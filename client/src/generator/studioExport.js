// ─── Export du document STRUCTURÉ du Studio : PDF (jsPDF) + EPUB 3 ──────────
// Le PDF n'est qu'un FORMAT D'EXPORTATION (§24) : il consomme le modèle
// structuré (pages → éléments), jamais une image aplatie. Les coordonnées du
// modèle sont en mm et jsPDF dessine en mm à partir du même repère (coin
// haut-gauche) : l'aperçu du Studio et le PDF exporté montrent la même page.
//
// Ce que l'export sait dessiner : texte riche (gras/italique/souligné/barré/
// couleur/surlignage/exposant/lien), colonnes, lettrine, images, galeries,
// QR réel, formes (rectangle, cercle, polygone, ligne pointillée), tableaux,
// graphiques (barres, courbe, camembert), diagrammes, statistiques, table des
// matières, en-têtes/pieds et numéros de page à jetons.
import { jsPDF } from "jspdf";
import { FONT_PDF, resolvePageBox, resolveTemplate, getTemplate } from "./templates.js";
import { drawPageDecor, toDataUrl, saveBlob } from "./exportPdf.js";
import { makeQrDataUrl } from "./protection.js";
import { applyTokens, elementType, sortedElements, mixHex } from "./studioModel.js";

const PT2MM = 0.3527777;

function rgb(hex) {
  const m = String(hex || "").match(/^#([0-9a-f]{6})$/i);
  if (!m) return [17, 17, 17];
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}
function setFill(doc, hex) {
  const [r, g, b] = rgb(hex);
  doc.setFillColor(r, g, b);
}
function setText(doc, hex) {
  const [r, g, b] = rgb(hex);
  doc.setTextColor(r, g, b);
}
function setStroke(doc, hex) {
  const [r, g, b] = rgb(hex);
  doc.setDrawColor(r, g, b);
}
function withOpacity(doc, opacity, draw) {
  if (opacity >= 99) {
    draw();
    return;
  }
  try {
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: Math.max(0, opacity) / 100 }));
    draw();
    doc.restoreGraphicsState();
  } catch {
    draw();
  }
}
function shape(doc, box, radius, mode) {
  if (radius > 0) doc.roundedRect(box.x, box.y, box.w, box.h, radius, radius, mode);
  else doc.rect(box.x, box.y, box.w, box.h, mode);
}
function dashPattern(doc, dash) {
  if (dash === "dashed") doc.setLineDashPattern([1.6, 1.2], 0);
  else if (dash === "dotted") doc.setLineDashPattern([0.4, 1.1], 0, "round");
  else doc.setLineDashPattern([], 0);
}

// ─── Texte riche : HTML → runs → lignes mesurées par jsPDF ─────────────────
/** Analyse un HTML simple (spans/strong/em/u/s/mark/sup/sub/a/br) en runs. */
export function htmlRuns(html, base = {}) {
  const start = {
    bold: !!base.bold, italic: !!base.italic, underline: !!base.underline, strike: !!base.strike,
    color: base.color || "#111111", bg: null, sup: false, sub: false, href: null,
    font: base.font || "serif", size: Number(base.size) || 10.5,
  };
  const runs = [];
  if (typeof DOMParser === "undefined") {
    runs.push({ ...start, text: String(html || "").replace(/<[^>]+>/g, " ") });
    return runs;
  }
  let root = null;
  try {
    root = new DOMParser().parseFromString(`<div id="gen-studio-root">${html || ""}</div>`, "text/html")
      .getElementById("gen-studio-root");
  } catch {
    root = null;
  }
  if (!root) {
    runs.push({ ...start, text: String(html || "").replace(/<[^>]+>/g, " ") });
    return runs;
  }
  const walk = (node, st) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const t = String(child.nodeValue || "").replace(/\s+/g, " ");
        if (t.trim() || (t && runs.length)) runs.push({ ...st, text: t });
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (tag === "BR") {
        runs.push({ ...st, text: "", br: true });
        continue;
      }
      const cs = { ...st };
      if (/^(STRONG|B)$/.test(tag)) cs.bold = true;
      if (/^(EM|I)$/.test(tag)) cs.italic = true;
      if (tag === "U") cs.underline = true;
      if (/^(S|STRIKE|DEL)$/.test(tag)) cs.strike = true;
      if (tag === "SUP") cs.sup = true;
      if (tag === "SUB") cs.sub = true;
      if (tag === "MARK") cs.bg = "#FFF3A3";
      if (tag === "A") cs.href = child.getAttribute("href") || null;
      const styleAttr = child.getAttribute("style") || "";
      const deco = /text-decoration\s*:\s*([^;]+)/i.exec(styleAttr);
      if (deco) {
        if (/underline/.test(deco[1])) cs.underline = true;
        if (/line-through/.test(deco[1])) cs.strike = true;
      }
      if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(styleAttr)) cs.bold = true;
      if (/font-style\s*:\s*italic/i.test(styleAttr)) cs.italic = true;
      const col = /(?:^|[;\s])color\s*:\s*(#[0-9a-f]{3,8})/i.exec(styleAttr);
      if (col) cs.color = col[1];
      const bgc = /background-color\s*:\s*(#[0-9a-f]{3,8})/i.exec(styleAttr);
      if (bgc) cs.bg = bgc[1];
      const fs = /font-size\s*:\s*([\d.]+)pt/i.exec(styleAttr);
      if (fs) cs.size = Number(fs[1]) || cs.size;
      if (/vertical-align\s*:\s*super/i.test(styleAttr)) cs.sup = true;
      if (/vertical-align\s*:\s*sub/i.test(styleAttr)) cs.sub = true;
      walk(child, cs);
    }
  };
  walk(root, start);
  return runs;
}

function fontName(r) {
  if (r.bold && r.italic) return "bolditalic";
  if (r.bold) return "bold";
  if (r.italic) return "italic";
  return "normal";
}
function applyFont(doc, r) {
  doc.setFont(FONT_PDF[r.font] || "times", fontName(r));
  doc.setFontSize(r.size);
}
/** Coupe des runs en lignes mesurées avec les métriques de jsPDF. */
function layoutRuns(doc, runs, maxWmm) {
  const lines = [];
  let cur = { w: 0, runs: [] };
  const flush = () => {
    lines.push(cur);
    cur = { w: 0, runs: [] };
  };
  for (const run of runs) {
    if (run.br) {
      if (cur.runs.length || !lines.length) flush();
      continue;
    }
    const tokens = String(run.text || "").split(/(\s+)/);
    for (const token of tokens) {
      if (!token) continue;
      applyFont(doc, run);
      const w = doc.getTextWidth(token);
      const isSpace = /^\s+$/.test(token);
      if (isSpace) {
        if (!cur.runs.length) continue; // pas d'espace en tête de ligne
        cur.runs.push({ ...run, text: " ", w });
        cur.w += w;
        continue;
      }
      if (cur.w + w > maxWmm && cur.runs.length) {
        const lastRun = cur.runs[cur.runs.length - 1];
        if (lastRun && /^\s+$/.test(lastRun.text)) {
          cur.w -= lastRun.w;
          cur.runs.pop();
        }
        flush();
      }
      cur.runs.push({ ...run, text: token, w });
      cur.w += w;
    }
  }
  if (cur.runs.length) flush();
  return lines;
}

/** Dessine une ligne de runs depuis x (bord gauche) et y (ligne de base). */
function drawRunsLine(doc, line, x, y, { align = "left", maxW = 0, color } = {}) {
  let cursor = x;
  if (align === "center") cursor = x + (maxW - line.w) / 2;
  else if (align === "right") cursor = x + maxW - line.w;
  for (const r of line.runs) {
    applyFont(doc, r);
    const w = doc.getTextWidth(r.text);
    const lift = r.sup ? r.size * 0.35 * PT2MM : r.sub ? -r.size * 0.18 * PT2MM : 0;
    const base = y - lift;
    if (r.bg) {
      setFill(doc, r.bg);
      doc.rect(cursor, base - r.size * PT2MM * 0.82, w, r.size * PT2MM * 1.1, "F");
    }
    setText(doc, r.href ? "#0B5FFF" : r.color || color || "#111111");
    doc.text(r.text, cursor, base);
    if (r.underline || r.href) {
      setStroke(doc, r.href ? "#0B5FFF" : r.color || color || "#111111");
      doc.setLineWidth(0.13);
      doc.line(cursor, base + 0.55, cursor + w, base + 0.55);
    }
    if (r.strike) {
      setStroke(doc, r.color || color || "#111111");
      doc.setLineWidth(0.13);
      doc.line(cursor, base - r.size * PT2MM * 0.28, cursor + w, base - r.size * PT2MM * 0.28);
    }
    cursor += w;
  }
}
/**
 * Élément de TEXTE : fond, bordure, colonnes, lettrine, alignement.
 * `box` de l'élément en mm (repère page, origine haut-gauche).
 */
function drawTextElement(doc, el, ctx) {
  const st = el.style || {};
  const size = Number(st.size) || 10.5;
  const lhmm = (Number(st.lineHeight) || 1.5) * size * PT2MM;
  const pad = Number(st.padding) || 0;
  const bx = el.box.x;
  const by = el.box.y;
  const innerX = bx + pad;
  const innerY = by + pad;
  const innerW = Math.max(8, el.box.w - pad * 2);
  const text = applyTokens(el.html || "", ctx);
  const runs = htmlRuns(text, { ...st, size, font: st.font || ctx.bodyFont });
  if (!runs.length || !runs.some((r) => r.text.trim())) return;

  if (st.bg && st.bg !== "transparent") {
    withOpacity(doc, st.bgOpacity == null ? 100 : st.bgOpacity, () => {
      setFill(doc, st.bg);
      shape(doc, { x: bx, y: by, w: el.box.w, h: el.box.h }, st.radius || 0, "F");
    });
  }
  if (st.border) {
    setStroke(doc, st.borderColor || ctx.accent);
    doc.setLineWidth(st.border);
    dashPattern(doc, st.dash);
    if (st.borderSide === "left") doc.line(bx, by, bx, by + el.box.h);
    else if (st.borderSide === "right") doc.line(bx + el.box.w, by, bx + el.box.w, by + el.box.h);
    else if (st.borderSide === "top") doc.line(bx, by, bx + el.box.w, by);
    else if (st.borderSide === "bottom") doc.line(bx, by + el.box.h, bx + el.box.w, by + el.box.h);
    else shape(doc, { x: bx, y: by, w: el.box.w, h: el.box.h }, st.radius || 0, "S");
    dashPattern(doc, "solid");
  }

  const indent = Number(st.indent) || 0;
  let x = innerX + indent;
  let w = Math.max(8, innerW - indent);
  const align = st.align || "left";

  // Lettrine (§4) : première lettre agrandie, texte contournant la lettrine.
  let dropCap = null;
  if (st.dropCap) {
    const first = runs.find((r) => r.text && r.text.trim());
    if (first) {
      const idx = runs.indexOf(first);
      const letter = String(first.text.trim()[0] || "");
      if (letter) {
        const capStyle = { ...first, text: letter, size: size * 2.8, bold: first.bold };
        applyFont(doc, capStyle);
        const capW = doc.getTextWidth(letter) + 1.2;
        dropCap = { letter, capW, style: capStyle };
        runs.splice(idx, 1, { ...first, text: String(first.text).replace(letter, "") });
        w = Math.max(8, w - capW);
        x = innerX + indent + capW;
      }
    }
  }

  const columns = Math.max(1, Math.min(4, Number(st.columns) || 1));
  const firstBaseline = innerY + size * PT2MM * 0.92;
  if (columns > 1) {
    const gut = 5;
    const colW = (innerW - gut * (columns - 1)) / columns;
    const all = layoutRuns(doc, runs, colW);
    const per = Math.ceil(all.length / columns);
    for (let c = 0; c < columns; c++) {
      const cx = innerX + c * (colW + gut);
      all.slice(c * per, (c + 1) * per).forEach((ln, i) => {
        drawRunsLine(doc, ln, cx, firstBaseline + i * lhmm, { align, maxW: colW, color: st.color });
      });
    }
    return;
  }

  const lines = layoutRuns(doc, runs, w);
  lines.forEach((ln, i) => {
    drawRunsLine(doc, ln, x, firstBaseline + i * lhmm, { align, maxW: w, color: st.color });
  });
  if (dropCap) {
    applyFont(doc, dropCap.style);
    setText(doc, st.color || "#111111");
    doc.text(dropCap.letter, innerX + indent + 0.3, innerY + size * 2.8 * PT2MM * 0.8);
  }
}
// ─── Médias : images, galeries, icônes, QR ─────────────────────────────────
const imageCache = new Map();
async function imageData(src) {
  if (!src) return null;
  if (imageCache.has(src)) return imageCache.get(src);
  const data = await toDataUrl(src);
  imageCache.set(src, data);
  return data;
}
function addImage(doc, data, box) {
  if (!data) return false;
  try {
    const fmt = /^data:image\/png/i.test(data) ? "PNG" : /^data:image\/webp/i.test(data) ? "WEBP" : "JPEG";
    doc.addImage(data, fmt, box.x, box.y, box.w, box.h, undefined, "FAST");
    return true;
  } catch {
    return false;
  }
}
/** Placeholder d'image vide (cadre pointillé + libellé) — rien n'est inventé. */
function drawImagePlaceholder(doc, el, ctx) {
  setStroke(doc, ctx.accent);
  doc.setLineWidth(0.3);
  dashPattern(doc, "dashed");
  doc.rect(el.box.x, el.box.y, el.box.w, el.box.h, "S");
  dashPattern(doc, "solid");
  doc.setFont(FONT_PDF.sans, "normal");
  doc.setFontSize(Math.min(9, Math.max(6, el.box.h / 6)));
  setText(doc, ctx.accent);
  doc.text("Image à choisir", el.box.x + el.box.w / 2, el.box.y + el.box.h / 2, { align: "center" });
}

/** Rendu d'un glyphe (émoji compris) en PNG via canvas — icônes du Studio. */
function glyphDataUrl(glyph, sizePx, color) {
  try {
    const c = document.createElement("canvas");
    c.width = sizePx;
    c.height = sizePx;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, sizePx, sizePx);
    ctx.fillStyle = color || "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(sizePx * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(String(glyph || "★"), sizePx / 2, sizePx / 2 + sizePx * 0.02);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

function drawShapeElement(doc, el, ctx) {
  const st = el.style || {};
  const type = elementType(el.type).id;
  const opacity = st.fillOpacity == null ? 100 : st.fillOpacity;
  const hasFill = opacity > 0 && st.fill && st.fill !== "transparent";
  if (type === "line" || type === "divider") {
    setStroke(doc, st.stroke || ctx.accent);
    doc.setLineWidth(st.strokeWidth || 0.4);
    dashPattern(doc, st.dash);
    const y = el.box.y + el.box.h / 2;
    doc.line(el.box.x, y, el.box.x + el.box.w, y);
    dashPattern(doc, "solid");
    return;
  }
  const kind = el.data?.shapeKind;
  if (kind === "poly" && Array.isArray(el.data?.pts) && el.data.pts.length > 2) {
    const pts = el.data.pts.map(([x, y]) => [el.box.x + x, el.box.y + y]);
    const [start, ...rest] = pts;
    const segs = rest.map((p, i) => {
      const prev = i === 0 ? start : rest[i - 1];
      return [p[0] - prev[0], p[1] - prev[1]];
    });
    withOpacity(doc, opacity, () => {
      setFill(doc, st.fill || ctx.accent);
      doc.lines(segs, start[0], start[1], [1, 1], "F", true);
    });
    return;
  }
  if (kind === "triangle" || kind === "arrow") {
    const b = el.box;
    const pts = kind === "triangle"
      ? [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]
      : [[b.x, b.y + b.h * 0.3], [b.x + b.w * 0.62, b.y + b.h * 0.3], [b.x + b.w * 0.62, b.y],
        [b.x + b.w, b.y + b.h / 2], [b.x + b.w * 0.62, b.y + b.h], [b.x + b.w * 0.62, b.y + b.h * 0.7],
        [b.x, b.y + b.h * 0.7]];
    const [start, ...rest] = pts;
    const segs = rest.map((p, i) => {
      const prev = i === 0 ? start : rest[i - 1];
      return [p[0] - prev[0], p[1] - prev[1]];
    });
    withOpacity(doc, opacity, () => {
      setFill(doc, st.fill || ctx.accent);
      doc.lines(segs, start[0], start[1], [1, 1], "F", true);
    });
    return;
  }
  if (type === "circle") {
    const cx = el.box.x + el.box.w / 2;
    const cy = el.box.y + el.box.h / 2;
    const rx = Math.max(0.5, el.box.w / 2);
    const ry = Math.max(0.5, el.box.h / 2);
    if (hasFill) withOpacity(doc, opacity, () => {
      setFill(doc, st.fill);
      doc.ellipse(cx, cy, rx, ry, "F");
    });
    if (st.stroke && st.stroke !== "transparent" && st.strokeWidth) {
      setStroke(doc, st.stroke);
      doc.setLineWidth(st.strokeWidth);
      doc.ellipse(cx, cy, rx, ry, "S");
    }
    return;
  }
  if (hasFill) withOpacity(doc, opacity, () => {
    setFill(doc, st.fill);
    shape(doc, el.box, st.radius || 0, "F");
  });
  if (st.stroke && st.stroke !== "transparent" && st.strokeWidth) {
    setStroke(doc, st.stroke);
    doc.setLineWidth(st.strokeWidth);
    shape(doc, el.box, st.radius || 0, "S");
  }
}
/** Médias : image, logo, galerie, icône (glyphe → PNG), QR réel. */
async function drawMediaElement(doc, el, ctx) {
  const t = elementType(el.type).id;
  const st = el.style || {};
  if (t === "image" || t === "logo") {
    const data = await imageData(el.src);
    const opacity = (el.opacity == null ? 1 : el.opacity) * 100;
    if (data) withOpacity(doc, opacity, () => addImage(doc, data, el.box));
    else drawImagePlaceholder(doc, el, ctx);
    return;
  }
  if (t === "gallery") {
    const items = (el.data?.items || []).filter(Boolean);
    if (!items.length) {
      drawImagePlaceholder(doc, el, ctx);
      return;
    }
    const cols = Math.max(1, Math.min(4, Number(el.data?.columns) || Math.min(3, items.length)));
    const rows = Math.ceil(items.length / cols);
    const gap = Number(el.data?.gap) || 2;
    const cw = (el.box.w - gap * (cols - 1)) / cols;
    const ch = (el.box.h - gap * (rows - 1)) / rows;
    for (let i = 0; i < items.length; i++) {
      const box = {
        x: el.box.x + (i % cols) * (cw + gap),
        y: el.box.y + Math.floor(i / cols) * (ch + gap),
        w: cw, h: ch,
      };
      const data = await imageData(items[i].src || items[i]);
      if (!addImage(doc, data, box)) drawImagePlaceholder(doc, { ...el, box }, ctx);
    }
    return;
  }
  if (t === "icon") {
    const data = glyphDataUrl(el.data?.glyph || "★", 256, st.color || ctx.accent);
    addImage(doc, data, el.box);
    return;
  }
  if (t === "qr") {
    const url = el.data?.url || "";
    const size = Math.min(el.box.w, el.box.h);
    const box = { x: el.box.x + (el.box.w - size) / 2, y: el.box.y, w: size, h: size };
    if (st.bg && st.bg !== "transparent") {
      setFill(doc, st.bg);
      doc.rect(box.x, box.y, box.w, box.h, "F");
    }
    const data = url ? await makeQrDataUrl(url, 400) : null;
    if (data) {
      try {
        doc.addImage(data, "PNG", box.x, box.y, box.w, box.h, undefined, "FAST");
      } catch {
        drawImagePlaceholder(doc, { ...el, box }, ctx);
      }
    } else drawImagePlaceholder(doc, { ...el, box }, ctx);
    if (el.data?.label) {
      doc.setFont(FONT_PDF.sans, "normal");
      doc.setFontSize(Number(st.size) || 8);
      setText(doc, st.color || ctx.body);
      doc.text(String(el.data.label), box.x + size / 2, box.y + size + 3.5, { align: "center" });
    }
  }
}

/** Tableau : colonnes, en-tête, zébrures, bordures, texte multi-lignes. */
function drawTableElement(doc, el, ctx) {
  const st = el.style || {};
  const rows = el.data?.rows || [];
  if (!rows.length) return;
  const nCols = Math.max(1, rows.reduce((m, r) => Math.max(m, r.length), 0));
  const total = el.box.w;
  const raw = Array.isArray(el.data?.colWidths) ? el.data.colWidths.slice(0, nCols) : [];
  const sum = raw.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  const widths = [];
  for (let i = 0; i < nCols; i++) widths.push(raw[i] ? (raw[i] / sum) * total : total / nCols);
  const pad = Number(st.padding) || 1.6;
  const size = Number(st.size) || 9;
  const font = FONT_PDF[st.font] || "times";
  let y = el.box.y;
  rows.forEach((row, ri) => {
    const isHeaderRow = ri === 0 && row.some((c) => c && c.header);
    const cells = widths.map((w, ci) => {
      const cell = row[ci] || { text: "" };
      const bold = !!(cell.header || isHeaderRow);
      const color = bold ? st.headerColor || st.color : st.color;
      const runs = htmlRuns(String(cell.text || ""), { ...st, size, bold, color, font: st.font });
      return { cell, bold, color, lines: layoutRuns(doc, runs, Math.max(4, w - pad * 2)) };
    });
    const lh = size * 1.38 * PT2MM;
    const rowH = Math.max(size * PT2MM * 1.9, Math.max(...cells.map((c) => c.lines.length || 1)) * lh + pad * 2);
    if (isHeaderRow && st.headerBg) {
      setFill(doc, st.headerBg);
      doc.rect(el.box.x, y, total, rowH, "F");
    } else if (st.stripes && ri % 2 === 0) {
      setFill(doc, mixHex(ctx.bg || "#ffffff", st.color || "#111111", 0.05));
      doc.rect(el.box.x, y, total, rowH, "F");
    }
    let x = el.box.x;
    cells.forEach((c, ci) => {
      const align = c.cell?.align || st.align || "left";
      c.lines.forEach((ln, li) => {
        drawRunsLine(doc, ln, x + pad, y + pad + size * PT2MM * 0.92 + li * lh, {
          align, maxW: widths[ci] - pad * 2, color: c.color,
        });
      });
      x += widths[ci];
    });
    if (st.borderWidth) {
      setStroke(doc, st.borderColor || ctx.accent);
      doc.setLineWidth(st.borderWidth);
      doc.line(el.box.x, y, el.box.x + total, y);
      doc.line(el.box.x, y + rowH, el.box.x + total, y + rowH);
      let bx = el.box.x;
      for (const w of widths) {
        doc.line(bx, y, bx, y + rowH);
        bx += w;
      }
      doc.line(bx, y, bx, y + rowH);
    }
    y += rowH;
  });
}
/** Graphique : barres (défaut), courbe, camembert avec légende. */
function drawChartElement(doc, el, ctx) {
  const st = el.style || {};
  const data = el.data || {};
  const base = el.box;
  const palette = st.palette && st.palette.length ? st.palette : [ctx.accent, ctx.heading || "#111111", "#8A8A8A", "#C0C0C0"];
  const series = (data.series || []).filter((s) => s && Number.isFinite(Number(s.value)));
  if (!series.length) return;
  let top = base.y;
  if (data.title) {
    doc.setFont(FONT_PDF[st.font] || "sans", "bold");
    doc.setFontSize((Number(st.size) || 9) + 1.5);
    setText(doc, st.color || ctx.body);
    doc.text(String(data.title), base.x, top + 3.5);
    top += 7;
  }
  if (data.chartType === "pie") {
    const total = series.reduce((a, s) => a + Math.max(0, Number(s.value)), 0) || 1;
    const r = Math.max(6, Math.min(base.w * 0.3, (base.y + base.h - top) / 2));
    const cx = base.x + r + 2;
    const cy = top + (base.y + base.h - top) / 2;
    let angle = -Math.PI / 2;
    series.forEach((s, i) => {
      const sweep = (Math.max(0, Number(s.value)) / total) * Math.PI * 2;
      const steps = Math.max(2, Math.ceil(sweep / 0.2));
      const pts = [[cx, cy]];
      for (let k = 0; k <= steps; k += 1) {
        const a = angle + (sweep * k) / steps;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      angle += sweep;
      const [start, ...rest] = pts;
      const segs = rest.map((p, idx) => {
        const prev = idx === 0 ? start : rest[idx - 1];
        return [p[0] - prev[0], p[1] - prev[1]];
      });
      setFill(doc, palette[i % palette.length]);
      doc.lines(segs, start[0], start[1], [1, 1], "F", true);
    });
    doc.setFont(FONT_PDF[st.font] || "sans", "normal");
    doc.setFontSize(Number(st.size) || 9);
    let ly = top + 4;
    series.forEach((s, i) => {
      setFill(doc, palette[i % palette.length]);
      doc.rect(base.x + r * 2 + 6, ly - 2.4, 3, 3, "F");
      setText(doc, st.color || ctx.body);
      const pct = Math.round((Math.max(0, Number(s.value)) / total) * 100);
      doc.text(`${s.label} — ${pct} %`, base.x + r * 2 + 11, ly, { maxWidth: Math.max(10, base.w - r * 2 - 14) });
      ly += 5;
    });
    return;
  }
  const labels = series.map((s) => String(s.label));
  const values = series.map((s) => Number(s.value));
  const max = Math.max(1, ...values);
  const plot = { x: base.x + 7, y: top + 2, w: Math.max(10, base.w - 9), h: Math.max(8, base.y + base.h - top - 7) };
  if (st.grid) {
    setStroke(doc, mixHex(ctx.bg || "#ffffff", st.color || "#111111", 0.25));
    doc.setLineWidth(0.15);
    for (let i = 0; i <= 4; i++) doc.line(plot.x, plot.y + (plot.h * i) / 4, plot.x + plot.w, plot.y + (plot.h * i) / 4);
  }
  setStroke(doc, mixHex(ctx.bg || "#ffffff", st.color || "#111111", 0.5));
  doc.setLineWidth(0.25);
  doc.line(plot.x, plot.y, plot.x, plot.y + plot.h);
  doc.line(plot.x, plot.y + plot.h, plot.x + plot.w, plot.y + plot.h);
  doc.setFont(FONT_PDF[st.font] || "sans", "normal");
  doc.setFontSize(Math.max(6, (Number(st.size) || 9) - 1));
  setText(doc, st.color || ctx.body);

  if (data.chartType === "line") {
    const step = series.length > 1 ? plot.w / (series.length - 1) : 0;
    const pts = values.map((v, i) => [plot.x + i * step, plot.y + plot.h - (v / max) * plot.h]);
    setStroke(doc, palette[0]);
    doc.setLineWidth(0.6);
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    pts.forEach(([px, py], i) => {
      setFill(doc, palette[0]);
      doc.circle(px, py, 0.9, "F");
      setText(doc, st.color || ctx.body);
      doc.text(labels[i], px, plot.y + plot.h + 3.4, { align: "center", maxWidth: Math.max(4, step || 12) });
      if (st.showValues) doc.text(String(values[i]), px, py - 1.6, { align: "center" });
    });
    return;
  }
  const slot = plot.w / Math.max(1, series.length);
  const barW = Math.min(slot * 0.62, 18);
  series.forEach((s, i) => {
    const v = Number(s.value);
    const bh = Math.max(0.6, (v / max) * plot.h);
    const bx = plot.x + slot * i + (slot - barW) / 2;
    const by = plot.y + plot.h - bh;
    setFill(doc, palette[i % palette.length]);
    doc.rect(bx, by, barW, bh, "F");
    setText(doc, st.color || ctx.body);
    doc.text(labels[i], plot.x + slot * i + slot / 2, plot.y + plot.h + 3.4, { align: "center", maxWidth: Math.max(4, slot) });
    if (st.showValues) doc.text(String(v), plot.x + slot * i + slot / 2, by - 1.6, { align: "center" });
  });
}
/** Statistiques : grandes valeurs + libellés (bandeau de chiffres clés). */
function drawStatsElement(doc, el, ctx) {
  const st = el.style || {};
  const items = (el.data?.items || []).filter(Boolean);
  if (!items.length) return;
  const colW = el.box.w / items.length;
  items.forEach((it, i) => {
    const cx = el.box.x + colW * i + colW / 2;
    doc.setFont(FONT_PDF[st.font] || "sans", "bold");
    doc.setFontSize(Number(st.size) || 16);
    setText(doc, st.color || ctx.accent);
    doc.text(String(it.value || ""), cx, el.box.y + (Number(st.size) || 16) * PT2MM * 1.1, { align: "center" });
    doc.setFont(FONT_PDF[st.font] || "sans", "normal");
    doc.setFontSize(Number(st.labelSize) || 8);
    setText(doc, st.labelColor || ctx.body);
    doc.text(String(it.label || ""), cx, el.box.y + (Number(st.size) || 16) * PT2MM * 1.1 + 4.4, { align: "center", maxWidth: colW - 3 });
    if (i < items.length - 1) {
      setStroke(doc, mixHex(ctx.bg || "#ffffff", st.color || "#111111", 0.2));
      doc.setLineWidth(0.2);
      doc.line(el.box.x + colW * (i + 1), el.box.y + 2, el.box.x + colW * (i + 1), el.box.y + el.box.h - 2);
    }
  });
}

/** Diagramme : étapes reliées par des flèches (horizontal ou vertical). */
function drawDiagramElement(doc, el, ctx) {
  const st = el.style || {};
  const nodes = (el.data?.nodes || []).filter((n) => n && String(n.text || "").length);
  if (!nodes.length) return;
  const horizontal = (el.data?.flow || "h") === "h";
  const gap = 8;
  const size = Number(st.size) || 9;
  if (horizontal) {
    const w = (el.box.w - gap * (nodes.length - 1)) / nodes.length;
    const hh = Math.min(el.box.h, Math.max(9, size * PT2MM * 4));
    nodes.forEach((n, i) => {
      const x = el.box.x + i * (w + gap);
      const y = el.box.y + (el.box.h - hh) / 2;
      setFill(doc, st.boxFill || "#F1F5F9");
      shape(doc, { x, y, w, h: hh }, st.radius || 1.5, "F");
      if (st.boxStroke) {
        setStroke(doc, st.boxStroke);
        doc.setLineWidth(0.3);
        shape(doc, { x, y, w, h: hh }, st.radius || 1.5, "S");
      }
      doc.setFont(FONT_PDF[st.font] || "sans", "normal");
      doc.setFontSize(size);
      setText(doc, st.color || ctx.body);
      doc.text(String(n.text), x + w / 2, y + hh / 2 + size * PT2MM * 0.36, { align: "center", maxWidth: w - 3 });
      if (i < nodes.length - 1) {
        setStroke(doc, st.accent || ctx.accent);
        doc.setLineWidth(0.35);
        const ax = x + w + 1.2;
        const ay = y + hh / 2;
        doc.line(ax, ay, ax + gap - 3.6, ay);
        setFill(doc, st.accent || ctx.accent);
        doc.lines([[2.2, -1.4], [0, 2.8], [-2.2, -1.4]], ax + gap - 1.4, ay - 1.4, [1, 1], "F", true);
      }
    });
    return;
  }
  const hh = (el.box.h - gap * (nodes.length - 1)) / nodes.length;
  nodes.forEach((n, i) => {
    const y = el.box.y + i * (hh + gap);
    setFill(doc, st.boxFill || "#F1F5F9");
    shape(doc, { x: el.box.x, y, w: el.box.w, h: hh }, st.radius || 1.5, "F");
    if (st.boxStroke) {
      setStroke(doc, st.boxStroke);
      doc.setLineWidth(0.3);
      shape(doc, { x: el.box.x, y, w: el.box.w, h: hh }, st.radius || 1.5, "S");
    }
    doc.setFont(FONT_PDF[st.font] || "sans", "normal");
    doc.setFontSize(size);
    setText(doc, st.color || ctx.body);
    doc.text(String(n.text), el.box.x + el.box.w / 2, y + hh / 2 + size * PT2MM * 0.36, { align: "center", maxWidth: el.box.w - 4 });
  });
}

/** Table des matières : entrées + points de conduite + numéros de page. */
function drawTocElement(doc, el, ctx) {
  const st = el.style || {};
  const size = Number(st.size) || 10.5;
  const entries = el.data?.entries || [];
  let y = el.box.y + size * PT2MM * 1.1;
  const lh = (Number(st.lineHeight) || 1.6) * size * PT2MM;
  entries.forEach((e) => {
    const isLevel1 = Number(e.level) === 1;
    const label = String(e.text || "").slice(0, 90);
    doc.setFont(FONT_PDF[st.font] || "serif", isLevel1 ? "bold" : "normal");
    doc.setFontSize(isLevel1 ? size + 0.5 : size);
    setText(doc, isLevel1 ? ctx.heading : st.color || ctx.body);
    const indent = isLevel1 ? 0 : 4;
    const numText = e.page ? String(e.page) : "";
    doc.text(label, el.box.x + indent, y, { maxWidth: Math.max(10, el.box.w - indent - 8) });
    if (numText) {
      doc.setFont(FONT_PDF[st.font] || "serif", "normal");
      doc.setFontSize(isLevel1 ? size + 0.5 : size);
      const labelW = doc.getTextWidth(label) + indent;
      const numW = doc.getTextWidth(numText);
      setText(doc, st.color || ctx.body);
      doc.text(numText, el.box.x + el.box.w, y, { align: "right" });
      if (labelW + numW + 4 < el.box.w) {
        setStroke(doc, mixHex(ctx.bg || "#ffffff", st.color || "#111111", 0.45));
        doc.setLineWidth(0.15);
        doc.setLineDashPattern([0.3, 1.1], 0, "round");
        doc.line(el.box.x + labelW + 1.5, y + 0.35, el.box.x + el.box.w - numW - 1, y + 0.35);
        doc.setLineDashPattern([], 0);
      }
    }
    y += lh;
  });
}
// ─── Rendu d'UNE page du modèle structuré ──────────────────────────────────
/** Filigrane du document (protection) — même rendu que le reste du Générateur. */
function drawWatermark(doc, docMeta, box) {
  const wm = docMeta?.protection?.watermark;
  if (!wm || !wm.enabled) return;
  const { w, h } = box;
  const text = wm.text || `© ${docMeta.author || "Auteur"}`;
  const opacity = wm.mode === "visible" ? 16 : 6;
  withOpacity(doc, opacity, () => {
    doc.setFont(FONT_PDF.sans, "bold");
    doc.setFontSize(Math.min(110, w * 0.42));
    setText(doc, wm.color || "#555555");
    try {
      doc.text(String(text), w / 2, h / 2, { align: "center", angle: 45 });
    } catch {
      doc.text(String(text), w / 2, h / 2, { align: "center" });
    }
  });
}

/** Applique la rotation d'un élément (si jsPDF le permet) autour de son centre. */
async function withRotation(doc, el, draw) {
  const rot = Number(el.rot) || 0;
  if (!rot || typeof doc.setCurrentTransformationMatrix !== "function") {
    await draw();
    return;
  }
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = el.box.x + el.box.w / 2;
  const cy = el.box.y + el.box.h / 2;
  const e = cx - cx * cos + cy * sin;
  const f = cy - cx * sin - cy * cos;
  try {
    doc.saveGraphicsState();
    doc.setCurrentTransformationMatrix([cos, sin, -sin, cos, e, f]);
    await draw();
    doc.restoreGraphicsState();
  } catch {
    try {
      doc.restoreGraphicsState();
    } catch {
      /* état graphique déjà restauré */
    }
    await draw();
  }
}

async function drawStudioPage(doc, page, ctx) {
  const { box, template, docMeta, index, total } = ctx;
  const { w, h } = box;
  const bg = page.design?.bg || template.colors.bg || "#ffffff";
  if (bg && bg !== "#ffffff") {
    setFill(doc, bg);
    doc.rect(0, 0, w, h, "F");
  }
  if (page.design?.decor) {
    drawPageDecor(doc, { ...template, pageDecor: page.design.decor }, box, docMeta);
  }
  const tokens = {
    page: index + 1,
    pages: total,
    title: docMeta?.title || "",
    author: docMeta?.author || "",
    date: new Date().toLocaleDateString("fr-FR"),
    ref: docMeta?.doc_ref || "",
    bodyFont: template.bodyFont,
    headingFont: template.headingFont,
    accent: template.colors.accent,
    heading: template.colors.heading,
    body: template.colors.body,
    bg,
  };
  for (const el of sortedElements(page)) {
    if (el.hidden) continue;
    const kind = elementType(el.type).kind;
    const paint = async () => {
      if (kind === "media") await drawMediaElement(doc, el, tokens);
      else if (kind === "shape") drawShapeElement(doc, el, tokens);
      else if (kind === "data") {
        if (el.type === "table") drawTableElement(doc, el, tokens);
        else if (el.type === "chart") drawChartElement(doc, el, tokens);
        else if (el.type === "stats") drawStatsElement(doc, el, tokens);
        else if (el.type === "diagram") drawDiagramElement(doc, el, tokens);
      } else if (el.type === "toc") drawTocElement(doc, el, tokens);
      else drawTextElement(doc, el, tokens);
    };
    await withRotation(doc, el, paint);
  }
  drawWatermark(doc, docMeta, box);
}

// ─── Export PDF du Studio (aperçu = PDF : même modèle, même repère mm) ─────
export async function exportStudioPdf({ pages, docMeta, onProgress, filename, download = true }) {
  const box = resolvePageBox(docMeta || {});
  const template = resolveTemplate(getTemplate(docMeta?.template_id), docMeta?.style_overrides);
  const { w, h } = box;
  const doc = new jsPDF({
    unit: "mm",
    format: [w, h],
    orientation: w > h ? "landscape" : "portrait",
    compress: true,
  });
  doc.setProperties({
    title: docMeta?.title || "Document",
    subject: docMeta?.subtitle || "",
    author: docMeta?.author || "",
    keywords: `Mboppi, ${docMeta?.doc_ref || ""}, Studio page par page`,
    creator: "Mboppi — Générateur de documents (Studio)",
  });
  const total = pages.length || 1;
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) doc.addPage([w, h], w > h ? "landscape" : "portrait");
    await drawStudioPage(doc, pages[i], { box, template, docMeta: docMeta || {}, index: i, total });
    onProgress?.(Math.round(((i + 1) / total) * 100), i + 1, total);
  }
  const name = String(filename || docMeta?.title || "document")
    .replace(/[\\/:*?"<>|]+/g, "")
    .slice(0, 60)
    .trim() || "document";
  if (download) doc.save(`${name.replace(/\.pdf$/i, "")}.pdf`);
  onProgress?.(100, total, total);
  return doc;
}
// ─── Export EPUB 3 du Studio (reflowable : téléphone, liseuse) ─────────────
// L'EPUB ne peut pas conserver une mise en page fixe : le contenu est donc
// repris dans l'ORDRE DE LECTURE (par calques) avec la typographie du document.
// Les décors purement visuels (formes, filets) sont ignorés — c'est la nature
// du format, et l'utilisateur le voit écrit dans l'interface.
const XHTML_TAGS = new Set(["SPAN", "A", "BR", "STRONG", "B", "EM", "I", "U", "S", "DEL", "STRIKE", "SUP", "SUB", "MARK", "P", "DIV"]);

function escText(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s) {
  return escText(s).replace(/"/g, "&quot;");
}
function sanitizeXhtml(html) {
  const raw = String(html || "");
  if (typeof DOMParser === "undefined") return escText(raw.replace(/<[^>]+>/g, " ")).trim();
  let root = null;
  try {
    root = new DOMParser().parseFromString(`<div id="epub-root">${raw}</div>`, "text/html").getElementById("epub-root");
  } catch {
    root = null;
  }
  if (!root) return escText(raw.replace(/<[^>]+>/g, " ")).trim();
  const one = (node) => {
    if (node.nodeType === 3) return escText(node.nodeValue.replace(/\s+/g, " "));
    if (node.nodeType !== 1) return "";
    const tag = node.tagName;
    if (tag === "BR") return "<br/>";
    const inner = [...node.childNodes].map(one).join("");
    if (!XHTML_TAGS.has(tag)) return inner;
    const lower = tag.toLowerCase();
    const attrs = [];
    const style = node.getAttribute("style");
    if (style) attrs.push(`style="${escAttr(style)}"`);
    if (lower === "a") {
      const href = node.getAttribute("href") || "";
      if (!/^https?:/i.test(href)) return inner;
      attrs.push(`href="${escAttr(href)}"`);
    }
    return `<${lower}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${inner}</${lower}>`;
  };
  return [...root.childNodes].map(one).join("").trim();
}
function plainText(page) {
  return (page.elements || [])
    .filter((e) => e.html)
    .map((e) => String(e.html).replace(/<[^>]+>/g, " "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
function studioCss(template, box) {
  const body = template.bodyFont === "sans" ? "Helvetica, Arial, sans-serif" : template.bodyFont === "mono" ? "'Courier New', monospace" : "'Times New Roman', Times, Georgia, serif";
  const head = template.headingFont === "sans" ? "Helvetica, Arial, sans-serif" : "'Times New Roman', Times, Georgia, serif";
  return `@page { margin: 5% }
html, body { margin: 0; padding: 0; }
body { font-family: ${body}; color: ${template.colors.body}; line-height: ${template.lineHeight}; background: ${template.colors.bg}; }
h1, h2, h3, h4 { font-family: ${head}; color: ${template.colors.heading}; line-height: 1.25; margin: 1.2em 0 0.5em; }
h1 { font-size: 1.7em; } h2 { font-size: 1.35em; } h3 { font-size: 1.15em; } h4 { font-size: 1.05em; }
p { margin: 0 0 0.8em; }
em { font-style: italic; } strong { font-weight: bold; }
blockquote { margin: 1em 1.2em; border-left: 3px solid ${template.colors.accent}; padding-left: 0.9em; font-style: italic; color: ${template.colors.heading}; }
.note, .box { background: ${template.colors.accent}1A; border: 1px solid ${template.colors.accent}55; border-radius: 4px; padding: 0.7em 0.9em; margin: 1em 0; }
.reference { color: ${template.colors.accent}; font-size: 0.9em; }
.footnote { font-size: 0.85em; border-top: 1px solid #ddd; padding-top: 0.4em; }
figure { margin: 1.2em 0; text-align: center; }
figure img { max-width: 100%; height: auto; }
.gallery { display: flex; flex-wrap: wrap; gap: 6px; }
.gallery img { width: 30%; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.92em; }
th, td { border: 1px solid ${template.colors.accent}66; padding: 4px 6px; text-align: left; }
th { background: ${template.colors.accent}22; color: ${template.colors.heading}; }
.stats { display: flex; flex-wrap: wrap; gap: 1em; margin: 1em 0; }
.stats div { flex: 1 1 30%; text-align: center; }
.stats b { display: block; font-size: 1.5em; color: ${template.colors.accent}; }
.cover { text-align: center; padding: 15% 8%; background: ${template.colors.accent}; color: #ffffff; height: 100%; }
.cover h1 { color: #ffffff; font-size: 2.2em; }
.pagebreak { break-before: page; }${box ? "" : ""}
`;
}
function hasHeading(page) {
  return (page.elements || []).some(
    (e) => (e.type === "heading" || e.type === "chapter") && String(e.html || "").replace(/<[^>]+>/g, "").trim(),
  );
}

function pageLabelSafe(page, i) {
  if (page.kind === "cover") return "Couverture";
  if (page.kind === "copyright") return "Copyright";
  if (page.kind === "toc") return "Sommaire";
  const el = (page.elements || []).find((e) => (e.type === "heading" || e.type === "chapter") && e.html);
  const text = el ? String(el.html).replace(/<[^>]+>/g, "").trim() : "";
  return text ? text.slice(0, 60) : `Page ${i + 1}`;
}

/** Contenu XHTML du corps d'une page du Studio (ordre de lecture). */
async function pageXhtmlBody(page, ctx) {
  const { imageRef, index, total, docMeta, title, author } = ctx;
  const body = [];
  const tokens = {
    page: index + 1, pages: total, title, author,
    date: new Date().toLocaleDateString("fr-FR"), ref: docMeta?.doc_ref || "",
  };
  for (const el of sortedElements(page)) {
    if (el.hidden) continue;
    if (elementType(el.type).kind === "shape") continue; // décor visuel : sans objet en reflowable
    if (el.type === "pageNumber") continue; // la pagination appartient à la liseuse
    if (el.type === "toc") {
      const items = (el.data?.entries || [])
        .map((e) => `<li>${escText(e.text)} — p. ${escText(String(e.page || ""))}</li>`)
        .join("");
      body.push(`<h2>${sanitizeXhtml(el.html) || "Table des matières"}</h2><ul>${items}</ul>`);
      continue;
    }
    if (el.html) {
      const html = sanitizeXhtml(applyTokens(el.html, tokens));
      if (!html) continue;
      const tag = el.type === "heading" || el.type === "chapter" ? "h2"
        : el.type === "subtitle" ? "h3"
          : el.type === "paragraph" || el.type === "textzone" || el.type === "footnote" ? "p" : "div";
      const cls = el.type === "note" ? "note" : el.type === "box" ? "box"
        : el.type === "reference" ? "reference" : el.type === "footnote" ? "footnote" : "";
      body.push(`<${tag}${cls ? ` class="${cls}"` : ""}>${html}</${tag}>`);
      continue;
    }
    if (el.type === "image" || el.type === "logo") {
      const ref = await imageRef(el.src);
      if (ref) body.push(`<figure><img src="${ref}" alt="${escAttr(el.name || "Illustration")}"/></figure>`);
      continue;
    }
    if (el.type === "gallery") {
      const refs = [];
      for (const it of el.data?.items || []) {
        const ref = await imageRef(it?.src || it);
        if (ref) refs.push(`<img src="${ref}" alt=""/>`);
      }
      if (refs.length) body.push(`<div class="gallery">${refs.join("")}</div>`);
      continue;
    }
    if (el.type === "icon") {
      body.push(`<p style="font-size:2em;text-align:center">${escText(el.data?.glyph || "★")}</p>`);
      continue;
    }
    if (el.type === "qr") {
      const data = el.data?.url ? await makeQrDataUrl(el.data.url, 400) : null;
      const ref = data ? await imageRef(data) : null;
      if (ref) {
        body.push(`<figure><img src="${ref}" alt="QR" style="width:38%"/><figcaption>${escText(el.data?.label || "Vérification")}</figcaption></figure>`);
      }
      continue;
    }
    if (el.type === "table") {
      const rows = el.data?.rows || [];
      const html = rows
        .map((row) => `<tr>${row.map((c) => (c?.header ? `<th>${escText(c.text)}</th>` : `<td>${escText(c?.text)}</td>`)).join("")}</tr>`)
        .join("");
      if (html) body.push(`<table>${html}</table>`);
      continue;
    }
    if (el.type === "chart") {
      const rows = (el.data?.series || []).map((s) => `<tr><td>${escText(s.label)}</td><td>${escText(String(s.value))}</td></tr>`).join("");
      body.push(`<h3>${escText(el.data?.title || "Données")}</h3><table>${rows}</table>`);
      continue;
    }
    if (el.type === "stats") {
      const items = (el.data?.items || []).map((it) => `<div><b>${escText(it.value)}</b>${escText(it.label)}</div>`).join("");
      body.push(`<div class="stats">${items}</div>`);
      continue;
    }
    if (el.type === "diagram") {
      const items = (el.data?.nodes || []).map((n) => `<li>${escText(n.text)}</li>`).join("");
      if (items) body.push(`<ol>${items}</ol>`);
    }
  }
  return body.join("\n");
}
/**
 * Export EPUB 3 du Studio : un XHTML par page, dans l'ordre du document, avec
 * la typographie du design. Les tableaux/graphiques deviennent des tableaux de
 * valeurs (l'EPUB est reflowable : aucune mise en page fixe n'est garantie).
 */
export async function exportStudioEpub({ pages, docMeta, onProgress }) {
  const JSZip = (await import("jszip")).default;
  const box = resolvePageBox(docMeta || {});
  const template = resolveTemplate(getTemplate(docMeta?.template_id), docMeta?.style_overrides);
  const title = docMeta?.title || "Document";
  const author = docMeta?.author || "";
  const lang = (navigator.language || "fr").slice(0, 2);
  const identifier = docMeta?.doc_ref
    ? `urn:mboppi:${docMeta.doc_ref}`
    : `urn:uuid:${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `gen-${Date.now()}`}`;
  onProgress?.(5, "Préparation du livre…");

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>`,
  );
  const oebps = zip.folder("OEBPS");
  oebps.file("style.css", studioCss(template, box));

  const images = new Map();
  async function imageRef(src) {
    if (!src) return null;
    if (images.has(src)) return images.get(src).file;
    let data = src;
    if (!/^data:image\//i.test(src)) {
      const fetched = await toDataUrl(src);
      if (!fetched) return null;
      data = fetched;
    }
    const m = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(data);
    if (!m) return null;
    const mime = `image/${m[1].toLowerCase()}`;
    const ext = /png/.test(mime) ? "png" : /webp/.test(mime) ? "webp" : /gif/.test(mime) ? "gif" : "jpg";
    const file = `media/img${images.size + 1}.${ext}`;
    oebps.file(file, m[2], { base64: true });
    images.set(src, { file, mime });
    return file;
  }

  const total = pages.length;
  const files = [];
  for (let i = 0; i < total; i++) {
    const page = pages[i];
    if (i % 6 === 0) onProgress?.(20 + Math.round((i / Math.max(1, total)) * 60), `Page ${i + 1}/${total}…`);
    const isCover = page.kind === "cover";
    const inner = isCover
      ? `<div class="cover"><h1>${escText(title)}</h1>${docMeta?.subtitle ? `<p>${escText(docMeta.subtitle)}</p>` : ""}${author ? `<p>${escText(author)}</p>` : ""}</div>`
      : await pageXhtmlBody(page, { imageRef, index: i, total, docMeta, title, author });
    const label = pageLabelSafe(page, i);
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escAttr(lang)}">\n<head><meta charset="utf-8"/><title>${escText(label)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>${inner}</body>\n</html>`;
    const file = `${isCover ? "cover" : `page-${i + 1}`}.xhtml`;
    oebps.file(file, xhtml);
    files.push({ file, id: `pg${i + 1}`, label, nav: isCover || page.kind === "toc" || hasHeading(page) });
  }
  onProgress?.(85, "Assemblage du livre…");
  const navItems = files.filter((f) => f.nav).map((f) => `      <li><a href="${f.file}">${escText(f.label)}</a></li>`).join("\n");
  oebps.file(
    "nav.xhtml",
    `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escAttr(lang)}">\n<head><meta charset="utf-8"/><title>Sommaire</title></head>\n<body>\n  <nav epub:type="toc" id="toc">\n    <h1>Sommaire</h1>\n    <ol>\n${navItems}\n    </ol>\n  </nav>\n</body>\n</html>`,
  );
  const navPoints = files
    .filter((f) => f.nav)
    .map((f, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${escText(f.label)}</text></navLabel><content src="${f.file}"/></navPoint>`)
    .join("\n");
  oebps.file(
    "toc.ncx",
    `<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n  <head><meta name="dtb:uid" content="${escAttr(identifier)}"/></head>\n  <docTitle><text>${escText(title)}</text></docTitle>\n  <navMap>\n${navPoints}\n  </navMap>\n</ncx>`,
  );
  const manifest = [
    `    <item id="css" href="style.css" media-type="text/css"/>`,
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    ...[...images.values()].map((img, i) => `    <item id="img${i + 1}" href="${img.file}" media-type="${img.mime}"/>`),
    ...files.map((f) => `    <item id="${f.id}" href="${f.file}" media-type="application/xhtml+xml"/>`),
  ].join("\n");
  const spine = files.map((f) => `    <itemref idref="${f.id}"/>`).join("\n");
  const creator = author ? `    <dc:creator>${escText(author)}</dc:creator>\n` : "";
  const desc = docMeta?.subtitle ? `    <dc:description>${escText(docMeta.subtitle)}</dc:description>\n` : "";
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  oebps.file(
    "content.opf",
    `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escAttr(lang)}">\n  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n    <dc:identifier id="bookid">${escText(identifier)}</dc:identifier>\n    <dc:title>${escText(title)}</dc:title>\n    <dc:language>${escText(lang)}</dc:language>\n${creator}${desc}    <meta property="dcterms:modified">${modified}</meta>\n  </metadata>\n  <manifest>\n${manifest}\n  </manifest>\n  <spine toc="ncx">\n${spine}\n  </spine>\n</package>`,
  );
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const name = String(title).replace(/[\\/:*?"<>|]+/g, "").slice(0, 60).trim() || "document";
  saveBlob(blob, `${name}.epub`);
  onProgress?.(100, "Terminé");
  return { blob, files: files.length, images: images.size };
}










