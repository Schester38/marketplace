// Rendu de la couverture en image (canvas local, aucun service tiers).
// Deux usages réels :
//   1. miniature de la bibliothèque du Générateur (gen-thumb) ;
//   2. image de couverture du produit digital lors de la publication
//      « Vendre sur Mboppi » (bucket `photos` via POST /generator/.../publish).
// Le rendu reprend exactement les codes du modèle (fond, texte, titre,
// sous-titre, auteur, image de fond, cadrage) : l'aperçu de l'éditeur, le PDF
// et la miniature du catalogue montrent donc la même couverture.
import { FONT_CSS, resolveTemplate, resolveCover, coverLayoutBox } from "./templates.js";

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
  const cover = resolveCover(docMeta, template);
  const geo = coverLayoutBox(cover, w);
  const w = Math.max(120, Math.round(width));
  const h = Math.round(w * RATIO);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = cover.bg;
  ctx.fillRect(0, 0, w, h);

  // Image de fond éventuelle + voile RÉGLABLE (« Opacité de l'image »).
  if (cover.image) {
    const img = await loadImage(cover.image);
    if (img) {
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      if (cover.dim > 0) {
        ctx.globalAlpha = cover.dim;
        ctx.fillStyle = cover.bg;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Mise en page « bande » : tiers inférieur aux couleurs d'accent du modèle.
  if (geo.band) {
    ctx.fillStyle = cover.accent;
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
  }

  const fg = geo.band ? "#ffffff" : cover.fg;
  const align = geo.leftish ? "left" : cover.align;
  const titleFont = coverageFont(template.headingFont, Math.round(w * (geo.band ? 0.09 : 0.105)));
  const subFont = coverageFont(template.headingFont, Math.round(w * 0.05));
  const authorFont = coverageFont(template.bodyFont, Math.round(w * 0.045));
  const titleLH = Math.round(w * 0.13);
  const subLH = Math.round(w * 0.075);

  ctx.textAlign = align;
  ctx.fillStyle = fg;
  // Ancrage horizontal de la boîte de titre (mêmes règles que PDF et aperçu).
  const textX = align === "center" ? geo.x + geo.maxW / 2 : align === "right" ? geo.x + geo.maxW : geo.x;

  if (cover.showTitle) {
    ctx.font = titleFont;
    const titleLines = wrap(ctx, cover.title.toUpperCase(), geo.maxW, 5);
    ctx.font = subFont;
    const subLines = cover.subtitle ? wrap(ctx, cover.subtitle, geo.maxW, 3) : [];
    let y = (geo.yPct / 100) * h;
    ctx.font = titleFont;
    for (const line of titleLines) {
      y += titleLH;
      ctx.fillText(line, textX, y);
    }
    if (subLines.length) {
      ctx.font = subFont;
      ctx.globalAlpha = 0.88;
      y += Math.round(w * 0.025);
      for (const line of subLines) {
        y += subLH;
        ctx.fillText(line, textX, y);
      }
      ctx.globalAlpha = 1;
    }
    // Règle d'accent sous le bloc titre (identité du modèle).
    if (cover.rule && !geo.band) {
      const rw = align === "center" ? geo.maxW * 0.3 : Math.min(geo.maxW * 0.45, w * 0.4);
      const rx = align === "center" ? geo.x + (geo.maxW - rw) / 2 : geo.x;
      ctx.fillStyle = cover.accent;
      ctx.fillRect(rx, y + Math.round(w * 0.02), rw, Math.max(2, Math.round(w * 0.006)));
      ctx.fillStyle = fg;
    }
  }

  if (cover.author) {
    ctx.font = authorFont;
    ctx.textAlign = geo.band ? "right" : align;
    const ax = geo.band ? geo.x + geo.maxW : textX;
    ctx.fillText(
      String(cover.author).slice(0, 60),
      ax,
      geo.band ? h - Math.round(h * 0.045) : h - Math.round(h * 0.06)
    );
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
