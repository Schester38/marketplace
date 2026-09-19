// Rendu de la couverture en image (canvas local, aucun service tiers).
// Deux usages réels :
//   1. miniature de la bibliothèque du Générateur (gen-thumb) ;
//   2. image de couverture du produit digital lors de la publication
//      « Vendre sur Mboppi » (bucket `photos` via POST /generator/.../publish).
// Le rendu reprend exactement les codes du modèle (fond, texte, titre,
// sous-titre, auteur, image de fond, cadrage) : l'aperçu de l'éditeur, le PDF
// et la miniature du catalogue montrent donc la même couverture.
import { FONT_CSS, resolveTemplate } from "./templates.js";

const RATIO = 1.5; // hauteur / largeur (format livre portrait)

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Découpe un texte en lignes tenant dans maxWidth (mesure réelle du canvas).
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) return lines;
    } else {
      cur = test;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

export async function renderCoverImage(docMeta, { width = 480 } = {}) {
  const template = resolveTemplate(
    (await import("./templates.js")).getTemplate(docMeta.template_id),
    docMeta.style_overrides
  );
  const cover = docMeta.cover || {};
  const w = Math.max(120, Math.round(width));
  const h = Math.round(w * RATIO);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const bg = cover.bg || template.coverBg;
  const fg = cover.text || template.coverText;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Image de fond éventuelle (assombrie pour garder le titre lisible).
  if (cover.image) {
    const img = await loadImage(cover.image);
    if (img) {
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, Math.max(0, Number(cover.imageDim ?? 0.35)))})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  const pad = Math.round(w * 0.1);
  const maxW = w - pad * 2;
  const titleFont = coverageFont(template.headingFont, Math.round(w * 0.105));
  const subFont = coverageFont(template.headingFont, Math.round(w * 0.05));
  const authorFont = coverageFont(template.bodyFont, Math.round(w * 0.045));

  ctx.textAlign = "center";
  ctx.fillStyle = fg;

  const title = String(cover.title || docMeta.title || "Sans titre").toUpperCase();
  const sub = String(cover.subtitle || docMeta.subtitle || "");

  ctx.font = titleFont;
  const titleLines = wrap(ctx, title, maxW, 5);
  const titleLH = Math.round(w * 0.13);
  ctx.font = subFont;
  const subLines = wrap(ctx, sub, maxW, 3);
  const subLH = Math.round(w * 0.075);

  const blockH = titleLines.length * titleLH + (subLines.length ? subLines.length * subLH + 12 : 0);
  let y = Math.max(h * 0.2, h * 0.5 - blockH / 2);

  ctx.font = titleFont;
  for (const line of titleLines) {
    y += titleLH;
    ctx.fillText(line, w / 2, y);
  }
  if (subLines.length) {
    ctx.font = subFont;
    ctx.globalAlpha = 0.88;
    y += 12;
    for (const line of subLines) {
      y += subLH;
      ctx.fillText(line, w / 2, y);
    }
    ctx.globalAlpha = 1;
  }

  if (docMeta.author) {
    ctx.font = authorFont;
    ctx.fillText(String(docMeta.author).slice(0, 60), w / 2, h - Math.round(h * 0.06));
  }

  try {
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return null;
  }
}

// Police canvas : même famille que le PDF (serif/sans/mono) avec repli système.
function coverageFont(token, px) {
  const css = String(FONT_CSS[token] || FONT_CSS.sans)
    .split(",")[0]
    .replace(/["']/g, "")
    .trim();
  return `600 ${px}px "${css}", "Segoe UI", system-ui, sans-serif`;
}

// Miniatures de bibliothèque : cache mémoire (une couverture par document et
// par largeur) — évite de redessiner le canvas à chaque rendu de la liste.
const thumbCache = new Map();

export async function libraryThumb(docMeta, width = 120) {
  const key = `${docMeta.id}:${width}:${docMeta.updated_at}:${docMeta.template_id}:${JSON.stringify(
    docMeta.cover || {}
  )}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const url = await renderCoverImage(docMeta, { width });
  if (thumbCache.size > 60) thumbCache.clear();
  thumbCache.set(key, url);
  return url;
}
