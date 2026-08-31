import { compressImage, thumbFromDataUrl } from "./imageKit.js";

export { compressImage, thumbFromDataUrl };

export function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [header.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Note : compression d'images gérée par `imageKit.js` (pipeline intelligente :
// détection « déjà optimisée », redimensionnement, conversion WebP, transparence).

// Agrège des éléments par jour sur N jours : [{key,label,value}] chronologiques.
// Utilisé par les courbes des espaces boutique/vendeur/créateur/livreur.
export function dailyBuckets(items, { days = 14, dateKey = "created_at", valueFn } = {}) {
  const now = new Date();
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (days - 1 - i));
    return {
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      value: 0,
    };
  });
  const index = Object.fromEntries(buckets.map((b, i) => [b.key, i]));
  for (const item of items || []) {
    const raw = item?.[dateKey];
    if (!raw) continue;
    const k = new Date(raw).toISOString().slice(0, 10);
    const i = index[k];
    if (i === undefined) continue;
    buckets[i].value += valueFn ? Number(valueFn(item) || 0) : 1;
  }
  return buckets;
}
