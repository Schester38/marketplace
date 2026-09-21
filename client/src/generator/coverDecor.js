// Décor de couverture partagé : convertit le motif `coverShape` du modèle
// (templates.js → coverShapeSpec) en primitives géométriques neutres, puis les
// dessine sur un canvas (miniature produit, coverImage.js) ou dans un document
// jsPDF (exportPdf.js). L'aperçu HTML utilise exactement le même tableau via
// <CoverDecor /> (CoverDecor.jsx) : aperçu, PDF et miniature sont donc
// rigoureusement identiques.
import { coverShapeSpec } from "./templates.js";

/** Primitives du décor ({kind: poly|rect|circle|ring, color, …}) ou tableau vide. */
export function coverDecorPrims(template, w, h) {
  if (!template || !w || !h) return [];
  const prims = coverShapeSpec(template, w, h);
  return Array.isArray(prims) ? prims : [];
}

/** Dessine le décor sur un contexte canvas 2D (repère : pixels du canvas). */
export function drawCoverDecorCanvas(ctx, prims) {
  for (const p of prims) {
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    if (p.kind === "poly") {
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === "rect") {
      ctx.fillRect(p.x, p.y, p.w, p.h);
    } else if (p.kind === "circle") {
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "ring") {
      ctx.lineWidth = p.lw;
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Dessine le décor dans un document jsPDF (repère en mm, origine en haut à
 * gauche de la page — mêmes coordonnées que l'aperçu à l'échelle mm).
 */
export function drawCoverDecorPdf(doc, prims) {
  for (const p of prims) {
    if (p.kind === "poly") {
      // jsPDF `lines()` attend des segments en coordonnées RELATIVES + un
      // point de départ ; `closed` referme le polygone.
      const [start, ...rest] = p.pts;
      const segs = rest.map((pt, i) => {
        const prev = i === 0 ? start : rest[i - 1];
        return [pt[0] - prev[0], pt[1] - prev[1]];
      });
      doc.setFillColor(p.color);
      doc.lines(segs, start[0], start[1], [1, 1], "F", true);
    } else if (p.kind === "rect") {
      doc.setFillColor(p.color);
      doc.rect(p.x, p.y, p.w, p.h, "F");
    } else if (p.kind === "circle") {
      doc.setFillColor(p.color);
      doc.circle(p.cx, p.cy, p.r, "F");
    } else if (p.kind === "ring") {
      doc.setDrawColor(p.color);
      doc.setLineWidth(p.lw);
      doc.circle(p.cx, p.cy, p.r, "S");
    }
  }
}
