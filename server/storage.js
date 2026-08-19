import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'photos';

// Le Storage valide l'Authorization Bearer comme JWT.
// - Clé legacy (eyJ...) : utilisée telle quelle.
// - Nouvelle clé opaque (sb_secret_...) : on signe un jeton service_role HS256
//   avec le SUPABASE_JWT_SECRET du projet (mécanisme historique des clés service_role).
let cachedToken = null;
function apiToken() {
  if (cachedToken) return cachedToken;
  if (!SERVICE_KEY) return null;
  if (SERVICE_KEY.startsWith('eyJ')) {
    cachedToken = SERVICE_KEY;
  } else if (JWT_SECRET) {
    const b64url = (b) => Buffer.from(b).toString('base64url');
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ iss: 'supabase', role: 'service_role' }));
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
    cachedToken = `${header}.${payload}.${signature}`;
  } else {
    cachedToken = SERVICE_KEY;
  }
  return cachedToken;
}

export function isStoredUrl(s) {
  return typeof s === 'string' && /^https?:\/\//.test(s) && !s.startsWith('data:');
}

export function isBase64Photo(s) {
  return typeof s === 'string' && /^data:image\//.test(s);
}

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function dataUriParts(uri) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(String(uri || ''));
  if (!m) return null;
  return { type: m[1], ext: EXT_BY_TYPE[m[1]] || m[1].split('/')[1] || 'bin', buffer: Buffer.from(m[2], 'base64') };
}

export function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function request(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Supabase Storage non configuré : variables SUPABASE_URL / SUPABASE_SERVICE_KEY absentes');
  }
  const token = apiToken();
  const res = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      ...(options.headers || {}),
    },
  });
  return res;
}

export async function ensureBucket() {
  const res = await request('bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (res.ok || res.status === 409) return;
  const text = await res.text().catch(() => '');
  if (/BucketAlreadyExists/i.test(text)) return;
  throw new Error(`Création du bucket ${BUCKET} échouée (${res.status}) : ${text.slice(0, 160)}`);
}

export async function uploadBuffer(buffer, type, folder = 'products') {
  const ext = EXT_BY_TYPE[type] || 'bin';
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const res = await request(`object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload Storage échoué (${res.status}) : ${text.slice(0, 160)}`);
  }
  return publicUrl(path);
}

export async function uploadPhoto(dataUri, folder = 'products') {
  const parts = dataUriParts(dataUri);
  if (!parts) return null;
  return uploadBuffer(parts.buffer, parts.type, folder);
}

// photoList : [{thumb, full}] avec des data URIs et/ou des URLs déjà stockées.
// Les URLs existantes sont conservées telles quelles (édition sans re-upload).
export async function storePhotos(photoList, folder = 'products') {
  const out = [];
  for (const ph of photoList || []) {
    if (!ph) continue;
    const entry = {};
    if (isStoredUrl(ph.thumb)) entry.thumb = ph.thumb;
    else if (isBase64Photo(ph.thumb)) entry.thumb = await uploadPhoto(ph.thumb, folder);
    if (isStoredUrl(ph.full)) entry.full = ph.full;
    else if (isBase64Photo(ph.full)) entry.full = await uploadPhoto(ph.full, folder);
    if (entry.thumb || entry.full) out.push(entry);
  }
  return out.slice(0, 3);
}

// photos : tableau de strings (offres) — data URI à uploader, URLs conservées.
export async function storePhotoStrings(photos, folder = 'offers') {
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