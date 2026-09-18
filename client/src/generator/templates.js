// Modèles de design du Générateur de documents. Chaque modèle définit la
// typographie, les tailles (pt), les couleurs, les espacements et les règles
// de pagination. Polices = tokens mappés sur les polices natives PDF
// (serif → Times, sans → Helvetica, mono → Courier) : accents français
// garantis, zéro payload de polices. Ajouter un modèle = un objet de plus.
export const GEN_TEMPLATES = [
  {
    id: "minimal", name: "Minimaliste", category: "Ebook",
    bodyFont: "serif", headingFont: "sans",
    sizes: { h1: 24, h2: 17, h3: 13.5, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.62, paraSpace: 5,
    colors: { heading: "#111111", body: "#1a1a1a", accent: "#6b7280", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#111111", coverText: "#ffffff", headingUpper: true,
  },
  {
    id: "moderne", name: "Moderne", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 26, h2: 18, h3: 14, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.58, paraSpace: 6,
    colors: { heading: "#1d4ed8", body: "#1f2937", accent: "#3b82f6", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#1d4ed8", coverText: "#ffffff", headingUpper: false,
  },
  {
    id: "elegant", name: "Élégant", category: "Ebook",
    bodyFont: "serif", headingFont: "serif",
    sizes: { h1: 26, h2: 18, h3: 14, h4: 12, body: 11, small: 9 },
    lineHeight: 1.7, paraSpace: 6,
    colors: { heading: "#4a3728", body: "#2d2a26", accent: "#8b6f47", bg: "#fffdf8" },
    align: "justify", chapterNewPage: true,
    coverBg: "#4a3728", coverText: "#f5ead9", headingUpper: false,
  },
  {
    id: "professionnel", name: "Professionnel", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 24, h2: 17, h3: 13.5, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.55, paraSpace: 5,
    colors: { heading: "#0f172a", body: "#334155", accent: "#0ea5e9", bg: "#ffffff" },
    align: "left", chapterNewPage: false,
    coverBg: "#0f172a", coverText: "#e2e8f0", headingUpper: false,
  },
  {
    id: "business", name: "Business", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 25, h2: 18, h3: 14, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.55, paraSpace: 6,
    colors: { heading: "#1e3a5f", body: "#2f3b4c", accent: "#c9a227", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#1e3a5f", coverText: "#ffffff", headingUpper: true,
  },
  {
    id: "education", name: "Éducation", category: "Ebook",
    bodyFont: "serif", headingFont: "sans",
    sizes: { h1: 24, h2: 17, h3: 13.5, h4: 12, body: 11, small: 9 },
    lineHeight: 1.65, paraSpace: 6,
    colors: { heading: "#14532d", body: "#1f2937", accent: "#16a34a", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#14532d", coverText: "#dcfce7", headingUpper: true,
  },
  {
    id: "motivation", name: "Motivation", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 28, h2: 19, h3: 14, h4: 12, body: 11, small: 9 },
    lineHeight: 1.6, paraSpace: 7,
    colors: { heading: "#c2410c", body: "#292524", accent: "#f59e0b", bg: "#fffbeb" },
    align: "justify", chapterNewPage: true,
    coverBg: "#c2410c", coverText: "#fff7ed", headingUpper: true,
  },
  {
    id: "finance", name: "Finance", category: "Ebook",
    bodyFont: "serif", headingFont: "sans",
    sizes: { h1: 24, h2: 17, h3: 13.5, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.6, paraSpace: 5,
    colors: { heading: "#064e3b", body: "#1f2937", accent: "#059669", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#064e3b", coverText: "#d1fae5", headingUpper: false,
  },
  {
    id: "technologie", name: "Technologie", category: "Ebook",
    bodyFont: "sans", headingFont: "mono",
    sizes: { h1: 24, h2: 17, h3: 13, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.55, paraSpace: 6,
    colors: { heading: "#312e81", body: "#1e293b", accent: "#6366f1", bg: "#ffffff" },
    align: "left", chapterNewPage: true,
    coverBg: "#312e81", coverText: "#e0e7ff", headingUpper: false,
  },
  {
    id: "luxe", name: "Luxe", category: "Ebook",
    bodyFont: "serif", headingFont: "serif",
    sizes: { h1: 28, h2: 19, h3: 14, h4: 12, body: 11, small: 9 },
    lineHeight: 1.72, paraSpace: 7,
    colors: { heading: "#1c1917", body: "#292524", accent: "#b8860b", bg: "#fffef9" },
    align: "justify", chapterNewPage: true,
    coverBg: "#1c1917", coverText: "#d4af37", headingUpper: false,
  },
  {
    id: "jeunesse", name: "Jeunesse", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 26, h2: 18, h3: 14, h4: 12.5, body: 11.5, small: 9 },
    lineHeight: 1.62, paraSpace: 7,
    colors: { heading: "#be185d", body: "#312e81", accent: "#ec4899", bg: "#fff5fb" },
    align: "left", chapterNewPage: true,
    coverBg: "#be185d", coverText: "#fce7f3", headingUpper: false,
  },
  {
    id: "magazine", name: "Magazine", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 30, h2: 19, h3: 14, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.5, paraSpace: 6,
    colors: { heading: "#111827", body: "#1f2937", accent: "#dc2626", bg: "#ffffff" },
    align: "justify", chapterNewPage: false,
    coverBg: "#111827", coverText: "#ffffff", headingUpper: true,
  },
];

export function getTemplate(id) {
  return GEN_TEMPLATES.find((tpl) => tpl.id === id) || GEN_TEMPLATES[0];
}

// ─── Surcharges de style par document (`style_overrides`, colonne JSONB) ────
// Panneau « Typographie » du Générateur : l'utilisateur ajuste police, tailles,
// couleurs, interligne, alignement et espacement de paragraphe sans changer de
// modèle. Appliqué au même endroit que le modèle (pagination ET export PDF).
export const SIZE_KEYS = ["h1", "h2", "h3", "h4", "body", "small"];
export const COLOR_KEYS = ["heading", "body", "accent", "bg"];

export function resolveTemplate(template, overrides) {
  const ov = overrides && typeof overrides === "object" ? overrides : {};
  const out = {
    ...template,
    sizes: { ...template.sizes },
    colors: { ...template.colors },
  };
  if (ov.bodyFont && FONT_CSS[ov.bodyFont]) out.bodyFont = ov.bodyFont;
  if (ov.headingFont && FONT_CSS[ov.headingFont]) out.headingFont = ov.headingFont;
  if (ov.align === "left" || ov.align === "justify" || ov.align === "center") out.align = ov.align;
  const lh = Number(ov.lineHeight);
  if (Number.isFinite(lh) && lh >= 1.1 && lh <= 2.4) out.lineHeight = lh;
  const ps = Number(ov.paraSpace);
  if (Number.isFinite(ps) && ps >= 0 && ps <= 24) out.paraSpace = ps;
  if (ov.sizes) {
    for (const k of SIZE_KEYS) {
      const v = Number(ov.sizes[k]);
      if (Number.isFinite(v) && v >= 5 && v <= 60) out.sizes[k] = v;
    }
  }
  if (ov.colors) {
    for (const k of COLOR_KEYS) {
      const v = ov.colors[k];
      if (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v)) out.colors[k] = v;
    }
  }
  return out;
}

// Formats de page (mm). « ebook » ≈ format liseuse 6"×9" réduit.
export const PAGE_FORMATS = {
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  ebook: [120, 180],
};

// Marges par défaut (mm) — personnalisables par document, bornées.
const DEFAULT_MARGINS = { top: 20, right: 18, bottom: 20, left: 18 };

export function resolvePageBox(docMeta) {
  let [w, h] = PAGE_FORMATS[docMeta.page_format] || PAGE_FORMATS.A4;
  if (docMeta.page_format === "custom" && docMeta.page_width && docMeta.page_height) {
    w = Number(docMeta.page_width);
    h = Number(docMeta.page_height);
  }
  if (docMeta.orientation === "landscape") [w, h] = [h, w];
  const m = { ...DEFAULT_MARGINS, ...(docMeta.margins || {}) };
  m.top = Math.min(Math.max(Number(m.top) || 20, 5), 60);
  m.bottom = Math.min(Math.max(Number(m.bottom) || 20, 5), 60);
  m.left = Math.min(Math.max(Number(m.left) || 18, 5), 60);
  m.right = Math.min(Math.max(Number(m.right) || 18, 5), 60);
  return { w, h, m };
}

// Équivalents CSS des polices PDF natives — métriques quasi identiques
// (Arial ≈ Helvetica, Times New Roman = Times, Courier New = Courier).
export const FONT_CSS = {
  serif: '"Times New Roman", Times, serif',
  sans: "Arial, Helvetica, sans-serif",
  mono: '"Courier New", Courier, monospace',
};

export const FONT_PDF = { serif: "times", sans: "helvetica", mono: "courier" };

// Espacements typographiques autour des titres (en pt).
export function blockSpacing(template, kind) {
  const s = template.sizes;
  switch (kind) {
    case "h1": return { before: s.h1 * 2.2, after: s.h1 * 1.0 };
    case "h2": return { before: s.h2 * 1.9, after: s.h2 * 0.75 };
    case "h3": return { before: s.h3 * 1.6, after: s.h3 * 0.6 };
    case "h4": return { before: s.h4 * 1.5, after: s.h4 * 0.5 };
    case "quote": return { before: s.body * 1.4, after: s.body * 1.4 };
    case "list": return { before: s.body * 0.8, after: s.body * 1.2 };
    case "image": return { before: s.body * 1.2, after: s.body * 1.4 };
    case "hr": return { before: s.body * 1.6, after: s.body * 1.8 };
    default: return { before: 0, after: template.paraSpace };
  }
}