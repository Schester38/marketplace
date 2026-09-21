// ─── Bibliothèque du Studio : éléments, pages neuves, layouts (§6 à §8, §21) ─
// Moteur PUR : chaque fonction fabrique ou réorganise des éléments du modèle
// structuré (studioModel.js). Aucun rendu ici — l'aperçu, le PDF et l'EPUB
// consomment le même modèle.
import {
  ELEMENT_GROUPS, ELEMENT_TYPES, elementType, isTextType, makeElement, makePage,
  round1, uid, mixHex, verificationUrl, estimateLines,
} from "./studioModel.js";

// ─── Bibliothèque d'éléments (§6 « Ajouter des éléments ») ──────────────────
export const ELEMENT_LIBRARY = ELEMENT_GROUPS.map((g) => ({
  ...g,
  items: ELEMENT_TYPES.filter((t) => t.group === g.id).map((t) => ({ id: t.id, label: t.label })),
}));

// ─── Contenu par défaut d'un nouvel élément ────────────────────────────────
function defaultContent(typeId, template, docMeta = {}) {
  switch (typeId) {
    case "heading": return { html: "Titre du chapitre" };
    case "subtitle": return { html: "Sous-titre de section" };
    case "chapter": return { html: "CHAPITRE 1", style: { uppercase: true } };
    case "quote": return { html: "« La citation qui résume l'idée forte de cette page. »" };
    case "note": return { html: "💡 Note importante à retenir." };
    case "box": return { html: "Encadré : mettez en avant une idée clé." };
    case "list": return { html: "• Premier point<br>• Deuxième point<br>• Troisième point" };
    case "footnote": return { html: "* Note de bas de page." };
    case "reference": return { html: "Source : " };
    case "bibliography": return { html: "• Auteur, <em>Titre de l'ouvrage</em>, éditeur, année." };
    case "textzone": return { html: "Zone de texte libre." };
    case "paragraph":
    default: return { html: "Votre texte ici. Cliquez pour modifier directement sur la page." };
  }
}

function defaultData(typeId, template, docMeta = {}) {
  switch (typeId) {
    case "table":
      return {
        rows: [
          [{ text: "Élément", header: true }, { text: "Valeur", header: true }, { text: "Détail", header: true }],
          [{ text: "Ligne 1", header: false }, { text: "100", header: false }, { text: "—", header: false }],
          [{ text: "Ligne 2", header: false }, { text: "250", header: false }, { text: "—", header: false }],
        ],
      };
    case "chart":
      return {
        chartType: "bar",
        title: "Titre du graphique",
        series: [
          { label: "Jan", value: 40 }, { label: "Fév", value: 65 },
          { label: "Mar", value: 52 }, { label: "Avr", value: 78 },
        ],
      };
    case "diagram":
      return { nodes: [{ text: "Étape 1" }, { text: "Étape 2" }, { text: "Étape 3" }] };
    case "stats":
      return {
        items: [
          { value: "12 500", label: "lecteurs" },
          { value: "98 %", label: "satisfaction" },
          { value: "4", label: "chapitres bonus" },
        ],
      };
    case "icon":
      return { glyph: "⚡" };
    case "qr":
      return { url: verificationUrl(docMeta), label: "Scannez pour vérifier" };
    case "gallery":
      return { items: [] };
    case "toc":
      return { entries: [] };
    default:
      return {};
  }
}

/** Crée un élément prêt à poser sur une page (§6), centré dans la largeur. */
export function newElement(template, typeId, box, opts = {}) {
  const def = elementType(typeId);
  const CW = box.w - box.m.left - box.m.right;
  const w = Math.max(12, Math.min(def.box.w, CW));
  const x = round1(box.m.left + Math.max(0, (CW - w) / 2));
  const y = round1(opts.y != null ? opts.y : box.m.top + 12);
  const content = defaultContent(typeId, template, opts.docMeta || {});
  return makeElement(template, typeId, { x, y, w, h: def.box.h }, {
    ...content,
    ...(opts.patch || {}),
    data: { ...defaultData(typeId, template, opts.docMeta || {}), ...(opts.patch?.data || {}) },
    style: { ...(content.style || {}), ...(opts.patch?.style || {}) },
    autoH: opts.autoH,
    name: opts.name,
  });
}
// ─── Types de pages neuves (§7 « + Ajouter une page ») ─────────────────────
export const PAGE_KINDS = [
  { id: "blank", label: "Page vierge", emoji: "▢" },
  { id: "text", label: "Page texte", emoji: "🔤" },
  { id: "image", label: "Page image", emoji: "🖼️" },
  { id: "quote", label: "Page citation", emoji: "❝" },
  { id: "chapter", label: "Page chapitre", emoji: "📖" },
  { id: "table", label: "Page tableau", emoji: "▦" },
  { id: "chart", label: "Page graphique", emoji: "📈" },
  { id: "summary", label: "Page résumé", emoji: "📝" },
  { id: "exercises", label: "Page exercices", emoji: "✍️" },
  { id: "checklist", label: "Page checklist", emoji: "☑️" },
  { id: "biography", label: "Page biographie", emoji: "👤" },
  { id: "cover", label: "Couverture", emoji: "📕" },
  { id: "toc", label: "Sommaire", emoji: "📑" },
  { id: "custom", label: "Page personnalisée", emoji: "✨" },
];

/** Construit une page neuve du type demandé, avec un contenu de départ utile. */
export function buildPage(kindId, template, box, docMeta = {}, helpers = {}) {
  const CW = box.w - box.m.left - box.m.right;
  const L = box.m.left;
  const T = box.m.top;
  const base = { kind: "custom", design: { bg: template.colors.bg, decor: template.pageDecor } };

  if (kindId === "cover" && helpers.buildCoverPage) {
    const p = helpers.buildCoverPage(docMeta, template, box);
    return { ...p, label: "" };
  }
  if (kindId === "toc" && helpers.buildTocPage) {
    const entries = helpers.entries || [];
    return helpers.buildTocPage({ entries }, template, box);
  }

  const stack = (list) => {
    let y = T + 10;
    return list.map((el) => {
      el.box = { ...el.box, x: L, y: round1(y), w: CW };
      y += (el.box.h || 8) + 4;
      return el;
    });
  };

  switch (kindId) {
    case "text":
      return makePage({ ...base, elements: stack([
        newElement(template, "heading", box, { patch: { html: "Titre de la section" } }),
        newElement(template, "paragraph", box),
        newElement(template, "paragraph", box, { patch: { html: "Deuxième paragraphe de la page." } }),
      ]) });
    case "image":
      return makePage({ ...base, elements: stack([
        newElement(template, "heading", box, { patch: { html: "Titre de la page" } }),
        newElement(template, "image", box, { patch: { box: { w: CW, h: CW * 0.62 } } }),
        newElement(template, "paragraph", box, { patch: { html: "Légende ou description de l'image." } }),
      ]) });
    case "quote":
      return makePage({ ...base, elements: [
        newElement(template, "quote", box, {
          patch: { box: { x: L + 14, y: box.h * 0.34, w: CW - 28, h: 40 }, style: { size: template.sizes.h2, italic: true, align: "center" } },
        }),
        newElement(template, "paragraph", box, {
          patch: { html: "— Auteur de la citation", box: { x: L + 14, y: box.h * 0.34 + 44, w: CW - 28, h: 10 }, style: { align: "center", color: template.colors.accent, size: template.sizes.small } },
        }),
      ] });
    case "chapter":
      return makePage({ ...base, elements: [
        newElement(template, "chapter", box, { patch: { box: { x: L, y: T + 30, w: CW, h: 20 } } }),
        newElement(template, "line", box, { patch: { box: { x: L, y: T + 56, w: CW * 0.4, h: 1 } } }),
        newElement(template, "paragraph", box, { patch: { box: { x: L, y: T + 66, w: CW, h: 24 }, html: "Introduction du chapitre : annoncez ce que le lecteur va apprendre." } }),
      ] });
    case "table":
      return makePage({ ...base, elements: stack([
        newElement(template, "heading", box, { patch: { html: "Tableau" } }),
        newElement(template, "table", box),
      ]) });
    case "chart":
      return makePage({ ...base, elements: stack([
        newElement(template, "heading", box, { patch: { html: "Graphique" } }),
        newElement(template, "chart", box, { patch: { box: { w: CW, h: 90 } } }),
      ]) });
    case "summary":
      return makePage({ ...base, elements: stack([
        newElement(template, "heading", box, { patch: { html: "Résumé" } }),
        newElement(template, "box", box, { patch: { box: { w: CW, h: 60 }, html: "En résumé : les points essentiels de ce chapitre." } }),
        newElement(template, "list", box, { patch: { html: "• Point clé 1<br>• Point clé 2<br>• Point clé 3" } }),
      ]) });
    case "exercises":
      return makePage({ ...base, elements: stack([
        newElement(template, "heading", box, { patch: { html: "Exercices" } }),
        newElement(template, "list", box, {
          patch: { html: "1. Premier exercice…<br>2. Deuxième exercice…<br>3. Troisième exercice…", box: { w: CW, h: 40 } },
        }),
        newElement(template, "note", box, { patch: { html: "Corrigé disponible à la fin de l'ouvrage.", box: { w: CW } } }),
      ]) });
    case "checklist":
      return makePage({ ...base, elements: stack([
        newElement(template, "heading", box, { patch: { html: "Checklist" } }),
        newElement(template, "list", box, {
          patch: { html: "☐ Première action<br>☐ Deuxième action<br>☐ Troisième action<br>☐ Quatrième action", box: { w: CW, h: 44 } },
        }),
      ]) });
    case "biography":
      return makePage({ ...base, elements: [
        newElement(template, "heading", box, { patch: { html: "À propos de l'auteur", box: { x: L, y: T + 10, w: CW, h: 12 } } }),
        newElement(template, "image", box, { patch: { box: { x: L, y: T + 26, w: CW * 0.42, h: CW * 0.42 * 1.2 } }, name: "Portrait" }),
        newElement(template, "paragraph", box, {
          patch: {
            box: { x: L + CW * 0.46, y: T + 26, w: CW * 0.54, h: 70 },
            html: `${docMeta.author || "L'auteur"} est l'auteur de cet ouvrage. Présentez ici son parcours, son expertise et ses réalisations.`,
          },
        }),
      ] });
    case "custom":
    case "blank":
    default:
      return makePage(base);
  }
}
// ─── Layouts de page (§8 « Changer le design de cette page », §21) ─────────
// Chaque layout repositionne les éléments EXISTANTS (le contenu n'est jamais
// perdu ni réécrit) : la mise en page change, le texte reste identique.
export const PAGE_LAYOUTS = [
  { id: "free", label: "Libre", desc: "Aucune contrainte : placement manuel." },
  { id: "single", label: "Colonne unique", desc: "Texte pleine largeur, empilé." },
  { id: "editorial", label: "Style éditorial", desc: "Colonne unique, lettrine sur le premier paragraphe." },
  { id: "imageRight", label: "Image à droite", desc: "Texte à gauche, image à droite." },
  { id: "imageLeft", label: "Image à gauche", desc: "Image à gauche, texte à droite." },
  { id: "imageTop", label: "Image en haut", desc: "Image pleine largeur en tête de page." },
  { id: "imageFull", label: "Image pleine largeur", desc: "Grande image, texte en dessous." },
  { id: "magazine", label: "Style magazine", desc: "Titre pleine largeur + deux colonnes + image." },
  { id: "twoColumns", label: "Deux colonnes", desc: "Texte réparti en deux colonnes." },
  { id: "chapter", label: "Ouverture de chapitre", desc: "Titre majestueux, texte en retrait." },
  { id: "centered", label: "Page centrée", desc: "Contenu centré, colonne étroite." },
  { id: "titlePage", label: "Page de titre", desc: "Contenu centré au milieu de la page." },
];

const isFlow = (el) => isTextType(el) || el.type === "toc";
const isVisual = (el) =>
  el.type === "image" || el.type === "gallery" || el.type === "logo" || el.type === "icon" ||
  el.type === "qr" || el.type === "chart" || el.type === "table" || el.type === "diagram" ||
  el.type === "stats";
const isTitle = (el) => el.type === "heading" || el.type === "chapter" || el.type === "subtitle";

/** Applique un layout à UNE page : boîtes recalculées, style conservé. */
export function applyLayout(page, layoutId, box) {
  if (!layoutId || layoutId === "free") return { ...page, layout: "free" };
  const { w, h, m } = box;
  const L = m.left;
  const R = w - m.right;
  const T = m.top;
  const B = h - m.bottom;
  const CW = R - L;
  const gap = 2.5;
  const els = (page.elements || []).slice();
  const boxes = new Map(); // id → { box partiel, style partiel }
  const setBox = (el, b) => boxes.set(el.id, { ...(boxes.get(el.id) || {}), box: { ...el.box, ...b } });
  const setStyle = (el, s) => boxes.set(el.id, { ...(boxes.get(el.id) || {}), style: { ...(boxes.get(el.id)?.style || {}), ...s } });

  /** Empile une liste d'éléments dans une colonne (largeur imposée). */
  const stack = (list, { x, width, y = T, spacing = gap }) => {
    let cursor = y;
    for (const el of list) {
      const hh = el.box.h || 6;
      setBox(el, { x, w: width, y: round1(cursor) });
      cursor += hh + spacing;
    }
    return cursor;
  };
  const splitColumns = (list) => {
    const left = [];
    const right = [];
    list.forEach((el, i) => (i % 2 === 0 ? left : right).push(el));
    return { left, right };
  };

  const titles = els.filter(isTitle);
  const bodies = els.filter((e) => !isTitle(e) && isFlow(e));
  const visuals = els.filter((e) => !isTitle(e) && !isFlow(e) && isVisual(e));
  const others = els.filter((e) => !titles.includes(e) && !bodies.includes(e) && !visuals.includes(e));

  switch (layoutId) {
    case "twoColumns": {
      const colW = (CW - gap * 1.6) / 2;
      const y = stack(titles, { x: L, width: CW, spacing: gap * 1.4 });
      const { left, right } = splitColumns(bodies);
      stack(left, { x: L, width: colW, y });
      stack(right, { x: L + colW + gap * 1.6, width: colW, y });
      stack(visuals.concat(others), { x: L, width: CW, y });
      break;
    }
    case "imageRight":
    case "imageLeft": {
      const imgW = CW * 0.46;
      const colW = CW - imgW - gap * 1.6;
      const imgX = layoutId === "imageRight" ? L + colW + gap * 1.6 : L;
      const txtX = layoutId === "imageRight" ? L : L + imgW + gap * 1.6;
      const y = stack(titles, { x: L, width: CW, spacing: gap * 1.4 });
      stack(bodies.concat(others), { x: txtX, width: colW, y });
      stack(visuals, { x: imgX, width: imgW, y });
      break;
    }
    case "editorial": {
      const y = stack(titles, { x: L, width: CW, spacing: gap * 1.4 });
      const first = bodies[0];
      if (first) setStyle(first, { dropCap: true, align: "justify" });
      stack(bodies.concat(others), { x: L, width: CW, y });
      stack(visuals, { x: L, width: CW, y });
      break;
    }
    case "imageTop":
    case "imageFull": {
      const y = stack(titles, { x: L, width: CW, spacing: gap * 1.4 });
      const first = visuals[0];
      let cursor = y;
      if (first) {
        const targetH = layoutId === "imageFull" ? (B - T) * 0.52 : CW * 0.5;
        setBox(first, { x: L, w: CW, y: round1(y), h: round1(targetH) });
        cursor = y + targetH + gap * 2;
      }
      stack(visuals.slice(1).concat(bodies).concat(others), { x: L, width: CW, y: cursor });
      break;
    }
    case "magazine": {
      const colW = (CW - gap * 1.6) / 2;
      const yTop = stack(titles, { x: L, width: CW, spacing: gap * 1.4 });
      const img = visuals[0];
      let yRight = yTop;
      if (img) {
        setBox(img, { x: L + colW + gap * 1.6, w: colW, y: round1(yTop), h: round1(colW * 0.72) });
        yRight = yTop + colW * 0.72 + gap * 2;
      }
      const { left, right } = splitColumns(bodies);
      stack(left, { x: L, width: colW, y: yTop });
      stack(right, { x: L + colW + gap * 1.6, width: colW, y: yRight });
      stack(visuals.slice(1).concat(others), { x: L + colW + gap * 1.6, width: colW, y: yRight });
      break;
    }
    case "chapter": {
      const y = stack(titles, { x: L, width: CW, spacing: gap * 2 });
      stack(bodies.concat(others), { x: L + 6, width: CW - 6, y: y + 4 });
      stack(visuals, { x: L + CW * 0.55, width: CW * 0.45, y: y + 4 });
      break;
    }
    case "centered": {
      const narrow = CW * 0.78;
      const x = L + (CW - narrow) / 2;
      stack(titles.concat(bodies).concat(others), { x, width: narrow, spacing: gap * 1.4 });
      stack(visuals, { x, width: narrow });
      break;
    }
    case "titlePage": {
      const narrow = CW * 0.74;
      const x = L + (CW - narrow) / 2;
      let y = T + (B - T) * 0.28;
      for (const el of titles.concat(bodies).concat(others).concat(visuals)) {
        setBox(el, { x, w: narrow, y: round1(y) });
        y += (el.box.h || 6) + gap * 1.6;
      }
      for (const el of titles.concat(bodies).concat(others)) setStyle(el, { align: "center" });
      break;
    }
    case "single":
    default: {
      const y = stack(titles.concat(bodies).concat(others), { x: L, width: CW });
      stack(visuals, { x: L, width: CW, y });
      break;
    }
  }

  const elements = els.map((el) => {
    const b = boxes.get(el.id);
    if (!b) return el;
    return {
      ...el,
      box: b.box ? b.box : el.box,
      style: b.style ? { ...el.style, ...b.style } : el.style,
    };
  });
  return { ...page, layout: layoutId, elements };
}
/** Compte les mots éditables d'une page (analyse des layouts intelligents). */
export function countWords(page) {
  return (page.elements || [])
    .filter((e) => e.html)
    .map((e) => String(e.html).replace(/<[^>]+>/g, " "))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Répartition des éléments d'une page (analyse « Smart Layout », §21). */
export function describePage(page) {
  const els = page.elements || [];
  return {
    words: countWords(page),
    titles: els.filter(isTitle).length,
    paragraphs: els.filter((e) => e.type === "paragraph" || e.type === "textzone" || e.type === "list").length,
    images: els.filter((e) => e.type === "image" || e.type === "gallery").length,
    quotes: els.filter((e) => e.type === "quote").length,
    tables: els.filter((e) => e.type === "table").length,
    charts: els.filter((e) => e.type === "chart").length,
    shapes: els.filter((e) => elementType(e.type).kind === "shape").length,
    elements: els.length,
  };
}

/**
 * Smart Layout (§21) : le Studio comprend la structure de la page (titre,
 * paragraphes, image, citation, tableau) et propose jusqu'à 5 layouts adaptés,
 * avec la raison du choix. Le contenu est toujours conservé.
 */
export function smartLayouts(page) {
  const d = describePage(page);
  const out = [];
  const add = (id, reason) => {
    const meta = PAGE_LAYOUTS.find((l) => l.id === id);
    if (meta && !out.some((o) => o.id === id)) out.push({ id, label: meta.label, desc: meta.desc, reason });
  };
  if (d.images) {
    add("imageRight", "Une image se place naturellement à droite du texte.");
    add("imageFull", "L'image pleine largeur donne de l'impact.");
    add("imageTop", "L'image en tête ouvre la page.");
    add("magazine", "Titre + deux colonnes + image : rendu magazine.");
  }
  add("editorial", "Colonne unique justifiée avec lettrine : classique et lisible.");
  if (d.words > 380) add("twoColumns", `${d.words} mots : deux colonnes tiennent mieux la page.`);
  if (d.quotes) add("centered", "La citation respire au centre de la page.");
  if (d.tables || d.charts) add("single", "Le tableau / graphique garde toute la largeur utile.");
  if (d.titles && d.words < 140) add("titlePage", "Page d'ouverture : le titre est mis en avant.");
  if (!out.length) add("single", "Mise en page la plus sûre pour ce contenu.");
  return out.slice(0, 5);
}



