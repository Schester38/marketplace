// ─── Intelligence du Studio : IA page par page (§9, §10, §26) + actions
//     multi-pages (§11) et globales (§12) ─────────────────────────────────────
// Moteur PUR : il COMPREND une consigne en langage naturel et produit un PLAN
// (portée exacte, mode, action, texte concerné). L'exécution (appel réseau à
// l'assistant, modification du modèle) appartient à l'écran — ainsi la
// confirmation « Pages concernées : … » est toujours affichée AVANT d'agir.
import { norm } from "./designCommands.js";
import { elementType, sortedElements, uid } from "./studioModel.js";
import { applyLayout, PAGE_LAYOUTS } from "./studioLayouts.js";

/** Exemples affichés dans le panneau IA (repris du cahier des charges §9). */
export const AI_PAGE_EXAMPLES = [
  "Rends cette page plus moderne.",
  "Réduis ce texte pour qu'il tienne correctement sur la page.",
  "Ajoute une image pertinente à droite.",
  "Transforme cette page en page de chapitre.",
  "Améliore la mise en page sans modifier le contenu.",
  "Corrige uniquement les fautes de cette page.",
  "Rends cette page plus élégante.",
  "Ajoute une citation pertinente.",
  "Change la couleur du titre.",
  "Transforme cette page en style magazine.",
];

const has = (bag, ...list) => list.some((w) => bag.has(norm(w)));
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

// Intentions de MISE EN PAGE exprimables naturellement (§8/§21).
const LAYOUT_INTENTS = [
  { id: "magazine", words: ["magazine", "presse"] },
  { id: "twoColumns", words: ["deux colonnes", "2 colonnes", "colonnes", "journal"] },
  { id: "imageRight", words: ["image a droite", "photo a droite", "image droite"] },
  { id: "imageLeft", words: ["image a gauche", "photo a gauche"] },
  { id: "imageFull", words: ["image pleine largeur", "grande image", "image pleine page"] },
  { id: "imageTop", words: ["image en haut", "image en tete"] },
  { id: "chapter", words: ["page de chapitre", "ouverture de chapitre", "debut de chapitre"] },
  { id: "titlePage", words: ["page de titre", "page d ouverture"] },
  { id: "centered", words: ["page centree", "centrer la page", "au centre de la page"] },
  { id: "editorial", words: ["style editorial", "classique", "lettrine"] },
  { id: "single", words: ["colonne unique", "une seule colonne"] },
];

// Intentions de CONTENU : elles seules autorisent la réécriture du texte, et
// uniquement en mode « Contenu + Design » (§10).
const CONTENT_INTENTS = [
  { action: "correct", words: ["fautes", "faute", "orthographe", "grammaire", "corrige", "corriger"] },
  { action: "shorten", words: ["reduis", "reduire", "raccourcis", "raccourcir", "plus court", "condense", "condenser"] },
  { action: "expand", words: ["developpe", "developper", "allonge", "enrichis", "enrichir", "detaille", "detaille_r"] },
  { action: "summarize", words: ["resume", "resumer", "synthese"] },
  { action: "rephrase", words: ["reformule", "reformuler", "autrement", "reecris", "reecrire"] },
  { action: "improve", words: ["ameliore le texte", "ameliorer le texte", "style du texte", "fluidite", "vocabulaire"] },
  { action: "translate", words: ["traduis", "traduire", "traduction", "en anglais", "en espagnol", "en arabe"] },
  { action: "quote", words: ["citation", "phrase inspirante"] },
];

/** Nombre de mots éditables d'une page (diagnostic du plan). */
export function pageWordCount(page) {
  return (page?.elements || [])
    .filter((e) => e.html)
    .map((e) => String(e.html).replace(/<[^>]+>/g, " "))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Texte envoyé à l'IA pour une page (dans l'ordre de lecture des calques). */
export function pageTextForAi(page, { target = "text" } = {}) {
  let htmls;
  if (target === "title") {
    htmls = (page.elements || [])
      .filter((e) => e.type === "heading" || e.type === "chapter" || e.type === "subtitle")
      .map((e) => e.html);
  } else if (target === "primary") {
    const first = sortedElements(page).find((e) => e.html);
    htmls = first ? [first.html] : [];
  } else {
    htmls = sortedElements(page).filter((e) => e.html).map((e) => e.html);
  }
  return htmls
    .map((h) => String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/** Découpe une réponse IA en blocs (paragraphes) + gras/italique simple. */
export function splitBlocks(text) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|\s)\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/_(.+?)_/g, "<em>$1</em>");
  return String(text || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => inline(block).replace(/\n/g, "<br>"));
}

/**
 * Répartit un texte réécrit par l'IA dans les éléments de la page (§9 : « L'IA
 * doit effectuer uniquement les modifications demandées »). Aucune structure
 * n'est modifiée : seuls les contenus des éléments ciblés changent.
 */
export function distributeText(page, text, { target = "text" } = {}) {
  const blocks = splitBlocks(text);
  if (!blocks.length) return { patches: {} };
  const all = sortedElements(page).filter((e) => e.html && String(e.html).trim());
  const targets = target === "title"
    ? all.filter((e) => e.type === "heading" || e.type === "chapter" || e.type === "subtitle")
    : target === "primary"
      ? all.slice(0, 1)
      : all;
  if (!targets.length) return { patches: {} };
  const patches = {};
  targets.forEach((el, i) => {
    if (i < blocks.length) patches[el.id] = blocks[i];
    else if (i === targets.length - 1) patches[el.id] = blocks[blocks.length - 1];
    else patches[el.id] = "";
  });
  return { patches, distributed: Math.min(blocks.length, targets.length) };
}
// ─── Analyse d'une consigne (§9) ───────────────────────────────────────────
/**
 * Comprend une instruction de page et renvoie un PLAN exécutable.
 * @param {string} instruction phrase de l'utilisateur
 * @param {object} ctx { mode: "auto"|"design"|"content", pageIndex, total,
 *                       selectedCount, selectionNumbers, designParser, designCtx }
 */
export function parsePageInstruction(instruction, ctx = {}) {
  const raw = String(instruction || "");
  const bag = new Set(tokens(raw));
  const n = norm(raw);
  const { pageIndex = 0, total = 1, selectedCount = 1 } = ctx;

  // 1. PORTÉE (§26) : « cette page » / « page 17 » / « toutes les pages ».
  let scope = "page";
  let pageNumbers = [pageIndex + 1];
  const allMatch = /\b(toutes? les pages|tout le document|tout le livre|globalement|partout)\b/.test(n);
  const numMatch = n.match(/\bpage\s*(?:n[°o]\s*)?(\d{1,4})\b/);
  if (allMatch) {
    scope = "document";
    pageNumbers = Array.from({ length: Math.max(1, total) }, (_, i) => i + 1);
  } else if (numMatch) {
    const target = Number(numMatch[1]);
    if (target >= 1 && target <= total) {
      scope = target === pageIndex + 1 ? "page" : "page_number";
      pageNumbers = [target];
    }
  } else if (selectedCount > 1 && /\b(ces pages|la selection|les pages selectionnees|selection)\b/.test(n)) {
    scope = "selection";
    pageNumbers = ctx.selectionNumbers && ctx.selectionNumbers.length ? ctx.selectionNumbers : pageNumbers;
  }

  // 2. MODE (§10) : design uniquement par défaut — le contenu n'est touché que
  //    si la consigne le demande explicitement, ou si l'utilisateur l'impose.
  const contentIntent = CONTENT_INTENTS.find((c) => has(bag, ...c.words)) || null;
  const contentWords = /\b(texte|paragraphe|phrase|mots?|redige|reecris|reformule|corrige|resume|traduis)\b/.test(n);
  let mode = contentIntent || contentWords ? "content" : "design";
  if (ctx.mode === "design" || ctx.mode === "content") mode = ctx.mode;

  // 3. LAYOUT demandé éventuellement (§8/§21).
  let layout = null;
  for (const item of LAYOUT_INTENTS) {
    if (has(bag, ...item.words) || item.words.some((w) => n.includes(norm(w)))) {
      layout = item.id;
      break;
    }
  }

  // 4. DESIGN (couleurs, polices, espacements, couverture) : la commande de
  //    design existante est réutilisée — zéro duplication de logique.
  let design = null;
  if (typeof ctx.designParser === "function") {
    try {
      design = ctx.designParser(raw, ctx.designCtx || {});
    } catch {
      design = null;
    }
  }

  // 5. Réduction du texte pour tenir sur la page (§20/§9).
  const fitsPage = /(tienne|tenir|trop long|reduis|raccourcis|condense|debord|trop de texte)/.test(n);
  const shorten = fitsPage && (contentIntent?.action === "shorten" || /\btexte\b/.test(n));

  // 6. Action IA (si le texte doit réellement être transformé).
  const action = contentIntent && mode === "content" ? contentIntent.action : null;
  const needsAi = mode === "content" && !!action;

  const bits = [];
  if (layout) bits.push(`mise en page « ${PAGE_LAYOUTS.find((l) => l.id === layout)?.label || layout} »`);
  if (design && (design.templateId || Object.keys(design.overrides || {}).length || design.cover)) bits.push("design (couleurs, polices, espacements)");
  if (shorten) bits.push("réduction du texte pour tenir sur la page");
  if (needsAi) bits.push(`réécriture par l'assistant (${action})`);

  return {
    instruction: raw,
    mode,
    scope,
    pageNumbers,
    pageIndex: pageNumbers[0] - 1,
    layout,
    design,
    shorten,
    action,
    needsAi,
    summary: bits.length ? bits.join(" + ") : "analyse de la consigne",
    empty: bits.length === 0,
  };
}

/** « Pages concernées : 17 » / « Pages concernées : 1–48 » (§26). */
export function describeScope(plan) {
  const nums = [...new Set(plan.pageNumbers || [])].sort((a, b) => a - b);
  if (!nums.length) return "Pages concernées : —";
  if (nums.length === 1) return `Pages concernées : ${nums[0]}`;
  const contiguous = nums.every((v, i) => i === 0 || v === nums[i - 1] + 1);
  if (contiguous) return `Pages concernées : ${nums[0]}–${nums[nums.length - 1]}`;
  return `Pages concernées : ${nums.join(", ")}`;
}
// __AI_END__

