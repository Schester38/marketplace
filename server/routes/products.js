import { Router } from "express";
import { q } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";
import { listPhotos, mediumPhotos, fullPhotos, normalizeUploadPhotos } from "../photo.js";
import { proxyPhotoUrl } from "../photoProxy.js";
import { defaultCurrencyFor, validCurrency } from "../currency.js";
import {
  storePhotos,
  collectStorageKeys,
  deleteStorageKeys,
} from "../storage.js";
import { broadcastNotification } from "../services/notifications.js";
import { getSetting, setSetting } from "../services/ikeepay.js";
import { sendPushToAll } from "../push.js";
import { createProductSchema, productListQuerySchema, citiesQuerySchema } from "../validators.js";
import { validate, validateQuery } from "../middlewares/validate.js";

const router = Router();

// ─── Contenus PROTÉGÉS (vidéos YouTube non répertoriées) ────────────────────
// Un produit digital de type "youtube" n'a AUCUN fichier : la vidéo est
// hébergée sur YouTube (non répertoriée) et son identifiant n'est remis qu'au
// détenteur du droit d'accès (GET /api/digital/:saleId/video). L'ID n'est
// JAMAIS exposé publiquement — productRow le retire comme digital_path.
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_URL_RE =
  /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** Extrait l'ID YouTube (11 caractères) d'une URL ou d'un ID brut, sinon null. */
export function parseYoutubeId(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  if (YOUTUBE_ID_RE.test(s)) return s;
  const m = YOUTUBE_URL_RE.exec(s);
  return m ? m[1] : null;
}

/**
 * Valide la demande « contenu protégé » du client.
 * Retourne `{ error }` (message), `{ clear: true }` (retour au mode fichier /
 * produit physique), ou `{ kind, youtubeId, accessDays }` sinon.
 */
function parseProtectedPayload(digital_kind, youtube_url, access_days) {
  const kind = digital_kind === "youtube" ? "youtube" : digital_kind === "file" ? "file" : null;
  if (!kind) return { clear: true };
  const days = access_days === "" || access_days === null || access_days === undefined
    ? null
    : Number(access_days);
  if (days !== null && (!Number.isFinite(days) || days < 1 || days > 3650)) {
    return { error: "Durée d'accès invalide (1 à 3650 jours)." };
  }
  if (kind === "file") return { kind, youtubeId: null, accessDays: days };
  // kind === "youtube" : l'ID est obligatoire (nouveau ou déjà enregistré).
  const id = parseYoutubeId(youtube_url);
  if (!id) {
    return { error: "Lien YouTube invalide. Collez l'adresse de la vidéo (youtube.com/watch…, youtu.be/…) ou son identifiant à 11 caractères." };
  }
  return { kind, youtubeId: id, accessDays: days };
}

const OWNER_ROLES = ["shop", "creator"];

async function preparePhotos(photos, folder) {
  const photoList = normalizeUploadPhotos(photos);
  if (!photoList.length) return [];
  try {
    const stored = await storePhotos(photoList, folder);
    if (stored.length) return stored;
    const err = new Error(
      "Le stockage des photos est indisponible. Le produit n'a pas été enregistré afin de ne pas stocker l'image dans la base de données."
    );
    err.statusCode = 503;
    throw err;
  } catch (err) {
    console.error("[storage] upload photo produit échoué :", err.message);
    if (err?.statusCode) throw err;
    const storageError = new Error(
      "Le stockage des photos est indisponible. Réessayez plus tard."
    );
    storageError.statusCode = 503;
    throw storageError;
  }
}

// ---------------------------------------------------------------------------
// PRODUITS DIGITAUX (fichiers payants)
// Le fichier vit dans le bucket PRIVÉ Supabase (`digital-products`) et est
// remis à l'acheteur uniquement par URL SIGNÉE (voir server/routes/digital.js).
// Aucune URL publique n'existe : le fichier ne peut pas être téléchargé sans
// passer par la vérification du droit d'accès.
//
// Deux modes d'envoi :
//   1. DIRECT (défaut) : le navigateur téléverse le fichier lui-même vers
//      Supabase via une URL d'upload SIGNÉE (POST /api/digital/upload-url),
//      puis n'envoie ici que `digital.key` + métadonnées. Limite 20 Mo — le
//      corps de l'API Vercel (4,5 Mo) n'est plus impliqué.
//   2. LEGACY base64 : `digital.data` en data-URI (≤ 3 Mo, plafond du corps
//      Vercel) — conservé pour compatibilité avec d'anciens clients.
// ---------------------------------------------------------------------------
import {
  DIGITAL_MAX_BYTES,
  DIGITAL_INLINE_MAX_BYTES,
  DIGITAL_EXT_ALLOWED,
  uploadDigitalFile,
  deleteDigitalFile,
  digitalObjectMeta,
  safeFileExt,
} from "../storage.js";

// LIMITE DE PUBLICATIONS : un créateur (hors comptes dispensés ci-dessous) ne
// peut pas publier plus de DIGITAL_MAX_PRODUCTS produits digitaux — chaque
// fichier pouvant peser jusqu'à 20 Mo, cette limite protège le quota Supabase.
const DIGITAL_MAX_PRODUCTS = 2;
// Comptes créateurs DISPENSÉS de la limite (inscription existante) : le nom du
// compte OU l'email commence par l'une de ces valeurs (insensible à la casse).
const DIGITAL_UNLIMITED_CREATORS = ["bestrong"];

function isUnlimitedCreator(user) {
  const name = String(user?.name || "").trim().toLowerCase();
  const email = String(user?.email || "").trim().toLowerCase();
  return DIGITAL_UNLIMITED_CREATORS.some(
    (s) => name.includes(s) || email.startsWith(s)
  );
}

/** Nombre de produits digitaux déjà publiés par le compte. */
async function countDigitalProducts(userId) {
  const [r] = await q(
    "SELECT COUNT(*)::int AS n FROM products WHERE shop_id = $1 AND is_digital = TRUE",
    [userId]
  );
  return Number(r?.n || 0);
}

/**
 * Décode le blob `digital` envoyé par le client.
 * Retourne `{ error }` si le fichier est refusé (taille / extension / clé),
 * sinon `{ name, mime, ext, key?, size, direct, buffer? }`, ou `null` si
 * aucun fichier n'est fourni.
 *  - direct=true : fichier DÉJÀ téléversé par le navigateur (`digital.key`) ;
 *    sa présence et sa taille seront vérifiées dans le bucket avant usage.
 *  - direct=false : mode legacy (data-URI base64), buffer à téléverser ici.
 */
function parseDigitalPayload(digital, userId) {
  if (!digital || typeof digital !== "object") return null;
  const name = String(digital.name || "fichier").trim().slice(0, 160);
  const key = String(digital.key || "").trim();

  // --- Mode 1 : upload direct (clé Storage déjà en place) -------------------
  if (key) {
    const expectedPrefix = `users/${userId}/`;
    if (!key.startsWith(expectedPrefix) || !/^[^/]+\/[^/]+\/[0-9a-f]{64}\/file\.[a-z0-9]{1,8}$/.test(key)) {
      return { error: "Clé de fichier invalide : retéléversez le fichier." };
    }
    const ext = safeFileExt(key);
    if (!DIGITAL_EXT_ALLOWED.has(ext)) {
      return {
        error: `Type de fichier non pris en charge (.${ext}). Formats acceptés : PDF, ZIP, EPUB, Office, TXT/CSV, MP3, MP4, images…`,
      };
    }
    const size = Math.floor(Number(digital.size || 0));
    if (!Number.isFinite(size) || size <= 0) return { error: "Fichier illisible ou vide" };
    if (size > DIGITAL_MAX_BYTES) {
      return {
        error: `Fichier trop volumineux (${(size / 1024 / 1024).toFixed(1)} Mo). Maximum ${Math.round(DIGITAL_MAX_BYTES / 1024 / 1024)} Mo.`,
      };
    }
    const mime = String(digital.mime || "").trim() || "application/octet-stream";
    return { name, mime: mime.slice(0, 120), ext, key, size, direct: true };
  }

  // --- Mode 2 : legacy data-URI base64 -------------------------------------
  const raw = String(digital.data || "");
  if (!raw) return null;
  const m = /^data:([^;,]*);base64,([\s\S]+)$/.exec(raw);
  const b64 = (m ? m[2] : raw).replace(/\s+/g, "");
  if (!b64) return { error: "Fichier illisible : contenu encodé vide" };
  const ext = safeFileExt(name);
  if (!DIGITAL_EXT_ALLOWED.has(ext)) {
    return {
      error: `Type de fichier non pris en charge (.${ext}). Formats acceptés : PDF, ZIP, EPUB, Office, TXT/CSV, MP3, MP4, images…`,
    };
  }
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) return { error: "Fichier illisible ou vide" };
  if (buffer.length > DIGITAL_INLINE_MAX_BYTES) {
    return {
      error: `Fichier trop volumineux (${(buffer.length / 1024 / 1024).toFixed(1)} Mo). Utilisez un fichier de ${Math.round(DIGITAL_MAX_BYTES / 1024 / 1024)} Mo maximum (téléversement direct).`,
    };
  }
  const mime = (m && m[1]) || String(digital.mime || "").trim() || "application/octet-stream";
  return { name, mime: mime.slice(0, 120), ext, buffer, size: buffer.length, direct: false };
}

/**
 * Résout le chemin du fichier digital pour la création / l'édition :
 *   - mode direct : vérifie la présence du fichier dans le bucket (HEAD) ;
 *   - mode legacy : téléverse le buffer serveur → bucket.
 * Retourne `{ error }` (400) ou `{ path, size }`.
 */
async function resolveDigitalFile(parsed, req) {
  if (parsed.direct) {
    const meta = await digitalObjectMeta(parsed.key).catch(() => ({ exists: false, size: 0 }));
    if (!meta.exists) {
      return { error: "Fichier introuvable dans le stockage : retéléversez-le depuis le formulaire." };
    }
    // Taille réelle du bucket prioritaire (têtière de confiance).
    return { path: parsed.key, size: meta.size > 0 ? meta.size : parsed.size };
  }
  const path = await uploadDigitalFile(parsed.buffer, parsed.name, {
    folder: `users/${req.user.id}`,
  });
  if (!path) return { error: "__STORAGE_UNAVAILABLE__" };
  return { path, size: parsed.size };
}

// ---------------------------------------------------------------------------
// Digest quotidien des nouveaux produits (canal push "digest", désactivable
// par l'utilisateur via Mon compte). Déclenché en fire-and-forget par la
// route GET /products — au plus une fois par jour, mémorisé dans
// platform_settings ("products_digest_last").
// ---------------------------------------------------------------------------
let digestCheckedAt = 0;
const DIGEST_CHECK_INTERVAL_MS = 10 * 60 * 1000; // vérif au plus toutes les 10 min/instance
async function maybeSendProductsDigest() {
  if (Date.now() - digestCheckedAt < DIGEST_CHECK_INTERVAL_MS) return;
  digestCheckedAt = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const last = (await getSetting("products_digest_last")) || "";
  if (last === today) return;
  const [cnt] = await q(
    "SELECT COUNT(*)::int AS n FROM products WHERE created_at >= CURRENT_DATE AND quantity > 0"
  );
  const n = Number(cnt?.n || 0);
  if (n <= 0) {
    await setSetting("products_digest_last", today);
    return;
  }
  const sent = await sendPushToAll(
    {
      title: "🛍️ Nouveautés du jour",
      body: `${n} nouveau${n > 1 ? "x" : ""} produit${n > 1 ? "s" : ""} publié${n > 1 ? "s" : ""} aujourd'hui sur MboppiShop — viens découvrir !`,
      url: "/",
      tag: `digest-${today}`,
    },
    { channel: "digest" }
  );
  await setSetting("products_digest_last", today);
  if (sent > 0)
    console.warn(`[products] digest quotidien envoyé à ${sent} abonné(s) (${n} produits)`);
}

function cachePublic(res, sMaxAge = 60) {
  res.set(
    "Cache-Control",
    `public, s-maxage=${sMaxAge}, max-age=${Math.floor(sMaxAge / 2)}, stale-while-revalidate=30`
  );
}

function productRow(p, mode = "list", { ownerView = false } = {}) {
  const thumbs = listPhotos(p.photos);
  const mediums = mediumPhotos(p.photos);
  const larges = fullPhotos(p.photos);
  // Catalogue/rails → thumb ; fiche produit → medium (zoom large dispo à part).
  const photos = mode === "detail" ? mediums : thumbs;
  const image = photos[0] || proxyPhotoUrl(p.image) || null;
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
    // La CLÉ Storage du fichier digital n'est JAMAIS exposée publiquement :
    // le bucket est privé et l'accès passe par une URL signée délivrée après
    // vérification du droit d'accès (POST /api/digital/:saleId/download).
    digital_path,
    // L'ID de la vidéo YouTube (contenu protégé) n'est exposé qu'au
    // PROPRIÉTAIRE du produit (GET /api/products/mine) — jamais sur une route
    // publique ou en cache CDN : la vidéo n'est déverrouillée qu'après
    // vérification du droit d'accès (GET /api/digital/:saleId/video).
    youtube_id,
    ...rest
  } = p;
  const price = Number(p.price);
  return {
    ...rest,
    ...(ownerView && youtube_id ? { youtube_id } : {}),
    photos,
    image,
    shop_avatar: proxyPhotoUrl(p.shop_avatar),
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
         u.verified AS shop_verified, u.phone AS shop_phone, u.avatar AS shop_avatar,
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

// Variante propriétaire : ajoute UNIQUEMENT l'identifiant du document source
// quand le produit a été publié par le Générateur. Le contenu/page_layout n'est
// jamais chargé ici ; la relation suffit au bouton « Modifier » de l'espace
// créateur et reste absente des réponses publiques du catalogue.
const SELECT_OWNER_PRODUCT = SELECT_PRODUCT.replace(
  "fp.duration_minutes AS flash_duration_minutes",
  `fp.duration_minutes AS flash_duration_minutes,
         (SELECT gd.id FROM gen_documents gd
          WHERE gd.published_product_id = p.id AND gd.owner_id = p.shop_id
          ORDER BY gd.updated_at DESC LIMIT 1) AS generator_document_id`
);

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
  // Le catalogue digital ne doit jamais être réutilisé depuis un ancien cache :
  // ses réponses doivent refléter immédiatement toute publication récente.
  if (req.query.type === "digital") {
    res.set("Cache-Control", "private, no-store, max-age=0");
  } else {
    cachePublic(res);
  }
  // Digest quotidien (non bloquant, fire-and-forget) : au premier appel de la
  // journée, informe tous les abonnés push du nombre de nouveaux produits.
  // Cache mémoire 10 min pour n'exécuter la vérification qu'au plus toutes les
  // 10 minutes par instance serverless.
  maybeSendProductsDigest().catch(() => {});
  const { search, shop, category, type, sort, scope, min_price, max_price, city, country, limit, offset } =
    req.query;
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
  // Volets « Produits physiques » / « Produits digitaux » (accueil, espaces) :
  // un seul filtre pour ne jamais mélanger les deux familles de produits.
  if (type === "digital") {
    where.push("p.is_digital = TRUE");
  } else if (type === "physical") {
    where.push("p.is_digital IS NOT TRUE");
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
      orderSql += SORTS[sort] || SORTS.recent;
      pagedSql = sql + orderSql + ` LIMIT ${pageSize} OFFSET ${skip}`;
    } else {
      // Diversité : entrelacement par boutique — le 1ᵉʳ produit de chaque
      // boutique d'abord (par score), puis les 2ᵉ, etc. Chaque page mélange
      // les boutiques et TOUS les produits restent accessibles via la pagination.
      const innerRank = CAP_SORTS[sort] || CAP_SORTS.recent;
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
  // boutique — le tri normal s'applique. SÉCURITÉ EGRESS : plafonnée aux 100
  // plus récents (le catalogue complet est paginé via ?limit=&offset=).
  // Plusieurs écrans (dashboards, favoris, page 404…) appellent cette route
  // sans limite : sans plafond, chaque appel renvoie TOUT le catalogue.
  let orderSql = " ORDER BY ";
  if (countryNorm) {
    const countryParam = params.length + 1;
    orderSql +=
      `CASE WHEN ${FOLD_TEXT(`u.country`)} = ${FOLD_TEXT(`$${countryParam}`)} THEN 0 ELSE 1 END, `;
  }
  orderSql += SORTS[sort] || SORTS.recent;
  const fullSql = sql + orderSql + " LIMIT 100";
  if (countryNorm) params.push(countryNorm);
  const products = (await q(fullSql, params)).map(productRow);
  res.json({ products });
});

router.get("/mine", authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const products = (
    await q(
      SELECT_OWNER_PRODUCT +
        ` WHERE p.shop_id = $1
            AND NOT EXISTS (SELECT 1 FROM flash_promotions fp2 WHERE fp2.product_id = p.id AND fp2.ends_at > now())
          ORDER BY p.created_at DESC`,
      [req.user.id]
    )
  ).map((p) => productRow(p, "list", { ownerView: true }));
  res.json({ products });
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
      digital,
      digital_download_limit,
    } = req.body;

    // Produit digital : le fichier est rattaché AVANT l'insertion, de sorte
    // qu'un produit « digital » ne puisse jamais exister sans son fichier.
    // EXCEPTION — contenu PROTÉGÉ « youtube » : la vidéo vit sur YouTube
    // (non répertoriée) ; aucun fichier, l'ID n'est remis qu'après vérification
    // du droit d'accès (GET /api/digital/:saleId/video).
    const parsedDigital = parseDigitalPayload(digital, req.user.id);
    if (parsedDigital?.error) return res.status(400).json({ error: parsedDigital.error });
    const protectedPayload = parseProtectedPayload(
      req.body.digital_kind,
      req.body.youtube_url,
      req.body.access_days
    );
    if (protectedPayload?.error) return res.status(400).json({ error: protectedPayload.error });
    const isYoutubeKind = protectedPayload?.kind === "youtube";
    const wantsDigital = Boolean(parsedDigital) || isYoutubeKind;
    // RÈGLE MÉTIER MboppiShop — qui publie quoi :
    //   • CRÉATEUR → uniquement des produits DIGITAUX (fichier téléchargeable) ;
    //   • BOUTIQUE → uniquement des produits PHYSIQUES ;
    //   • VENDEUR  → ne publie rien, mais VEND les deux (code vendeur).
    // Le serveur fait autorité : l'interface ne peut pas contourner cette règle.
    if (req.user.role === "shop" && wantsDigital) {
      return res.status(403).json({
        error:
          "Les produits digitaux sont réservés aux comptes créateur. Une boutique publie des produits physiques.",
        code: "DIGITAL_CREATOR_ONLY",
      });
    }
    if (req.user.role === "creator" && !wantsDigital) {
      return res.status(403).json({
        error:
          "Un compte créateur publie uniquement des produits digitaux : joignez le fichier que le client téléchargera.",
        code: "CREATOR_DIGITAL_ONLY",
      });
    }
    // LIMITE DE PUBLICATIONS : hors comptes dispensés (ex. « bestrong »), un
    // créateur ne peut pas dépasser DIGITAL_MAX_PRODUCTS produits digitaux.
    if (req.user.role === "creator" && !isUnlimitedCreator(req.user)) {
      const existing = await countDigitalProducts(req.user.id);
      if (existing >= DIGITAL_MAX_PRODUCTS) {
        return res.status(403).json({
          error: `Limite de ${DIGITAL_MAX_PRODUCTS} produits digitaux atteinte pour votre compte. Supprimez ou remplacez un produit existant pour en publier un nouveau.`,
          code: "DIGITAL_PRODUCT_LIMIT",
        });
      }
    }
    let digitalPath = null;
    let digitalSize = null;
    if (parsedDigital) {
      const resolved = await resolveDigitalFile(parsedDigital, req);
      if (resolved.error === "__STORAGE_UNAVAILABLE__") {
        return res
          .status(503)
          .json({ error: "Stockage des fichiers indisponible pour le moment. Réessayez plus tard." });
      }
      if (resolved.error) return res.status(400).json({ error: resolved.error });
      digitalPath = resolved.path;
      digitalSize = resolved.size;
    }

    const photoList = await preparePhotos(photos, `products/${req.user.id}`);
    // Un créateur est rangé dans « Arts & Artisanat » — SAUF pour un produit
    // digital (un PDF ou une formation n'est pas une création artisanale).
    const cleanCategory = wantsDigital
      ? category
        ? String(category).trim()
        : "Digital"
      : req.user.role === "creator"
        ? "Arts & Artisanat"
        : category
          ? String(category).trim()
          : null;
    const downloadLimit =
      Number(digital_download_limit) > 0 ? Math.min(Number(digital_download_limit), 100) : 5;
    const currencyCode = validCurrency(currency)
      ? String(currency).trim().toUpperCase()
      : defaultCurrencyFor(req.user.country);
    const created = await q(
      `INSERT INTO products (shop_id, name, description, price, old_price, commission_percent, image, photos, category, warranty, delivery_fee, contact, quantity, currency,
        is_digital, digital_path, digital_name, digital_mime, digital_size, digital_download_limit,
        digital_kind, youtube_id, access_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING id`,
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
        // Un fichier ne se livre pas : frais de livraison forcés à 0.
        wantsDigital ? 0 : Number(delivery_fee || 0),
        contact ? String(contact).trim() : null,
        Number(quantity || 1),
        currencyCode,
        wantsDigital,
        digitalPath,
        wantsDigital
          ? isYoutubeKind
            ? String(digital?.name || "").trim().slice(0, 160) || "Vidéo YouTube"
            : parsedDigital.name
          : null,
        wantsDigital ? (isYoutubeKind ? "video/youtube" : parsedDigital.mime) : null,
        wantsDigital ? (isYoutubeKind ? 0 : digitalSize) : null,
        downloadLimit,
        // Contenu protégé : type, ID de la vidéo YouTube (jamais exposé
        // publiquement) et durée d'accès (NULL = illimité).
        wantsDigital ? (isYoutubeKind ? "youtube" : "file") : null,
        isYoutubeKind ? protectedPayload.youtubeId : null,
        wantsDigital && protectedPayload && protectedPayload.accessDays !== null
          ? protectedPayload.accessDays
          : null,
      ]
    );
    const product = productRow((await q(SELECT_PRODUCT + " WHERE p.id = $1", [created[0].id]))[0]);
    // Notification + push temps réel « Nouveau produit » à tous les
    // utilisateurs (hors boutique émettrice, qui vient de le publier).
    // Envoi AVANT la réponse : en serverless, le code après res.json n'est pas
    // garanti d'exécuter. Jamais bloquant (try/catch + budget interne).
    // Réconciliation avec l'existant : le digest quotidien « Nouveautés du
    // jour » (getSetting/setSetting products_digest_last) sert d'anti-spam —
    // si la notification immédiate a réussi (au moins une ligne cloche écrite),
    // on marque aujourd'hui comme « déjà digesté » pour ne pas doublonner.
    const today = new Date().toISOString().slice(0, 10);
    try {
      const r = await broadcastNotification({
        type: {
          type: "new_product",
          product_id: product.id,
          product_name: product.name,
          body: String(req.user.name || "").slice(0, 120) || null,
        },
        payload: {
          title: "🆕 Nouveau produit sur MboppiShop",
          body: `« ${product.name} » vient d'être publié${req.user.name ? ` par ${req.user.name}` : ""} — venez le découvrir !`,
          url: `/produit/${product.id}`,
          tag: `product-${product.id}`,
        },
        channel: "digest",
        excludeUserId: req.user.id,
      });
      if (r && r.inserted > 0) {
        await setSetting("products_digest_last", today);
      }
    } catch (err) {
      console.error("[products] notification nouveau produit impossible :", err.message);
    }
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
  // Fichier digital du produit supprimé : retiré du bucket privé seulement s'il
  // n'est plus référencé par un autre produit (déduplication par contenu).
  if (product.digital_path) {
    try {
      const [still] = await q(
        "SELECT 1 FROM products WHERE id <> $1 AND digital_path = $2 LIMIT 1",
        [product.id, product.digital_path]
      );
      if (!still) await deleteDigitalFile(product.digital_path);
    } catch (err) {
      console.error("[storage] nettoyage fichier digital échoué :", err.message);
    }
  }
  res.json({ ok: true });
});

router.post("/:id/duplicate", authRequired, roleRequired(...OWNER_ROLES), async (req, res) => {
  const product = (await q("SELECT * FROM products WHERE id = $1", [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: "Produit introuvable" });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: "Ce produit ne vous appartient pas" });
  }
  // Le duplicata doit respecter la règle de rôle (créateur → digital,
  // boutique → physique) : inutile de créer une copie d'un type interdit.
  if (req.user.role === "creator" && product.is_digital !== true) {
    return res.status(403).json({
      error:
        "Un compte créateur publie uniquement des produits digitaux (joignez un fichier à la création d'origine).",
      code: "CREATOR_DIGITAL_ONLY",
    });
  }
  if (req.user.role === "shop" && product.is_digital === true) {
    return res.status(403).json({
      error: "Les produits digitaux sont réservés aux comptes créateur.",
      code: "DIGITAL_CREATOR_ONLY",
    });
  }
  // LIMITE DE PUBLICATIONS : même règle que la création (hors comptes dispensés).
  if (req.user.role === "creator" && product.is_digital === true && !isUnlimitedCreator(req.user)) {
    const existing = await countDigitalProducts(req.user.id);
    if (existing >= DIGITAL_MAX_PRODUCTS) {
      return res.status(403).json({
        error: `Limite de ${DIGITAL_MAX_PRODUCTS} produits digitaux atteinte pour votre compte.`,
        code: "DIGITAL_PRODUCT_LIMIT",
      });
    }
  }
  const created = await q(
    `INSERT INTO products (shop_id, name, description, price, old_price, commission_percent, image, photos, category, warranty, delivery_fee, contact, quantity, currency,
       is_digital, digital_path, digital_name, digital_mime, digital_size, digital_download_limit,
       digital_kind, youtube_id, access_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING id`,
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
      // La copie partage le même fichier (dédupliqué par contenu côté Storage)
      // ou la même vidéo YouTube — jamais d'URL publique dans les deux cas.
      product.is_digital === true,
      product.digital_path || null,
      product.digital_name || null,
      product.digital_mime || null,
      product.digital_size || null,
      Number(product.digital_download_limit) || 5,
      product.digital_kind || null,
      product.youtube_id || null,
      product.access_days === null || product.access_days === undefined
        ? null
        : Number(product.access_days) || null,
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
      digital,
      digital_download_limit,
    } = req.body;

    // --- Fichier digital : nouveau fichier, retrait, ou conservation ---
    const parsedDigital = parseDigitalPayload(digital, req.user.id);
    if (parsedDigital?.error) return res.status(400).json({ error: parsedDigital.error });
    const removeDigital = digital?.remove === true;

    // --- Contenu PROTÉGÉ (vidéo YouTube / durée d'accès) ---------------------
    // Le TYPE de contenu est figé à la création : basculer fichier ↔ YouTube
    // couperait l'accès des acheteurs déjà servis → refusé (supprimez et
    // recréez le produit tant qu'aucune vente n'existe). L'édition permet :
    //   • remplacer la vidéo YouTube (comme remplacer un fichier) ;
    //   • régler la durée d'accès (access_days, NULL = illimité).
    const currentKind =
      product.is_digital === true
        ? product.digital_kind === "youtube"
          ? "youtube"
          : "file"
        : null;
    const wasYoutube = currentKind === "youtube";
    let kindAfter = parsedDigital ? "file" : removeDigital ? "file" : undefined;
    if (req.body.digital_kind === "youtube") kindAfter = "youtube";
    else if (req.body.digital_kind === "file") kindAfter = "file";
    else if (kindAfter === undefined) kindAfter = currentKind;
    // Conversion fichier ↔ vidéo YouTube : autorisée tant qu'AUCUN client n'a
    // acheté (sinon l'accès déjà ouvert serait coupé). L'ancien contenu est
    // alors effacé (fichier Storage nettoyé plus bas).
    const kindChanged = Boolean(kindAfter && currentKind && kindAfter !== currentKind);
    if (kindChanged) {
      const [sold] = await q(
        "SELECT COUNT(*)::int AS n FROM sales WHERE product_id = $1 AND status <> 'cancelled'",
        [product.id]
      );
      if (Number(sold?.n || 0) > 0) {
        return res.status(409).json({
          error:
            currentKind === "youtube"
              ? "Impossible de convertir cette vidéo en produit fichier : des clients l'ont déjà achetée. Supprimez le produit et recréez-le si nécessaire."
              : "Impossible de convertir ce fichier en vidéo YouTube : des clients l'ont déjà acheté. Supprimez le produit et recréez-le si nécessaire.",
        });
      }
    }
    // Remplacement de la vidéo YouTube (repli : vidéo actuelle conservée).
    let youtubeIdAfter = wasYoutube ? product.youtube_id : null;
    if (kindAfter === "youtube" && req.body.youtube_url) {
      const id = parseYoutubeId(req.body.youtube_url);
      if (!id) {
        return res.status(400).json({
          error:
            "Lien YouTube invalide. Collez l'adresse de la vidéo (youtube.com/watch…, youtu.be/…) ou son identifiant à 11 caractères.",
        });
      }
      youtubeIdAfter = id;
    }
    if (kindAfter === "youtube" && !youtubeIdAfter) {
      return res.status(400).json({ error: "Lien de la vidéo YouTube requis." });
    }
    // Durée d'accès : non fournie → conservée ; null/"" → illimité ; sinon 1-3650 j.
    let accessDaysAfter = product.access_days === null ? null : Number(product.access_days) || null;
    if (req.body.access_days !== undefined) {
      const v = req.body.access_days;
      if (v === null || v === "") {
        accessDaysAfter = null;
      } else {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 3650) {
          return res.status(400).json({ error: "Durée d'accès invalide (1 à 3650 jours)." });
        }
        accessDaysAfter = n;
      }
    }
    let newDigitalPath = null;
    let newDigitalSize = null;
    if (parsedDigital) {
      const resolved = await resolveDigitalFile(parsedDigital, req);
      if (resolved.error === "__STORAGE_UNAVAILABLE__") {
        return res.status(503).json({ error: "Stockage des fichiers indisponible pour le moment." });
      }
      if (resolved.error) return res.status(400).json({ error: resolved.error });
      newDigitalPath = resolved.path;
      newDigitalSize = resolved.size;
    } else if (removeDigital && product.is_digital) {
      // Retirer le fichier couperait l'accès des acheteurs déjà servis :
      // interdit dès qu'une vente existe (annulées exclues).
      const [sold] = await q(
        "SELECT COUNT(*)::int AS n FROM sales WHERE product_id = $1 AND status <> 'cancelled'",
        [product.id]
      );
      if (Number(sold?.n || 0) > 0) {
        return res.status(409).json({
          error:
            "Impossible de retirer le fichier : des clients ont déjà acheté ce produit et doivent pouvoir le retélécharger.",
        });
      }
    }

    // Valeurs finales : le fichier existant est CONSERVÉ si aucun changement
    // n'est demandé (sinon l'édition d'un simple titre effacerait le fichier).
    const hasNewFile = Boolean(newDigitalPath);
    const isDigitalAfter = hasNewFile
      ? true
      : removeDigital && product.is_digital
        ? false
        : product.is_digital === true;
    // RÈGLE MÉTIER — le type FINAL du produit doit correspondre au rôle :
    //   • boutique → physique ; • créateur → digital.
    // Un créateur qui détient encore un ancien produit physique peut le
    // CONVERTIR en joignant un fichier (le type devient digital) ; sinon il
    // doit le supprimer. Aucune donnée n'est modifiée avant ces contrôles.
    if (req.user.role === "shop" && isDigitalAfter) {
      return res.status(403).json({
        error:
          "Les produits digitaux sont réservés aux comptes créateur. Une boutique publie des produits physiques.",
        code: "DIGITAL_CREATOR_ONLY",
      });
    }
    if (req.user.role === "creator" && !isDigitalAfter) {
      return res.status(403).json({
        error:
          "Un compte créateur publie uniquement des produits digitaux : joignez un fichier pour convertir ce produit, ou supprimez-le.",
        code: "CREATOR_DIGITAL_ONLY",
      });
    }
    // Contenu protégé : lors d'une conversion de type, l'ancien contenu
    // (fichier ou vidéo) est abandonné — seules les valeurs du NOUVEAU type
    // subsistent. Sinon le contenu existant est CONSERVÉ.
    const keepOldContent = isDigitalAfter && !kindChanged;
    const digitalPathAfter = hasNewFile
      ? newDigitalPath
      : keepOldContent
        ? product.digital_path
        : null;
    const digitalNameAfter = hasNewFile
      ? parsedDigital.name
      : keepOldContent
        ? product.digital_name
        : kindAfter === "youtube"
          ? String(name).trim().slice(0, 160) || "Vidéo YouTube"
          : null;
    const digitalMimeAfter = hasNewFile
      ? parsedDigital.mime
      : keepOldContent
        ? product.digital_mime
        : kindAfter === "youtube"
          ? "video/youtube"
          : null;
    const digitalSizeAfter = hasNewFile
      ? newDigitalSize
      : keepOldContent
        ? product.digital_size
        : isDigitalAfter
          ? 0
          : null;
    // Garde-fou : un produit digital doit TOUJOURS avoir une source de contenu
    // (fichier Storage pour « file », identifiant pour « youtube »).
    if (isDigitalAfter && kindAfter === "file" && !digitalPathAfter) {
      return res.status(400).json({
        error: "Choisissez le fichier que le client téléchargera pour ce produit digital.",
      });
    }
    const downloadLimit =
      Number(digital_download_limit) > 0
        ? Math.min(Number(digital_download_limit), 100)
        : Number(product.digital_download_limit) || 5;

    const photoList = await preparePhotos(photos, `products/${req.user.id}`);
    // Catégorie : un produit digital n'est jamais rangé dans « Arts &
    // Artisanat » (catégorie forcée des créateurs pour le reste).
    const cleanCategory = isDigitalAfter
      ? category
        ? String(category).trim()
        : product.is_digital && product.category
          ? product.category
          : "Digital"
      : req.user.role === "creator"
        ? "Arts & Artisanat"
        : category
          ? String(category).trim()
          : null;
    const currencyCode = validCurrency(currency)
      ? String(currency).trim().toUpperCase()
      : product.currency || defaultCurrencyFor(req.user.country);
    const updated = await q(
      `UPDATE products SET
       name = $1, description = $2, price = $3, old_price = $4, commission_percent = $5,
       image = $6, photos = $7, category = $8, warranty = $9, delivery_fee = $10,
       contact = $11, quantity = $12, currency = $13,
       is_digital = $14, digital_path = $15, digital_name = $16, digital_mime = $17,
       digital_size = $18, digital_download_limit = $19,
       digital_kind = $20, youtube_id = $21, access_days = $22
     WHERE id = $23 RETURNING id`,
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
        isDigitalAfter ? 0 : Number(delivery_fee || 0),
        contact ? String(contact).trim() : null,
        Number(quantity || 1),
        currencyCode,
        isDigitalAfter,
        digitalPathAfter,
        digitalNameAfter,
        digitalMimeAfter,
        digitalSizeAfter,
        downloadLimit,
        isDigitalAfter ? kindAfter : null,
        isDigitalAfter && kindAfter === "youtube" ? youtubeIdAfter : null,
        isDigitalAfter ? accessDaysAfter : null,
        product.id,
      ]
    );
    const updatedProduct = productRow(
      (await q(SELECT_PRODUCT + " WHERE p.id = $1", [updated[0].id]))[0]
    );
    // Ancien fichier digital remplacé : supprimé seulement s'il n'est plus
    // référencé par un autre produit (déduplication par contenu).
    if (
      product.digital_path &&
      (hasNewFile ? product.digital_path !== newDigitalPath : kindChanged)
    ) {
      try {
        const [still] = await q(
          "SELECT 1 FROM products WHERE id <> $1 AND digital_path = $2 LIMIT 1",
          [product.id, product.digital_path]
        );
        if (!still) await deleteDigitalFile(product.digital_path);
      } catch (err) {
        console.error("[storage] nettoyage ancien fichier digital échoué :", err.message);
      }
    }
    // Fichier retiré (aucune vente) : il n'est plus utile à personne.
    if (!isDigitalAfter && product.digital_path && !hasNewFile) {
      await deleteDigitalFile(product.digital_path);
    }

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
