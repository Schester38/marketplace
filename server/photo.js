export function parsePhotos(raw) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function entry(x) {
  const ok = (v) =>
    typeof v === "string" && (v.startsWith("data:image/") || /^https?:\/\//.test(v));
  if (typeof x === "string" && ok(x)) return { thumb: x, full: x };
  if (x && typeof x === "object" && typeof x.full === "string" && ok(x.full)) {
    const thumb = typeof x.thumb === "string" && ok(x.thumb) ? x.thumb : x.full;
    return { thumb, full: x.full };
  }
  return null;
}

export function photoEntries(raw) {
  return parsePhotos(raw).map(entry).filter(Boolean).slice(0, 3);
}

export function listPhotos(raw) {
  return photoEntries(raw).map((e) => e.thumb);
}

export function fullPhotos(raw) {
  return photoEntries(raw).map((e) => e.full);
}

export function normalizeUploadPhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos.map(entry).filter(Boolean).slice(0, 3);
}
