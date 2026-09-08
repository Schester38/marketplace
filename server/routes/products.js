import { Router } from "express";
import { q } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";
import { listPhotos, mediumPhotos, fullPhotos, normalizeUploadPhotos } from "../photo.js";
import { defaultCurrencyFor, validCurrency } from "../currency.js";
import { storePhotos, collectStorageKeys, deleteStorageKeys } from "../storage.js";
import { createProductSchema, productListQuerySchema, citiesQuerySchema } from "../validators.js";
import { validate, validateQuery } from "../middlewares/validate.js";

const router = Router();

const MAX_PRODUCTS_PER_SHOP = 5;
const OWNER_ROLES = ["shop", "creator"];

async function preparePhotos(photos, folder) {
  const photoList = normalizeUploadPhotos(photos);
  try {
    const stored = await storePhotos(photoList, folder);
    return stored.length ? stored : photoList;
  } catch (err) {
    console.error("[storage] upload échoué, fallback base64 :", err.message);
    return photoList;
  }
}

function cachePublic(res, sMaxAge = 60) {
  res.set(
    "Cache-Control",
    `public, s-maxage=${sMaxAge}, max-age=${Math.floor(sMaxAge / 2)}, stale-while-revalidate=30`
  );
}

function productRow(p, mode = "list") {
  const thumbs = listPhotos(p.photos);
  const mediums = mediumPhotos(p.photos);
  const larges = fullPhotos(p.photos);
  // Catalogue/rails → thumb ; fiche produit → medium (zoom large dispo à part).
  const photos = mode === "detail" ? mediums : thumbs;
  const image = photos[0] || p.image || null;
  const {
    n,
    n_month,
    pending_n,
    rating_avg,
    review_count,
    flash_promo_id,
    flash_price,
    flash_commission_percent,
    flash_ends_at,
    flash_starts_at,
    flash_duration_minutes,
    ...rest
  } = p;
  const price = Number(p.price);
  return {
    ...rest,
    photos,
    image,
    ...(mode === "detail" ? { photos_thumb: thumbs, photos_large: larges } : {}),
    rating_avg: Number(rating_avg || 0),
    review_count: Number(review_count || 0),
    price,
    old_price: p.old_price === null || p.old_price === undefined ? null : Number(p.old_price),
    commission_percent: Number(p.commission_percent),
    commission: Math.round(price * (Number(p.commission_percent) / 100) * 100) / 100,
    delivery_fee: Number(p.delivery_fee || 0),
    quantity: Number(p.quantity || 1),
    sold: Number(n || 0),
    sold_month: Number(n_month || 0),
    pending_count: Number(pending_n || 0),
    flash_promo: flash_promo_id
      ? {
          id: Number(flash_promo_id),
          price: Number(flash_price),
          discount_percent: price > 0 ? Math.round((1 - Number(flash_price) / price) * 100) : 0,
          commission_percent: Number(flash_commission_percent),
          commission:
            Math.round(Number(flash_price) * (Number(flash_commission_percent) / 100) * 100) / 100,
          starts_at: flash_starts_at,
          ends_at: flash_ends_at,
          duration_minutes: Number(flash_duration_minutes || 0),
        }
      : null,
  };
}

const SELECT_PRODUCT = `
  SELECT p.*, u.name AS shop_name, u.role AS shop_role, u.location AS shop_location, u.city AS shop_city, u.country AS shop_country,
         u.verified AS shop_verified, u.phone AS shop_phone,
         s.n, s.n_month, s.pending_n, r.review_count, r.rating_avg, v.w1_views,
         fp.id AS flash_promo_id, fp.promo_price AS flash_price, fp.commission_percent AS flash_commission_percent,
         fp.starts_at AS flash_starts_at, fp.ends_at AS flash_ends_at, fp.duration_minutes AS flash_duration_minutes
  FROM products p
  JOIN users u ON u.id = p.shop_id
  LEFT JOIN (SELECT product_id,
                    SUM(quantity) FILTER (WHERE status = 'delivered') AS n,
                    SUM(quantity) FILTER (WHERE status = 'delivered' AND created_at >= date_trunc('month', now())) AS n_month,
                    SUM(quantity) FILTER (WHERE status IN ('pending', 'bought', 'confirmed')) AS pending_n
             FROM sales GROUP BY product_id) s ON s.product_id = p.id
  LEFT JOIN (SELECT product_id, COUNT(*) AS review_count, COALESCE(AVG(rating), 0)::numeric(3, 2) AS rating_avg
             FROM reviews GROUP BY product_id) r ON r.product_id = p.id
  LEFT JOIN (SELECT item_id, SUM(count) AS w1_views
             FROM item_views
             WHERE item_type = 'product' AND seen_on >= CURRENT_DATE - 6
             GROUP BY item_id) v ON v.item_id = p.id
  LEFT JOIN flash_promotions fp ON fp.product_id = p.id AND fp.ends_at > now()
`;

const NORMALIZE_TEXT = (col) =>
  `regexp_replace(translate(lower(${col}), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn'), '[^a-z0-9]', '', 'g')`;

const FOLD_TEXT = (col) =>
  `translate(lower(${col}), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn')`;

// Boost de fraîcheur : un produit publié il y a moins de 14 jours reçoit un
// bonus qui décroît linéairement (max +28, soit ≈ 9 ventes × 3) — garantie
// d'une fenêtre de visibilité de lancement, sans pénaliser les best-sellers.
const FRESHNESS_WINDOW_DAYS = 14;
// EXTRACT(EPOCH)/86400 plutôt que EXTRACT(DAY) : ce dernier découpe les
// intervalles en mois + jours (« 1 mon 15 days ») et fausserait l'âge au-delà
// de 30 jours.
const freshBoost = (col) =>
  `GREATEST(0, ${FRESHNESS_WINDOW_DAYS} - EXTRACT(EPOCH FROM now() - ${col}) / 86400) * 2`;

const SORTS = {
  recent: "p.created_at DESC",
  popular:
    `(COALESCE(s.n, 0) * 3 + COALESCE(v.w1_views, 0) + ${freshBoost("p.created_at")}) DESC, p.created_at DESC`,
  sales: "COALESCE(s.n, 0) DESC, p.created_at DESC",
  price_asc: "p.price ASC, p.created_at DESC",
  price_desc: "p.price DESC, p.created_at DESC",
  rating: "COALESCE(r.rating_avg, 0) DESC, p.created_at DESC",
};

// Classement des tris exprimés sur la sous-requête paginée (alias base_row),
// utilisée pour l'entrelacement par boutique (ROW_NUMBER par shop_id).
const CAP_SORTS = {
  recent: "base_row.created_at DESC",
  popular:
    `(COALESCE(base_row.n, 0) * 3 + COALESCE(base_row.w1_views, 0) + ${freshBoost("base_row.created_at")}) DESC, base_row.created_at DESC`,
  sales: "COALESCE(base_row.n, 0) DESC, base_row.created_at DESC",
  price_asc: "base_row.price ASC, base_row.created_at DESC",
  price_desc: "base_row.price DESC, base_row.created_at DESC",
  rating: "COALESCE(base_row.rating_avg, 0) DESC, base_row.created_at DESC",
};

router.get("/", validateQuery(productListQuerySchema), async (req, res) => {
  const { search, shop, category, sort, scope, min_price, max_price, city, country, limit, offset, seed } =
    req.query;
  // Rotation aléatoire : une requête avec `seed` doit pouvoir renvoyer un ordre
  // différent à chaque chargement — on interdit toute mise en cache CDN/navigateur.
  if (seed) res.set("Cache-Control", "private, no-store");
  else cachePublic(res);
  let sql = SELECT_PRODUCT;
  const params = [];
  const where = [];
  if (search) {
    const tokens = String(search)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean);
    if (tokens.length) {
      if (scope === "shop") {
        const conds = [];
        for (const tk of tokens) {
          conds.push(`${FOLD_TEXT(`u.name`)} LIKE '%' || $${params.length + 1} || '%'`);
          params.push(tk);
        }
        where.push(`(${conds.join(" AND ")})`);
      } else {
        const conds = [];
        for (const tk of tokens) {
          conds.push(
            `(${FOLD_TEXT(`p.name`)} LIKE '%' || $${params.length + 1} || '%' OR ` +
              `${FOLD_TEXT(`u.name`)} LIKE '%' || $${params.length + 2} || '%')`
          );
          params.push(tk, tk);
        }
        where.push(`(${conds.join(" AND ")})`);
        if (scope === "creation") {
          where.push("p.category = 'Arts & Artisanat'");
        }
      }
    }
  }
  if (shop) {
    where.push("p.shop_id = $" + (params.length + 1));
    params.push(Number(shop));
  }
  if (category) {
    where.push("p.category = $" + (params.length + 1));
    params.push(String(category).trim());
  }
  if (city) {
    const norm = String(city)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    const match = NORMALIZE_TEXT(`COALESCE(u.city, '') || ' ' || COALESCE(u.location, '')`);
    where.push(match + ` ILIKE '%' || $${params.length + 1} || '%'`);
    params.push(norm);
  }
  const minP = Number(min_price);
  const maxP = Number(max_price);
  if (Number.isFinite(minP) && minP >= 0) {
    where.push("p.price >= $" + (params.length + 1));
    params.push(minP);
  }
  if (Number.isFinite(maxP) && maxP >= 0) {
    where.push("p.price <= $" + (params.length + 1));
    params.push(maxP);
  }
  where.push("p.quantity > 0");
  // Un produit en promotion éclair disparaît du catalogue : seul l'accès direct (via la promotion) reste possible.
  where.push(
    "NOT EXISTS (SELECT 1 FROM flash_promotions fp2 WHERE fp2.product_id = p.id AND fp2.ends_at > now())"
  );
  if (where.length) sql += " WHERE " + where.join(" AND ");
  // Boost géographique : si un pays est fourni (détection automatique), les
  // produits des boutiques de ce pays remontent en premier, sans exclure les
  // autres — on peut toujours tout faire défiler.
  let countryNorm = null;
  if (country) {
    countryNorm = String(country).slice(0, 60);
  }
  const rawLimit = Number(limit);
  const rawOffset = Number(offset);
  const paging =
    (Number.isInteger(rawLimit) && rawLimit > 0) || (Number.isInteger(rawOffset) && rawOffset > 0);
  if (paging) {
    const pageSize = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 24;
    const skip = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
    // Rotation aléatoire seedée : avec `seed`, l'ordre est un mélange déterministe
    // de la graine (md5(id + seed)) — différent à chaque chargement de page côté
    // client, mais stable entre les pages d'une même visite (pas de doublon via
    // « Voir plus de produits »).
    let seedParam = null;
    if (seed) {
      seedParam = params.length + 1;
      params.push(String(seed).slice(0, 64));
    }
    const simpleSort = seed
      ? `md5(p.id::text || $${seedParam})`
      : SORTS[sort] || SORTS.recent;
    // Total RÉEL (non plafonné) : aucun produit ne doit rester caché.
    const [totalRow] = await q(`SELECT COUNT(*) AS n FROM (${sql}) t`, params);
    const total = Number(totalRow.n);
    let pagedSql;
    if (total <= pageSize) {
      // Tout tient sur une page : liste directe, aucun produit masqué.
      let orderSql = " ORDER BY ";
      if (countryNorm) {
        const countryParam = params.length + 1;
        orderSql +=
          `CASE WHEN ${FOLD_TEXT("u.country")} = ${FOLD_TEXT(`$${countryParam}`)} THEN 0 ELSE 1 END, `;
      }
      orderSql += simpleSort;
      pagedSql = sql + orderSql + ` LIMIT ${pageSize} OFFSET ${skip}`;
    } else {
      // Diversité : entrelacement par boutique — le 1ᵉʳ produit de chaque
      // boutique d'abord (par score), puis les 2ᵉ, etc. Chaque page mélange
      // les boutiques et TOUS les produits restent accessibles via la pagination.
      const innerRank = seed
        ? `md5(base_row.id::text || $${seedParam})`
        : CAP_SORTS[sort] || CAP_SORTS.recent;
      const rankedSql =
        `SELECT base_row.*, ROW_NUMBER() OVER (PARTITION BY base_row.shop_id ORDER BY ${innerRank}) AS shop_rn` +
        ` FROM (${sql}) base_row`;
      let orderSql = " ORDER BY ";
      if (countryNorm) {
        const countryParam = params.length + 1;
        orderSql +=
          `CASE WHEN ${FOLD_TEXT("ranked.shop_country")} = ${FOLD_TEXT(`$${countryParam}`)} THEN 0 ELSE 1 END, `;
      }
      orderSql += `ranked.shop_rn ASC, ${innerRank.replace(/base_row\./g, "ranked.")}`;
      pagedSql = `SELECT * FROM (${rankedSql}) ranked` + orderSql + ` LIMIT ${pageSize} OFFSET ${skip}`;
    }
    if (countryNorm) params.push(countryNorm);
    const products = (await q(pagedSql, params)).map(productRow);
    res.json({
      products,
      total,
      limit: pageSize,
      offset: skip,
      hasMore: skip + products.length < total,
    });
    return;
  }
  // Liste complète (favoris, rails, fiches similaires) : pas de plafond par
  // boutique — le tri normal s'applique.
  let orderSql = " ORDER BY ";
  if (countryNorm) {
    const countryParam = params.length + 1;
    orderSql +=
      `CASE WHEN ${FOLD_TEXT(`u.country`)} = ${FOLD_TEXT(`$${countryParam}`)} THEN 0 ELSE 1 END, `;
  }
  orderSql += SORTS[sort] || SORTS.recent;
  const fullSql = sql + orderSql;
  if (countryNorm) params.push(countryNorm);
  const products = (await q(fullSql, params)).map(productRow);
  res.json({ products });
});

router.get("/mine", authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const products = (
    await q(
      SELECT_PRODUCT +
        ` WHERE p.shop_id = $1
            AND NOT EXISTS (SELECT 1 FROM flash_promotions fp2 WHERE fp2.product_id = p.id AND fp2.ends_at > now())
          ORDER BY p.created_at DESC`,
      [req.user.id]
    )
  ).map(productRow);
  res.json({ products, limit: MAX_PRODUCTS_PER_SHOP });
});

router.get("/cities", validateQuery(citiesQuerySchema), async (req, res) => {
  const { q: search } = req.query;
  const rows = await q(
    `SELECT DISTINCT
       regexp_replace(translate(lower(COALESCE(u.city, '') || ' ' || COALESCE(u.location, '')), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn'), '[^a-z0-9]', '', 'g') AS norm,
       COALESCE(NULLIF(TRIM(u.city), ''), u.location) AS label
     FROM users u
     WHERE u.role IN ('shop', 'creator') AND (COALESCE(u.city, '') <> '' OR COALESCE(u.location, '') <> '')
     ORDER BY norm ASC LIMIT 100`
  );
  const suggestions = [];
  const seen = new Set();
  for (const r of rows) {
    const norm = r.norm || "";
    if (!norm) continue;
    const key = norm.slice(0, 12);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ label: r.label, norm });
  }
  const filtered = search
    ? suggestions.filter((s) =>
        s.norm.includes(
          String(search)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
        )
      )
    : suggestions;
  res.json({ cities: filtered });
});

router.get("/:id", async (req, res) => {
  cachePublic(res, 120);
  const product = productRow(
    (await q(SELECT_PRODUCT + " WHERE p.id = $1", [Number(req.params.id)]))[0],
    "detail"
  );
  if (!product) return res.status(404).json({ error: "Produit introuvable" });
  res.json({ product });
});

router.post(
  "/",
  authRequired,
  roleRequired(...OWNER_ROLES),
  validate(createProductSchema),
  async (req, res) => {
    const {
      name,
      description,
      price,
      old_price,
      commission_percent,
      photos,
      category,
      warranty,
      delivery_fee,
      contact,
      quantity,
      currency,
    } = req.body;
    const photoList = await preparePhotos(photos, `products/${req.user.id}`);
    const count = (
      await q("SELECT COUNT(*) AS n FROM products WHERE shop_id = $1", [req.user.id])
    )[0];
    if (Number(count.n) >= MAX_PRODUCTS_PER_SHOP) {
      return res.status(400).json({
        error: `Limite atteinte : maximum ${MAX_PRODUCTS_PER_SHOP} produits publiés`,
      });
    }
    const cleanCategory =
      req.user.role === "creator" ? "Arts & Artisanat" : category ? String(category).trim() : null;
    const currencyCode = validCurrency(currency)
      ? String(currency).trim().toUpperCase()
      : defaultCurrencyFor(req.user.country);
    const created = await q(
      `INSERT INTO products (shop_id, name, description, price, old_price, commission_percent, image, photos, category, warranty, delivery_fee, contact, quantity, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        req.user.id,
        String(name).trim(),
        description ? String(description).trim() : null,
        Number(price),
        old_price === "" || old_price === null ? null : Number(old_price),
        Number(commission_percent),
        photoList[0] ? photoList[0].thumb : null,
        JSON.stringify(photoList),
        cleanCategory,
        warranty === "" || warranty === null ? null : String(warranty).trim().slice(0, 60),
        Number(delivery_fee || 0),
        contact ? String(contact).trim() : null,
        Number(quantity || 1),
        currencyCode,
      ]
    );
    const product = productRow((await q(SELECT_PRODUCT + " WHERE p.id = $1", [created[0].id]))[0]);
    res.status(201).json({ product });
  }
);

router.delete("/:id", authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const product = (await q("SELECT * FROM products WHERE id = $1", [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: "Produit introuvable" });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: "Ce produit ne vous appartient pas" });
  }
  const storageKeys = collectStorageKeys(product.photos);
  await q("DELETE FROM products WHERE id = $1", [product.id]);
  try {
    const removed = await deleteStorageKeys(storageKeys, { excludeProductId: product.id });
    if (removed)
      console.warn(`[storage] ${removed} fichier(s) supprimé(s) pour le produit ${product.id}`);
  } catch (err) {
    console.error("[storage] nettoyage produit échoué :", err.message);
  }
  res.json({ ok: true });
});

router.post("/:id/duplicate", authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const product = (await q("SELECT * FROM products WHERE id = $1", [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: "Produit introuvable" });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: "Ce produit ne vous appartient pas" });
  }
  const count = (
    await q("SELECT COUNT(*) AS n FROM products WHERE shop_id = $1", [req.user.id])
  )[0];
  if (Number(count.n) >= MAX_PRODUCTS_PER_SHOP) {
    return res.status(400).json({
      error: `Limite atteinte : maximum ${MAX_PRODUCTS_PER_SHOP} produits publiés`,
    });
  }
  const created = await q(
    `INSERT INTO products (shop_id, name, description, price, old_price, commission_percent, image, photos, category, warranty, delivery_fee, contact, quantity, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      product.shop_id,
      `${String(product.name).trim()} (copie)`,
      product.description,
      Number(product.price),
      product.old_price,
      Number(product.commission_percent),
      product.image,
      product.photos || "[]",
      product.category,
      product.warranty,
      Number(product.delivery_fee || 0),
      product.contact,
      Number(product.quantity || 1),
      product.currency || "XAF",
    ]
  );
  const newProduct = productRow((await q(SELECT_PRODUCT + " WHERE p.id = $1", [created[0].id]))[0]);
  res.status(201).json({ product: newProduct });
});

router.put(
  "/:id",
  authRequired,
  roleRequired(...OWNER_ROLES),
  validate(createProductSchema),
  async (req, res) => {
    const product = (await q("SELECT * FROM products WHERE id = $1", [Number(req.params.id)]))[0];
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    if (product.shop_id !== req.user.id) {
      return res.status(403).json({ error: "Ce produit ne vous appartient pas" });
    }
    const oldKeys = collectStorageKeys(product.photos);
    const {
      name,
      description,
      price,
      old_price,
      commission_percent,
      photos,
      category,
      warranty,
      delivery_fee,
      contact,
      quantity,
      currency,
    } = req.body;
    const photoList = await preparePhotos(photos, `products/${req.user.id}`);
    const cleanCategory =
      req.user.role === "creator" ? "Arts & Artisanat" : category ? String(category).trim() : null;
    const currencyCode = validCurrency(currency)
      ? String(currency).trim().toUpperCase()
      : product.currency || defaultCurrencyFor(req.user.country);
    const updated = await q(
      `UPDATE products SET
       name = $1, description = $2, price = $3, old_price = $4, commission_percent = $5,
       image = $6, photos = $7, category = $8, warranty = $9, delivery_fee = $10,
       contact = $11, quantity = $12, currency = $13
     WHERE id = $14 RETURNING id`,
      [
        String(name).trim(),
        description ? String(description).trim() : null,
        Number(price),
        old_price === "" || old_price === null ? null : Number(old_price),
        Number(commission_percent),
        photoList[0] ? photoList[0].thumb : null,
        JSON.stringify(photoList),
        cleanCategory,
        warranty === "" || warranty === null ? null : String(warranty).trim().slice(0, 60),
        Number(delivery_fee || 0),
        contact ? String(contact).trim() : null,
        Number(quantity || 1),
        currencyCode,
        product.id,
      ]
    );
    const updatedProduct = productRow(
      (await q(SELECT_PRODUCT + " WHERE p.id = $1", [updated[0].id]))[0]
    );
    // Nettoyage des fichiers remplacés : on supprime les anciennes clés Storage
    // qui ne sont plus référencées par ce produit (ni par un autre produit, une
    // offre ou une commande). Best-effort, n'empêche jamais la réponse.
    const newKeys = collectStorageKeys(JSON.stringify(photoList));
    const orphanKeys = oldKeys.filter((k) => !newKeys.includes(k));
    if (orphanKeys.length) {
      try {
        const removed = await deleteStorageKeys(orphanKeys, { excludeProductId: product.id });
        if (removed)
          console.warn(`[storage] ${removed} ancien(s) fichier(s) nettoyé(s) pour le produit ${product.id}`);
      } catch (err) {
        console.error("[storage] nettoyage après édition échoué :", err.message);
      }
    }
    res.json({ product: updatedProduct });
  }
);

export default router;
