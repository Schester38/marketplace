// Détection automatique de structure : transforme un texte brut (ou Markdown
// léger) en HTML sémantique que l'éditeur TipTap peut ingérer.
//
// Règles appliquées :
//   - 1re ligne courte, sans ponctuation finale → titre du document (H1) ;
//   - « Chapitre N », « Partie N », ligne EN MAJUSCULES, Introduction,
//     Conclusion, etc. → titre de chapitre (H2) ;
//   - lignes « ## », « ### » (Markdown) → H2/H3 ;
//   - lignes « - », « * », « • » → liste à puces (consécutives regroupées) ;
//   - lignes « 1. », « 2) » → liste numérotée ;
//   - lignes « > » → citation ;
//   - « --- » → séparateur ;
//   - tout le reste → paragraphe (lignes consécutives fusionnées).

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CHAPTER_RE =
  /^(chapitre|chap\.?|partie|section|module|leçon|lecon|unité|unite)\s*(\d+|[ivxlcdm]+)?\s*[:.\-–—]?\s*/i;
const SECTION_RE =
  /^(introduction|conclusion|préface|avant-propos|postface|épilogue|prologue|sommaire|table des matières|remerciements|annexe[s]?|préambule|résumé|bibliographie|glossaire|index|foreword|epilogue|appendix|about the author|notes?)\b/i;

// Numérotation existante d'un titre de chapitre (« CHAPITRE 3 », « Partie II »).
const CHAPTER_NUM_RE =
  /^(chapitre|chap\.?|partie|section|module|leçon|lecon|unité|unite)\s*(\d+|[ivxlcdm]+)\b/i;

function isUpperTitle(line) {
  if (line.length < 3 || line.length > 80) return false;
  if (!/[A-ZÀ-ÖØ-Þ]/.test(line)) return false;
  // Une « majuscule » est une ligne sans minuscule et sans ponctuation finale.
  if (/[a-zà-öø-ÿ]/.test(line)) return false;
  return !/[.;,:]$/.test(line);
}

// ─── Détection d'un titre, ligne par ligne ──────────────────────────────────
// RÈGLE UNIQUE, partagée par l'import TXT/MD, la conversion en direct dans
// l'éditeur et le bouton « 🧠 Détecter les titres ». Niveaux alignés sur
// l'import : 1 = titre du document, 2 = chapitre/section, 3-4 = sous-titres.
// Retourne { level, kind } ou null (jamais de faux positif sur une phrase :
// ligne trop longue ou ponctuée en fin, ou numérotation « 1. » ambiguë avec
// les listes → liste).
export function detectHeading(raw, { first = false, caps = true } = {}) {
  const text = String(raw || "").trim();
  if (!text) return null;

  // Markdown : # … ######
  const md = text.match(/^(#{1,6})\s+(.+)$/);
  if (md) return { level: Math.min(md[1].length, 4), kind: "md", text: md[2].trim() };

  if (text.length > 100) return null; // ligne longue → paragraphe
  if (/[.;,:]$/.test(text)) return null; // ponctuation finale → phrase, pas un titre

  // Première ligne courte du document : titre (avant les règles « majuscules »).
  if (first && text.length <= 80 && !CHAPTER_RE.test(text) && !SECTION_RE.test(text)) {
    return { level: 1, kind: "title" };
  }

  // Chapitre / partie / module / leçon (« CHAPITRE 3 », « Partie II : le début »)
  // → h1 : c'est le niveau STRUCTURANT (nouvelle page + entrée de niveau 1 dans
  // la table des matières) quand le modèle demande les sauts de chapitre.
  if (CHAPTER_RE.test(text)) return { level: 1, kind: "chapter" };

  // Sections nommées (INTRODUCTION, CONCLUSION, ANNEXE…) → h1 également.
  if (SECTION_RE.test(text) && text.length <= 60) return { level: 1, kind: "section" };

  // Sous-titres hiérarchiques uniquement (« 1.1 Titre », « 2.3.1 Titre ») : les
  // simples « 1. » / « 2) » restent des listes numérotées (règle de l'import).
  const num = text.match(/^(\d{1,2}(?:\.\d{1,2})+)\.?\s+\S/);
  if (num) {
    const depth = num[1].split(".").length;
    return { level: depth >= 3 ? 4 : 3, kind: "numbered", number: num[1] };
  }

  // Ligne EN MAJUSCULES courte, sans ponctuation finale.
  if (caps && isUpperTitle(text)) return { level: 2, kind: "caps" };

  return null;
}

// Numéro déjà présent dans un titre de chapitre (« CHAPITRE 3 » → 3 ; null).
export function chapterNumber(text) {
  const m = String(text || "").match(CHAPTER_NUM_RE);
  if (!m) return null;
  return /^\d+$/.test(m[2]) ? Number(m[2]) : null;
}

// Le titre porte-t-il DÉJÀ une numérotation (chiffres ou romains) ?
export function hasChapterNumber(text) {
  return CHAPTER_NUM_RE.test(String(text || "").trim());
}

// Un texte collé mérite-t-il la détection de structure ? (≥ 3 lignes dont au
// moins une ligne structurante : titre, liste, citation ou séparateur.)
export function looksStructured(raw) {
  const lines = String(raw || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return false;
  return lines.some(
    (l) =>
      detectHeading(l) ||
      /^[-*•]\s+/.test(l) ||
      /^\d{1,3}[.)]\s+/.test(l) ||
      /^>\s?/.test(l) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(l)
  );
}

export function detectStructureHtml(rawText) {
  const text = String(rawText || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const out = [];
  let para = [];
  let list = null; // null | "ul" | "ol"

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${escapeHtml(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const openList = (kind, firstItem) => {
    flushList();
    list = kind;
    out.push(`<${kind}><li>${escapeHtml(firstItem)}</li>`);
  };

  let firstMeaningfulSeen = false;
  let titleUsed = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushPara();
      flushList();
      continue;
    }

    // Markdown : titres explicites.
    const md = line.match(/^(#{1,6})\s+(.*)$/);
    if (md) {
      flushPara();
      flushList();
      const level = Math.min(md[1].length, 4);
      if (!titleUsed && level === 1) {
        out.push(`<h1>${escapeHtml(md[2])}</h1>`);
        titleUsed = true;
      } else {
        out.push(`<h${level}>${escapeHtml(md[2])}</h${level}>`);
      }
      firstMeaningfulSeen = true;
      continue;
    }

    // Séparateur Markdown.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushPara();
      flushList();
      out.push("<hr>");
      continue;
    }

    // Titre du document : première ligne courte, sans ponctuation finale,
    // qui n'est pas un chapitre.
    if (
      !firstMeaningfulSeen &&
      !titleUsed &&
      line.length <= 80 &&
      !/[.;,:]$/.test(line) &&
      !CHAPTER_RE.test(line)
    ) {
      out.push(`<h1>${escapeHtml(line)}</h1>`);
      titleUsed = true;
      firstMeaningfulSeen = true;
      continue;
    }
    firstMeaningfulSeen = true;

    // Citations.
    if (/^>\s?/.test(line)) {
      flushPara();
      flushList();
      out.push(`<blockquote><p>${escapeHtml(line.replace(/^>\s?/, ""))}</p></blockquote>`);
      continue;
    }

    // Listes à puces.
    if (/^[-*•]\s+/.test(line)) {
      flushPara();
      const item = line.replace(/^[-*•]\s+/, "");
      if (list !== "ul") openList("ul", item);
      else out.push(`<li>${escapeHtml(item)}</li>`);
      continue;
    }

    // Listes numérotées.
    if (/^\d{1,3}[.)]\s+/.test(line)) {
      flushPara();
      const item = line.replace(/^\d{1,3}[.)]\s+/, "");
      if (list !== "ol") openList("ol", item);
      else out.push(`<li>${escapeHtml(item)}</li>`);
      continue;
    }

    flushList();

    // Chapitres / sections / sous-titres numérotés / majuscules : règle
    // PARTAGÉE avec l'éditeur (detectHeading) — l'import et la détection en
    // direct donnent donc exactement le même résultat.
    const head = detectHeading(line);
    if (head) {
      flushPara();
      const lvl = head.level;
      out.push(`<h${lvl}>${escapeHtml(line)}</h${lvl}>`);
      continue;
    }

    para.push(line);
  }
  flushPara();
  flushList();

  if (!out.length) return "<p></p>";
  return out.join("\n");
}