export function parsePhotos(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const ok = (v) => typeof v === "string" && (v.startsWith("data:image/") || /^https?:\/\//.test(v));

/**
 * Normalise une entrée photo en { thumb, medium, large }.
 * Formats acceptés (rétrocompatibles) :
 *  - "https://…"                        (string seule)
 *  - { thumb, full }                    (ancien format 2 variantes)
 *  - { thumb, medium, large }           (nouveau format 3 variantes)
 *  - { thumb, medium, large, meta }     (+ métadonnées d'optimisation)
 */
export function entry(x) {
  if (typeof x === "string" && ok(x)) return { thumb: x, medium: x, large: x };
  if (!x || typeof x !== "object") return null;
  const t = ok(x.thumb) ? x.thumb : null;
  const m = ok(x.medium) ? x.medium : null;
  const l = ok(x.large) ? x.large : null;
  const f = ok(x.full) ? x.full : null;
  const thumb = t || m || l || f;
  const medium = m || f || l || thumb;
  const large = l || f || medium || thumb;
  if (!thumb && !medium && !large) return null;
  const out = { thumb, medium: medium || thumb, large: large || medium || thumb };
  if (x.meta && typeof x.meta === "object") out.meta = x.meta;
  return out;
}

export function photoEntries(raw) {
  return parsePhotos(raw).map(entry).filter(Boolean).slice(0, 3);
}

/** Thumbnails — listes, catalogues, vignettes. */
export function listPhotos(raw) {
  return photoEntries(raw).map((e) => e.thumb);
}

/** Version « medium » — affichage principal de la fiche produit. */
export function mediumPhotos(raw) {
  return photoEntries(raw).map((e) => e.medium || e.thumb);
}

/** Meilleure version disponible (large) — zoom, lightbox, og:image. */
export function fullPhotos(raw) {
  return photoEntries(raw).map((e) => e.large || e.medium || e.thumb);
}

/** Métadonnées d'optimisation (largeur, poids, format, original…). */
export function photoMetaList(raw) {
  return photoEntries(raw).map((e) => e.meta || null);
}

export function normalizeUploadPhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos.map(entry).filter(Boolean).slice(0, 3);
}
