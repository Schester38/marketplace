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
  /^(chapitre|chap\.?|partie|section|module|leçon)\s*(\d+|[ivxlcdm]+)?\s*[:.\-–—]?\s*/i;
const SECTION_RE =
  /^(introduction|conclusion|préface|avant-propos|postface|épilogue|prologue|sommaire|table des matières|remerciements|annexe[s]?|préambule|résumé|foreword|epilogue|appendix)\b/i;

function isUpperTitle(line) {
  if (line.length < 3 || line.length > 80) return false;
  if (!/[A-ZÀ-ÖØ-Þ]/.test(line)) return false;
  // Une « majuscule » est une ligne sans minuscule et sans ponctuation finale.
  if (/[a-zà-öø-ÿ]/.test(line)) return false;
  return !/[.;,:]$/.test(line);
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

    // Chapitres / sections.
    if (CHAPTER_RE.test(line) && line.length <= 100) {
      flushPara();
      out.push(`<h2>${escapeHtml(line)}</h2>`);
      continue;
    }
    if (SECTION_RE.test(line) && line.length <= 60) {
      flushPara();
      out.push(`<h2>${escapeHtml(line)}</h2>`);
      continue;
    }
    if (isUpperTitle(line)) {
      flushPara();
      out.push(`<h2>${escapeHtml(line)}</h2>`);
      continue;
    }

    para.push(line);
  }
  flushPara();
  flushList();

  if (!out.length) return "<p></p>";
  return out.join("\n");
}