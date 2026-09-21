/**
 * Commandes de design en langage naturel (Générateur de documents).
 *
 * Moteur PUR : aucun réseau, aucun accès React. Il traduit une phrase de
 * l'utilisateur en un « patch » appliqué au document — modèle de design,
 * couleurs, polices, mise en page, couverture — SANS jamais toucher au
 * contenu. C'est la séparation contenu / présentation demandée par le cahier
 * des charges (§ 45-56 « commandes naturelles », re-design, design lock).
 *
 * Les surcharges produites respectent STRICTEMENT le schéma déjà appliqué par
 * `resolveTemplate()` (templates.js) : colors{heading,body,accent,bg},
 * bodyFont, headingFont, align, lineHeight, paraSpace. Tout ce que le moteur
 * ne sait pas faire honnêtement est renvoyé dans `notes` — jamais d'échec
 * silencieux, jamais de fausse promesse.
 */
import { GEN_TEMPLATES, getTemplate, templateMeta, templateVariant } from "./templates.js";

/** Normalise pour la compréhension : minuscules, sans accents ni ponctuation. */
export function norm(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Mots (≥ 3 lettres) d'une phrase normalisée. */
function words(str) {
  return norm(str)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

// ─── Couleurs exprimables par l'utilisateur ───────────────────────────────────
// `accent` est le levier principal ; `dark`/`light` inversent aussi fond +
// textes pour rester lisible (jamais de texte noir sur fond noir).
const COLORS = [
  { keys: ["bleu nuit", "navy", "marine"], label: "bleu nuit", accent: "#0B2545", dark: true },
  { keys: ["bleu clair", "cyan", "turquoise"], label: "bleu clair", accent: "#0E7490", light: true },
  { keys: ["bleu"], label: "bleu", accent: "#1D4ED8" },
  { keys: ["vert fonce", "emeraude"], label: "vert émeraude", accent: "#047857", dark: true },
  { keys: ["vert"], label: "vert", accent: "#15803D" },
  { keys: ["rouge", "bordeaux"], label: "rouge", accent: "#B91C1C" },
  { keys: ["orange", "ambre"], label: "orange", accent: "#EA580C" },
  { keys: ["jaune", "dore", "dorure", "or"], label: "doré", accent: "#B58900" },
  { keys: ["violet", "pourpre", "mauve"], label: "violet", accent: "#7C3AED" },
  { keys: ["rose", "magenta", "fuchsia"], label: "rose", accent: "#DB2777" },
  { keys: ["marron", "brun", "beige", "terre"], label: "brun", accent: "#8B5E3C" },
  { keys: ["gris", "argent"], label: "gris", accent: "#64748B" },
];

const DARK = { bg: "#111827", heading: "#F9FAFB", body: "#E5E7EB" };
const LIGHT = { bg: "#FFFFFF", heading: "#111827", body: "#1F2937" };

// « livre » est volontairement EXCLU du style serif : « un livre moderne » doit
// mener au sans-serif. « sans » seul l'est aussi (« sans changer le contenu ») :
// seul « sans serif » compte.
const FONT_WORDS = {
  serif: ["serif", "elegant", "elegante", "classique", "litteraire", "roman", "editorial"],
  sans: ["sans serif", "moderne", "simple", "sobre", "neutre", "contemporain"],
  mono: ["mono", "monospace", "technique", "techno", "tapuscrit", "dactylo"],
};

/** Luminance perçue d'un #rrggbb → texte noir ou blanc lisible par-dessus. */
function readableOn(hex) {
  const m = String(hex || "").match(/^#([0-9a-f]{6})$/i);
  if (!m) return "#FFFFFF";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "#111827" : "#FFFFFF";
}

// Nombres écrits en toutes lettres (les chiffres sont lus séparément).
const NUM_WORDS = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };

// ─── Recommandation intelligente (cahier des charges § 16 et § 65) ────────────
/**
 * Classe les modèles d'après le CONTENU du document (titre + texte), en
 * donnant un bonus aux favoris ⭐ et aux modèles récents 🕘 (préférences
 * personnelles mémorisées localement). Retourne `[{ tpl, m, score }]`.
 */
export function recommendTemplates({
  templates = GEN_TEMPLATES,
  title = "",
  text = "",
  recents = [],
  favs = [],
  limit = 4,
} = {}) {
  const hay = norm(`${title} ${String(text || "").slice(0, 6000)}`);
  const bag = new Set(words(hay));
  const scored = templates.map((tpl) => {
    const m = templateMeta(tpl);
    const fields = [m.category, m.style, m.audience, m.sector].map(norm);
    let score = 0;
    for (const f of fields) {
      for (const part of f.split(/[^a-z0-9]+/)) {
        if (part.length >= 4 && bag.has(part)) score += 3;
      }
    }
    // Indices de structure : un document à tableaux va vers un rapport, un
    // document illustré vers un magazine — petit bonus, jamais décisif.
    if (bag.has("tableau") || bag.has("tableaux")) {
      if (/rapport|catalogue|business|academ|corporate|professionnel/.test(fields.join(" "))) score += 1;
    }
    if (bag.has("image") || bag.has("images") || bag.has("photo") || bag.has("photos")) {
      if (/magazine|jeunesse|voyage|cuisine|sante|nature/.test(fields.join(" "))) score += 1;
    }
    if (favs.includes(tpl.id)) score += 2;
    const ri = recents.indexOf(tpl.id);
    if (ri >= 0) score += Math.max(1, 3 - ri);
    return { tpl, m, score };
  });
  scored.sort((a, b) => b.score - a.score || a.tpl.name.localeCompare(b.tpl.name));
  // Diversité : au plus 2 modèles du même style dans la rangée.
  const out = [];
  const perStyle = {};
  for (const s of scored) {
    const st = norm(s.m.style || "");
    if ((perStyle[st] || 0) >= 2) continue;
    perStyle[st] = (perStyle[st] || 0) + 1;
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * « Générer une variante » : n propositions de style (couleurs + polices +
 * couverture) du modèle choisi, via le moteur `templateVariant`. Le contenu
 * n'est jamais concerné.
 */
export function designVariations(templateId, seed = 0, count = 3) {
  const tpl = getTemplate(templateId) || GEN_TEMPLATES[0];
  const out = [];
  for (let i = 0; i < Math.max(1, Math.min(6, count)); i += 1) {
    const v = templateVariant(tpl, (Number(seed) || 0) + i + 1);
    out.push({
      key: `${tpl.id}-${i + 1}`,
      label: `${tpl.name} · ${i + 1}`,
      overrides: { colors: v.colors, bodyFont: v.bodyFont, headingFont: v.headingFont },
      cover: { bg: v.cover.bg, text: v.cover.text },
    });
  }
  return out;
}

// ─── Analyse d'une commande en langage naturel ────────────────────────────────
/**
 * Traduit une phrase utilisateur en patch de présentation.
 *
 * Retourne :
 *   { templateId, overrides, cover, variants, codes, notes, empty }
 *   - `codes`  : ce qui a été compris (traduit par l'interface).
 *   - `notes`  : demandes non applicables telles quelles, expliquées.
 *   - `empty`  : true si rien n'a été compris (l'interface le dit clairement).
 */
export function parseDesignCommand(text, opts = {}) {
  const templates = opts.templates || GEN_TEMPLATES;
  const currentId = opts.currentTemplateId || "";
  const seed = Number(opts.seed) || 0;
  const raw = String(text || "").trim();
  const q = ` ${norm(raw)} `;
  const bag = new Set(words(raw));
  let codes = [];
  const notes = [];
  const overrides = {};
  let cover = null;
  let templateId = null;
  let variants = null;
  // Plusieurs propositions de couverture (§49 : « crée trois couvertures »).
  let coverIdeas = null;

  const has = (...ks) => ks.some((k) => q.includes(` ${k}`) || q.includes(`${k} `));

  // 1. Modèle de design : on cherche les modèles dont les métadonnées
  //    (catégorie, style, audience, secteur) recoupent les mots de la demande.
  let best = null;
  for (const tpl of templates) {
    const m = templateMeta(tpl);
    const fields = [m.category, m.style, m.audience, m.sector].map(norm);
    let score = 0;
    for (const f of fields) {
      for (const part of f.split(/[^a-z0-9]+/)) {
        if (part.length >= 4 && bag.has(part)) score += 2;
      }
    }
    if (!score) continue;
    if (tpl.id === currentId) score += 1; // on ne quitte pas le modèle actif sans raison
    if (!best || score > best.score) best = { tpl, score };
  }
  if (best) {
    templateId = best.tpl.id;
    codes.push({ code: "template", value: best.tpl.name });
  }

  // 2. Couleurs : une couleur nommée devient la couleur d'accent ; « sombre » /
  //    « clair » inversent le fond et les textes (jamais noir sur noir).
  let colorHit = null;
  for (const c of COLORS) {
    if (c.keys.some((k) => has(k) || bag.has(k))) {
      colorHit = c;
      break;
    }
  }
  const wantsDark =
    bag.has("sombre") || bag.has("fonce") || bag.has("noir") || bag.has("night");
  const wantsLight =
    bag.has("clair") || bag.has("claire") || bag.has("blanc") ||
    bag.has("blanche") || bag.has("lumineux") || bag.has("lumiere");
  const palette = {};
  if (colorHit) {
    palette.accent = colorHit.accent;
    codes.push({ code: "accent", value: colorHit.label });
  }
  if (wantsDark || (colorHit && colorHit.dark)) {
    Object.assign(palette, DARK);
    codes.push({ code: "theme", value: "dark" });
  } else if (wantsLight || (colorHit && colorHit.light)) {
    Object.assign(palette, LIGHT);
    codes.push({ code: "theme", value: "light" });
  }
  if (Object.keys(palette).length) {
    overrides.colors = { ...(overrides.colors || {}), ...palette };
  }

  // 3. Polices : on additionne les indices par famille et on retient la plus
  //    citée (une seule famille, corps ET titres, pour rester cohérent).
  const fontScore = {};
  for (const [fam, keys] of Object.entries(FONT_WORDS)) {
    for (const k of keys) {
      if (has(k) || bag.has(k)) fontScore[fam] = (fontScore[fam] || 0) + 1;
    }
  }
  const fontBest = Object.entries(fontScore).sort((a, b) => b[1] - a[1])[0];
  if (fontBest && fontBest[1] > 0) {
    overrides.bodyFont = fontBest[0];
    overrides.headingFont = fontBest[0];
    codes.push({ code: "font", value: fontBest[0] });
  }

  // 4. Mise en page : alignement, interligne, espacement des paragraphes.
  if (has("justifie", "justifiees", "justifier")) {
    overrides.align = "justify";
    codes.push({ code: "align", value: "justify" });
  } else if (has("centre", "centrer", "centree", "centrees")) {
    overrides.align = "center";
    codes.push({ code: "align", value: "center" });
  } else if (has("gauche")) {
    overrides.align = "left";
    codes.push({ code: "align", value: "left" });
  }
  const lhMatch = norm(raw).match(/interligne[^0-9]{0,14}([0-9]+(?:[.,][0-9]+)?)/);
  if (lhMatch) {
    const v = Number(lhMatch[1].replace(",", "."));
    if (v >= 1.1 && v <= 2.4) {
      overrides.lineHeight = v;
      codes.push({ code: "lineHeight", value: v });
    } else {
      notes.push({ code: "lineHeightRange" });
    }
  } else if (
    has("aere", "aeree", "aerer", "aeres", "respir", "respire", "espace entre les lignes")
  ) {
    overrides.lineHeight = 1.75;
    codes.push({ code: "lineHeight", value: 1.75 });
  } else if (has("serre", "serree", "serrees", "dense", "dense") && !has("marge", "marges")) {
    overrides.lineHeight = 1.3;
    codes.push({ code: "lineHeight", value: 1.3 });
  }
  if (/espace[^.]{0,24}paragraphe/.test(norm(raw)) || has("aere les paragraphes")) {
    const less = has("moins", "reduis", "reduire", "diminue", "diminuer", "supprime");
    overrides.paraSpace = less ? 2 : 12;
    codes.push({ code: "paraSpace", value: overrides.paraSpace });
  }
  if (bag.has("imprimable") || has("a5", "a4", "letter", "paysage", "portrait")) {
    notes.push({ code: "format" });
  }
  if (bag.has("marge") || bag.has("marges") || has("compact", "compacte", "compactes")) {
    notes.push({ code: "margins" });
  }

  // 5. Couverture : une teinte précise, ou PLUSIEURS propositions quand
  //    l'utilisateur en demande plusieurs (« crée trois couvertures »).
  const coverWord = has("couverture", "page de garde");
  let count = 0;
  for (const [w, n] of Object.entries(NUM_WORDS)) {
    if (bag.has(w)) count = Math.max(count, n);
  }
  const digit = norm(raw).match(/\b([2-6])\b/);
  if (digit) count = Math.max(count, Number(digit[1]));
  if (coverWord && (count >= 2 || has("plusieurs", "differentes", "differents", "choix"))) {
    const base = getTemplate(templateId || currentId) || GEN_TEMPLATES[0];
    const n = Math.min(6, Math.max(2, count || 3));
    coverIdeas = [];
    for (let i = 0; i < n; i += 1) {
      const v = templateVariant(base, (seed + i + 1) % 6);
      coverIdeas.push({ cover: { bg: v.cover.bg, text: v.cover.text } });
    }
    codes.push({ code: "coverIdeas", value: coverIdeas.length });
  } else if (coverWord) {
    let bg = null;
    if (palette.bg) bg = palette.bg;
    else if (colorHit) bg = colorHit.accent;
    if (bg) {
      cover = { bg, text: palette.heading || readableOn(bg) };
      codes.push({ code: "cover", value: bg });
    } else {
      // « couverture élégante / technologique » : le STYLE de couverture vient du
      // modèle ; on le dit plutôt que de promettre un réglage qui n'existe pas.
      notes.push({ code: "coverStyle" });
    }
  }

  // 6. Variantes de design (§21/§53) : plusieurs propositions de style du modèle
  //    actif, contenu strictement intact.
  const wantsVariants =
    wantsLight === undefined
      ? false
      : has("variante", "variantes", "designs", "options", "alternatives", "redesign", "re-design");
  if (!coverIdeas && wantsVariants) {
    const baseId = templateId || currentId || GEN_TEMPLATES[0].id;
    variants = designVariations(baseId, seed, Math.min(5, Math.max(2, count)));
    codes.push({ code: "variants", value: variants.length });
  }

  // 7. Verrouillage du contenu (§54-56) : une commande de design ne modifie
  //    JAMAIS le texte — on le confirme explicitement à l'utilisateur.
  const contentLocked =
    /\bsans (changer|modifier|toucher|reconstruire)\b/.test(norm(raw)) ||
    has("meme contenu", "contenu identique", "garde le contenu");
  if (contentLocked) codes.push({ code: "contentLock", value: true });

  // 8. Demandes de protection (§36/§50) : elles ont leur propre panneau — on
  //    renvoie l'utilisateur au bon endroit au lieu d'inventer un réglage.
  if (bag.has("watermark") || has("filigrane")) notes.push({ code: "watermark" });
  if (/\bqr\b/.test(norm(raw))) notes.push({ code: "qr" });
  if (bag.has("copyright")) notes.push({ code: "copyright" });
  if (has("mot de passe", "par code", "proteger par code")) notes.push({ code: "password" });
  // « Mets les citations au centre » ne doit pas centrer TOUT le document.
  let quoteOnly = false;
  if (bag.has("citation") || bag.has("citations")) {
    notes.push({ code: "quote" });
    if (overrides.align === "center" || overrides.align === "left") {
      delete overrides.align;
      codes = codes.filter((c) => c.code !== "align");
      quoteOnly = true;
    }
  }

  // Dédoublonnage des notes (une même explication une seule fois).
  const seenNote = new Set();
  const uniqNotes = [];
  for (const n of notes) {
    if (seenNote.has(n.code)) continue;
    seenNote.add(n.code);
    uniqNotes.push(n);
  }

  return {
    templateId: templateId || null,
    overrides,
    cover,
    coverIdeas,
    variants,
    codes,
    notes: uniqNotes,
    contentLocked,
    quoteOnly,
    empty: !codes.length,
  };
}
