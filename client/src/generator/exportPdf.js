// Export PDF réel (jsPDF) à partir de la structure paginée du moteur.
// Le rendu consomme EXACTEMENT la même sortie que l'aperçu HTML (mêmes
// positions mot à mot mesurées via l'API Range) → aperçu = PDF.
//
// Polices natives (Times/Helvetica/Courier) : accents FR garantis, fichier
// léger. Images dataURL intégrées directement ; URLs http(s) téléchargées
// puis converties (échec silencieux → image ignorée). Métadonnées complètes,
// watermark optionnel, QR code de vérification, en-têtes/pieds paramétrables.
import { jsPDF } from "jspdf";
import { FONT_PDF, resolveCover, coverLayoutBox } from "./templates.js";
import { PX_PER_MM } from "./paginate.js";
import { copyrightLines, makeQrDataUrl, verificationPayload } from "./protection.js";

const pxToMm = (v) => v / PX_PER_MM;

function fontName(style) {
  if (style.bold && style.italic) return "bolditalic";
  if (style.bold) return "bold";
  if (style.italic) return "italic";
  return "normal";
}

async function toDataUrl(src) {
  if (!src) return null;
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Dessine les mots d'une ligne (px → mm). Les métriques des polices natives
// jsPDF diffèrent légèrement de celles mesurées côté navigateur : chaque mot
// est donc CENTRÉ sur son point milieu mesuré, avec la largeur CALCULÉE par
// jsPDF (getTextWidth). L'écart ne s'accumule jamais d'un mot au suivant
// (pas de dérive → pas de texte écrasé/superposé), et les traits de
// soulignement/barré utilisent la même largeur que le texte réellement posé.
function drawLine(doc, ln, offsetXmm = 0, offsetYmm = 0) {
  const lineH = ln.bottom - ln.top;
  const baselinePx = ln.bottom - lineH * 0.21;
  const baselineMm = offsetYmm + pxToMm(baselinePx);
  for (const run of ln.runs || []) {
    const style = run.style;
    doc.setFont(FONT_PDF[style.font] || "times", fontName(style));
    doc.setFontSize(style.sizePx * 0.75); // px → pt
    const col = style.color || "#000000";
    doc.setTextColor(col);
    for (const w of run.words) {
      const pdfWmm = doc.getTextWidth(w.text);
      const xMm = offsetXmm + pxToMm(w.x + w.w / 2) - pdfWmm / 2;
      doc.text(w.text, xMm, baselineMm, { baseline: "alphabetic" });
      if (style.underline) {
        doc.setDrawColor(col);
        doc.setLineWidth(0.2);
        doc.line(xMm, baselineMm + 0.5, xMm + pdfWmm, baselineMm + 0.5);
      }
      if (style.strike) {
        doc.setDrawColor(col);
        doc.setLineWidth(0.2);
        doc.line(xMm, baselineMm - 1.0, xMm + pdfWmm, baselineMm - 1.0);
      }
      if (run.href) {
        doc.link(offsetXmm + pxToMm(w.x), offsetYmm + pxToMm(ln.top), pxToMm(w.w), pxToMm(lineH), {
          url: run.href,
        });
      }
    }
  }
}

function hexToRgbChannels(hex) {
  const m = String(hex || "#000000").replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [
    parseInt(v.slice(0, 2), 16) || 0,
    parseInt(v.slice(2, 4), 16) || 0,
    parseInt(v.slice(4, 6), 16) || 0,
  ];
}

function setFill(doc, hex) {
  const [r, g, b] = hexToRgbChannels(hex);
  doc.setFillColor(r, g, b);
}

function setText(doc, hex) {
  const [r, g, b] = hexToRgbChannels(hex);
  doc.setTextColor(r, g, b);
}

function setStroke(doc, hex) {
  const [r, g, b] = hexToRgbChannels(hex);
  doc.setDrawColor(r, g, b);
}

// Texte multi-lignes centré/aligné à gauche avec retour à la ligne mesuré.
function drawParagraphText(doc, text, xMm, yMm, maxWmm, opts) {
  const { size, font, styleName, color, align = "center", lineHeight = 1.35 } = opts;
  doc.setFont(font, styleName);
  doc.setFontSize(size);
  setText(doc, color);
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (doc.getTextWidth(test) > maxWmm && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  const lh = (size * lineHeight) / 2.83; // pt → mm
  let y = yMm;
  for (const ln of lines) {
    let x = xMm;
    if (align === "center") x = xMm + (maxWmm - doc.getTextWidth(ln)) / 2;
    else if (align === "right") x = xMm + maxWmm - doc.getTextWidth(ln);
    doc.text(ln, x, y);
    y += lh;
  }
  return y;
}

// ─── Rendu des pages spéciales ──────────────────────────────────────────────

async function drawCover(doc, page, docMeta, template, box, qrDataUrl) {
  const { w, h } = box;
  const cover = resolveCover(docMeta, template);
  const geo = coverLayoutBox(cover, w);

  setFill(doc, cover.bg);
  doc.rect(0, 0, w, h, "F");

  // Image de fond (cover-fit) + voile RÉGLABLE (« Opacité de l'image » :
  // 100 % = photo nette sans voile, 0 % = fond uni du modèle).
  if (cover.image) {
    const data = await toDataUrl(cover.image);
    if (data) {
      try {
        const size = doc.getImageProperties(data);
        const scale = Math.max(w / size.width, h / size.height);
        const iw = size.width * scale;
        const ih = size.height * scale;
        // Cadrage vertical réglable (`imageY`, 0 % = haut conservé) : identique
        // à l'aperçu HTML et à la miniature produit (coverImage.js).
        const oy = ((cover.imageY ?? 30) / 100) * Math.max(0, ih - h);
        doc.addImage(data, "JPEG", (w - iw) / 2, -oy, iw, ih);
        if (cover.dim > 0) {
          doc.saveGraphicsState();
          doc.setGState(new doc.GState({ opacity: cover.dim }));
          setFill(doc, cover.bg);
          doc.rect(0, 0, w, h, "F");
          doc.restoreGraphicsState();
        }
      } catch {
        /* image inexploitable : couverture couleur seule */
      }
    }
  }

  // Mise en page « bande » : tiers inférieur aux couleurs d'accent du modèle.
  if (geo.band) {
    setFill(doc, cover.accent);
    doc.rect(0, h * 0.62, w, h * 0.38, "F");
  }

  const fg = geo.band ? "#ffffff" : cover.fg;
  const align = geo.leftish ? "left" : geo.align;
  const titleSize = geo.band ? template.sizes.h1 + 4 : template.sizes.h1 + 8;

  // Titre + sous-titre : affichables/masquables et positionnables (titleX/titleY).
  let y = (geo.yPct / 100) * h;
  if (cover.showTitle) {
    y = drawParagraphText(doc, cover.title, geo.x, y, geo.maxW, {
      size: titleSize, font: FONT_PDF[template.headingFont], styleName: "bold",
      color: fg, align, lineHeight: 1.2,
    });
    if (cover.subtitle) {
      y = drawParagraphText(doc, cover.subtitle, geo.x, y + 6, geo.maxW, {
        size: template.sizes.h3, font: FONT_PDF[template.headingFont], styleName: "normal",
        color: fg, align, lineHeight: 1.3,
      });
    }
    // Règle d'accent sous le bloc titre (identité du modèle).
    if (cover.rule && !geo.band) {
      const rw = align === "center" ? geo.maxW * 0.3 : Math.min(geo.maxW * 0.45, 60);
      const rx = align === "center" ? geo.x + (geo.maxW - rw) / 2 : geo.x;
      setStroke(doc, cover.accent);
      doc.setLineWidth(0.9);
      doc.line(rx, y + 3, rx + rw, y + 3);
    }
  }
  if (cover.author) {
    drawParagraphText(doc, cover.author, geo.pad, geo.band ? h - 14 : h - 24, w - geo.pad * 2, {
      size: template.sizes.h4, font: FONT_PDF[template.bodyFont], styleName: "normal",
      color: fg, align: geo.band ? "right" : geo.leftish ? "left" : "center",
    });
  }
  if (qrDataUrl) {
    const s = 22;
    doc.addImage(qrDataUrl, "PNG", w - s - 10, h - s - 10, s, s);
  }
}

// Décor de titre du modèle : barre d'accent à gauche de h1 et règle sous le
// titre (h1 seul, ou h1 + h2 pour les modèles « h1h2 »). C'est ce qui rend les
// designs immédiatement reconnaissables dans le PDF.
function drawHeadingDecor(doc, item, template, box) {
  const ln = (item.lines || [])[0];
  if (!ln) return;
  const isH1 = item.kind === "h1";
  const isH2 = item.kind === "h2";
  if (!isH1 && !isH2) return;
  const { w, m } = box;
  const lineH = ln.bottom - ln.top;
  const itemTopMm = m.top + pxToMm(item.top);
  const rule = template.headingRule || "none";
  const bar = template.headingBar || "none";
  const lineIndex = item.lineIndex ?? 0;
  if (bar === "left" && isH1 && lineIndex === 0) {
    const barH = pxToMm(lineH) * Math.max(1, item.groupLines || 1);
    setFill(doc, template.colors.accent);
    doc.rect(Math.max(4, m.left - 5), itemTopMm, 1.6, barH, "F");
  }
  if (
    lineIndex === (item.groupLines || 1) - 1 &&
    rule !== "none" &&
    (isH1 || (isH2 && rule === "h1h2"))
  ) {
    const words = ln.words || [];
    const textW = words.length ? Math.max(...words.map((wd) => wd.x + wd.w)) : 0;
    const contentW = w - m.left - m.right;
    const rw = isH1 ? contentW : Math.min(textW, contentW);
    setStroke(doc, template.colors.accent);
    doc.setLineWidth(isH1 ? 0.7 : 0.4);
    const ry = itemTopMm + pxToMm(lineH) + 1.4;
    doc.line(m.left, ry, m.left + Math.max(10, rw), ry);
  }
}

function drawCopyright(doc, docMeta, template, box, contentHash) {
  const { w, h } = box;
  setFill(doc, template.colors.bg);
  doc.rect(0, 0, w, h, "F");
  const lines = copyrightLines(docMeta);
  let y = h * 0.42;
  doc.setFont(FONT_PDF[template.bodyFont], "normal");
  doc.setFontSize(template.sizes.small);
  for (const line of lines) {
    if (!line) {
      y += 3;
      continue;
    }
    const tw = doc.getTextWidth(line);
    setText(doc, template.colors.body);
    doc.text(line, (w - tw) / 2, y);
    y += (template.sizes.small * 1.6) / 2.83;
  }
  y += 12;
  setText(doc, template.colors.accent);
  const ref = `Référence : ${docMeta.doc_ref}`;
  doc.text(ref, (w - doc.getTextWidth(ref)) / 2, y);
  if (contentHash) {
    y += 5;
    doc.setFontSize(template.sizes.small - 1);
    const hashLine = `Empreinte SHA-256 : ${contentHash.slice(0, 32)}…`;
    doc.text(hashLine, (w - doc.getTextWidth(hashLine)) / 2, y);
  }
}

const TOC_LH = 1.9;

function drawToc(doc, page, template, box) {
  const { w, m } = box;
  setFill(doc, template.colors.bg);
  doc.rect(0, 0, w, box.h, "F");
  const s = template.sizes;
  let y = m.top + 14;
  doc.setFont(FONT_PDF[template.headingFont], "bold");
  doc.setFontSize(s.h2);
  setText(doc, template.colors.heading);
  doc.text("Table des matières", m.left, y);
  y += s.h2 * 1.2 / 2.83;
  for (const entry of page.entries) {
    doc.setFontSize(entry.level === 1 ? s.body + 0.5 : s.body);
    doc.setFont(FONT_PDF[template.bodyFont], entry.level === 1 ? "bold" : "normal");
    const indent = entry.level === 1 ? 0 : 8;
    setText(doc, entry.level === 1 ? template.colors.heading : template.colors.body);
    const title = entry.text.length > 68 ? entry.text.slice(0, 68) + "…" : entry.text;
    const tw = doc.getTextWidth(title);
    const numStr = String(entry.page);
    const nw = doc.getTextWidth(numStr);
    doc.text(title, m.left + indent, y);
    doc.text(numStr, w - m.right - nw, y);
    // Points de conduite.
    setStroke(doc, template.colors.accent);
    doc.setLineWidth(0.15);
    doc.setLineDashPattern([0.6, 0.8], 0);
    doc.line(m.left + indent + tw + 3, y - 1, w - m.right - nw - 3, y - 1);
    doc.setLineDashPattern([], 0);
    y += (s.body * TOC_LH) / 2.83;
  }
}

// En-têtes / pieds de page paramétrables, tokens {title} {author} {page}.
function drawHeaderFooter(doc, page, docMeta, template, box) {
  const { w, h, m } = box;
  const cfg = docMeta.protection || {};
  const s = template.sizes.small;
  const fill = (text, slot, slotY) => {
    if (!text) return;
    const str = String(text)
      .replaceAll("{title}", docMeta.title || "")
      .replaceAll("{author}", docMeta.author || "")
      .replaceAll("{page}", String(page.number ?? ""));
    if (!str.trim()) return;
    doc.setFont(FONT_PDF[template.bodyFont], "normal");
    doc.setFontSize(s);
    setText(doc, template.colors.accent);
    const tw = doc.getTextWidth(str);
    const x = slot === "left" ? m.left : slot === "right" ? w - m.right - tw : (w - tw) / 2;
    doc.text(str, x, slotY);
  };
  const hasHeader = cfg.header !== false && (cfg.headerLeft || cfg.headerCenter || cfg.headerRight);
  if (hasHeader) {
    const slotY = m.top - 7;
    fill(cfg.headerLeft, "left", slotY);
    fill(cfg.headerCenter, "center", slotY);
    fill(cfg.headerRight, "right", slotY);
  }
  if (cfg.footer !== false) {
    const slotY = h - m.bottom + 8;
    fill(cfg.footerLeft || "", "left", slotY);
    fill(cfg.footerCenter || "{page}", "center", slotY);
    fill(cfg.footerRight || "", "right", slotY);
  }
}

// Watermark diagonal discret ou visible, toutes les pages de contenu.
function drawWatermark(doc, docMeta, template, box) {
  const wm = docMeta.protection?.watermark;
  if (!wm?.enabled) return;
  const { w, h } = box;
  const text = wm.text || `© ${docMeta.author || "Auteur"}`;
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: wm.mode === "visible" ? 0.16 : 0.06 }));
  doc.setFont(FONT_PDF[template.headingFont], "bold");
  doc.setFontSize(42);
  setText(doc, wm.color || "#555555");
  doc.text(text, w / 2, h / 2, { angle: 45, align: "center" });
  doc.restoreGraphicsState();
}

// ─── Export PDF complet (même sortie paginée que l'aperçu HTML) ──────────────
// docMeta = document complet (générateur.js) + doc.content (docModel TipTap)
// + html (HTML sérialisé de l'éditeur, déjà paginé par paginateDocument).
// Options : filename (nom imposé), download:false → renvoie l'instance jsPDF
// sans télécharger (utilisé par la publication « Vendre sur Mboppi »).
export async function exportDocumentPdf({ doc, docMeta, paginated, onProgress, filename, download = true }) {
  const { pages, box, contentWpx } = paginated;
  const { w, h, m } = box;
  const doc2 = new jsPDF({
    unit: "mm",
    format: [w, h],
    orientation: w > h ? "landscape" : "portrait",
    compress: true,
  });

  // Métadonnées complètes (protection / traçabilité du document).
  doc2.setProperties({
    title: docMeta.title || "Document",
    subject: docMeta.subtitle || "",
    author: docMeta.author || "",
    keywords: `Mboppi, ${docMeta.doc_ref || ""}`,
    creator: "Mboppi — Générateur de documents",
  });

  const template = paginated.template;
  const total = pages.length;
  const contentHash = docMeta.content_hash || "";
  const qrDataUrl = docMeta.protection?.qrEnabled === false ? null : await makeQrDataUrl(
    verificationPayload(docMeta, contentHash),
    320
  );

  for (let i = 0; i < total; i++) {
    if (i > 0) doc2.addPage([w, h], w > h ? "landscape" : "portrait");
    const page = pages[i];
    onProgress?.(Math.round(((i + 1) / total) * 100), i + 1, total);
    if (page.kind === "cover") {
      await drawCover(doc2, page, docMeta, template, box, qrDataUrl);
    } else if (page.kind === "copyright") {
      drawCopyright(doc2, docMeta, template, box, contentHash);
    } else if (page.kind === "toc") {
      drawToc(doc2, page, template, box);
    } else {
      // Page de contenu : fond du modèle (thèmes crème, rosé, ambré, ivoire…)
      // puis les atomes mesurés — positions exactes DANS la boîte de texte
      // utile → on ajoute la marge de page (m.left/m.top) et la position de
      // l'atome (item.top), comme le fait l'aperçu HTML.
      if (template.colors.bg && template.colors.bg !== "#ffffff") {
        setFill(doc2, template.colors.bg);
        doc2.rect(0, 0, w, h, "F");
      }
      for (const item of page.items) {
        const itemTopMm = m.top + pxToMm(item.top);
        if (item.kind === "image") {
          const data = await toDataUrl(item.src);
          if (data) {
            try {
              doc2.addImage(data, m.left + pxToMm(item.x || 0), itemTopMm, pxToMm(item.w), pxToMm(item.h));
            } catch {
              /* format image non supporté par jsPDF : ignorée */
            }
          }
        } else if (item.kind === "hr") {
          setStroke(doc2, template.colors.accent);
          doc2.setLineWidth(0.3);
          const yMm = itemTopMm + pxToMm(2);
          doc2.line(m.left + pxToMm(contentWpx * 0.2), yMm, m.left + pxToMm(contentWpx * 0.8), yMm);
        } else if (item.kind === "qr") {
          // Emplacement [QR] : le vrai QR de vérification est dessiné dans la
          // boîte réservée (pagination identique à une image, insécable).
          const s = pxToMm(item.w);
          const xMm = m.left + pxToMm(item.x || 0);
          if (qrDataUrl) {
            try {
              doc2.addImage(qrDataUrl, "PNG", xMm, itemTopMm, s, s);
            } catch {
              /* QR indisponible : cadre seul */
            }
          }
          // Cadre discret autour de l'emplacement (utile aussi si QR désactivé).
          setStroke(doc2, template.colors.accent);
          doc2.setLineWidth(0.3);
          doc2.setLineDashPattern([1.5, 1.5], 0);
          doc2.rect(xMm, itemTopMm, s, s, "S");
          doc2.setLineDashPattern([], 0);
        } else if (item.kind === "tableRow") {
          drawTableRow(doc2, item, template, box);
        } else {
          for (const ln of item.lines || []) drawLine(doc2, ln, m.left, itemTopMm);
          // Barre latérale / règle de titre propres au modèle de design.
          drawHeadingDecor(doc2, item, template, box);
        }
      }
      drawWatermark(doc2, docMeta, template, box);
      drawHeaderFooter(doc2, page, docMeta, template, box);
    }
  }

  const name = String(
    filename ||
      (docMeta.title || "document")
        .replace(/[\\/:*?"<>|]+/g, "")
        .slice(0, 60)
        .trim() ||
      "document"
  ).replace(/\.pdf$/i, "");
  if (download) doc2.save(`${name}.pdf`);
  onProgress?.(100, total, total);
  return doc2;
}

// Téléchargement d'un Blob (EPUB, HTML, JSON…) — même logique que le PDF.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Une ligne de tableau : bordures + texte cellule par cellule. Les mots sont
// mesurés dans le repère de LEUR cellule → on ajoute la marge de page et la
// position de la cellule (x) / de la ligne de tableau (item.top).
function drawTableRow(doc, item, template, box) {
  const { m } = box;
  const rowY = m.top + pxToMm(item.top);
  for (const cell of item.cells) {
    const cellX = m.left + pxToMm(cell.x);
    setFill(doc, cell.header ? template.colors.accent + "22" : "#ffffff");
    doc.rect(cellX, rowY, pxToMm(cell.w), pxToMm(cell.h), "FD");
    for (const ln of cell.lines || []) drawLine(doc, ln, cellX, rowY);
  }
}
