import crypto from "crypto";
import { q } from "./db.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "photos";
const PAYMENT_PROOF_BUCKET = process.env.SUPABASE_PAYMENT_PROOF_BUCKET || "payment-proofs";

// Les URLs produites sont immuables (hash du contenu + uuid) : elles peuvent
// être servies par le CDN / cache navigateur « pour toujours ».
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// Le Storage valide l'Authorization Bearer comme JWT.
// - Clé legacy (eyJ...) : utilisée telle quelle.
// - Nouvelle clé opaque (sb_secret_...) : on signe un jeton service_role HS256
//   avec le SUPABASE_JWT_SECRET du projet (mécanisme historique des clés service_role).
let cachedToken = null;
function apiToken() {
  if (cachedToken) return cachedToken;
  if (!SERVICE_KEY) return null;
  if (SERVICE_KEY.startsWith("eyJ")) {
    cachedToken = SERVICE_KEY;
  } else if (JWT_SECRET) {
    const b64url = (b) => Buffer.from(b).toString("base64url");
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64url(JSON.stringify({ iss: "supabase", role: "service_role" }));
    const signature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    cachedToken = `${header}.${payload}.${signature}`;
  } else {
    cachedToken = SERVICE_KEY;
  }
  return cachedToken;
}

export function isStoredUrl(s) {
  return typeof s === "string" && /^https?:\/\//.test(s) && !s.startsWith("data:");
}

export function isBase64Photo(s) {
  return typeof s === "string" && /^data:image\//.test(s);
}
export function dataUriParts(uri) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(String(uri || ""));
  if (!m) return null;
  return {
    type: m[1],
    ext: EXT_BY_TYPE[m[1]] || m[1].split("/")[1] || "bin",
    buffer: Buffer.from(m[2], "base64"),
  };
}

export function publicUrl(path, bucketName = BUCKET) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${path}`;
}

async function request(path, options = {}, bucketName = BUCKET) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "Supabase Storage non configuré : variables SUPABASE_URL / SUPABASE_SERVICE_KEY absentes"
    );
  }
  const token = apiToken();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/${path.replace(/^\//, "")}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      ...(options.headers || {}),
    },
  });
  return res;
}

export async function ensureBucket(bucketName = BUCKET) {
  const res = await request("bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucketName, name: bucketName, public: true }),
  }, bucketName);
  if (res.ok || res.status === 409) return;
  const text = await res.text().catch(() => "");
  if (/BucketAlreadyExists/i.test(text)) return;
  throw new Error(`Création du bucket ${bucketName} échouée (${res.status}) : ${text.slice(0, 160)}`);
}

const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Empreinte courte (48 bits) d'un buffer — déduplication des doublons exacts. */
function contentHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
}

// --- Conversion automatique WebP -------------------------------------------------
// Les photos (produits, offres, preuves de paiement) arrivent generalement en
// JPEG ou PNG, souvent tres lourdes depuis un telephone. On les convertit en
// WebP avant l'upload : meme rendu visuel, poids tres nettement reduit.
// sharp est importe dynamiquement : s'il est absent ou incompatible sur
// l'environnement, on garde le fichier original (aucune rupture d'upload).
let sharpMod = null;
let sharpTried = false;
async function getSharp() {
  if (!sharpTried) {
    sharpTried = true;
    try {
      sharpMod = (await import("sharp")).default;
    } catch (err) {
      console.warn("[storage] sharp indisponible, conversion WebP desactivee :", err.message);
    }
  }
  return sharpMod;
}

// Pas de conversion pour les micro-images (icones, logos minuscules) : gain
// negligeable, et la conversion peut meme les alourdir.
const WEBP_MIN_BYTES = 8 * 1024;
const WEBP_QUALITY = 80;
// Garde-fou pour les originaux tres larges (photos d'appareils recents).
const WEBP_MAX_WIDTH = 2000;
// Formats sources convertis. Le GIF (animation) et l'AVIF (deja plus compact)
// sont conserves tels quels ; le WebP recu ne doit pas etre re-encode.
const WEBP_SOURCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

/**
 * Convertit un buffer image en WebP. Retourne `null` si la conversion n'est
 * pas applicable (format non eligible, image trop petite, sharp absent,
 * erreur de decodage, ou resultat plus lourd que l'original) : l'appelant
 * conserve alors le buffer d'origine.
 */
export async function toWebp(buffer, type) {
  if (!Buffer.isBuffer(buffer) || !WEBP_SOURCE_TYPES.has(type)) return null;
  if (buffer.length < WEBP_MIN_BYTES) return null;
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const out = await sharp(buffer, { failOn: "none" })
      .rotate() // applique l'orientation EXIF (photos de telephone)
      .resize({ width: WEBP_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    // Securite : si le WebP est plus lourd que l'original, on garde l'original.
    return out && out.length > 0 && out.length < buffer.length ? out : null;
  } catch (err) {
    console.warn("[storage] conversion WebP echouee, image originale conservee :", err.message);
    return null;
  }
}

/**
 * Upload un buffer vers Storage, sous `{folder}/{hash}/{variant}.{ext}`.
 * - Le dossier par hash permet de DÉDUPLIQUER : un contenu identique importé
 *   deux fois partage le même fichier (aucune copie en double).
 * - `HEAD` avant l'upload : si le fichier existe déjà, on réutilise son URL
 *   (zéro octet transféré, aucune fuite de fichiers orphelins).
 * - Cache-Control immutable : les URLs sont versionnées par contenu/uuids.
 */
export async function uploadBuffer(buffer, type, folder = "products", variant = "auto", bucketName = BUCKET) {
  // Conversion automatique en WebP (produits, offres, preuves de paiement) :
  // meme rendu visuel, poids tres nettement reduit. Si la conversion n'est pas
  // applicable (format non eligible, sharp absent, resultat plus lourd), le
  // buffer d'origine est conserve — aucune rupture d'upload.
  const converted = await toWebp(buffer, type);
  if (converted) {
    buffer = converted;
    type = "image/webp";
  }
  const ext = EXT_BY_TYPE[type] || "bin";
  const path = `${folder}/${contentHash(buffer)}/${variant}.${ext}`;
  const fullPath = `object/${bucketName}/${path}`;

  const head = await request(fullPath, { method: "HEAD" }, bucketName);
  if (head.ok || head.status === 200) return publicUrl(path, bucketName);

  const res = await request(fullPath, {
    method: "POST",
    headers: {
      "Content-Type": type,
      "Cache-Control": IMMUTABLE_CACHE_CONTROL,
    },
    body: buffer,
  }, bucketName);
  if (res.ok || res.status === 409) return publicUrl(path, bucketName);
  const text = await res.text().catch(() => "");
  throw new Error(`Upload Storage échoué (${res.status}) : ${text.slice(0, 160)}`);
}

export async function uploadPhoto(dataUri, folder = "products", variant = "auto") {
  const parts = dataUriParts(dataUri);
  if (!parts) return null;
  return uploadBuffer(parts.buffer, parts.type, folder, variant);
}

export async function uploadPaymentProof(dataUri, folder = "payments") {
  const parts = dataUriParts(dataUri);
  if (!parts) return null;
  if (!SUPABASE_URL || !SERVICE_KEY) return dataUri;
  try {
    await ensureBucket(PAYMENT_PROOF_BUCKET);
    return await uploadBuffer(parts.buffer, parts.type, folder, "proof", PAYMENT_PROOF_BUCKET);
  } catch (err) {
    console.warn("[storage] upload preuve paiement fallback base64 :", err.message);
    return dataUri;
  }
}

/**
 * Enregistre les photos d'un produit/offre.
 * Format d'entrée : liste d'entrées { thumb?, medium?, large?, full?, meta? }
 * dont les valeurs sont des data-URIs (à uploader) ou des URLs déjà stockées
 * (conservées telles quelles — édition sans re-upload).
 * Rétrocompatible : l'ancien format { thumb, full } est accepté (full est alors
 * mappé sur medium/large comme avant).
 */
export async function storePhotos(photoList, folder = "products") {
  const out = [];
  for (const ph of photoList || []) {
    if (!ph || typeof ph !== "object") continue;
    const entry = {};
    const variants = [
      ["thumb", ph.thumb],
      ["medium", ph.medium],
      ["large", ph.large],
      ["full", ph.full],
    ];
    for (const [name, value] of variants) {
      if (typeof value !== "string" || !value) continue;
      if (isStoredUrl(value)) {
        entry[name] = value;
      } else if (isBase64Photo(value)) {
        const url = await uploadPhoto(value, folder, name === "full" ? "full" : name);
        if (url) entry[name] = url;
      }
    }
    // Rétrocompat : un `full` legacy se comporte comme le « large » de l'époque.
    if (!entry.medium && entry.full) entry.medium = entry.full;
    if (!entry.large && entry.full) entry.large = entry.full;
    if (entry.thumb || entry.medium || entry.large) {
      if (ph.meta && typeof ph.meta === "object") entry.meta = ph.meta;
      out.push(entry);
    }
  }
  return out.slice(0, 3);
}

// photos : tableau de strings (offres) — data URI à uploader, URLs conservées.
export async function storePhotoStrings(photos, folder = "offers") {
  const out = [];
  for (const ph of photos || []) {
    if (isStoredUrl(ph)) out.push(ph);
    else if (isBase64Photo(ph)) {
      const url = await uploadPhoto(ph, folder);
      if (url) out.push(url);
    }
  }
  return out.slice(0, 3);
}

const OBJECT_PREFIX = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/`;

function storageKeyOf(value) {
  if (typeof value !== "string" || !OBJECT_PREFIX || !value.startsWith(OBJECT_PREFIX)) return null;
  return decodeURIComponent(value.slice(OBJECT_PREFIX.length));
}

// Extrait les clés Storage d'un photos JSON : [{thumb, medium, large, full}]
// ou tableau de strings.
export function collectStorageKeys(photosJson) {
  let entries = [];
  try {
    entries = JSON.parse(photosJson || "[]");
  } catch {
    entries = [];
  }
  const keys = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (typeof e === "string") {
      const k = storageKeyOf(e);
      if (k) keys.push(k);
    } else if (e && typeof e === "object") {
      for (const field of ["thumb", "medium", "large", "full"]) {
        const k = storageKeyOf(e[field]);
        if (k) keys.push(k);
      }
    }
  }
  return [...new Set(keys)];
}

/** Échappe les jokers LIKE (% _ \). */
function likeEscaped(key) {
  return key.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Vrai si la clé Storage est toujours référencée par un autre produit, une
 * offre ou une commande (sauf le produit en cours d'édition). Évite de
 * supprimer un fichier partagé (déduplication) ou cité dans des commandes.
 */
async function isKeyStillUsed(key, excludeProductId) {
  const pat = `%${likeEscaped(key)}%`;
  const rows = await q(
    `SELECT 1 FROM products WHERE id <> $1 AND (photos LIKE $2 OR image LIKE $2)
     UNION ALL SELECT 1 FROM offers WHERE photos LIKE $2
     UNION ALL SELECT 1 FROM orders WHERE items::text LIKE $2
     LIMIT 1`,
    [excludeProductId ?? -1, pat]
  );
  return rows.length > 0;
}

/**
 * Supprime les fichiers du bucket (best-effort). Ne touche que les objets de CE
 * projet et seulement ceux qui ne sont plus référencés (sûreté : déduplication,
 * commandes historiques). Passe `force: true` pour tout supprimer.
 */
export async function deleteStorageKeys(keys, { excludeProductId, force = false } = {}) {
  if (!keys || !keys.length) return 0;
  if (!force) {
    const unused = [];
    for (const key of keys) {
      if (typeof key !== "string") continue;
      try {
        if (!(await isKeyStillUsed(key, excludeProductId))) unused.push(key);
      } catch (err) {
        console.error("[storage] vérification de référence échouée, fichier conservé :", err.message);
      }
    }
    keys = unused;
  }
  if (!keys.length) return 0;
  const token = apiToken();
  let deleted = 0;
  for (const key of keys) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    });
    if (res.ok || res.status === 404) deleted += 1;
  }
  return deleted;
}

// Estime l'occupation du bucket (nb de fichiers + taille totale) en listant les
// objets par pages de 1000. Utile pour surveiller le quota gratuit du Storage.
export async function storageUsage() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  const token = apiToken();
  let count = 0;
  let bytes = 0;
  let offset = 0;
  for (;;) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: "", limit: 1000, offset }),
    });
    if (!res.ok) {
      throw new Error(`Liste du bucket ${BUCKET} échouée (${res.status})`);
    }
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;
    for (const it of items) {
      if (it && it.id) {
        count += 1;
        const m = it.metadata || {};
        bytes += Number(m.size || m.contentLength || 0) || 0;
      }
    }
    offset += items.length;
    if (items.length < 1000) break;
  }
  return { count, bytes };
}
