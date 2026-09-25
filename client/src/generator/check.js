// ─── Contrôle qualité du document ( DOCUMENT CHECK) ────────────────────────
// Analyse RÉELLE de la sortie paginée (mêmes données que l'aperçu et le PDF) :
// aucune estimation arbitraire, chaque alerte renvoie à un élément mesuré.
//
// Trois niveaux, comme dans un contrôle pré-impression :
//   errors   → défaut bloquant pour un document professionnel ;
//   warnings → gêne visuelle probable (page presque vide, image peu définie) ;
//   suggestions → amélioration de fond (couverture, auteur, table des matières).
//
// `fixables` décrit ce que la correction automatique sait réellement corriger
// (elle ne simule rien : chaque correction est appliquée au modèle).

const MIN_FILLED_RATIO = 0.12; // < 12 % de la hauteur utile = page presque vide
const LOW_RES_PX = 480; // largeur d'affichage faible → image potentiellement floue
const MIN_WORDS = 150; // en dessous, un document paraît vide en librairie

function itemWords(item) {
  let n = 0;
  if (item.kind === "tableRow") {
    for (const c of item.cells || []) for (const ln of c.lines || []) n += (ln.runs || []).length;
  } else {
    for (const ln of item.lines || []) n += (ln.runs || []).length;
  }
  return n;
}

function itemBottom(item) {
  if (item.kind === "tableRow") {
    let b = item.top;
    for (const c of item.cells || []) b = Math.max(b, item.top + (c.h || 0));
    return b;
  }
  if (item.kind === "image" || item.kind === "hr") return item.top + (item.h || 0);
  // `ln.bottom` est relatif à la boîte de l'atome (top 0) : le bas réel de
  // l'atome dans la page est donc item.top + ln.bottom.
  let b = item.top;
  for (const ln of item.lines || []) b = Math.max(b, item.top + (ln.bottom || ln.top));
  return b;
}

export function checkDocument({ paginated, docMeta }) {
  const errors = [];
  const warnings = [];
  const suggestions = [];
  const fixables = []; // { code, label }
  const push = (arr, code, label, detail) => arr.push({ code, label, detail });

  if (!paginated?.pages?.length) {
    push(errors, "no_pages", "Le document ne contient aucune page.", "Ajoutez du texte puis régénérez l'aperçu.");
    return { errors, warnings, suggestions, fixables, score: emptyScore() };
  }

  const { pages, box, contentHpx } = paginated;
  const content = pages.filter((p) => p.kind === "content");
  const words = content.reduce((n, p) => n + p.items.reduce((m, it) => m + itemWords(it), 0), 0);
  let overflow = 0;
  let images = 0;
  let lowRes = 0;
  const emptyPages = [];
  const thinPages = [];
  const orphanTitles = [];

  content.forEach((page, idx) => {
    const n = page.items.reduce((m, it) => m + itemWords(it), 0);
    if (!page.items.length || n === 0) {
      emptyPages.push(page.number);
      return;
    }
    let bottom = 0;
    for (const it of page.items) {
      bottom = Math.max(bottom, itemBottom(it));
      if (it.kind === "image") {
        images += 1;
        if ((it.w || 0) < LOW_RES_PX) lowRes += 1;
      }
    }
    // Débordement : un atome sort de la boîte de texte utile.
    if (bottom > contentHpx + 2) overflow += 1;
    // Page presque vide : très peu de hauteur remplie (hors fin de document).
    const isLast = idx === content.length - 1;
    if (!isLast && bottom < contentHpx * MIN_FILLED_RATIO) thinPages.push(page.number);
    // Titre orphelin : dernière ligne d'une page = titre isolé en bas de page.
    const last = page.items[page.items.length - 1];
    const lastLine = last?.lines?.[last.lines.length - 1];
    if (lastLine?.style && lastLine.style.sizePx >= (paginated.template?.sizes?.h3 || 13) * 1.3333) {
      orphanTitles.push(page.number);
    }
  });

  const pageNumbers = (arr) => [...new Set(arr)].sort((a, b) => a - b).join(", ");
  const headings = paginated.entries?.length || 0;

  if (words < MIN_WORDS) {
    push(
      suggestions,
      "short_doc",
      "Le document est encore court.",
      `${words} mots détectés : un document de moins de ${MIN_WORDS} mots paraît vide dans une librairie.`
    );
  }
  if (emptyPages.length) {
    push(errors, "empty_pages", `${emptyPages.length} page(s) sans aucun contenu.`, `Pages ${pageNumbers(emptyPages)}.`);
  }
  if (overflow) {
    push(
      errors,
      "overflow",
      `${overflow} page(s) où un élément dépasse la zone de texte.`,
      "Réduisez la taille des images ou augmentez les marges haut/bas."
    );
  }
  if (thinPages.length) {
    push(
      warnings,
      "thin_pages",
      `${thinPages.length} page(s) presque vide(s) avant la fin du document.`,
      `Pages ${pageNumbers(thinPages)} : un saut de chapitre y laisse une page orpheline.`
    );
  }
  if (orphanTitles.length) {
    push(
      warnings,
      "orphan_titles",
      `${orphanTitles.length} titre(s) isolé(s) en bas de page.`,
      `Pages ${pageNumbers(orphanTitles)} : le titre reste seul, son contenu commence à la page suivante.`
    );
  }
  if (lowRes) {
    push(
      warnings,
      "low_res_images",
      `${lowRes} image(s) de faible définition.`,
      `Une image affichée à moins de ${LOW_RES_PX} px peut apparaître floue à l'impression.`
    );
  }
  if (images && !lowRes) {
    push(suggestions, "images_ok", `${images} image(s) correctement définie(s).`, "");
  }
  if (!headings) {
    push(
      suggestions,
      "no_headings",
      "Aucun titre de chapitre détecté.",
      "Utilisez le style H1 pour vos chapitres : la table des matières et la pagination en dépendent."
    );
  }
  if (docMeta.protection?.toc === false) {
    push(suggestions, "no_toc", "La table des matières est désactivée.", "Elle est attendue dans un document professionnel.");
  }
  if (docMeta.protection?.copyright === false) {
    push(suggestions, "no_copyright", "Aucune page de copyright.", "Ajoutez-la : elle protège vos droits d'auteur.");
  }
  if (!String(docMeta.author || "").trim()) {
    push(
      warnings,
      "no_author",
      "Aucun auteur renseigné.",
      "Le nom de l'auteur figure dans les en-têtes, la page de copyright et les métadonnées du PDF (jamais sur la couverture)."
    );
  }
  if (!String(docMeta.cover?.title || docMeta.title || "").trim()) {
    push(errors, "no_title", "Le document n'a pas de titre.", "Renseignez le titre : il apparaît sur la couverture et les métadonnées.");
  }
  if (docMeta.cover?.enabled === false) {
    push(suggestions, "no_cover", "La couverture est désactivée.", "");
  }
  if (!docMeta.cover?.image && !docMeta.cover?.bg && !docMeta.cover?.text) {
    push(
      suggestions,
      "generic_cover",
      "Couverture au design par défaut.",
      "Personnalisez les couleurs ou ajoutez une image de fond pour un rendu plus professionnel."
    );
  }

  // ── Corrections réellement applicables au document (aucune simulation) ────
  const ov = docMeta.style_overrides || {};
  const margins = docMeta.margins || {};
  if (ov.align !== "justify" && (words >= 400 || thinPages.length || orphanTitles.length)) {
    fixables.push({ code: "justify", label: "Justifier le texte (rendu livre)" });
  }
  if (docMeta.protection?.toc === false) fixables.push({ code: "toc", label: "Activer la table des matières" });
  if (docMeta.protection?.copyright === false) fixables.push({ code: "copyright", label: "Ajouter la page de copyright" });
  if (docMeta.protection?.qrEnabled === false && docMeta.doc_ref) {
    fixables.push({ code: "qr", label: "Activer le QR code de vérification" });
  }
  if (docMeta.cover?.enabled === false) fixables.push({ code: "cover", label: "Activer la couverture" });
  if (thinPages.length && (Number(margins.top) > 18 || Number(margins.bottom) > 18)) {
    fixables.push({ code: "compact_margins", label: "Resserrer les marges pour densifier les pages" });
  }
  if (String(docMeta.title || "").trim() && !String(docMeta.cover?.title || "").trim()) {
    fixables.push({ code: "cover_title", label: "Reporter le titre sur la couverture" });
  }

  const quality = scoreOf({
    words, headings, images, lowRes, errors, warnings, thinPages, orphanTitles, overflow, docMeta,
  });

  return { errors, warnings, suggestions, fixables, quality, stats: { words, headings, images } };
}

// Score descriptif (jamais une note commerciale) : chaque ligne est un constat
// mesuré sur la sortie paginée, l'utilisateur reste libre de l'ignorer.
function scoreOf({ words, headings, images, lowRes, errors, warnings, thinPages, orphanTitles, overflow, docMeta }) {
  const note = (n) => {
    if (n >= 3) return { level: "excellent", label: "excellente" };
    if (n >= 1) return { level: "good", label: "bonne" };
    if (n === 0) return { level: "warn", label: "correcte" };
    return { level: "bad", label: "à revoir" };
  };
  const rows = [];
  rows.push({
    key: "structure",
    label: "Structure",
    ...note(headings >= 3 ? 3 : headings >= 1 ? 1 : -1),
    hint: headings ? `${headings} titre(s) repéré(s)` : "aucun titre de chapitre",
  });
  rows.push({
    key: "lisibilite",
    label: "Lisibilité",
    ...note(words >= 1200 ? 3 : words >= 400 ? 1 : -1),
    hint: `${words} mot(s)`,
  });
  rows.push({
    key: "images",
    label: "Images",
    ...(images === 0 ? { level: "warn", label: "aucune" } : note(lowRes ? -1 : 3)),
    hint: images ? `${images} image(s)${lowRes ? `, dont ${lowRes} peu définie(s)` : ""}` : "aucune image",
  });
  rows.push({
    key: "pagination",
    label: "Pagination",
    ...note(-(errors.length + warnings.length + thinPages.length + orphanTitles.length + overflow)),
    hint: `${errors.length} erreur(s), ${warnings.length} avertissement(s)`,
  });
  const coverOk = docMeta.cover?.enabled !== false && String(docMeta.cover?.title || docMeta.title || "").trim();
  const authorOk = String(docMeta.author || "").trim();
  rows.push({
    key: "couverture",
    label: "Couverture",
    ...(coverOk && authorOk ? note(3) : coverOk ? note(1) : note(-1)),
    hint: coverOk ? (authorOk ? "titre + auteur" : "titre seulement") : "incomplète",
  });
  return rows;
}

function emptyScore() {
  const row = (key, label, hint) => ({ key, label, level: "bad", hint: `${label} — ${hint}` });
  return [
    row("structure", "Structure", "document vide"),
    row("lisibilite", "Lisibilité", "document vide"),
    row("images", "Images", "aucune image"),
    row("pagination", "Pagination", "aucune page"),
    row("couverture", "Couverture", "incomplète"),
  ];
}