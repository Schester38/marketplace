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

// Encodage WebP quand le navigateur le supporte (Chrome, Firefox, Edge, Safari 17+).
// Sinon repli silencieux sur JPEG (canvas.toDataURL renvoie du PNG si le format n'est pas pris en charge).
function canvasDataUrl(canvas, type, quality) {
  const out = canvas.toDataURL(type, quality);
  return out.startsWith("data:" + type) ? out : canvas.toDataURL("image/jpeg", quality);
}

export function thumbFromDataUrl(dataUrl, maxDim = 320, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvasDataUrl(canvas, "image/webp", quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function compressImage(file, maxDim = 800, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvasDataUrl(canvas, "image/webp", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
