// ─── Filigrane partagé par le PDF classique et le PDF du Studio ────────────────
// Le texte est réduit si nécessaire, puis ancré avec `baseline: middle` : le
// centre visuel reste au centre de la page même après la rotation à 45°.
import { FONT_PDF } from "./templates.js";

function setWatermarkColor(doc, hex) {
  const value = String(hex || "#555555");
  const match = value.match(/^#([0-9a-f]{6})$/i);
  const rgb = match
    ? [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16))
    : [85, 85, 85];
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

export function watermarkPreviewFontSize(box) {
  // ×2 par rapport à l'ancienne taille : le filigrane doit être perceptible
  // sans nécessiter un zoom, y compris sur un écran de téléphone.
  return Math.min(84, Math.max(36, Math.min(Number(box?.w) || 210, Number(box?.h) || 297) * 0.32));
}

/** Opacité commune à l'aperçu et aux exports PDF. */
export function watermarkOpacity(mode) {
  return mode === "visible" ? 0.3 : 0.12;
}

export function watermarkFontSize(doc, text, box) {
  const { w, h } = box;
  const maxWidth = (w + h) / Math.SQRT2 * 0.82;
  let size = Math.min(84, Math.max(36, Math.min(w, h) * 0.32));
  doc.setFontSize(size);
  while (size > 9 && doc.getTextWidth(String(text)) > maxWidth) {
    size -= 1;
    doc.setFontSize(size);
  }
  return size;
}

/** Dessine un filigrane diagonal centré sur toute la surface de la page. */
export function drawWatermarkPdf(doc, docMeta, box, { font = "sans" } = {}) {
  const wm = docMeta?.protection?.watermark;
  if (!wm?.enabled) return;
  const text = String(wm.text || `© ${docMeta.author || "Auteur"}`);
  const { w, h } = box;
  doc.saveGraphicsState();
  try {
    doc.setGState(new doc.GState({ opacity: watermarkOpacity(wm.mode) }));
  } catch {
    /* Certains builds jsPDF n exposent pas GState : le texte reste visible. */
  }
  doc.setFont(FONT_PDF[font] || "sans", "bold");
  if (typeof doc.setCharSpace === "function") doc.setCharSpace(0);
  watermarkFontSize(doc, text, box);
  setWatermarkColor(doc, wm.color || "#555555");
  doc.text(text, w / 2, h / 2, { align: "center", baseline: "middle", angle: 45 });
  doc.restoreGraphicsState();
}
