// Détection de la PORTÉE d'un contenu (« de quoi parle le document ? ») et
// suggestion du modèle de design le plus adapté. Module PUR (aucune dépendance
// DOM) : le Générateur l'appelle sur le texte de l'éditeur et affiche une carte
// « Design suggéré ». L'utilisateur reste libre — rien n'est appliqué seul.
//
// Principe : chaque portée possède un vocabulaire pondéré (plus le mot est
// spécifique, plus il pèse) + des signaux de STRUCTURE (chapitres, montants,
// dialogues, codes, exercices…). Les scores sont normalisés en pourcentage.

export const GEN_SCOPES = [
  {
    id: "finance",
    label: "Finance & investissement",
    emoji: "💰",
    templates: ["finance", "business", "professionnel"],
    keywords: [
      ["investissement", 5], ["investir", 5], ["épargne", 5], ["trading", 5],
      ["crypto", 5], ["bourse", 5], ["dividende", 5], ["patrimoine", 5],
      ["rentabilité", 4], ["portefeuille", 4], ["inflation", 4],
      ["crédit", 3], ["dette", 3], ["budget", 3], ["banque", 3],
      ["marge", 3], ["finances", 4], ["tontine", 3], ["mobile money", 3],
      ["rendement", 4], ["taux", 2], ["épargner", 5], ["trésorerie", 5],
    ],
  },
  {
    id: "business",
    label: "Business & entrepreneuriat",
    emoji: "💼",
    templates: ["business", "professionnel", "finance"],
    keywords: [
      ["business plan", 5], ["entrepreneur", 5], ["entreprendre", 5],
      ["startup", 5], ["marketing", 4], ["stratégie", 4], ["management", 4],
      ["leadership", 4], ["entreprise", 4], ["client", 3], ["clients", 3],
      ["marché", 3], ["ventes", 3], ["chiffre d'affaires", 5],
      ["plan d'action", 4], ["objectifs", 3], ["productivité", 4],
      ["kpi", 4], ["marque", 3], ["équipe", 3], ["gestion", 3],
      ["croissance", 3], ["fournisseur", 4], ["commercial", 3],
      ["e-commerce", 4], ["fidélisation", 4], ["rentable", 4],
    ],
  },
  {
    id: "technologie",
    label: "Technologie & informatique",
    emoji: "💻",
    templates: ["technologie", "moderne", "professionnel"],
    keywords: [
      ["javascript", 5], ["python", 5], ["html", 4], ["css", 4],
      ["react", 4], ["sql", 4], ["algorithme", 5], ["programmation", 5],
      ["développeur", 5], ["code source", 5],
      ["intelligence artificielle", 5], ["machine learning", 5],
      ["cybersécurité", 5], ["base de données", 4], ["logiciel", 4],
      ["application", 3], ["serveur", 3], ["api", 3], ["réseau", 3],
      ["cloud", 3], ["données", 3], ["informatique", 4], ["numérique", 3],
      ["tutoriel", 3], ["configuration", 3], ["terminal", 4],
    ],
  },
  {
    id: "education",
    label: "Éducation & formation",
    emoji: "🎓",
    templates: ["education", "minimal", "professionnel"],
    keywords: [
      ["cours", 4], ["leçon", 4], ["chapitre", 3], ["exercice", 4],
      ["élève", 4], ["étudiant", 4], ["enseignant", 4], ["formation", 4],
      ["apprendre", 3], ["programme scolaire", 5], ["examen", 4],
      ["école", 4], ["université", 4], ["pédagogie", 5], ["mémoire", 3],
      ["thèse", 4], ["révision", 4], ["quiz", 3], ["matière", 3],
      ["baccalauréat", 5], ["méthode", 3], ["comprendre", 2],
      ["niveau", 2], ["corrigé", 4], ["notation", 3],
    ],
  },
  {
    id: "motivation",
    label: "Développement personnel & motivation",
    emoji: "🔥",
    templates: ["motivation", "magazine", "moderne"],
    keywords: [
      ["développement personnel", 5], ["motivation", 5],
      ["confiance en soi", 5], ["réussite", 4], ["succès", 4],
      ["habitudes", 4], ["discipline", 4], ["mental", 3], ["mindset", 4],
      ["peur", 3], ["courage", 3], ["persévérance", 5],
      ["dépassement", 4], ["liberté", 3], ["rêve", 3], ["rêves", 3],
      ["croire en soi", 5], ["potentiel", 4], ["procrastination", 5],
      ["transformer votre vie", 5], ["épanouissement", 4], ["motivé", 4],
      ["détermination", 4], ["se lever", 2],
    ],
  },
  {
    id: "spirituel",
    label: "Spiritualité & foi",
    emoji: "🙏",
    templates: ["luxe", "elegant", "minimal"],
    keywords: [
      ["dieu", 4], ["seigneur", 4], ["prière", 5], ["prier", 4],
      ["foi", 3], ["bible", 5], ["coran", 5], ["verset", 5],
      ["psaume", 5], ["évangile", 5], ["jésus", 5], ["église", 4],
      ["mosquée", 4], ["islam", 5], ["chrétien", 5], ["prophète", 5],
      ["spirituel", 4], ["âme", 3], ["méditation", 4], ["bénédiction", 4],
      ["jeûne", 4], ["hadith", 5], ["allah", 5], ["salat", 4],
      ["chapelet", 5], ["adorer", 4],
    ],
  },
  {
    id: "jeunesse",
    label: "Jeunesse & enfants",
    emoji: "🧸",
    templates: ["jeunesse", "magazine", "moderne"],
    keywords: [
      ["conte", 5], ["enfant", 4], ["enfants", 4], ["aventure", 4],
      ["illustré", 5], ["prince", 4], ["princesse", 4], ["magique", 4],
      ["fée", 5], ["dragon", 5], ["lutin", 5], ["bande dessinée", 5],
      ["jeunesse", 5], ["merveilleux", 4], ["coloriage", 5],
      ["école primaire", 5], ["comptine", 5], ["papa", 2], ["maman", 2],
      ["il était une fois", 5], ["animal", 3], ["forêt", 3],
    ],
  },
  {
    id: "roman",
    label: "Roman & fiction",
    emoji: "📖",
    templates: ["elegant", "luxe", "minimal"],
    keywords: [
      ["roman", 5], ["personnage", 4], ["il marcha", 5],
      ["elle regarda", 5], ["dit-il", 5], ["dit-elle", 5], ["s'écria", 5],
      ["chapitre premier", 5], ["prologue", 5], ["épilogue", 5],
      ["narrateur", 5], ["protagoniste", 5], ["intrigue", 5],
      ["dialogue", 3], ["sentiments", 3], ["amour", 3], ["destin", 3],
      ["voyage", 3], ["silence", 2], ["regard", 2],
    ],
  },
  {
    id: "magazine",
    label: "Magazine & actualité",
    emoji: "📰",
    templates: ["magazine", "moderne", "minimal"],
    keywords: [
      ["interview", 5], ["dossier", 4], ["reportage", 5], ["rubrique", 5],
      ["sommaire", 4], ["magazine", 5], ["actualité", 5], ["enquête", 5],
      ["témoignage", 4], ["éditorial", 5], ["numéro", 3], ["chronique", 4],
      ["exclusif", 4], ["les tendances", 4], ["top 10", 4],
      ["guide pratique", 4], ["rédaction", 3], ["lecteurs", 3],
    ],
  },
];

// Signaux de STRUCTURE (indépendants du vocabulaire métier) : ils départagent
// deux domaines proches (un roman et un manuel parlent tous deux de « voyage »).
function structuralSignals(low, lines) {
  const s = {};
  const has = (re) => re.test(low);
  const count = (re) => (low.match(re) || []).length;
  // Chapitres numérotés → ouvrage de fiction ou essai long.
  if (count(/chapitre\s+\d+/g) >= 2) s.roman = 3;
  // Sommaire / table des matières rédigée → magazine ou guide.
  if (has(/\bsommaire\b/) || has(/table des matières/)) s.magazine = 2;
  // Montants et unités monétaires CFA/€ : finance (et business).
  if (count(/\d[\d\s.,]*\s?(xaf|fcfa|f\s?cfa|francs?|€|\$|usd|eur)\b/g) >= 3) {
    s.finance = 2;
    s.business = 1;
  }
  // Codes / commandes techniques → technologie.
  if (count(/\b(function|const|var|npm |git |console\.log|<\/?[a-z]+>)/g) >= 3) s.technologie = 2;
  // Guillemets de dialogue nombreux → fiction.
  if (count(/[«»"]/g) >= 8 && lines.length > 6) s.roman = 2;
  // Exercices numérotés → éducation.
  if (count(/exercice\s+\d+/gi) >= 2) s.education = 3;
  // Listes à puces abondantes → guide pratique (business / motivation).
  if (count(/^\s*[-•*]\s+/gm) >= 8) {
    s.business = Math.max(s.business || 0, 1);
    s.motivation = Math.max(s.motivation || 0, 1);
  }
  return s;
}

function escRe(word) {
  return String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreScope(scope, low) {
  let score = 0;
  const hits = [];
  for (const [word, weight] of scope.keywords) {
    if (!word) continue;
    // Frontières sur les LETTRES Unicode (accents gérés) : « marché » ne
    // matche pas dans « remarché », mais ponctuation et espaces sont acceptés.
    const re = new RegExp(`(^|[^\\p{L}])${escRe(word)}(?![\\p{L}])`, "giu");
    const n = (low.match(re) || []).length;
    if (!n) continue;
    score += weight * Math.min(3, n); // au-delà de 3 occurrences, on plafonne
    hits.push({ word, weight, n });
  }
  return { score, hits };
}

/**
 * Analyse un texte et renvoie la portée détectée + un classement de modèles.
 * @param {string} text  texte brut du document
 * @param {object} [opts] { templateIds } : modèles réellement disponibles
 * @returns {{scope:string,label:string,emoji:string,confidence:number,reason:string,
 *            keywords:string[],suggestions:{id:string,score:number}[]}|null}
 */
export function detectScope(text, opts = {}) {
  const raw = String(text || "");
  if (raw.trim().length < 120) return null; // trop court pour trancher
  const low = raw.toLowerCase();
  const lines = raw.split(/\n+/).filter((l) => l.trim());

  const scores = new Map();
  const hitWords = new Map();
  for (const scope of GEN_SCOPES) {
    const { score, hits } = scoreScope(scope, low);
    if (score > 0) {
      scores.set(scope.id, score);
      hitWords.set(
        scope.id,
        hits.sort((a, b) => b.weight * b.n - a.weight * a.n).map((h) => h.word)
      );
    }
  }
  // Signaux de structure ajoutés aux scores de mots.
  for (const [id, extra] of Object.entries(structuralSignals(low, lines))) {
    scores.set(id, (scores.get(id) || 0) + extra);
  }
  if (!scores.size) {
    return {
      scope: "generale",
      label: "Document général",
      emoji: "📄",
      confidence: 0,
      reason: "",
      keywords: [],
      suggestions: suggestFor("generale", opts.templateIds),
    };
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [topId, topScore] = ranked[0];
  const total = ranked.reduce((a, [, v]) => a + v, 0);
  const confidence = Math.max(1, Math.round((topScore / total) * 100));
  const meta = GEN_SCOPES.find((s) => s.id === topId);
  const words = (hitWords.get(topId) || []).slice(0, 3);

  return {
    scope: topId,
    label: meta?.label || "Document général",
    emoji: meta?.emoji || "📄",
    confidence,
    reason: words.length ? words.join(" · ") : "structure du document",
    keywords: (hitWords.get(topId) || []).slice(0, 6),
    suggestions: suggestFor(topId, opts.templateIds),
  };
}

/** Modèles conseillés pour une portée (classés), filtrés sur les disponibles. */
export function suggestFor(scopeId, available) {
  const meta = GEN_SCOPES.find((s) => s.id === scopeId);
  const ids = meta ? meta.templates.slice() : ["minimal", "moderne", "professionnel"];
  if (meta) {
    for (const fallback of ["minimal", "moderne", "professionnel", "business"]) {
      if (!ids.includes(fallback)) ids.push(fallback);
    }
  }
  const list = available && available.length ? ids.filter((id) => available.includes(id)) : ids;
  return (list.length ? list : ids).slice(0, 3).map((id, i) => ({ id, score: 3 - i }));
}

/** Texte exploitable depuis du HTML (imports, contenu servi par l'API…). */
export function textFromHtml(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
