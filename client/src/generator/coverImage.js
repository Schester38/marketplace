// Rendu de la couverture en image (canvas local, aucun service tiers).
// Deux usages réels :
//   1. miniature de la bibliothèque du Générateur (gen-thumb) ;
//   2. image de couverture du produit digital lors de la publication
//      « Vendre sur MboppiShop » (bucket `photos` via POST /generator/.../publish).
// Le rendu reprend exactement les codes du modèle (fond, texte, titre,
// sous-titre, auteur, image de fond, cadrage) : l'aperçu de l'éditeur, le PDF
// et la miniature du catalogue montrent donc la même couverture.
import { FONT_CSS, resolveTemplate, resolveCover, coverLayoutBox } from "./templates.js";
import { coverDecorPrims, drawCoverDecorCanvas } from "./coverDecor.js";
import { makeQrDataUrl, verificationPayload } from "./protection.js";

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

export async function renderCoverImage(docMeta, { width = 480, maxBytes = 0 } = {}) {
  const template = resolveTemplate(
    (await import("./templates.js")).getTemplate(docMeta.template_id),
    docMeta.style_overrides
  );
  const cover = resolveCover(docMeta, template);
  const w = Math.max(120, Math.round(width));
  const h = Math.round(w * RATIO);
  const geo = coverLayoutBox(cover, w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = cover.bg;
  ctx.fillRect(0, 0, w, h);

  // Décor géométrique du modèle (formes d'accent) : DERRIÈRE l'image de fond
  // (l'image reste entièrement visible devant les formes) et derrière le texte.
  drawCoverDecorCanvas(ctx, coverDecorPrims(template, w, h));

  // Image de fond éventuelle + voile RÉGLABLE (« Opacité de l'image »).
  // La bibliothèque ne reçoit qu'une MINIATURE (`thumb`, ~20 Ko) : les gros
  // data-URI de couverture ne circulent plus dans la liste (egress Supabase).
  const bgImage = cover.image || cover.thumb;
  if (bgImage) {
    const img = await loadImage(bgImage);
    if (img) {
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      // Cadrage vertical réglable (`imageY`, 0 % = haut de la photo conservé,
      // 100 % = bas) — par défaut 30 % : le haut de l'image n'est plus coupé.
      const oy = ((cover.imageY ?? 30) / 100) * Math.max(0, dh - h);
      ctx.drawImage(img, (w - dw) / 2, -oy, dw, dh);
      if (cover.dim > 0) {
        ctx.globalAlpha = cover.dim;
        ctx.fillStyle = cover.bg;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Mise en page « bande » : AUCUNE couche de couleur sur la photo — le titre
  // (blanc) se pose directement sur l'image, dans le tiers inférieur
  // (rendu identique au PDF et à l'aperçu HTML).

  const fg = geo.band ? "#ffffff" : cover.fg;
  const align = geo.leftish ? "left" : cover.align;
  const titleFont = coverageFont(template.headingFont, Math.round(w * (geo.band ? 0.09 : 0.105)));
  const subFont = coverageFont(template.headingFont, Math.round(w * 0.05));
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

  // L'auteur n'est JAMAIS dessiné sur la couverture (règle produit).

  // QR de vérification sur l'affiche du produit publié (et les miniatures) :
  // même emplacement que le QR de couverture PDF : coin inférieur droit, avec
  // une marge proportionnelle équivalente aux 10 mm du PDF. L'affiche vendue
  // au catalogue prouve donc elle-même l'origine du document.
  if (docMeta.protection?.qrEnabled !== false && docMeta.doc_ref) {
    try {
      const qr = await makeQrDataUrl(verificationPayload(docMeta, docMeta.content_hash), 240);
      const qimg = qr ? await loadImage(qr) : null;
      if (qimg) {
        // 22 mm sur une largeur A4 de 210 mm ≈ 10,48 % ; 10 mm ≈ 4,76 %.
        const size = Math.max(1, Math.round(w * 0.1048));
        const pad = Math.max(1, Math.round(w * 0.0476));
        const x = w - size - pad;
        const y = h - size - pad;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
        ctx.drawImage(qimg, x, y, size, size);
      }
    } catch {
      /* QR indisponible : couverture sans QR */
    }
  }

  try {
    // La couverture catalogue est une affiche : on évite de faire remonter
    // une image trop lourde dans le bucket public. Les couvertures EPUB/PDF
    // utilisent leur propre rendu et ne sont pas affectées par ce plafond.
    const qualities = [0.86, 0.82, 0.78, 0.74, 0.7, 0.66];
    let encoded = canvas.toDataURL("image/jpeg", qualities[0]);
    if (maxBytes > 0 && w >= 800) {
      for (const quality of qualities) {
        encoded = canvas.toDataURL("image/jpeg", quality);
        const base64 = encoded.split(",")[1] || "";
        const bytes = Math.floor((base64.length * 3) / 4);
        if (bytes <= maxBytes) return encoded;
      }
      return null;
    }
    return encoded;
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

/**
 * Miniature d'une image de couverture DÉJÀ en data-URI — migration douce des
 * couvertures importées avant l'existence de `cover.thumb` : la bibliothèque
 * n'a alors plus besoin de transporter l'image complète (egress Supabase).
 */
export async function makeCoverThumb(dataUrl, maxW = 280, quality = 0.68) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const img = await loadImage(dataUrl);
  if (!img || !img.width) return null;
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

export async function libraryThumb(docMeta, width = 120) {
  const key = `${docMeta.id}:${width}:${docMeta.updated_at}:${docMeta.template_id}:${
    docMeta.protection?.qrEnabled !== false
  }:${JSON.stringify(docMeta.cover || {})}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const url = await renderCoverImage(docMeta, { width });
  if (thumbCache.size > 60) thumbCache.clear();
  thumbCache.set(key, url);
  return url;
}
