// ─── Modèle de document STRUCTURÉ du Studio (édition page par page) ──────────
// Le Studio n'aplatit JAMAIS le document : chaque page est un conteneur
// d'ÉLÉMENTS typés et indépendants (texte, image, forme, tableau, graphique,
// en-tête, pied de page…), chacun avec sa boîte (mm), son style, son ordre
// d'empilement, ses verrous et sa visibilité. Le PDF / l'EPUB ne sont que des
// EXPORTS de ce modèle : le document source reste modifiable après génération
// (§24 « édition sans destruction » du cahier des charges).
//
// REPÈRE DE COORDONNÉES : millimètres, origine = coin HAUT-GAUCHE de la page.
// jsPDF partage exactement ce repère (dessin en mm, origine identique) : un
// élément posé à (x, y) se retrouve au même endroit dans l'aperçu du Studio et
// dans le PDF exporté — c'est ce qui rend « aperçu = PDF » possible.
//
// Ce module est PUR (aucun accès DOM, aucun réseau) : il fabrique, transforme
// et analyse le modèle. La mesure du texte vit dans StudioCanvas (mesure
// navigateur) et dans studioExport (métriques jsPDF).
import { PX_PER_MM, lineText } from "./paginate.js";
import { resolvePageBox, resolveCover, coverLayoutBox, FONT_CSS } from "./templates.js";
import { coverDecorPrims } from "./coverDecor.js";
import { copyrightLines, verificationPayload } from "./protection.js";
import { MBOPPI_PROMO_HTML, MBOPPI_PROMO_FONT_PT, MBOPPI_PROMO_BOX_H_MM, hasMboppiPromo } from "./footerPromo.js";
import { BASE_URL } from "../config.js";

/** Lien public de vérification encodé dans le QR code d'une page. */
export function verificationUrl(docMeta) {
  const ref = docMeta?.doc_ref || "";
  return ref ? `${BASE_URL}/verifier/${ref}` : `${BASE_URL}/verifier`;
}

export const STUDIO_VERSION = 1;

// px (mesure navigateur) → mm (repère du modèle).
const px2mm = (v) => Number(v || 0) / PX_PER_MM;

let seq = 0;
/** Identifiant court et unique d'élément / de page. */
export function uid(prefix = "e") {
  seq += 1;
  return `${prefix}${Date.now().toString(36).slice(-3)}${seq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
export const round1 = (v) => Math.round(Number(v) * 10) / 10;

// ─── Types d'éléments (§6 « Ajout d'éléments ») ─────────────────────────────
// `kind` pilote le rendu : texte (HTML riche), média (src), forme (boîte
// colorée), donnée (tableau/graphique), éditorial (pages/chapitres).
export const ELEMENT_GROUPS = [
  { id: "text", label: "Texte", emoji: "🔤" },
  { id: "media", label: "Média", emoji: "🖼️" },
  { id: "shape", label: "Éléments graphiques", emoji: "◼️" },
  { id: "data", label: "Données", emoji: "📊" },
  { id: "editorial", label: "Éléments éditoriaux", emoji: "📖" },
];

export const ELEMENT_TYPES = [
  // Texte
  { id: "paragraph", label: "Paragraphe", group: "text", kind: "text", box: { w: 174, h: 24 } },
  { id: "textzone", label: "Zone de texte", group: "text", kind: "text", box: { w: 80, h: 30 } },
  { id: "heading", label: "Titre", group: "text", kind: "text", box: { w: 174, h: 14 }, data: { level: 1 } },
  { id: "subtitle", label: "Sous-titre", group: "text", kind: "text", box: { w: 174, h: 11 }, data: { level: 2 } },
  { id: "quote", label: "Citation", group: "text", kind: "text", box: { w: 150, h: 22 } },
  { id: "note", label: "Note", group: "text", kind: "text", box: { w: 150, h: 20 } },
  { id: "box", label: "Encadré", group: "text", kind: "text", box: { w: 150, h: 26 } },
  { id: "list", label: "Liste", group: "text", kind: "text", box: { w: 174, h: 26 } },
  { id: "chapter", label: "Chapitre", group: "text", kind: "text", box: { w: 174, h: 30 } },
  // Média
  { id: "image", label: "Image", group: "media", kind: "media", box: { w: 120, h: 80 } },
  { id: "gallery", label: "Galerie d'images", group: "media", kind: "media", box: { w: 174, h: 60 } },
  { id: "icon", label: "Icône", group: "media", kind: "media", box: { w: 20, h: 20 } },
  { id: "logo", label: "Logo", group: "media", kind: "media", box: { w: 40, h: 20 } },
  { id: "qr", label: "QR Code", group: "media", kind: "media", box: { w: 40, h: 44 } },
  // Graphique
  { id: "rect", label: "Rectangle", group: "shape", kind: "shape", box: { w: 60, h: 30 } },
  { id: "block", label: "Bloc coloré", group: "shape", kind: "shape", box: { w: 174, h: 18 } },
  { id: "circle", label: "Cercle", group: "shape", kind: "shape", box: { w: 40, h: 40 } },
  { id: "shape", label: "Forme", group: "shape", kind: "shape", box: { w: 40, h: 30 }, data: { shapeKind: "triangle" } },
  { id: "line", label: "Ligne", group: "shape", kind: "shape", box: { w: 100, h: 2 } },
  { id: "divider", label: "Séparateur", group: "shape", kind: "shape", box: { w: 174, h: 2 } },
  // Données
  { id: "table", label: "Tableau", group: "data", kind: "data", box: { w: 174, h: 50 } },
  { id: "chart", label: "Graphique", group: "data", kind: "data", box: { w: 150, h: 80 }, data: { chartType: "bar" } },
  { id: "diagram", label: "Diagramme", group: "data", kind: "data", box: { w: 174, h: 50 }, data: { flow: "h" } },
  { id: "stats", label: "Statistiques", group: "data", kind: "data", box: { w: 174, h: 30 } },
  // Éditorial
  { id: "pageNumber", label: "Numéro de page", group: "editorial", kind: "editorial", box: { w: 40, h: 8 } },
  { id: "header", label: "En-tête", group: "editorial", kind: "editorial", box: { w: 174, h: 10 } },
  { id: "footer", label: "Pied de page", group: "editorial", kind: "editorial", box: { w: 174, h: 10 } },
  { id: "toc", label: "Table des matières", group: "editorial", kind: "editorial", box: { w: 174, h: 120 } },
  { id: "footnote", label: "Note de bas de page", group: "editorial", kind: "text", box: { w: 174, h: 12 } },
  { id: "reference", label: "Référence", group: "editorial", kind: "text", box: { w: 174, h: 12 } },
  { id: "bibliography", label: "Bibliographie", group: "editorial", kind: "text", box: { w: 174, h: 40 } },
];

const TYPE_MAP = new Map(ELEMENT_TYPES.map((t) => [t.id, t]));
export const elementType = (id) => TYPE_MAP.get(id) || TYPE_MAP.get("paragraph");
export const isTextType = (el) => elementType(el?.type).kind === "text";
/** Libellé lisible d'un élément (calques, inspecteur, sélection). */
export function elementLabel(el) {
  const t = elementType(el?.type);
  if (el?.name) return el.name;
  if (el?.type === "heading") {
    const lvl = Number(el?.data?.level) || 1;
    if (lvl <= 1) return "Titre";
    if (lvl === 2) return "Sous-titre";
    return `Titre ${lvl}`;
  }
  return t.label;
}

const KIND_EMOJI = { text: "🔤", media: "🖼️", shape: "◼️", data: "📊", editorial: "📖" };
/** Émoji d'un élément (listes, boutons). */
export function elementEmoji(el) {
  const t = elementType(el?.type);
  if (el?.type === "image" || el?.type === "gallery") return "🖼️";
  if (el?.type === "qr") return "▣";
  if (el?.type === "table") return "▦";
  if (el?.type === "chart") return "📈";
  if (el?.type === "pageNumber") return "#";
  if (el?.type === "header" || el?.type === "footer") return "▤";
  return KIND_EMOJI[t.kind] || "🔤";
}

// ─── Couleurs : mélange (fonds de note, bandes) + alpha CSS ─────────────────
function hexToRgb(hex) {
  const m = String(hex || "").match(/^#([0-9a-f]{6})$/i);
  if (!m) return [17, 17, 17];
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}
/** Mélange deux couleurs (t = part de `b`, 0..1) — fonds de note, bandes. */
export function mixHex(a, b, t = 0.1) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const to = (x, y) => Math.round(x + (y - x) * clamp(t, 0, 1));
  return `#${[to(r1, r2), to(g1, g2), to(b1, b2)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}
/** #rrggbb + opacité 0..1 → couleur CSS utilisable dans l'aperçu. */
export function cssAlpha(hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

// ─── Styles par défaut (issus du modèle de design du document) ──────────────
// Un élément créé hérite du modèle : il change avec lui (`applyTemplate`) mais
// garde ses réglages propres dès que l'utilisateur les modifie.
export function defaultStyle(template, type, extra = {}) {
  const s = template.sizes;
  const c = template.colors;
  const accent = c.accent;
  const base = {
    font: template.bodyFont, size: s.body, color: c.body, align: template.align,
    bold: false, italic: false, underline: false, strike: false,
    lineHeight: template.lineHeight, paraSpace: template.paraSpace,
    indent: 0, columns: 1, bg: "transparent", bgOpacity: 100,
    border: 0, borderColor: accent, borderSide: "left", padding: 0, radius: 0,
    letterSpacing: 0, uppercase: false,
  };
  switch (type) {
    case "chapter":
      return { ...base, font: template.headingFont, size: s.h1 + 6, color: c.heading, align: "left", bold: true, lineHeight: 1.2, paraSpace: 4 };
    case "heading":
      return { ...base, font: template.headingFont, size: s.h1, color: c.heading, align: "left", bold: true, lineHeight: 1.25, paraSpace: 3 };
    case "subtitle":
      return { ...base, font: template.headingFont, size: s.h2, color: c.heading, align: "left", bold: true, lineHeight: 1.3, paraSpace: 3 };
    case "quote":
      return { ...base, size: s.body + 0.5, italic: true, color: c.heading, align: "left", indent: 8, border: 1.6, borderSide: "left", borderColor: accent };
    case "note":
      return { ...base, size: s.small + 1, align: "left", bg: mixHex(c.bg, accent, 0.12), border: 0.6, borderSide: "all", padding: 3, radius: 1.5 };
    case "box":
      return { ...base, bg: mixHex(c.bg, accent, 0.06), border: 1, borderSide: "all", padding: 4, radius: 2 };
    case "list":
      return { ...base, indent: 5 };
    case "footnote":
      return { ...base, size: s.small, align: "left", indent: 0 };
    case "reference":
      return { ...base, size: s.small, color: accent, align: "left" };
    case "bibliography":
      return { ...base, size: s.small, align: "left", indent: 5 };
    case "header":
    case "footer":
      return { ...base, size: s.small, color: accent, align: "center", uppercase: false };
    case "pageNumber":
      return { ...base, size: s.small, color: accent, align: "center" };
    case "toc":
      return { ...base, color: c.body, align: "left" };
    case "image":
    case "gallery":
    case "logo":
      return { fit: "fill", radius: 0, border: 0, borderColor: accent, bg: "transparent" };
    case "icon":
      return { ...base, size: 24, color: accent, align: "center", bg: "transparent" };
    case "qr":
      return { ...base, size: s.small, color: c.body, align: "center", bg: "#ffffff" };
    case "rect":
    case "block":
      return { fill: accent, fillOpacity: 12, stroke: accent, strokeWidth: 0, radius: 0 };
    case "circle":
      return { fill: mixHex(c.bg, accent, 0.18), fillOpacity: 100, stroke: accent, strokeWidth: 0.6, radius: 0 };
    case "line":
    case "divider":
      return { stroke: accent, strokeWidth: 0.4, dash: "solid" };
    case "shape":
      return { fill: accent, fillOpacity: 20, stroke: accent, strokeWidth: 0 };
    case "table":
      return {
        font: template.bodyFont, size: s.small + 0.5, color: c.body, headerBg: mixHex(c.bg, accent, 0.16),
        headerColor: c.heading, borderColor: mixHex(c.bg, accent, 0.45), borderWidth: 0.25,
        padding: 1.6, stripes: false, align: "left",
      };
    case "chart":
      return { font: template.bodyFont, size: s.small, color: c.body, accent, palette: [accent, c.heading, mixHex(accent, c.bg, 0.45), mixHex(accent, "#000000", 0.3)], grid: true, showValues: true };
    case "diagram":
      return { font: template.bodyFont, size: s.small, color: c.body, accent, boxFill: mixHex(c.bg, accent, 0.1), boxStroke: accent, radius: 1.5 };
    case "stats":
      return { font: template.headingFont, size: s.h2, color: accent, labelSize: s.small, labelColor: c.body, align: "center" };
    default:
      return { ...base };
  }
}
// ─── Fabrique d'éléments ────────────────────────────────────────────────────
/** Élément complet : boîte (mm), style du modèle, ordre et visibilité. */
export function makeElement(template, type, box = {}, patch = {}) {
  const def = elementType(type);
  const kind = def.kind;
  return {
    id: uid(),
    type: def.id,
    name: patch.name || null,
    box: { x: 0, y: 0, w: def.box.w, h: def.box.h, ...box },
    rot: Number(patch.rot) || 0,
    z: patch.z !== undefined ? patch.z : 10,
    hidden: !!patch.hidden,
    opacity: patch.opacity !== undefined ? clamp(patch.opacity, 0, 1) : 1,
    // Hauteur automatique : le Studio remesure le contenu (texte, tableau…)
    // et ajuste la boîte — jamais imposé à un élément dont la hauteur a été
    // réglée à la main (autoH = false).
    autoH: patch.autoH !== undefined ? !!patch.autoH : kind === "text" || def.id === "table",
    html: patch.html || "",
    src: patch.src || null,
    data: { ...(def.data || {}), ...(patch.data || {}) },
    style: { ...defaultStyle(template, def.id), ...(patch.style || {}) },
  };
}

// ─── Jetons des en-têtes / pieds / numéros de page ─────────────────────────
export const TOKEN_HINT = "{page} · {pages} · {title} · {author} · {date} · {ref}";
export function applyTokens(text, ctx = {}) {
  return String(text == null ? "" : text)
    .replace(/\{page\}/gi, String(ctx.page == null ? "" : ctx.page))
    .replace(/\{pages\}/gi, String(ctx.pages == null ? "" : ctx.pages))
    .replace(/\{title\}/gi, ctx.title || "")
    .replace(/\{author\}/gi, ctx.author || "")
    .replace(/\{date\}/gi, ctx.date || new Date().toLocaleDateString("fr-FR"))
    .replace(/\{ref\}/gi, ctx.ref || "");
}

// ─── Reconstruction du HTML riche depuis la mesure du moteur ───────────────
// Le moteur de pagination mesure mot à mot (positions + style échantillonné) :
// on peut donc reconstruire un HTML éditable équivalent (gras, italique,
// couleur, surlignage, liens, exposants…) — c'est ce qui permet de passer du
// document paginé à un document NATIVEMENT éditable (§25).
function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
export { escapeHtml };

function runCss(s, base) {
  const out = [];
  if (s.bold) out.push("font-weight:700");
  if (s.italic) out.push("font-style:italic");
  const deco = [s.underline && "underline", s.strike && "line-through"].filter(Boolean);
  if (deco.length) out.push(`text-decoration:${deco.join(" ")}`);
  if (s.color && s.color !== base.color) out.push(`color:${s.color}`);
  if (s.bg) out.push(`background-color:${s.bg}`);
  if (s.sup) out.push("vertical-align:super");
  if (s.sub) out.push("vertical-align:sub");
  const sizePt = Number(s.sizePx || 0) / (96 / 72);
  if (sizePt && Math.abs(sizePt - Number(base.size)) > 0.4) out.push(`font-size:${round1(sizePt)}pt`);
  if (s.font && s.font !== base.font) out.push(`font-family:${FONT_CSS[s.font] || FONT_CSS.serif}`);
  return out.join(";");
}

/**
 * Indique s'il faut reconstruire une espace avant un mot.
 * Les documents reconstruits depuis le navigateur portent `spaceBefore` :
 * cette information est prioritaire, car la position graphique peut être
 * trompeuse selon la police. Le seuil historique reste le repli pour les
 * anciens modèles de pages qui ne possèdent pas encore cette métadonnée.
 */
export function needsSourceSpace(word, prevEnd = null) {
  if (word && typeof word.spaceBefore === "boolean") return word.spaceBefore;
  return prevEnd !== null && Number(word?.x) - Number(prevEnd) > 1.5;
}

/** HTML d'un groupe d'atomes mesurés (les lignes d'un même bloc de texte). */
function groupToHtml(atoms, base, kind) {
  const soft = kind === "pre" ? "\n" : " ";
  const chunks = [];
  let pending = false;
  for (const atom of atoms) {
    for (const ln of atom.lines || []) {
      let prevEnd = null;
      for (const run of ln.runs || []) {
        const css = runCss(run.style, base);
        for (const w of run.words || []) {
          const space = needsSourceSpace(w, prevEnd);
          prevEnd = w.x + w.w;
          const last = chunks[chunks.length - 1];
          if (last && last.css === css && last.href === run.href && !space && !pending) {
            last.text += w.text;
          } else {
            chunks.push({ css, href: run.href || null, text: (pending || space ? soft : "") + w.text });
          }
          pending = false;
        }
      }
      pending = true;
    }
  }
  let html = "";
  for (const c of chunks) {
    let t = escapeHtml(c.text);
    if (c.css) t = `<span style="${c.css}">${t}</span>`;
    if (c.href) t = `<a href="${escapeHtml(c.href)}">${t}</a>`;
    html += t;
  }
  return html.trim() ? (kind === "pre" ? html : html.replace(/^\s+/, "")) : "";
}

// Estimation du nombre de lignes (avant remesure réelle) : sert à poser la
// hauteur initiale des blocs reconstruits — la mesure navigateur affine ensuite.
export function estimateLines(text, maxWmm, sizePt, bold = false) {
  const perChar = 0.3528 * sizePt * (bold ? 0.55 : 0.5);
  const perLine = Math.max(6, (maxWmm - 2) / Math.max(0.5, perChar));
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const l = w.length + 1;
    if (cur + l > perLine && cur > 0) {
      lines += 1;
      cur = l;
    } else cur += l;
  }
  return lines;
}
function stripElementLocks(el = {}) {
  const { locked: _legacyLock, ...clean } = el || {};
  return clean;
}

/** Retire les anciens verrous d'une page sans modifier le reste du layout. */
function stripPageLocks(page = {}) {
  const { locked: _legacyPageLock, ...clean } = page || {};
  return {
    ...clean,
    elements: (page?.elements || []).map(stripElementLocks),
  };
}

// ─── Fabrique de pages ─────────────────────────────────────────────────────
export function makePage(patch = {}) {
  return {
    id: uid("p"),
    kind: patch.kind || "custom",
    label: patch.label || "",
    number: patch.number || 0,
    layout: patch.layout || "free",
    // Design de LA page (§8) : fond + décor du modèle. Le design du document
    // (modèle, couleurs, polices) vit dans le document ; ici on ne surcharge
    // que ce qui est propre à la page.
    design: { bg: "#ffffff", decor: null, ...(patch.design || {}) },
    elements: (patch.elements || []).map(stripElementLocks),
  };
}

/** Numérotation séquentielle (les numéros affichés suivent l'ordre réel). */
export function renumber(pages) {
  return pages.map((p, i) => ({ ...p, number: i + 1 }));
}

/**
 * Ajoute la promotion MboppiShop à gauche du pied de chaque page éditable.
 * La couverture reste sans pied de page. Les pieds déjà présents ne sont ni
 * supprimés ni réécrits : la promotion est un élément distinct, ce qui évite
 * d'écraser une personnalisation. La fonction est pure et idempotente.
 */
export function ensureStudioFooters(pages, box, template) {
  if (!box?.m || !template?.sizes) return pages || [];
  return (pages || []).map((rawPage) => {
    const page = stripPageLocks(rawPage);
    if (page?.kind === "cover") return page;
    const elements = page?.elements || [];
    const contentW = Math.max(20, box.w - box.m.left - box.m.right);
    const y = Math.max(box.m.top, box.h - Math.max(16, box.m.bottom * 0.95 + 3));
    // Un ancien pied promotionnel peut déjà être présent : on l'agrandit au
    // lieu d'en ajouter un second. Le texte et le lien restent inchangés.
    const existing = elements.find((el) => el?.type === "footer" && hasMboppiPromo(el.html));
    if (existing) {
      const updated = {
        ...existing,
        box: {
          ...existing.box,
          x: box.m.left,
          y: round1(y),
          w: round1(contentW),
          h: MBOPPI_PROMO_BOX_H_MM,
        },
        style: {
          ...existing.style,
          size: MBOPPI_PROMO_FONT_PT,
          color: template.colors.accent,
          align: "left",
          italic: true,
          lineHeight: 1,
          paraSpace: 0,
        },
      };
      return { ...page, elements: elements.map((el) => (el === existing ? updated : el)) };
    }
    const promo = makeElement(template, "footer", {
      x: box.m.left,
      y: round1(y),
      w: round1(contentW),
      h: MBOPPI_PROMO_BOX_H_MM,
    }, {
      name: "Promotion MboppiShop",
      z: 29,
      autoH: false,
      html: MBOPPI_PROMO_HTML,
      data: { promotion: "mboppi-content" },
      style: {
        ...defaultStyle(template, "footer"),
        size: MBOPPI_PROMO_FONT_PT,
        color: template.colors.accent,
        align: "left",
        italic: true,
        lineHeight: 1,
        paraSpace: 0,
      },
    });
    return { ...page, elements: [...elements, promo] };
  });
}

/** Nom affiché d'une page dans la colonne de gauche (§2). */
export function pageLabel(page, index) {
  if (page.label) return page.label;
  if (page.kind === "cover") return "Couverture";
  if (page.kind === "copyright") return "Copyright";
  if (page.kind === "toc") return "Sommaire";
  if (page.kind === "blank") return "Page vierge";
  const first = (page.elements || []).find((e) => e.type === "heading" || e.type === "chapter");
  const title = first ? String(first.html || "").replace(/<[^>]+>/g, "").slice(0, 34).trim() : "";
  if (title) return title;
  const text = (page.elements || []).find((e) => e.html);
  const t2 = text ? String(text.html).replace(/<[^>]+>/g, "").slice(0, 30).trim() : "";
  return t2 || `Page ${index + 1}`;
}

/** Primitives du décor de couverture → formes ÉDITABLES (une par forme). */
function primElement(template, prim, i) {
  const name = `Décor ${i + 1}`;
  if (prim.kind === "poly") {
    const xs = prim.pts.map((p) => p[0]);
    const ys = prim.pts.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return makeElement(template, "shape", { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }, {
      name, z: 1, autoH: false,
      data: { shapeKind: "poly", pts: prim.pts.map(([px, py]) => [round1(px - x), round1(py - y)]) },
      style: { fill: prim.color, fillOpacity: 100, strokeWidth: 0 },
    });
  }
  if (prim.kind === "rect") {
    return makeElement(template, "rect", { x: prim.x, y: prim.y, w: prim.w, h: prim.h }, {
      name, z: 1, autoH: false, style: { fill: prim.color, fillOpacity: 100, strokeWidth: 0 },
    });
  }
  if (prim.kind === "circle" || prim.kind === "ring") {
    const ring = prim.kind === "ring";
    return makeElement(template, "circle", { x: prim.cx - prim.r, y: prim.cy - prim.r, w: prim.r * 2, h: prim.r * 2 }, {
      name, z: 1, autoH: false,
      style: {
        fill: ring ? "transparent" : prim.color,
        fillOpacity: ring ? 0 : 100,
        stroke: ring ? prim.color : "transparent",
        strokeWidth: ring ? prim.lw : 0,
      },
    });
  }
  return null;
}
// ─── Conversion du document paginé → modèle structuré (§25 « Word → édition »)
// Chaque page paginée devient une page ÉDITABLE : les blocs mesurés (paragraphe,
// titre, citation, image, tableau…) deviennent des éléments indépendants avec
// leur boîte en mm et leur HTML riche reconstruit — rien n'est aplati.
function coverPage(docMeta, template, box) {
  const { w, h } = box;
  const cover = resolveCover(docMeta, template);
  const geo = coverLayoutBox(cover, w);
  const align = geo.leftish ? "left" : cover.align;
  const titleSize = geo.band ? template.sizes.h1 + 4 : template.sizes.h1 + 8;
  const fg = geo.band ? "#ffffff" : cover.fg;
  const els = [];

  els.push(makeElement(template, "rect", { x: 0, y: 0, w, h }, {
    name: "Fond de couverture", z: 0, autoH: false,
    style: { fill: cover.bg, fillOpacity: 100, strokeWidth: 0 },
  }));
  coverDecorPrims(template, w, h).forEach((prim, i) => {
    const el = primElement(template, prim, i);
    if (el) els.push(el);
  });
  if (cover.image) {
    els.push(makeElement(template, "image", { x: 0, y: 0, w, h }, {
      name: "Photo de couverture", z: 2, autoH: false, src: cover.image, opacity: 1 - cover.dim,
      style: { fit: "fill", radius: 0, border: 0 },
    }));
  }
  let y = (geo.yPct / 100) * h;
  if (cover.showTitle) {
    const titleText = String(cover.title || "");
    const titleH = estimateLines(titleText, geo.maxW, titleSize, true) * titleSize * 1.2 * 0.3528;
    els.push(makeElement(template, "chapter", { x: geo.x, y: round1(y), w: geo.maxW, h: round1(titleH) }, {
      name: "Titre de couverture", z: 6, html: escapeHtml(titleText),
      style: { size: titleSize, color: fg, align, bold: true, lineHeight: 1.2, paraSpace: 0 },
    }));
    y += titleH + 2;
    if (cover.subtitle) {
      const subH = estimateLines(cover.subtitle, geo.maxW, template.sizes.h3) * template.sizes.h3 * 1.35 * 0.3528;
      els.push(makeElement(template, "subtitle", { x: geo.x, y: round1(y), w: geo.maxW, h: round1(subH) }, {
        name: "Sous-titre", z: 6, html: escapeHtml(cover.subtitle),
        style: { size: template.sizes.h3, color: fg, align, bold: false, paraSpace: 0 },
      }));
      y += subH + 2;
    }
    if (cover.rule && !geo.band) {
      const ruleW = align === "center" ? geo.maxW * 0.3 : geo.maxW * 0.45;
      const ruleX = align === "center" ? geo.x + (geo.maxW - ruleW) / 2 : geo.x;
      els.push(makeElement(template, "line", { x: round1(ruleX), y: round1(y), w: round1(ruleW), h: 1 }, {
        name: "Filet de couverture", z: 6, autoH: false,
        style: { stroke: cover.accent, strokeWidth: 0.9, dash: "solid" },
      }));
    }
  }
  if (cover.author) {
    els.push(makeElement(template, "paragraph", { x: geo.pad, y: h - (geo.band ? 8 : 14), w: w - geo.pad * 2, h: 8 }, {
      name: "Auteur", z: 6, html: escapeHtml(cover.author),
      style: { ...defaultStyle(template, "paragraph"), size: template.sizes.h3, color: fg, align, lineHeight: 1.3, bold: false, paraSpace: 0 },
    }));
  }
  return makePage({ kind: "cover", label: "Couverture", design: { bg: cover.bg, decor: null }, elements: els });
}

function copyrightPage(docMeta, template, box) {
  const { w, h, m } = box;
  const contentW = w - m.left - m.right;
  const lines = copyrightLines(docMeta);
  const size = template.sizes.small;
  const height = Math.max(10, lines.length * size * 1.6 * 0.3528 + 2);
  const els = [];
  coverDecorPrims(template, w, h).forEach((prim, i) => {
    const el = primElement(template, prim, i);
    if (el) els.push(el);
  });
  els.push(makeElement(template, "paragraph", { x: m.left, y: round1(h * 0.4), w: contentW, h: round1(height) }, {
    name: "Mentions de copyright", z: 5, html: lines.join("<br>"),
    // Centré comme l'aperçu et le PDF ; la première ligne porte l'auteur
    // (« © année l'auteur: … », protection.js) — pas d'élément « Auteur »
    // séparé, qui ferait doublon sur la page.
    style: { ...defaultStyle(template, "paragraph"), size, align: "center", lineHeight: 1.6, paraSpace: 0 },
  }));
  els.push(makeElement(template, "reference", { x: m.left, y: round1(h * 0.4 + height + 12), w: contentW, h: 8 }, {
    name: "Référence du document", z: 5, html: `Référence : ${escapeHtml(docMeta.doc_ref || "")}`,
  }));
  return makePage({ kind: "copyright", label: "Copyright", design: { bg: template.colors.bg, decor: template.pageDecor }, elements: els });
}
function tocPage(page, template, box) {
  const { w, h, m } = box;
  const contentW = w - m.left - m.right;
  const els = [];
  els.push(makeElement(template, "heading", { x: m.left, y: m.top, w: contentW, h: 12 }, {
    name: "Titre du sommaire", z: 5, html: "Table des matières",
    style: { ...defaultStyle(template, "subtitle") },
  }));
  els.push(makeElement(template, "toc", { x: m.left, y: round1(m.top + 12), w: contentW, h: round1(Math.max(30, h - m.top - m.bottom - 16)) }, {
    name: "Table des matières", z: 5, autoH: false,
    data: { entries: (page.entries || []).map((e) => ({ level: e.level, text: e.text, page: e.page })) },
    style: { ...defaultStyle(template, "toc") },
  }));
  return makePage({ kind: "toc", label: "Sommaire", design: { bg: template.colors.bg, decor: template.pageDecor }, elements: els });
}

// Un bloc de texte (atome ou groupe de lignes du même bloc) → élément éditable.
function textElementFromGroup(template, group, box) {
  const { w, m } = box;
  const first = group[0];
  const top = Math.min(...group.map((a) => a.top));
  let bottom = top;
  for (const a of group) {
    for (const ln of a.lines || []) bottom = Math.max(bottom, a.top + (ln.bottom || ln.top || 0));
  }
  const kind = first.kind; // p | h1..h4 | quote | pre | list
  const type = kind === "h1" ? "heading" : kind === "h2" ? "subtitle"
    : kind === "h3" || kind === "h4" ? "heading" : kind === "quote" ? "quote"
      : kind === "list" ? "list" : "paragraph";
  let style = defaultStyle(template, type);
  const data = {};
  if (kind === "h3" || kind === "h4") {
    data.level = kind === "h3" ? 3 : 4;
    style = { ...style, size: kind === "h3" ? template.sizes.h3 : template.sizes.h4, lineHeight: 1.35 };
  } else if (kind === "h1") data.level = 1;
  else if (kind === "h2") data.level = 2;
  if (kind === "pre") {
    Object.assign(style, { font: "mono", size: template.sizes.small + 1, align: "left" });
    data.pre = true;
  }
  if (kind === "list") data.list = true;
  return makeElement(template, type, {
    x: m.left,
    y: round1(m.top + px2mm(top)),
    w: round1(w - m.left - m.right),
    h: Math.max(2, round1(px2mm(bottom - top))),
  }, {
    style, data, autoH: true,
    html: groupToHtml(group, style, kind),
  });
}

// Lignes d'un tableau (atomes tableRow) → UN élément tableau éditable.
function tableElement(template, rows, box) {
  const { w, m } = box;
  const contentW = w - m.left - m.right;
  const first = rows[0];
  const colWidths = (first.cells || []).map((c, i, arr) => {
    const nextX = arr[i + 1] ? arr[i + 1].x : contentW;
    return Math.max(6, round1(px2mm(nextX - c.x)));
  });
  const data = {
    colWidths,
    rows: rows.map((r, ri) => (r.cells || []).map((c) => ({
      text: (c.lines || []).map((ln) => lineText(ln)).join(" "),
      header: !!c.header || ri === 0,
      align: "left",
    }))),
  };
  const top = Math.min(...rows.map((r) => r.top));
  const height = rows.reduce((acc, r) => acc + px2mm(r.h || 0), 0);
  return makeElement(template, "table", {
    x: m.left, y: round1(m.top + px2mm(top)), w: round1(contentW), h: Math.max(6, round1(height)),
  }, { data, autoH: true });
}

function imageElement(template, atom, box) {
  const { m } = box;
  return makeElement(template, "image", {
    x: round1(m.left + px2mm(atom.x)),
    y: round1(m.top + px2mm(atom.top)),
    w: round1(px2mm(atom.w)),
    h: round1(px2mm(atom.h)),
  }, { name: "Image", src: atom.src || null, autoH: false, style: { fit: "fill", radius: 0, border: 0 } });
}

function qrElement(template, atom, box, docMeta) {
  const { m } = box;
  return makeElement(template, "qr", {
    x: round1(m.left + px2mm(atom.x)),
    y: round1(m.top + px2mm(atom.top)),
    w: round1(px2mm(atom.w)),
    h: round1(px2mm(atom.h)),
  }, {
    name: "QR de vérification", autoH: false,
    data: { url: verificationUrl(docMeta), label: "Vérification" },
  });
}
function contentPage(page, docMeta, template, box) {
  const { w, h, m } = box;
  const contentW = round1(w - m.left - m.right);
  const contentH = round1(h - m.top - m.bottom);
  const elements = [];
  const items = page.items || [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.kind === "image") {
      elements.push(imageElement(template, it, box));
      i += 1;
      continue;
    }
    if (it.kind === "qr") {
      elements.push(qrElement(template, it, box, docMeta));
      i += 1;
      continue;
    }
    if (it.kind === "hr") {
      elements.push(makeElement(template, "divider", {
        x: m.left, y: round1(m.top + px2mm(it.top)), w: contentW, h: 2,
      }, { name: "Séparateur", z: 5, autoH: false }));
      i += 1;
      continue;
    }
    if (it.kind === "tableRow") {
      const rows = [];
      while (i < items.length && items[i].kind === "tableRow") {
        rows.push(items[i]);
        i += 1;
      }
      elements.push(tableElement(template, rows, box));
      continue;
    }
    // Bloc de texte : on regroupe les atomes de lignes du MÊME bloc (groupId)
    // pour retrouver un paragraphe / un titre entier, éditable d'un seul tenant.
    const group = [it];
    i += 1;
    while (i < items.length && items[i].kind === it.kind && items[i].groupId === it.groupId) {
      group.push(items[i]);
      i += 1;
    }
    elements.push(textElementFromGroup(template, group, box));
  }
  // Numéro de page : un élément comme un autre (déplaçable, masquable et
  // modifiable) — le jeton {page} est remplacé au rendu.
  elements.push(makeElement(template, "pageNumber", {
    x: m.left, y: round1(Math.min(h - 6, h - m.bottom * 0.5)), w: contentW, h: 6,
  }, { name: "Numéro de page", z: 30, html: "{page}", autoH: false }));
  const pg = makePage({
    kind: "content",
    design: { bg: template.colors.bg, decor: template.pageDecor },
    elements,
  });
  pg.contentH = contentH;
  return pg;
}

/**
 * Document paginé → pages STRUCTURÉES et éditables (§24/§25).
 * Conversion non destructive : le document source (docModel TipTap) n'est pas
 * touché, on en dérive une vue éditable page par page.
 */
export function buildStudioPages({ paginated, docMeta }) {
  const { pages, box, template } = paginated;
  const out = [];
  for (const p of pages) {
    if (p.kind === "cover") out.push(coverPage(docMeta, template, box));
    else if (p.kind === "copyright") out.push(copyrightPage(docMeta, template, box));
    else if (p.kind === "toc") out.push(tocPage(p, template, box));
    else out.push(contentPage(p, docMeta, template, box));
  }
  return ensureStudioFooters(renumber(out), box, template);
}

/** Enveloppe persistée dans `gen_documents.page_layout` (JSONB additif). */
export function serializeStudio(pages, meta = {}) {
  return {
    version: STUDIO_VERSION,
    updated_at: new Date().toISOString(),
    ...meta,
    pages: (pages || []).map(stripPageLocks),
  };
}

/** Pages du Studio déjà enregistrées (ou null), sans anciens verrous. */
export function readStudio(pageLayout) {
  if (!pageLayout || !Array.isArray(pageLayout.pages) || !pageLayout.pages.length) return null;
  return pageLayout.pages.map(stripPageLocks);
}

/**
 * Version du MOTEUR de mise en page (`paginate.js`). Une mise en page du Studio
 * dérive des positions calculées par ce moteur : quand celui-ci corrige sa
 * géométrie, les mises en page enregistrées par l'ancien moteur deviennent
 * périmées et sont reconstruites automatiquement à l'ouverture du document
 * (même mécanisme qu'un changement de modèle) — sans quoi l'aperçu et le PDF
 * continueraient d'afficher les anciennes positions (texte superposé).
 *   v1 → avant correction de l'avance de ligne (hauteur d'encre seule).
 *   v2 → avance de ligne réelle mesurée + espacements appliqués aux bords du
 *        bloc (plus aucun chevauchement de texte).
 */
export const LAYOUT_ENGINE_VERSION = 3;

/**
 * Empreinte du DESIGN (modèle, styles avancés, format, marges, sommaire,
 * version du moteur de mise en page).
 * Elle change dès qu'un réglage de l'onglet Design est modifié : sert à savoir
 * si une mise en page enregistrée est encore d'actualité (synchronisation).
 */
export function studioDesignKey(docMeta = {}) {
  return JSON.stringify([
    LAYOUT_ENGINE_VERSION,
    docMeta.template_id,
    docMeta.style_overrides || {},
    docMeta.page_format,
    docMeta.page_width,
    docMeta.page_height,
    docMeta.orientation,
    docMeta.margins || {},
    docMeta.protection?.toc !== false,
  ]);
}

/** Empreinte courte et stable du TEXTE (contenu TipTap converti en HTML). */
export function studioContentKey(html) {
  const src = String(html || "");
  let h = 2166136261; // FNV-1a : rapide, stable, sans dépendance
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${src.length}:${(h >>> 0).toString(36)}`;
}

/** Boîte de page (mm) du document — repère commun au Studio et au PDF. */
export function studioBox(docMeta) {
  return resolvePageBox(docMeta || {});
}

// Réutilisation par studioLayouts.js (pages « Couverture / Sommaire / Copyright »)
// et par l'export : les fabriques de pages du moteur sont exposées, jamais
// dupliquées (une seule vérité pour la mise en page générée).
export { coverPage as buildCoverPage, copyrightPage as buildCopyrightPage, tocPage as buildTocPage };
// ─── Opérations sur les pages (§2, §7, §11, §15, §16) ──────────────────────
export function insertPage(pages, page, atIndex) {
  const out = pages.slice();
  const idx = Math.max(0, Math.min(out.length, Number.isInteger(atIndex) ? atIndex : out.length));
  out.splice(idx, 0, page);
  return renumber(out);
}

export function deletePages(pages, ids) {
  const set = new Set(Array.isArray(ids) ? ids : [ids]);
  if (pages.length <= set.size) return pages; // jamais un document vide
  return renumber(pages.filter((p) => !set.has(p.id)));
}

/** Duplication de page : textes, images, positions, styles, couleurs, formes. */
export function duplicatePage(pages, pageId, { toEnd = false } = {}) {
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return pages;
  const src = pages[idx];
  const copy = stripPageLocks({
    ...src,
    id: uid("p"),
    number: 0,
    label: src.label ? `${src.label} (copie)` : "",
    design: { ...src.design },
    elements: src.elements.map((el) => cloneElement(el)),
  });
  const out = pages.slice();
  out.splice(toEnd ? out.length : idx + 1, 0, copy);
  return renumber(out);
}

/** Déplacement d'une page (glisser-déposer / flèches). */
export function movePage(pages, from, to) {
  const out = pages.slice();
  const a = Math.max(0, Math.min(out.length - 1, from));
  const b = Math.max(0, Math.min(out.length - 1, to));
  if (a === b) return pages;
  const [p] = out.splice(a, 1);
  out.splice(b, 0, p);
  return renumber(out);
}

export function updatePage(pages, pageId, patch) {
  return pages.map((p) => (p.id === pageId ? mergePage(p, patch) : p));
}

export function mergePage(p, patch) {
  const out = stripPageLocks({ ...p, ...patch });
  if (patch.design) out.design = { ...p.design, ...patch.design };
  return out;
}

/** Applique une transformation à une sélection de pages (§11). */
export function patchPages(pages, ids, fn) {
  const set = new Set(Array.isArray(ids) ? ids : [ids]);
  return pages.map((p) => (set.has(p.id) ? fn(p) : p));
}

/** Applique un patch à CHAQUE élément de la sélection (multi-pages, global). */
export function patchElements(pages, ids, fn) {
  return patchPages(pages, ids, (p) => ({
    ...p,
    elements: p.elements.map((el) => {
      const next = fn(el, p);
      return next ? stripElementLocks({ ...el, ...next }) : stripElementLocks(el);
    }),
  }));
}

// ─── Opérations sur les éléments (§3, §5, §13, §14, §16) ───────────────────
export function cloneElement(el) {
  return {
    ...stripElementLocks(el),
    id: uid(),
    box: { ...el.box },
    style: { ...el.style },
    data: el.data ? JSON.parse(JSON.stringify(el.data)) : {},
  };
}

/** Insère UN élément (fin de page, ou à l'index donné — index de calque). */
export function addElement(pages, pageId, el, index) {
  return pages.map((p) => {
    if (p.id !== pageId) return p;
    const els = p.elements.slice();
    const at = Number.isInteger(index) ? Math.max(0, Math.min(els.length, index)) : els.length;
    els.splice(at, 0, el);
    return { ...p, elements: els };
  });
}

export function addElements(pages, pageId, els) {
  const list = Array.isArray(els) ? els : [els];
  return pages.map((p) => (p.id === pageId ? { ...p, elements: [...p.elements, ...list] } : p));
}

/**
 * Agrandit ou réduit la boîte d'un texte après un changement de police et
 * décale les autres éléments automatiques situés sous lui. Le canvas mesure la
 * hauteur réelle dans le navigateur ; cette fonction transforme cette mesure
 * (mm) en mise en page persistée. Seuls les blocs `autoH` suivent le flux : les
 * titres, images, pieds de page et éléments positionnés manuellement ne bougent pas.
 */
export function fitMeasuredTextHeight(pages, pageId, elId, measuredHeightMm) {
  const height = Number(measuredHeightMm);
  if (!Number.isFinite(height) || height <= 0) return pages || [];
  let changed = false;
  const out = (pages || []).map((page) => {
    if (page.id !== pageId) return page;
    const elements = page.elements || [];
    const index = elements.findIndex((el) => el.id === elId);
    if (index < 0) return page;
    const target = elements[index];
    if (!isTextType(target) || target.autoH === false) return page;
    const nextHeight = round1(height);
    const delta = round1(nextHeight - (Number(target.box?.h) || 0));
    if (Math.abs(delta) < 0.15) return page;
    const oldBottom = (Number(target.box?.y) || 0) + (Number(target.box?.h) || 0);
    const nextElements = elements.map((el, i) => {
      if (i === index) return { ...el, box: { ...el.box, h: nextHeight } };
      // Flux automatique uniquement : un paragraphe plus grand repousse les
      // paragraphes suivants ; après une réduction, ils remontent ensemble.
      // Images, formes et pieds de page positionnés manuellement restent fixes.
      if (!isTextType(el) || el.autoH === false || (Number(el.box?.y) || 0) < oldBottom - 0.15) return el;
      return { ...el, box: { ...el.box, y: round1((Number(el.box?.y) || 0) + delta) } };
    });
    changed = true;
    return { ...page, elements: nextElements };
  });
  return changed ? out : (pages || []);
}


export function patchElement(pages, pageId, elId, patch) {
  return pages.map((p) => {
    if (p.id !== pageId) return p;
    return {
      ...p,
      elements: p.elements.map((el) => (el.id === elId ? mergeElement(el, patch) : el)),
    };
  });
}

export function mergeElement(el, patch) {
  const out = {
    ...stripElementLocks(el),
    ...stripElementLocks(patch),
  };
  if (patch.box) out.box = { ...el.box, ...patch.box };
  if (patch.style) out.style = { ...el.style, ...patch.style };
  if (patch.data) out.data = { ...el.data, ...patch.data };
  return out;
}

export function removeElements(pages, pageId, ids) {
  const set = new Set(Array.isArray(ids) ? ids : [ids]);
  return pages.map((p) => (p.id === pageId ? { ...p, elements: p.elements.filter((e) => !set.has(e.id)) } : p));
}

/** Ordre d'empilement : monter / descendre / premier plan / arrière-plan. */
export function reorderElement(pages, pageId, elId, dir) {
  return pages.map((p) => {
    if (p.id !== pageId) return p;
    const zs = p.elements.map((e) => e.z);
    const el = p.elements.find((e) => e.id === elId);
    if (!el) return p;
    const step = 1;
    let z = el.z;
    if (dir === "up") z = Math.min(Math.max(...zs) + step, el.z + step);
    else if (dir === "down") z = Math.max(Math.min(...zs) - step, el.z - step);
    else if (dir === "front") z = Math.max(...zs) + step;
    else if (dir === "back") z = Math.min(...zs) - step;
    return { ...p, elements: p.elements.map((e) => (e.id === elId ? { ...e, z } : e)) };
  });
}

/** Éléments d'une page triés par ordre d'empilement (le dernier est devant). */
export function sortedElements(page) {
  return (page?.elements || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
}

export function contentBounds(page, box) {
  const { h, m } = box;
  const top = m.top;
  const bottom = h - m.bottom;
  const out = { top, bottom, height: bottom - top, overflow: [] };
  for (const el of page.elements || []) {
    if (el.hidden) continue;
    const b = el.box.y + el.box.h;
    if (b > bottom + 0.6) {
      out.overflow.push({ id: el.id, label: el.name || el.type, over: round1(b - bottom) });
    }
  }
  return out;
}
// ─── Alignement, distribution, guides magnétiques (§5) ─────────────────────
export const ALIGN_MODES = [
  { id: "left", label: "Aligner à gauche" },
  { id: "centerH", label: "Aligner au centre" },
  { id: "right", label: "Aligner à droite" },
  { id: "top", label: "Aligner en haut" },
  { id: "centerV", label: "Aligner au milieu" },
  { id: "bottom", label: "Aligner en bas" },
];

/**
 * Décalages d'alignement de plusieurs boîtes. `ref` = boîte de référence
 * (dernière sélectionnée) ; `page` sert de cadre quand la sélection est
 * unique (« aligner sur la page »).
 */
export function alignOffsets(boxes, mode, ref, page) {
  if (!boxes.length) return [];
  const r = ref || (boxes.length > 1 ? boxes[0] : page);
  if (!r) return boxes.map(() => ({ dx: 0, dy: 0 }));
  return boxes.map((b) => {
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case "left": dx = r.x - b.x; break;
      case "centerH": dx = r.x + r.w / 2 - (b.x + b.w / 2); break;
      case "right": dx = r.x + r.w - (b.x + b.w); break;
      case "top": dy = r.y - b.y; break;
      case "centerV": dy = r.y + r.h / 2 - (b.y + b.h / 2); break;
      case "bottom": dy = r.y + r.h - (b.y + b.h); break;
      default: break;
    }
    return { dx: round1(dx), dy: round1(dy) };
  });
}

/** Distribution régulière (écarts égaux) sur un axe : "h" | "v". */
export function distributeOffsets(boxes, axis) {
  if (boxes.length < 3) return boxes.map(() => ({ dx: 0, dy: 0 }));
  const order = boxes
    .map((_, i) => i)
    .sort((a, b) => (axis === "h" ? boxes[a].x - boxes[b].x : boxes[a].y - boxes[b].y));
  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const used = order.reduce((sum, i) => sum + (axis === "h" ? boxes[i].w : boxes[i].h), 0);
  const span = axis === "h" ? last.x + last.w - first.x : last.y + last.h - first.y;
  const gap = (span - used) / (order.length - 1);
  const out = boxes.map(() => ({ dx: 0, dy: 0 }));
  let cursor = axis === "h" ? first.x : first.y;
  for (const i of order) {
    const b = boxes[i];
    if (axis === "h") {
      out[i] = { dx: round1(cursor - b.x), dy: 0 };
      cursor += b.w + gap;
    } else {
      out[i] = { dx: 0, dy: round1(cursor - b.y) };
      cursor += b.h + gap;
    }
  }
  return out;
}

/**
 * Magnétisme (§5 « guides intelligents ») : la boîte déplacée ou redimensionnée
 * est attirée par les marges, le centre de la page et les bords des autres
 * éléments. Renvoie la boîte corrigée + les guides à dessiner.
 */
export function snapBox(box, { page, others = [], tol = 1.6, axes = "xy" } = {}) {
  const guides = [];
  const targets = [];
  if (page) {
    targets.push(
      { axis: "x", at: page.m.left }, { axis: "x", at: page.w / 2 }, { axis: "x", at: page.w - page.m.right },
      { axis: "y", at: page.m.top }, { axis: "y", at: page.h / 2 }, { axis: "y", at: page.h - page.m.bottom },
    );
  }
  for (const o of others) {
    targets.push(
      { axis: "x", at: o.box.x }, { axis: "x", at: o.box.x + o.box.w / 2 }, { axis: "x", at: o.box.x + o.box.w },
      { axis: "y", at: o.box.y }, { axis: "y", at: o.box.y + o.box.h / 2 }, { axis: "y", at: o.box.y + o.box.h },
    );
  }
  const out = { ...box };
  const tryAxis = (axis, edges) => {
    if (!axes.includes(axis)) return;
    let best = null;
    for (const t of targets) {
      if (t.axis !== axis) continue;
      for (const e of edges) {
        const delta = t.at - e;
        if (Math.abs(delta) <= tol && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t.at };
      }
    }
    if (!best) return;
    if (axis === "x") out.x = round1(out.x + best.delta);
    else out.y = round1(out.y + best.delta);
    guides.push({ axis, at: round1(best.at) });
  };
  tryAxis("x", [out.x, out.x + out.w / 2, out.x + out.w]);
  tryAxis("y", [out.y, out.y + out.h / 2, out.y + out.h]);
  return { box: out, guides };
}
// ─── Contrôle de pagination (§20) + vérification du document ────────────────
/**
 * Ajuste la taille de police de TOUS les éléments texte d'une portée donnée
 * (§4 : « augmenter la taille des écritures », §11 multi-pages, §12 global).
 * `scope` : "selection" (éléments de `selIds`), "page" (`pageId`) ou "document"
 * (toutes les pages). Renvoie `{ pages, count }` : toutes les pages et tous les
 * éléments texte de la portée sont modifiables ; la taille reste bornée entre
 * 5 et 72 pt.
 */
export function stepTextSizes(pages, { delta, scope = "page", pageId = null, selIds = [], template = null } = {}) {
  const d = Number(delta) || 0;
  const clampSize = (v) => Math.max(5, Math.min(72, Math.round(v * 10) / 10));
  const baseOf = (el) => {
    const n = Number(el?.style?.size);
    if (Number.isFinite(n) && n > 0) return n;
    if (template?.sizes) {
      try {
        return Number(defaultStyle(template, el?.type).size) || 11;
      } catch { /* modèle incomplet : repli */ }
    }
    return 11;
  };
  const sel = new Set(selIds || []);
  let count = 0;
  const out = (pages || []).map((p) => {
    const inScope = scope === "selection" || scope === "document" || p?.id === pageId;
    if (!inScope) return p;
    let changed = false;
    const elements = (p.elements || []).map((el) => {
      if (!isTextType(el)) return el;
      if (scope === "selection" && !sel.has(el.id)) return el;
      const from = baseOf(el);
      const to = clampSize(from + d);
      if (to === from) return el;
      changed = true;
      count += 1;
      return { ...el, style: { ...el.style, size: to } };
    });
    return changed ? { ...p, elements } : p;
  });
  return { pages: out, count };
}

/**
 * Met tous les textes courants du document en gras.
 * Les titres (chapitres, titres et sous-titres) et les citations gardent
 * exactement leur style : cette commande uniformise le CORPS du livre sans
 * écraser sa hiérarchie éditoriale. La fonction est pure et idempotente.
 */
export function boldDocumentText(pages) {
  const excluded = new Set(["chapter", "heading", "subtitle", "quote"]);
  let count = 0;
  const out = (pages || []).map((p) => {
    let changed = false;
    const elements = (p.elements || []).map((el) => {
      if (!isTextType(el) || excluded.has(el.type) || el.style?.bold) return el;
      changed = true;
      count += 1;
      return { ...el, style: { ...el.style, bold: true } };
    });
    return changed ? { ...p, elements } : p;
  });
  return { pages: out, count };
}

/** Débordement en PIXELS (unité affichée dans l'alerte du Studio). */
export function overflowPx(page, box) {
  const bounds = contentBounds(page, box);
  if (!bounds.overflow.length) return null;
  const worst = bounds.overflow.reduce((a, b) => (b.over > a.over ? b : a));
  return { mm: worst.over, px: Math.round(worst.over * PX_PER_MM), items: bounds.overflow };
}

/**
 * Rapport de vérification du document édité (§20 + « Vérifier le document »).
 * Même forme que `checkDocument` (errors / warnings / suggestions / fixables) :
 * le Studio n'invente pas de diagnostic, il mesure SES propres pages.
 */
export function studioCheck(pages, box, docMeta = {}) {
  const errors = [];
  const warnings = [];
  const suggestions = [];
  const fixables = [];
  const push = (arr, code, label, detail) => arr.push({ code, label, detail });
  const { w, h, m } = box;
  const contentBottom = h - m.bottom;

  if (!pages.length) {
    push(errors, "no_pages", "Le document ne contient aucune page.", "Ajoutez une page pour commencer.");
    return { errors, warnings, suggestions, fixables, score: 0 };
  }

  const overflowPages = [];
  const emptyPages = [];
  const outsidePages = [];
  let images = 0;
  let words = 0;

  pages.forEach((p) => {
    const visible = (p.elements || []).filter((e) => !e.hidden);
    const text = visible.filter((e) => e.html).map((e) => String(e.html).replace(/<[^>]+>/g, " ")).join(" ");
    words += text.split(/\s+/).filter(Boolean).length;
    images += visible.filter((e) => e.src || e.type === "gallery").length;
    const solid = visible.some((e) => e.src || e.type === "toc" || e.type === "table" || e.type === "chart" || e.type === "diagram" || e.type === "stats");
    if (!visible.length || (!text.trim() && !solid)) emptyPages.push(p.number);
    const bounds = contentBounds(p, box);
    if (bounds.overflow.length) {
      const worst = bounds.overflow.reduce((a, b) => (b.over > a.over ? b : a));
      overflowPages.push({ number: p.number, px: Math.round(worst.over * PX_PER_MM), label: worst.label });
    }
    for (const el of visible) {
      if (el.box.x < -0.5 || el.box.x + el.box.w > w + 0.5 || el.box.y < -0.5 || el.box.y > contentBottom + 0.5) {
        outsidePages.push(p.number);
        break;
      }
    }
  });

  const nums = (arr) => [...new Set(arr)].sort((a, b) => a - b).slice(0, 12).join(", ");
  const hasCover = pages.some((p) => p.kind === "cover");
  const hasToc = pages.some((p) => p.kind === "toc" || (p.elements || []).some((e) => e.type === "toc"));

  if (overflowPages.length) {
    push(
      errors, "overflow",
      `${overflowPages.length} page(s) où un élément dépasse la zone de texte.`,
      `Pages ${overflowPages.map((o) => o.number).join(", ")} — « ${overflowPages[0].label} » dépasse de ${overflowPages[0].px} px. Réduisez la police ou l'espacement, déplacez l'élément, ou créez une page.`,
    );
    fixables.push({ code: "reduce_font", label: "Réduire légèrement la police" });
    fixables.push({ code: "reduce_spacing", label: "Réduire l'espacement" });
    fixables.push({ code: "split_page", label: "Créer automatiquement une nouvelle page" });
  }
  if (emptyPages.length) push(warnings, "empty_pages", `${emptyPages.length} page(s) sans contenu visible.`, `Pages ${nums(emptyPages)}.`);
  if (outsidePages.length) push(warnings, "outside", `${outsidePages.length} page(s) avec un élément hors des limites utiles.`, `Pages ${nums(outsidePages)} — utilisez « Aligner sur la page » ou les guides.`);
  if (!hasCover) push(suggestions, "no_cover", "Aucune page de couverture.", "Ajoutez une page « Couverture » (bouton + Ajouter une page).");
  if (!hasToc) {
    push(suggestions, "no_toc", "Pas de table des matières.", "Ajoutez une page « Sommaire » pour un document professionnel.");
    fixables.push({ code: "add_toc", label: "Ajouter une table des matières" });
  }
  if (words < 150) push(suggestions, "short_doc", "Le document est encore court.", `${words} mots détectés dans les pages éditées.`);
  if (!docMeta.author) push(suggestions, "no_author", "Auteur non renseigné.", "L'auteur apparaît sur la couverture et la page de copyright.");
  if (!images && pages.length > 4) push(suggestions, "no_image", "Aucune image dans le document.", "Une illustration toutes les 3–4 pages retient l'attention du lecteur.");

  const score = Math.max(0, Math.round(100 - errors.length * 18 - warnings.length * 6 - suggestions.length * 2));
  return { errors, warnings, suggestions, fixables, score, words, images };
}

// ─── Historique (§17) ──────────────────────────────────────────────────────
/** Entrée d'historique : journal lisible + instantané des pages restaurable. */
export function historyEntry(label, pages, { pageIndex = 0, kind = "edit" } = {}) {
  return { id: uid("h"), at: new Date().toISOString(), label, kind, pageIndex, pages };
}









