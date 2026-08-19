import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { listPhotos, fullPhotos, normalizeUploadPhotos } from '../photo.js';
import { defaultCurrencyFor, validCurrency } from '../currency.js';
import { storePhotos, collectStorageKeys, deleteStorageKeys } from '../storage.js';

const router = Router();

const MAX_PRODUCTS_PER_SHOP = 5;
const OWNER_ROLES = ['shop', 'creator'];

async function preparePhotos(photos, folder) {
  const photoList = normalizeUploadPhotos(photos);
  try {
    const stored = await storePhotos(photoList, folder);
    return stored.length ? stored : photoList;
  } catch (err) {
    console.error('[storage] upload échoué, fallback base64 :', err.message);
    return photoList;
  }
}

function cachePublic(res, sMaxAge = 60) {
  res.set('Cache-Control', `public, s-maxage=${sMaxAge}, max-age=${Math.floor(sMaxAge / 2)}, stale-while-revalidate=30`);
}

function productRow(p, mode = 'list') {
  const photos = mode === 'detail' ? fullPhotos(p.photos) : listPhotos(p.photos);
  const image = (mode === 'detail' ? fullPhotos(p.photos) : listPhotos(p.photos))[0] || p.image || null;
  const { n, n_month, pending_n, rating_avg, review_count, ...rest } = p;
  return {
    ...rest,
    photos,
    image,
    rating_avg: Number(rating_avg || 0),
    review_count: Number(review_count || 0),
    price: Number(p.price),
    old_price: p.old_price === null || p.old_price === undefined ? null : Number(p.old_price),
    commission_percent: Number(p.commission_percent),
    commission: Math.round(Number(p.price) * (Number(p.commission_percent) / 100) * 100) / 100,
    delivery_fee: Number(p.delivery_fee || 0),
    quantity: Number(p.quantity || 1),
    sold: Number(n || 0),
    sold_month: Number(n_month || 0),
    pending_count: Number(pending_n || 0),
  };
}

const SELECT_PRODUCT = `
  SELECT p.*, u.name AS shop_name, u.role AS shop_role, u.location AS shop_location, u.city AS shop_city, u.country AS shop_country,
         u.verified AS shop_verified, u.phone AS shop_phone,
         s.n, s.n_month, s.pending_n, r.review_count, r.rating_avg, v.w1_views
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
`;

const NORMALIZE_TEXT = (col) =>
  `regexp_replace(translate(lower(${col}), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn'), '[^a-z0-9]', '', 'g')`;

const FOLD_TEXT = (col) =>
  `translate(lower(${col}), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn')`;

const SORTS = {
  recent: 'p.created_at DESC',
  popular: '(COALESCE(s.n, 0) * 3 + COALESCE(v.w1_views, 0)) DESC, p.created_at DESC',
  sales: 'COALESCE(s.n, 0) DESC, p.created_at DESC',
  price_asc: 'p.price ASC, p.created_at DESC',
  price_desc: 'p.price DESC, p.created_at DESC',
  rating: 'COALESCE(r.rating_avg, 0) DESC, p.created_at DESC',
};

router.get('/', async (req, res) => {
  cachePublic(res);
  const { search, shop, category, sort, scope, min_price, max_price, city, limit, offset } = req.query;
  let sql = SELECT_PRODUCT;
  const params = [];
  const where = [];
  if (search) {
    const tokens = String(search)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);
    if (tokens.length) {
      if (scope === 'shop') {
        const conds = [];
        for (const tk of tokens) {
          conds.push(`${FOLD_TEXT(`u.name`)} LIKE '%' || $${params.length + 1} || '%'`);
          params.push(tk);
        }
        where.push(`(${conds.join(' AND ')})`);
      } else {
        const conds = [];
        for (const tk of tokens) {
          conds.push(
            `(${FOLD_TEXT(`p.name`)} LIKE '%' || $${params.length + 1} || '%' OR ` +
              `${FOLD_TEXT(`u.name`)} LIKE '%' || $${params.length + 2} || '%')`
          );
          params.push(tk, tk);
        }
        where.push(`(${conds.join(' AND ')})`);
        if (scope === 'creation') {
          where.push("p.category = 'Arts & Artisanat'");
        }
      }
    }
  }
  if (shop) {
    where.push('p.shop_id = $' + (params.length + 1));
    params.push(Number(shop));
  }
  if (category) {
    where.push('p.category = $' + (params.length + 1));
    params.push(String(category).trim());
  }
  if (city) {
    const norm = String(city)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    const match = NORMALIZE_TEXT(`COALESCE(u.city, '') || ' ' || COALESCE(u.location, '')`);
    where.push(match + ` ILIKE '%' || $${params.length + 1} || '%'`);
    params.push(norm);
  }
  const minP = Number(min_price);
  const maxP = Number(max_price);
  if (Number.isFinite(minP) && minP >= 0) {
    where.push('p.price >= $' + (params.length + 1));
    params.push(minP);
  }
  if (Number.isFinite(maxP) && maxP >= 0) {
    where.push('p.price <= $' + (params.length + 1));
    params.push(maxP);
  }
  where.push('p.quantity > 0');
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY ' + (SORTS[sort] || SORTS.recent);
  const rawLimit = Number(limit);
  const rawOffset = Number(offset);
  const paging =
    (Number.isInteger(rawLimit) && rawLimit > 0) || (Number.isInteger(rawOffset) && rawOffset > 0);
  if (paging) {
    const pageSize = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 60) : 24;
    const skip = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
    const [countRow] = await q(
      `SELECT COUNT(*) AS n FROM products p JOIN users u ON u.id = p.shop_id` +
        (where.length ? ' WHERE ' + where.join(' AND ') : ''),
      params
    );
    sql += ` LIMIT ${pageSize} OFFSET ${skip}`;
    const products = (await q(sql, params)).map(productRow);
    const total = Number(countRow.n);
    res.json({
      products,
      total,
      limit: pageSize,
      offset: skip,
      hasMore: skip + products.length < total,
    });
    return;
  }
  const products = (await q(sql, params)).map(productRow);
  res.json({ products });
});

router.get('/mine', authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const products = (
    await q(SELECT_PRODUCT + ' WHERE p.shop_id = $1 ORDER BY p.created_at DESC', [req.user.id])
  ).map(productRow);
  res.json({ products, limit: MAX_PRODUCTS_PER_SHOP });
});

router.get('/cities', async (req, res) => {
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
    const norm = r.norm || '';
    if (!norm) continue;
    const key = norm.slice(0, 12);
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ label: r.label, norm });
  }
  const filtered = search
    ? suggestions.filter((s) => s.norm.includes(String(search).trim().toLowerCase().replace(/[^a-z0-9]/g, '')))
    : suggestions;
  res.json({ cities: filtered });
});

router.get('/:id', async (req, res) => {
  cachePublic(res, 120);
  const product = productRow(
    (await q(SELECT_PRODUCT + ' WHERE p.id = $1', [Number(req.params.id)]))[0],
    'detail'
  );
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  res.json({ product });
});

router.post('/', authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const { name, description, price, old_price, commission_percent, photos, category, warranty, delivery_fee, contact, quantity, currency } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Le nom et le prix sont requis' });
  }
  const priceNum = Number(price);
  const percentNum = Number(commission_percent ?? 0);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: 'Prix invalide' });
  }
  let oldPriceNum = old_price === '' || old_price === null || old_price === undefined ? null : Number(old_price);
  if (oldPriceNum !== null && (!Number.isFinite(oldPriceNum) || oldPriceNum < 0)) {
    return res.status(400).json({ error: 'Le prix normal est invalide' });
  }
  if (oldPriceNum !== null && oldPriceNum <= priceNum) {
    oldPriceNum = null;
  }
  if (!Number.isFinite(percentNum) || percentNum < 0 || percentNum > 100) {
    return res.status(400).json({ error: 'La commission doit être entre 0 et 100 %' });
  }
  const feeNum = Number(delivery_fee ?? 0);
  if (!Number.isFinite(feeNum) || feeNum < 0) {
    return res.status(400).json({ error: 'Les frais de livraison sont invalides' });
  }
  const qtyNum = Number(quantity ?? 1);
  if (!Number.isInteger(qtyNum) || qtyNum < 1) {
    return res.status(400).json({ error: 'La quantité doit être un nombre entier positif' });
  }
  const warrantyText = warranty === '' || warranty === null || warranty === undefined ? null : String(warranty).trim().slice(0, 60);
  const photoList = await preparePhotos(photos, `products/${req.user.id}`);
  const count = (await q('SELECT COUNT(*) AS n FROM products WHERE shop_id = $1', [req.user.id]))[0];
  if (Number(count.n) >= MAX_PRODUCTS_PER_SHOP) {
    return res.status(400).json({
      error: `Limite atteinte : maximum ${MAX_PRODUCTS_PER_SHOP} produits publiés`,
    });
  }
  const cleanCategory = req.user.role === 'creator' ? 'Arts & Artisanat' : category ? String(category).trim() : null;
  const currencyCode = validCurrency(currency) ? String(currency).trim().toUpperCase() : defaultCurrencyFor(req.user.country);
  const created = await q(
    `INSERT INTO products (shop_id, name, description, price, old_price, commission_percent, image, photos, category, warranty, delivery_fee, contact, quantity, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      req.user.id,
      String(name).trim(),
      description ? String(description).trim() : null,
      priceNum,
      oldPriceNum,
      percentNum,
      photoList[0] ? photoList[0].thumb : null,
      JSON.stringify(photoList),
      cleanCategory,
      warrantyText,
      feeNum,
      contact ? String(contact).trim() : null,
      qtyNum,
      currencyCode,
    ]
  );
  const product = productRow(
    (await q(SELECT_PRODUCT + ' WHERE p.id = $1', [created[0].id]))[0]
  );
  res.status(201).json({ product });
});

router.delete('/:id', authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: 'Ce produit ne vous appartient pas' });
  }
  const storageKeys = collectStorageKeys(product.photos);
  await q('DELETE FROM products WHERE id = $1', [product.id]);
  try {
    const removed = await deleteStorageKeys(storageKeys);
    if (removed) console.log(`[storage] ${removed} fichier(s) supprimé(s) pour le produit ${product.id}`);
  } catch (err) {
    console.error('[storage] nettoyage produit échoué :', err.message);
  }
  res.json({ ok: true });
});

router.post('/:id/duplicate', authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: 'Ce produit ne vous appartient pas' });
  }
  const count = (await q('SELECT COUNT(*) AS n FROM products WHERE shop_id = $1', [req.user.id]))[0];
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
      product.photos || '[]',
      product.category,
      product.warranty,
      Number(product.delivery_fee || 0),
      product.contact,
      Number(product.quantity || 1),
      product.currency || 'XAF',
    ]
  );
  const newProduct = productRow(
    (await q(SELECT_PRODUCT + ' WHERE p.id = $1', [created[0].id]))[0]
  );
  res.status(201).json({ product: newProduct });
});

router.put('/:id', authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: 'Ce produit ne vous appartient pas' });
  }
  const { name, description, price, old_price, commission_percent, photos, category, warranty, delivery_fee, contact, quantity, currency } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Le nom et le prix sont requis' });
  }
  const priceNum = Number(price);
  const percentNum = Number(commission_percent ?? 0);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: 'Prix invalide' });
  }
  let oldPriceNum = old_price === '' || old_price === null || old_price === undefined ? null : Number(old_price);
  if (oldPriceNum !== null && (!Number.isFinite(oldPriceNum) || oldPriceNum < 0)) {
    return res.status(400).json({ error: 'Le prix normal est invalide' });
  }
  if (oldPriceNum !== null && oldPriceNum <= priceNum) {
    oldPriceNum = null;
  }
  if (!Number.isFinite(percentNum) || percentNum < 0 || percentNum > 100) {
    return res.status(400).json({ error: 'La commission doit être entre 0 et 100 %' });
  }
  const feeNum = Number(delivery_fee ?? 0);
  if (!Number.isFinite(feeNum) || feeNum < 0) {
    return res.status(400).json({ error: 'Les frais de livraison sont invalides' });
  }
  const qtyNum = Number(quantity ?? 1);
  if (!Number.isInteger(qtyNum) || qtyNum < 1) {
    return res.status(400).json({ error: 'La quantité doit être un nombre entier positif' });
  }
  const warrantyText = warranty === '' || warranty === null || warranty === undefined ? null : String(warranty).trim().slice(0, 60);
  const photoList = await preparePhotos(photos, `products/${req.user.id}`);
  const cleanCategory = req.user.role === 'creator' ? 'Arts & Artisanat' : category ? String(category).trim() : null;
  const currencyCode = validCurrency(currency) ? String(currency).trim().toUpperCase() : (product.currency || defaultCurrencyFor(req.user.country));
  const updated = await q(
    `UPDATE products SET
       name = $1, description = $2, price = $3, old_price = $4, commission_percent = $5,
       image = $6, photos = $7, category = $8, warranty = $9, delivery_fee = $10,
       contact = $11, quantity = $12, currency = $13
     WHERE id = $14 RETURNING id`,
    [
      String(name).trim(),
      description ? String(description).trim() : null,
      priceNum,
      oldPriceNum,
      percentNum,
      photoList[0] ? photoList[0].thumb : null,
      JSON.stringify(photoList),
      cleanCategory,
      warrantyText,
      feeNum,
      contact ? String(contact).trim() : null,
      qtyNum,
      currencyCode,
      product.id,
    ]
  );
  const updatedProduct = productRow(
    (await q(SELECT_PRODUCT + ' WHERE p.id = $1', [updated[0].id]))[0]
  );
  res.json({ product: updatedProduct });
});

export default router;
