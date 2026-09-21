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
    headingRule: "h1", headingBar: "none", coverLayout: "center", coverRule: false,
    coverShape: "none",
    pageDecor: "toprule", // double filet éditorial en tête de page
  },
  {
    id: "moderne", name: "Moderne", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 26, h2: 18, h3: 14, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.58, paraSpace: 6,
    colors: { heading: "#1d4ed8", body: "#1f2937", accent: "#3b82f6", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#1d4ed8", coverText: "#ffffff", headingUpper: false,
    headingRule: "h1", headingBar: "left", coverLayout: "band", coverRule: false,
    coverDimDefault: 0, // mise en page « bande » : la photo reste NETTE (aucun voile)
    coverShape: "arc", // quart de cercle d'accent en haut à gauche (style « pro »)
    pageDecor: "topbar", // fin barre d'accent en haut de chaque page de contenu
  },
  {
    id: "elegant", name: "Élégant", category: "Ebook",
    bodyFont: "serif", headingFont: "serif",
    sizes: { h1: 26, h2: 18, h3: 14, h4: 12, body: 11, small: 9 },
    lineHeight: 1.7, paraSpace: 6,
    colors: { heading: "#4a3728", body: "#2d2a26", accent: "#8b6f47", bg: "#fffdf8" },
    align: "justify", chapterNewPage: true,
    coverBg: "#4a3728", coverText: "#f5ead9", headingUpper: false,
    headingRule: "none", headingBar: "none", coverLayout: "center", coverRule: true,
    coverShape: "none",
    pageDecor: "doublerule", // double filet en tête et en pied (édition classique)
  },
  {
    id: "professionnel", name: "Professionnel", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 24, h2: 17, h3: 13.5, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.55, paraSpace: 5,
    colors: { heading: "#0f172a", body: "#334155", accent: "#0ea5e9", bg: "#ffffff" },
    align: "left", chapterNewPage: false,
    coverBg: "#0f172a", coverText: "#e2e8f0", headingUpper: false,
    headingRule: "h1", headingBar: "none", coverLayout: "left", coverRule: true,
    coverShape: "bars",
    pageDecor: "sidebartint", // colonne latérale teintée « classeur »
  },
  {
    id: "business", name: "Business", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 25, h2: 18, h3: 14, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.55, paraSpace: 6,
    colors: { heading: "#1e3a5f", body: "#2f3b4c", accent: "#c9a227", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#1e3a5f", coverText: "#ffffff", headingUpper: true,
    headingRule: "h1h2", headingBar: "none", coverLayout: "band", coverRule: false,
    coverDimDefault: 0, // mise en page « bande » : la photo reste NETTE (aucun voile)
    coverShape: "diag", // coin biseauté doré en bas à droite
    pageDecor: "headerband", // bandeau titre du document en tête de page (style rapport)
  },
  {
    id: "education", name: "Éducation", category: "Ebook",
    bodyFont: "serif", headingFont: "sans",
    sizes: { h1: 24, h2: 17, h3: 13.5, h4: 12, body: 11, small: 9 },
    lineHeight: 1.65, paraSpace: 6,
    colors: { heading: "#14532d", body: "#1f2937", accent: "#16a34a", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#14532d", coverText: "#dcfce7", headingUpper: true,
    headingRule: "h1", headingBar: "left", coverLayout: "top", coverRule: true,
    coverShape: "bars",
    pageDecor: "noterule", // marge de cahier : filet vertical gauche
  },
  {
    id: "motivation", name: "Motivation", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 28, h2: 19, h3: 14, h4: 12, body: 11, small: 9 },
    lineHeight: 1.6, paraSpace: 7,
    colors: { heading: "#c2410c", body: "#292524", accent: "#f59e0b", bg: "#fffbeb" },
    align: "justify", chapterNewPage: true,
    coverBg: "#c2410c", coverText: "#fff7ed", headingUpper: true,
    headingRule: "none", headingBar: "left", coverLayout: "band", coverRule: false,
    coverDimDefault: 0, // mise en page « bande » : la photo reste NETTE (aucun voile)
    coverShape: "arc", // quart de cercle d'accent en haut à gauche
    pageDecor: "bottomband", // bande d'accent ambrée au pied de chaque page
  },
  {
    id: "finance", name: "Finance", category: "Ebook",
    bodyFont: "serif", headingFont: "sans",
    sizes: { h1: 24, h2: 17, h3: 13.5, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.6, paraSpace: 5,
    colors: { heading: "#064e3b", body: "#1f2937", accent: "#059669", bg: "#ffffff" },
    align: "justify", chapterNewPage: true,
    coverBg: "#064e3b", coverText: "#d1fae5", headingUpper: false,
    headingRule: "h1h2", headingBar: "none", coverLayout: "left", coverRule: false,
    coverShape: "diag",
    pageDecor: "doubleband", // filet haut + bande pleine au pied (rapport)
  },
  {
    id: "technologie", name: "Technologie", category: "Ebook",
    bodyFont: "sans", headingFont: "mono",
    sizes: { h1: 24, h2: 17, h3: 13, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.55, paraSpace: 6,
    colors: { heading: "#312e81", body: "#1e293b", accent: "#6366f1", bg: "#ffffff" },
    align: "left", chapterNewPage: true,
    coverBg: "#312e81", coverText: "#e0e7ff", headingUpper: false,
    headingRule: "none", headingBar: "left", coverLayout: "top", coverRule: true,
    coverDimDefault: 0.15,
    coverShape: "circle", // disque + anneau indigo débordant du coin haut-droit
    pageDecor: "sideline", // filet vertical gradué (fiche technique)
  },
  {
    id: "luxe", name: "Luxe", category: "Ebook",
    bodyFont: "serif", headingFont: "serif",
    sizes: { h1: 28, h2: 19, h3: 14, h4: 12, body: 11, small: 9 },
    lineHeight: 1.72, paraSpace: 7,
    colors: { heading: "#1c1917", body: "#292524", accent: "#b8860b", bg: "#fffef9" },
    align: "justify", chapterNewPage: true,
    coverBg: "#1c1917", coverText: "#d4af37", headingUpper: false,
    headingRule: "h1", headingBar: "none", coverLayout: "center", coverRule: true,
    coverDimDefault: 0.15,
    coverShape: "none",
    pageDecor: "frame", // cadre doré du livre de luxe
  },
  {
    id: "jeunesse", name: "Jeunesse", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 26, h2: 18, h3: 14, h4: 12.5, body: 11.5, small: 9 },
    lineHeight: 1.62, paraSpace: 7,
    colors: { heading: "#be185d", body: "#312e81", accent: "#ec4899", bg: "#fff5fb" },
    align: "left", chapterNewPage: true,
    coverBg: "#be185d", coverText: "#fce7f3", headingUpper: false,
    headingRule: "none", headingBar: "none", coverLayout: "band", coverRule: false,
    coverDimDefault: 0, // mise en page « bande » : la photo reste NETTE (aucun voile)
    coverShape: "circle", // gros disque rose débordant du coin haut-droit
    pageDecor: "sidestrip", // colonne d'accent rose sur le bord gauche
  },
  {
    id: "magazine", name: "Magazine", category: "Ebook",
    bodyFont: "sans", headingFont: "sans",
    sizes: { h1: 30, h2: 19, h3: 14, h4: 12, body: 10.5, small: 8.5 },
    lineHeight: 1.5, paraSpace: 6,
    colors: { heading: "#111827", body: "#1f2937", accent: "#dc2626", bg: "#ffffff" },
    align: "justify", chapterNewPage: false,
    coverBg: "#111827", coverText: "#ffffff", headingUpper: true,
    headingRule: "h1", headingBar: "none", coverLayout: "top", coverRule: true,
    coverDimDefault: 0.15,
    coverShape: "diag",
    pageDecor: "masthead", // bandeau portant le titre sur chaque page
  },
];

export function getTemplate(id) {
  return GEN_TEMPLATES.find((tpl) => tpl.id === id) || GEN_TEMPLATES[0];
}

// Convertisseur hex → rgba() : utilisé par l'aperçu HTML et les couvertures
// (bandes dégradées qui laissent voir la photo au lieu d'un aplat opaque).
export function withAlpha(hex, alpha = 1) {
  const h = String(hex || "").trim();
  const m = h.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return h || "transparent";
  let v = m[1];
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
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

// ─── Couverture : options normalisées (aperçu HTML, PDF, miniature produit) ──
// Toutes les valeurs sont bornées ici : l'utilisateur peut tout régler sans
// jamais produire de mise en page cassée. `imageOpacity` (0-100, réglage
// manuel) prime sur `imageDim` (ancien voile fixe) — rétrocompatible.
export function resolveCover(docMeta, template) {
  const c = (docMeta && docMeta.cover) || {};
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  // Voile de lisibilité au-dessus de la photo de fond :
  // 1. `imageOpacity` (curseur manuel) prime toujours ;
  // 2. sinon l'ancien `imageDim` explicite ;
  // 3. sinon le défaut DU MODÈLE (`coverDimDefault`) — les modèles « réalistes »
  //    (moderne, magazine, technologie, luxe, business) affichent la photo
  //    presque telle quelle (voile léger 0,15) au lieu de l'ancien voile
  //    uniforme 0,35 qui ternissait toutes les couvertures ;
  // 4. repli général 0,2.
  const dim = Number.isFinite(Number(c.imageOpacity))
    ? 1 - num(c.imageOpacity, 0, 100, 65) / 100
    : Number.isFinite(Number(c.imageDim))
      ? num(c.imageDim, 0, 0.9, 0.35)
      : num(template.coverDimDefault, 0, 0.9, 0.2);
  return {
    bg: c.bg || template.coverBg,
    fg: c.text || template.coverText,
    accent: template.colors.accent,
    image: c.image || null,
    dim,
    showTitle: c.showTitle !== false,
    title: String(c.title || (docMeta && docMeta.title) || "Sans titre"),
    subtitle: String(c.subtitle || (docMeta && docMeta.subtitle) || ""),
    author: String((docMeta && docMeta.author) || ""),
    align: ["left", "center", "right"].includes(c.titleAlign) ? c.titleAlign : "center",
    x: num(c.titleX, 5, 95, 50),
    y: num(c.titleY, 5, 95, 32),
    // Cadrage vertical de la photo de fond : 0 % = haut de l'image conservé
    // (le haut n'est plus coupé), 100 % = bas de l'image. Défaut 30 %.
    imageY: num(c.imageY, 0, 100, 30),
    customX: c.titleX !== undefined && c.titleX !== null,
    customY: c.titleY !== undefined && c.titleY !== null,
    layout: ["center", "left", "band", "top"].includes(template.coverLayout)
      ? template.coverLayout
      : "center",
    rule: !!template.coverRule,
  };
}

// Géométrie de la couverture, calculée UNE fois et exprimée dans l'unité de la
// largeur de page (mm pour l'aperçu et le PDF, px pour le canvas produit) :
// les trois rendus appliquent donc exactement la même mise en page.
export function coverLayoutBox(cover, pageW) {
  const layout = cover.layout;
  const band = layout === "band";
  const pad = layout === "left" ? pageW * 0.08 : 16;
  let maxW = Math.max(20, pageW - pad * 2);
  // Position horizontale manuelle (titleX) : le bloc titre est rétréci à 62 %
  // de la page pour que le curseur déplace RÉELLEMENT le texte — sinon le bloc
  // pleine largeur est clampé au centre et le réglage reste sans effet.
  if (cover.customX) maxW = Math.min(maxW, pageW * 0.62);
  let x = pad;
  if (cover.align === "center") {
    const cx = Math.min(pageW - pad - maxW / 2, Math.max(pad + maxW / 2, (cover.x / 100) * pageW));
    x = cx - maxW / 2;
  } else if (cover.align === "right") {
    // Le texte est calé à DROITE du bloc : le curseur pousse le bord droit.
    x = Math.min(pageW - pad - maxW, Math.max(pad, (cover.x / 100) * pageW - maxW));
  } else {
    x = Math.min(pageW - pad - maxW, Math.max(pad, (cover.x / 100) * pageW));
  }
  // Position verticale : les mises en page « bande » et « haut » imposent leur
  // zone par défaut, l'utilisateur garde la main dès qu'il règle titleY.
  let yPct = cover.y;
  if (band) yPct = cover.customY ? Math.min(92, Math.max(64, yPct)) : 68;
  else if (layout === "top" && !cover.customY) yPct = 14;
  return { layout, band, leftish: layout === "left" || band, pad, maxW, x, yPct, align: cover.align };
}

// ── Forme géométrique de couverture (style « modèle PDF pro ») ──────────────
// Décor d'accent du modèle, dessiné PAR-DESSUS la photo/le fond et SOUS le
// texte — géométrie exprimée dans l'unité de la page (mm pour l'aperçu et le
// PDF, px pour la canvas produit) : les trois rendus sont identiques.
//   "arc"    : disque plein partant du coin haut-GAUCHE (quart visible) ;
//   "circle" : grand disque + anneau débordant du coin haut-DROIT ;
//   "diag"   : coin biseauté (triangle) dans le coin bas-DROIT ;
//   "half"   : demi-bas pleine largeur en aplat.
// Décor de couverture : formes géométriques neutres (rectangles, disques,
// anneaux, polygones) dessinées à l'identique par l'aperçu HTML (SVG), la
// miniature (canvas) et le PDF (jsPDF) — voir `generator/coverDecor.js`.
// Les formes restent dans les coins hauts / bords : le tiers inférieur des
// modèles « bande » garde son titre posé directement sur la photo, sans
// aucune couche de couleur par-dessus.
export function coverShapeSpec(template, w, h) {
  const accent = template.colors.accent;
  const heading = template.colors.heading;
  // Quart de disque (secteur) échantillonné en polygone : un seul type de
  // primitive est ainsi à dessiner dans les 3 rendus.
  const pie = (cx, cy, r, color, steps = 48) => {
    const pts = [[cx, cy]];
    for (let i = 0; i <= steps; i += 1) {
      const a = (Math.PI / 2) * (i / steps);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return { kind: "poly", color, pts };
  };
  const rect = (x, y, rw, rh, color) => ({ kind: "rect", color, x, y, w: rw, h: rh });
  const disc = (cx, cy, r, color) => ({ kind: "circle", color, cx, cy, r });
  const ring = (cx, cy, r, color, lw) => ({ kind: "ring", color, cx, cy, r, lw });

  switch (template.coverShape) {
    case "arc":
      // Quart de disque d'accent en haut à gauche + deux anneaux concentriques.
      return [
        pie(0, 0, 0.55 * w, accent),
        ring(0.2 * w, 0.21 * w, 0.34 * w, heading, 0.012 * w),
        ring(0.2 * w, 0.21 * w, 0.44 * w, accent, 0.007 * w),
      ];
    case "circle":
      // Disque débordant du coin haut-droit + anneau + rappel en haut à gauche.
      return [
        disc(1.04 * w, 0.08 * h, 0.4 * w, accent),
        ring(1.04 * w, 0.08 * h, 0.5 * w, heading, 0.014 * w),
        disc(0.07 * w, 0.16 * h, 0.05 * w, accent),
      ];
    case "diag":
      // Coin biseauté en bas à droite (deux triangles emboîtés) + anneau.
      return [
        { kind: "poly", color: accent, pts: [[0.72 * w, h], [w, 0.5 * h], [w, h]] },
        { kind: "poly", color: heading, pts: [[0.86 * w, h], [w, 0.76 * h], [w, h]] },
        ring(0.9 * w, 0.4 * h, 0.075 * w, accent, 0.012 * w),
      ];
    case "bars":
      // Signature graphique minimale (modèles « bande ») : trois barres
      // d'accent en haut à gauche + un anneau en haut à droite — jamais sur
      // le titre, jamais de bloc de couleur sur la photo.
      return [
        rect(0, 0.05 * h, 0.36 * w, 0.016 * h, accent),
        rect(0, 0.084 * h, 0.26 * w, 0.016 * h, accent),
        rect(0, 0.118 * h, 0.16 * w, 0.016 * h, heading),
        ring(w - 0.14 * w, 0.1 * h, 0.07 * w, accent, 0.014 * w),
      ];
    default:
      return [];
  }
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

// Espacements typographiques autour des titres (en pt). Valeurs resserrées
// façon Word : les anciens coefficients (h1 ×2.2, h2 ×1.9…) laissaient des
// vides excessifs autour des titres et entre les listes — les documents
// semblaient « aérés » au point de faire apparaître des pages à moitié vides.
export function blockSpacing(template, kind) {
  const s = template.sizes;
  switch (kind) {
    case "h1": return { before: s.h1 * 0.9, after: s.h1 * 0.45 };
    case "h2": return { before: s.h2 * 0.8, after: s.h2 * 0.4 };
    case "h3": return { before: s.h3 * 0.7, after: s.h3 * 0.3 };
    case "h4": return { before: s.h4 * 0.6, after: s.h4 * 0.25 };
    case "quote": return { before: s.body * 0.8, after: s.body * 0.8 };
    case "list": return { before: 0, after: s.body * 0.22 };
    case "listFirst": return { before: s.body * 0.45, after: s.body * 0.22 };
    case "listLast": return { before: 0, after: s.body * 0.7 };
    case "image": return { before: s.body * 0.9, after: s.body };
    case "hr": return { before: s.body, after: s.body * 1.2 };
    default: return { before: 0, after: template.paraSpace };
  }
}