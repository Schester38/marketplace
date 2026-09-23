// ─── Mots collés : détection + correction automatique (moteur PUR) ──────────
// Les textes importés (PDF → DOCX, OCR, copier-coller depuis un site, Word mal
// converti) arrivent très souvent SANS les espaces : « lesmots sontcollés »,
// « fin.Le chapitre », « 5000francs »… Ce module les détecte et les corrige.
//
// PRINCIPE : des règles CONSERVATRICES — un mot légitime n'est jamais cassé.
// Chaque correction est renvoyée AVANT/APRÈS pour que l'utilisateur puisse les
// voir (Studio → « 🔗 Mots collés ») et annuler d'un clic.
//
// Règles :
//   punct : ponctuation collée au mot suivant   « fin.Le »      → « fin. Le »
//   space : espace avant . ou ,                 « mot . »       → « mot. »
//   case  : majuscule au milieu d'un mot        « bonjourMonde » → « bonjour Monde »
//   long  : deux mots français agglutinés       « intelligenceartificielle »
//   digit : chiffres collés aux lettres         « 5000francs »  → « 5000 francs »
//   apos  : apostrophe perdue                   « aujourdhui »  → « aujourd'hui »
//
// Sont IGNORÉS : URL, e-mails, noms de domaine (TLD connus), noms de fichiers
// (extensions connues), entités HTML (`&#39;`, `&amp;`…), jetons du Studio
// (`{page}`, `{titre}`…) et mots de la liste KEEP (marques, noms composés).
// Le module est PUR : aucun DOM, aucun réseau, aucune dépendance.
import { GLUED_DICT } from "./gluedDict.js";

// Le dictionnaire est ré-exporté pour les tests/diagnostics (aucun autre usage).
export { GLUED_DICT };

const MAX_FIXES = 800; // garde-fou : un texte pathologique ne bloque pas l'UI

/** Marques, noms composés et références à NE JAMAIS couper. */
const KEEP = new Set(
  (
    "Mboppi MboppiShop WhatsApp YouTube Facebook Instagram LinkedIn TikTok Messenger " +
    "Snapchat Telegram Netflix OpenAI ChatGPT DeepSeek Gemini Microsoft Google Android " +
    "Chromebook iPhone iPad iMac MacBook AirPods ApplePay PayPal eBay MasterCard Word " +
    "PowerPoint Excel OneDrive SharePoint GoogleDrive GooglePlay WordPress JavaScript " +
    "TypeScript GitHub GitLab iKeePay MoneyFusion OrangeMoney MobileMoney MTN Bitcoin " +
    "USDT FacebookGoogle LeMonde LaCroix LeFigaro LinkedInLearning HTML CSS PDF JPEG PNG " +
    "EPUB DOCX XLSX MP3 MP4 USB SMS GPS IA AI QR CodeBarre " +
    "DigitalPlat Supabase Vercel PostgreSQL jsPDF TipTap base64 sha256 JSONB JSX CSV"
  )
    .split(/\s+/)
    .filter(Boolean)
);
const KEEP_LOWER = new Set([...KEEP].map((w) => w.toLowerCase()));

/** Mots français de 2 lettres : autorisent « leChapitre » → « le Chapitre ». */
const SHORT_WORDS = new Set([
  "le", "la", "un", "du", "de", "ce", "il", "on", "je", "tu", "sa", "se", "ma",
  "ta", "au", "en", "et", "ou", "ne", "ni", "si", "va", "vu", "lu", "me", "te",
]);

/**
 * Articles, déterminants et possessifs. Eux seuls peuvent ouvrir une coupure
 * de 2 lettres ou une chaîne : « leChapitre », « Leguidedu vendeur ». Les
 * autres mots de 2 lettres (« on », « en », « si »…) couperaient des mots
 * légitimes ou des identifiants de code (« onImage »).
 */
const ARTICLES = new Set(
  (
    "le la les un une des du de d ce cet cette ces mon ma mes ton ta tes son sa ses " +
    "notre nos votre vos leur leurs"
  )
    .split(/\s+/)
    .filter(Boolean)
);

/** Mot du dictionnaire, pluriel/féminin simple toléré (« mondes » → « monde »). */
function dictStrict(word) {
  const x = norm(word);
  if (DICT.has(x)) return true;
  if (x.length > 4 && /(?:es|s)$/.test(x) && DICT.has(x.replace(/(?:es|s)$/, ""))) return true;
  return false;
}

/**
 * Têtes de chaîne autorisées (« lesmots », « nosclientssontsatisfaits »).
 * Volontairement RESTREINT aux mots-outils qui ne sont jamais le début d'un mot
 * français légitime ou long : « mon »+« tant », « se »+« maine », « en »+« semble »
 * sont exclus (ils coupaient « montant », « semaine », « ensemble »).
 */
const CHAIN_HEADS = new Set(
  (
    "les des une est sont dans pour avec cette votre notre leur leurs vous nous elle elles ils ont " +
    "avez avons suis êtes quand comme sans sous vers chez avant après depuis pendant aussi ainsi " +
    "alors encore déjà toujours jamais beaucoup presque chaque plusieurs pourquoi comment combien " +
    "sur par entre peut peuvent doit doivent veut veulent " +
    "ses ces mes tes nos vos tout tous toute toutes plus mais quel quelle quels quelles"
  )
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Mots-outils de 2 lettres autorisés à OUVRIR une chaîne (« laformation »,
 * « Leguidedu »). Volontairement limités aux déterminants : « il », « je »,
 * « on »… ouvriraient « illisible », « jetable », « onctueux » — les pronoms
 * sont traités à part par la règle « pronom + verbe » (voir `splitPronoun`).
 */
const SHORT_HEADS = new Set(["le", "la", "un", "du", "ce"]);
/**
 * Pronoms sujets pouvant ouvrir une chaîne quand ils sont suivis d'un VERBE
 * d'une liste fermée : « Ilestimportant » → « Il est important »,
 * « Onpeutdire » → « On peut dire ». Sans le filtre sur le verbe,
 * « illisible » deviendrait « il lisible ».
 */
const PRONOUNS = ["il", "je", "tu", "on", "elle", "nous", "vous", "ils", "elles"];
const PRONOUN_VERBS = new Set(
  (
    "est sont était étaient a ont avait avaient aura auront sera seront eut fut furent " +
    "soit soient être avoir peut peuvent doit doivent veut veulent sait savent fait font " +
    "va vont vient viennent faut reste restent"
  ).split(/\s+/)
);

/**
 * Découpe un jeton agglutiné en plusieurs mots (« nosclientssontsatisfaits »).
 * La TÊTE doit être un mot-outil (3 lettres de `CHAIN_HEADS`, 2 lettres de
 * `SHORT_HEADS`) ; chaque fragment intermédiaire doit exister au dictionnaire
 * (mots-outils courts acceptés) et la FIN doit être un mot connu, flexions
 * comprises. Renvoie la liste des positions de coupe, ou null si le découpage
 * n'est pas certain — mieux vaut manquer une correction que casser un mot.
 */
function splitChainCuts(token) {
  if (token.length < 5) return null;
  const memo = new Map();
  const walk = (s, depth, isHead) => {
    if (s.length < 3 || depth <= 0) return null;
    const key = `${isHead ? 1 : 0}:${s}`;
    if (memo.has(key)) return memo.get(key);
    // Coupe la PLUS LONGUE d'abord : « cetteformation » → « cette | formation »
    // (et non « cet | te | formation »), « pourquoipas » → « pourquoi | pas ».
    for (let cut = s.length - 2; cut >= 2; cut -= 1) {
      const a = s.slice(0, cut);
      const b = s.slice(cut);
      const na = norm(a);
      const aOk =
        a.length >= 3
          ? (isHead ? CHAIN_HEADS.has(na) : DICT.has(na))
          : (isHead ? SHORT_HEADS.has(na) : ARTICLES.has(na));
      if (!aOk) continue;
      if (b.length >= 3 && known(b)) return [cut];
      if (b.length <= 3 && ARTICLES.has(norm(b))) return [cut]; // « …du », « …la »
      const rest = walk(b, depth - 1, false);
      if (rest) {
        const out = [cut, ...rest];
        memo.set(key, out);
        return out;
      }
    }
    memo.set(key, null);
    return null;
  };
  return walk(token, 4, true);
}

/** Découpe « Il est… » / « On peut… » : pronom sujet + verbe connu + reste.
 *  Les positions renvoyées sont RELATIVES (`[coupe1, coupe2…]`), comme celles
 *  du découpage en chaîne : la 2ᵉ coupe se mesure dans « estimportant », pas
 *  dans le jeton complet. */
function splitPronoun(token) {
  const low = norm(token);
  for (const p of PRONOUNS) {
    if (low.length < p.length + 4 || !low.startsWith(p)) continue;
    const rest = token.slice(p.length);
    let verb = "";
    for (const v of PRONOUN_VERBS) {
      if (v.length > verb.length && norm(rest).startsWith(v)) verb = v;
    }
    if (!verb) continue;
    const after = rest.slice(verb.length);
    if (after.length < 3) continue;
    if (known(after)) return [p.length, verb.length];
    const rest2 = splitChainCuts(after);
    if (rest2) return [p.length, verb.length, ...rest2];
  }
  return null;
}

function splitChain(token) {
  return splitChainCuts(token) || splitPronoun(token);
}

/**
 * Mots-outils qui terminent un jeton agglutiné : « comprendreque », « dismoiqui ».
 * Liste FERMÉE et courte : chaque entrée a été vérifiée contre un corpus de
 * prose française (aucune terminaison légitime de mot ne doit passer pour un
 * mot-outil — « tableaux », « manuelle », « naturelles » n'ont pas le droit
 * d'être coupés). La moitié gauche doit être un mot connu d'au moins 4 lettres
 * et la queue au moins 3 lettres.
 */
const TAIL_WORDS = new Set(
  ("que qui dont pas plus très pour dans avec sans sous vers chez quand comme").split(/\s+/)
);
function splitTail(token) {
  if (token.length < 8) return null;
  for (let cut = token.length - 3; cut >= 4; cut -= 1) {
    const tail = norm(token.slice(cut));
    if (!TAIL_WORDS.has(tail)) continue;
    const head = token.slice(0, cut);
    if (head.length < 4 || !known(head)) continue;
    return [cut];
  }
  return null;
}


const DICT = GLUED_DICT;

// ─── Zones protégées : URL, e-mails, domaines, noms de fichiers ─────────────
const TLD = "com|fr|org|net|io|be|ca|cm|africa|shop|store|online|xyz|info|edu|gov|app|dev|me|tv|co|us|uk|de|es|it|ch|sn|ci|ml|bf|ne|tg|bj|ga|cg|cd|rw|bi|mg|gn|td|cf|dz|ma|tn|dj|km|mr|gw|st";
const EXT = "pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|svg|zip|rar|7z|epub|mobi|mp[34]|wav|ogg|mov|webm|csv|txt|json|xml|html?|css|js|ts|jsx|md";
const PROTECT_RE = new RegExp(
  [
    String.raw`[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+`,
    String.raw`(?:www\.)[^\s<>"']+`,
    String.raw`[^\s<>"'@]{1,64}@[^\s<>"'@]+\.[A-Za-z]{2,}`,
    String.raw`[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:${TLD})\b`,
    String.raw`[A-Za-z0-9_-]+\.(?:${EXT})\b`,
    // Segments techniques : chemin, expression, paramètre, identifiant.
    String.raw`[^\s<>"']*[/=@#][^\s<>"']*`,
    String.raw`\{[a-z]+\}`,
  ].join("|"),
  "gi"
);
const URL_RE = /(?:https?:\/\/|www\.|ftp:\/\/)\S+/i;

/**
 * Code en ligne entre backticks (« `localStorage` », « `totalPrice = prix ×
 * quantité` ») : les identifiants techniques ne doivent JAMAIS être coupés.
 * Les backticks sont appariés dans l'ordre ; si le texte en contient un nombre
 * IMPAIR (backtick isolé), le premier est ignoré pour que les paires suivantes
 * restent alignées.
 */
function backtickRanges(text) {
  const pos = [];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "`") pos.push(i);
  if (pos.length < 2) return [];
  const start = pos.length % 2 ? 1 : 0;
  const out = [];
  for (let k = start; k + 1 < pos.length; k += 2) out.push([pos[k], pos[k + 1] + 1]);
  return out;
}

/** Plages [début, fin[ des segments protégés (calculées une fois par texte). */
function protectedRanges(text) {
  const out = backtickRanges(text);
  PROTECT_RE.lastIndex = 0;
  let m;
  while ((m = PROTECT_RE.exec(text))) {
    if (!m[0]) break;
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}
const inside = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b);

/** Le caractère avant `i` appartient-il à une entité HTML encore ouverte ? */
function insideEntity(text, i) {
  return text.lastIndexOf("&", i) > text.lastIndexOf(";", i);
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const LOWER = "a-zà-öø-ÿ";
const UPPER = "A-ZÀ-ÖØ-Þ";
const SP = "[ \\t\\u00a0\\u202f]";
const norm = (w) => String(w || "").toLowerCase();
const isCaps = (w) => w.length > 1 && w === w.toUpperCase() && /[A-ZÀ-ÖØ-Þ]/.test(w);
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const isLowerCh = (c) => !!c && /[a-zà-öø-ÿ]/.test(c);
const isUpperCh = (c) => !!c && /[A-ZÀ-ÖØ-Þ]/.test(c);

/**
 * Le mot est-il connu ? Directement (dictionnaire) ou par une FLEXION courante
 * (pluriel, féminin, participe, conjugaison) — indispensable pour ne pas casser
 * un mot valide absent du dictionnaire sous sa forme exacte.
 */
function known(word) {
  const x = norm(word);
  if (x.length < 3) return false;
  if (DICT.has(x)) return true;
  if (x.length < 5) return false; // pas de flexion sur les mots très courts
  // 3ᵉ personne du pluriel : « vendent » → « vend » + « re » (vendre).
  if (/ent$/.test(x)) {
    const stem = x.slice(0, -3);
    if (stem.length >= 3 && (DICT.has(`${stem}er`) || DICT.has(`${stem}re`) || DICT.has(`${stem}ir`))) return true;
  }
  const tries = [
    x.replace(/aux$/, "al"),
    x.replace(/(?:es|s)$/, ""),
    x.replace(/e$/, ""),
    x.replace(/(?:ait|aite|aits|aites)$/, "aire"),
    x.replace(/(?:ée?s?|és?)$/, "er"),
    x.replace(/(?:antes?|ants?|ant)$/, "er"),
    x.replace(/(?:ez|ons|ait|aient|ais|ions)$/, "er"),
    `${x}s`,
    `${x}e`,
    `${x}es`,
  ];
  return tries.some((t) => t.length >= 3 && DICT.has(t));
}


/** Suffixes ordinaux à NE JAMAIS détacher : « 10ème », « 1er », « 2nde »… */
const ORDINAL = /^(ème|eme|ère|ere|er|e|nd|nde|th|st|d)$/i;

/** Marques / noms composés : recherche dans un texte (plages protégées). */
const KEEP_RE = new RegExp(
  [...KEEP]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g"
);
function keepRanges(text) {
  const out = [];
  KEEP_RE.lastIndex = 0;
  let m;
  while ((m = KEEP_RE.exec(text))) {
    if (!m[0]) break;
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

/** Apostrophes perdues les plus fréquentes (formes non ambiguës seulement). */
const APOS_FIXES = [
  { re: /\baujourd\s?hui\b/gi, to: "aujourd'hui" },
  { re: /\bquelqu\s?un\b/gi, to: "quelqu'un" },
  { re: /\bquelqu\s?une\b/gi, to: "quelqu'une" },
  { re: /\bquelqu\s?uns\b/gi, to: "quelqu'uns" },
];

/** Libellés des règles (affichés dans le rapport du Studio, traduits par l'UI). */
export const GLUED_RULES = [
  { id: "punct", label: "Ponctuation collée", sample: "« fin.Le » → « fin. Le »" },
  { id: "space", label: "Espace avant la ponctuation", sample: "« mot . » → « mot. »" },
  { id: "case", label: "Majuscule collée", sample: "« bonjourMonde » → « bonjour Monde »" },
  { id: "long", label: "Mots agglutinés", sample: "« intelligenceartificielle » → « intelligence artificielle »" },
  { id: "ref", label: "Comparatif (vocabulaire du document)", sample: "« lesmots » → « les mots » (mot du document)" },
  { id: "digit", label: "Chiffres collés", sample: "« 5000francs » → « 5000 francs »" },
  { id: "apos", label: "Apostrophe manquante", sample: "« aujourdhui » → « aujourd'hui »" },
];
export const GLUED_RULE_LABELS = GLUED_RULES.reduce((acc, r) => ({ ...acc, [r.id]: r.label }), {});

// ─── COMPARATIF : comparer le texte d'origine au texte des pages ────────────
/**
 * Vocabulaire de RÉFÉRENCE du comparatif : tous les mots (≥ 2 lettres) trouvés
 * dans le texte d'origine — et, si on le souhaite, dans les pages. Sert à
 * découper un mot collé dont les morceaux sont des mots DU DOCUMENT, même si le
 * dictionnaire général les ignore (vocabulaire métier, noms propres, sigles).
 * Accepte du HTML (balises et entités retirées) ou du texte brut.
 */
export function buildGluedReference(...sources) {
  const words = new Set();
  const re = new RegExp(`[${LETTER}]{2,}`, "g");
  for (const s of sources) {
    const text = String(s == null ? "" : s)
      // Balises HTML : uniquement une vraie balise (lettre ou « / » après « < »,
      // ≤ 80 caractères, pas de saut de ligne). Un « < » isolé dans du texte
      // (« l'auteur: <nom> », comparateurs…) ne doit PAS supprimer la suite du
      // document — sinon des mots entiers manqueraient à la référence.
      .replace(/<\/?[A-Za-z][^<>\n]{0,80}>/g, " ")
      .replace(/&[a-z]+;|&#\d+;/gi, " ");
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) words.add(norm(m[0]));
  }
  return words;
}

/** Texte brut de toutes les pages du Studio (html + données textuelles). */
export function gluedPagesText(pages) {
  const out = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    for (const el of page?.elements || []) {
      if (typeof el?.html === "string") out.push(el.html);
      const d = el?.data;
      if (!d || typeof d !== "object") continue;
      if (Array.isArray(d.rows)) for (const row of d.rows) for (const c of row || []) if (c?.text) out.push(c.text);
      if (Array.isArray(d.entries)) for (const e of d.entries) if (e?.text) out.push(e.text);
      if (Array.isArray(d.series)) for (const s of d.series) if (s?.label) out.push(s.label);
      if (Array.isArray(d.nodes)) for (const n of d.nodes) if (n?.text) out.push(n.text);
      if (Array.isArray(d.items)) for (const n of d.items) out.push(`${n?.label || ""} ${n?.value || ""}`);
      if (typeof d.title === "string") out.push(d.title);
      if (typeof d.label === "string") out.push(d.label);
    }
  }
  return out.join(" \n ");
}

/** Fragment acceptable pour le comparatif : mot du document, du dictionnaire ou
 *  mot-outil court (« de », « et »…). */
function refKnown(frag, reference) {
  const x = norm(frag);
  if (x.length <= 3 && (ARTICLES.has(x) || SHORT_WORDS.has(x) || CHAIN_HEADS.has(x))) return true;
  if (known(frag)) return true;
  if (!reference) return false;
  if (reference.has(x)) return true;
  if (x.length > 4 && /(?:es|s)$/.test(x) && reference.has(x.replace(/(?:es|s)$/, ""))) return true;
  return reference.has(`${x}s`) || reference.has(`${x}es`);
}

/**
 * Découpe un jeton selon le VOCABULAIRE DU DOCUMENT (comparatif).
 * Très conservateur, pour ne jamais casser un mot légitime :
 *   • le jeton ne doit PAS exister tel quel dans le texte d'origine (sinon il
 *     est considéré correct) et ne doit pas être un identifiant camelCase ;
 *   • 2 morceaux : « comptabilitéanalytique » → chaque morceau est un mot du
 *     document (ou du dictionnaire) d'au moins 3 lettres, la tête pouvant être
 *     un ARTICLE de 2 lettres (« la », « le », « du »…) ;
 *   • 3 morceaux (≥ 11 lettres) : « La | comptabilité | analytique » — milieu
 *     court accepté (« de », « et »), fin ≥ 3 lettres.
 * Un morceau inconnu du document ET du dictionnaire bloque le découpage :
 * « illimités », « webhooks », « invalide » restent intacts.
 * Renvoie les coupes RELATIVES, ou null.
 */
function splitByReference(token, reference) {
  const len = token.length;
  if (!reference || len < 8) return null;
  // Un mot qui existe TEL QUEL dans le texte d'origine n'est pas collé :
  // c'est la règle de base du comparatif (et le meilleur garde-fou).
  if (reference.has(norm(token))) return null;
  // Identifiants techniques (« localStorage », « originCheck »…) : la majuscule
  // interne n'est pas une frontière de mot — jamais coupés.
  if (/[a-zà-ÿ][A-ZÀ-Þ]/.test(token)) return null;
  const strong = (f) => f.length >= 3 && refKnown(f, reference);
  const short = (f) => f.length >= 2 && refKnown(f, reference);
  const head = (f) => (f.length >= 3 ? strong(f) : ARTICLES.has(norm(f)) || SHORT_HEADS.has(norm(f)));
  // 2 morceaux.
  for (let cut = len - 3; cut >= 2; cut -= 1) {
    if (head(token.slice(0, cut)) && strong(token.slice(cut))) return [cut];
  }
  // 3 morceaux (mot long).
  if (len >= 11) {
    for (let c1 = 2; c1 <= len - 6; c1 += 1) {
      if (!head(token.slice(0, c1))) continue;
      for (let c2 = len - 3; c2 >= c1 + 2; c2 -= 1) {
        if (!short(token.slice(c1, c2)) || !strong(token.slice(c2))) continue;
        return [c1, c2 - c1];
      }
    }
  }
  return null;
}

// ─── MOTEUR ─────────────────────────────────────────────────────────────────
/**
 * Corrige un texte brut. Renvoie `{ text, fixes }` où chaque correction porte
 * sa règle et le couple AVANT/APRÈS (affichage dans le rapport du Studio).
 * Aucune modification n'est faite dans le doute : mieux vaut manquer une
 * correction que casser un mot légitime.
 */
export function fixGluedText(input, opts = {}) {
  const src = String(input == null ? "" : input);
  if (!src || src.length > 400000) return { text: src, fixes: [] };
  const only = Array.isArray(opts.rules) && opts.rules.length ? new Set(opts.rules) : null;
  // Vocabulaire du DOCUMENT (comparatif) : construit par `buildGluedReference`
  // à partir du texte d'origine et/ou des pages.
  const reference = opts.reference && opts.reference.size ? opts.reference : null;
  const fixes = [];
  const add = (rule, before, after) => {
    if (!before || before === after || fixes.length >= MAX_FIXES) return;
    fixes.push({ rule, before, after });
  };
  const on = (rule) => !only || only.has(rule);
  let out = src;

  // 1. Espace avant « . » ou « , » : « mot . » → « mot. » (jamais avant ! ? ; :
  //    où l'espace est justement la typographie française correcte).
  if (on("space")) {
    const ranges = protectedRanges(out);
    const re = new RegExp(`([0-9${LETTER})»"'])[ \\t\\u00a0]+([.,])(?=\\s|$)`, "g");
    out = out.replace(re, (m, a, p, off) => {
      if (inside(ranges, off) || insideEntity(out, off)) return m;
      add("space", `${a} ${p}`, `${a}${p}`);
      return `${a}${p}`;
    });
  }

  // 2. Ponctuation collée au mot suivant : « mot,suite », « quoi?Vraiment ».
  //    Le caractère suivant doit être une LETTRE (jamais un chiffre : « 12:30 »).
  if (on("punct")) {
    const ranges = protectedRanges(out);
    const re = new RegExp(`([0-9${LETTER})»"'])([,;:!?])(?=([${LETTER}]))`, "g");
    out = out.replace(re, (m, a, p, c, off) => {
      if (inside(ranges, off) || insideEntity(out, off)) return m;
      add("punct", `${a}${p}${c}`, `${a}${p} ${c}`);
      return `${a}${p} `; // le caractère suivant (lookahead) n'est pas consommé
    });
  }

  // 3. Point collé (majuscule derrière) : « fin.Le » → « fin. Le ».
  //    Ignoré après une majuscule seule (« M.Dupont »), devant un sigle ou une
  //    extension (« fichier.PDF », « U.S.A »), dans les URL / e-mails et quand
  //    le mot de gauche n'est PAS un mot français connu (« Whapi.Cloud »,
  //    « i.C » — marque ou identifiant, jamais coupé).
  if (on("punct")) {
    const ranges = protectedRanges(out);
    const re = new RegExp(`([0-9${LOWER}])\\.(?=([${UPPER}]))`, "g");
    out = out.replace(re, (m, a, b, off) => {
      if (inside(ranges, off) || insideEntity(out, off)) return m;
      const after = out.slice(off + 2, off + 8);
      if (new RegExp(`^[${UPPER}]{2,5}(?![${LETTER}])`).test(after)) return m; // sigle / extension
      if (isLowerCh(a)) {
        let k = off;
        while (k > 0 && new RegExp(`[${LETTER}]`).test(out[k - 1])) k -= 1;
        const left = out.slice(k, off + 1);
        if (left.length > 2 && !known(left)) return m;
      }
      add("punct", `${a}.${b}`, `${a}. ${b}`);
      return `${a}. `;
    });
  }



  // 4. À l'INTÉRIEUR des mots : majuscule collée, puis mots agglutinés.
  {
    const ranges = protectedRanges(out).concat(keepRanges(out));
    const edits = [];
    const tokenRe = new RegExp(`[${LETTER}]{4,}`, "g");
    let m;
    while ((m = tokenRe.exec(out))) {
      const token = m[0];
      const start = m.index;
      if (inside(ranges, start) || inside(ranges, start + token.length - 1)) continue;
      if (isCaps(token)) continue; // « CHAPITRE » : jamais découpé
      let touched = false;
      // 4a. « bonjourMonde » → « bonjour Monde » : la majuscule ouvre un mot et
      //     le fragment de gauche est un mot connu (ou 2 lettres + mot connu).
      if (on("case")) {
        let prev = 0;
        for (let i = 1; i < token.length - 1; i += 1) {
          if (!isLowerCh(token[i - 1]) || !isUpperCh(token[i]) || !isLowerCh(token[i + 1])) continue;
          const abs = start + i;
          if (inside(ranges, abs)) continue;
          // Fin du fragment droit : fin d'une marque protégée, sinon prochaine
          // majuscule interne (« bonjourMonCherAmi ») ou fin du jeton.
          const kr = ranges.find(([a, b]) => abs >= a && abs < b);
          let endAbs;
          if (kr) endAbs = kr[1];
          else {
            endAbs = start + token.length;
            for (let abs2 = abs + 1; abs2 <= start + token.length - 3; abs2 += 1) {
              if (inside(ranges, abs2)) { endAbs = abs2; break; }
              const k = abs2 - start;
              if (isLowerCh(token[k - 1]) && isUpperCh(token[k]) && isLowerCh(token[k + 1])) { endAbs = abs2; break; }
            }
          }
          const left = token.slice(prev, i);
          const frag = token.slice(i, endAbs - start);
          // LES DEUX fragments doivent être des mots connus : un identifiant
          // technique (« withTransaction », « localStorage ») n'est pas touché.
          const okMain = left.length >= 3 && known(left) && frag.length >= 3 && known(frag);
          const okShort = left.length === 2 && SHORT_WORDS.has(norm(left)) && frag.length >= 4 && known(frag);
          if (!okMain && !okShort) continue;
          edits.push({ at: abs, text: " " });
          add("case", `${left}${frag}`, `${left} ${frag}`);
          touched = true;
          prev = i;
          i = endAbs - start - 1;
        }
      }
      // 4b. Deux mots français agglutinés sans majuscule ni tiret :
      //     « intelligenceartificielle » → « intelligence artificielle ».
      if (on("long") && !touched && token.length >= 12 && !known(token)) {
        const mid = Math.floor(token.length / 2);
        for (let d = 0; d <= token.length; d += 1) {
          let done = false;
          for (const cut of [mid + d, mid - d]) {
            if (cut < 5 || cut > token.length - 5) continue;
            const a = token.slice(0, cut);
            const b = token.slice(cut);
            if (!DICT.has(norm(a)) || !DICT.has(norm(b))) continue;
            edits.push({ at: start + cut, text: " " });
            add("long", token, `${a} ${b}`);
            done = true;
            break;
          }
          if (done) break;
        }
      }
      // Découpe le jeton aux positions RELATIVES `cuts` (un espace après chaque
      // morceau) — partagé par la règle 4c (mots-outils) et la règle 4d
      // (comparatif sur le vocabulaire du document).
      const applyCuts = (rule, cuts) => {
        let at = start;
        const words = [];
        let rest = token;
        for (const cut of cuts) {
          at += cut;
          edits.push({ at, text: " " });
          words.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        words.push(rest);
        add(rule, token, words.join(" "));
        touched = true;
      };
      // 4c. Mots agglutinés COURTS ou MULTIPLES (« lesmots », « nosclientssont
      //     satisfaits ») : découpage en chaîne, ancré sur un mot-outil en tête.
      if (on("long") && !touched && !known(token)) {
        const cuts = splitChain(token) || splitTail(token);
        if (cuts) applyCuts("long", cuts);
      }
      // 4d. COMPARATIF : le jeton est absent du dictionnaire mais ses morceaux
      //     sont des MOTS DU DOCUMENT (texte d'origine et/ou pages) — attrape le
      //     vocabulaire métier, les noms propres et les sigles que le
      //     dictionnaire général ignore.
      if (on("ref") && reference && !touched && !known(token)) {
        const cuts = splitByReference(token, reference);
        if (cuts) applyCuts("ref", cuts);
      }
    }
    if (edits.length) {
      const seen = new Set();
      for (const e of edits.slice().sort((a, b) => b.at - a.at)) {
        if (seen.has(e.at)) continue;
        seen.add(e.at);
        out = out.slice(0, e.at) + e.text + out.slice(e.at);
      }
    }
  }

  // 5. Chiffres collés aux lettres : « 5000francs », « chapitre10 ».
  //    Les ordinaux (« 10ème », « 1er ») et les URL sont préservés ; la partie
  //    lettres doit être un mot français connu ou un sigle (« 5000FCFA ») —
  //    sans cela « 360dialog » ou « 4kvideo » seraient coupés à tort.
  if (on("digit")) {
    const ranges = protectedRanges(out);
    out = out.replace(new RegExp(`(\\d{2,})([${LETTER}]{3,})`, "g"), (m, d, w, off) => {
      if (inside(ranges, off) || ORDINAL.test(w)) return m;
      if (!(isCaps(w) || known(w) || KEEP_LOWER.has(norm(w)))) return m;
      add("digit", m, `${d} ${w}`);
      return `${d} ${w}`;
    });
    const ranges2 = protectedRanges(out);
    out = out.replace(new RegExp(`([${LOWER}]{4,})(\\d{1,})`, "g"), (m, w, d, off) => {
      if (inside(ranges2, off) || insideEntity(out, off)) return m;
      // Le JETON entier est examiné : « base64 » doit rester intact alors que
      // le motif ne capture que « base6 ».
      let a = off;
      let b = off + m.length;
      const wordish = new RegExp(`[0-9${LETTER}]`);
      while (a > 0 && wordish.test(out[a - 1])) a -= 1;
      while (b < out.length && wordish.test(out[b])) b += 1;
      const token = out.slice(a, b);
      if (KEEP_LOWER.has(norm(token))) return m; // « base64 », « sha256 »…
      if (!known(w)) return m; // « v327 », « 4kvideo »…
      add("digit", m, `${w} ${d}`);
      return `${w} ${d}`;
    });
  }

  // 6. Apostrophes perdues les plus courantes : « aujourdhui ».
  if (on("apos")) {
    for (const { re, to } of APOS_FIXES) {
      re.lastIndex = 0;
      out = out.replace(re, (m) => {
        const good = /^[A-ZÀ-ÖØ-Þ]/.test(m) ? capFirst(to) : to;
        add("apos", m, good);
        return good;
      });
    }
  }

  return { text: out, fixes };
}


// ─── HTML, éléments du Studio, pages, champs du document ────────────────────
/**
 * Corrige le TEXTE d'un fragment HTML. Les balises et leurs attributs sont
 * recopiés tels quels (seuls les nœuds de texte sont analysés) : le HTML riche
 * du Studio (`<strong>`, listes, liens, images…) reste intact.
 */
export function fixGluedInHtml(html, opts = {}) {
  const src = String(html == null ? "" : html);
  if (!src) return { html: src, fixes: [] };
  const fixes = [];
  let out = "";
  let i = 0;
  const re = /<[^>]*>/g;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > i) {
      const r = fixGluedText(src.slice(i, m.index), opts);
      out += r.text;
      fixes.push(...r.fixes);
    }
    out += m[0];
    i = m.index + m[0].length;
  }
  if (i < src.length) {
    const r = fixGluedText(src.slice(i), opts);
    out += r.text;
    fixes.push(...r.fixes);
  }
  return { html: out, fixes };
}

/**
 * Corrige un ÉLÉMENT du Studio : son texte (`html`) et les données textuelles
 * (tableau, sommaire, graphique, diagramme, statistiques, libellé du QR).
 * Renvoie `{ patch, fixes }` — `patch` est vide s'il n'y a rien à corriger.
 */
export function fixGluedInElement(el, opts = {}) {
  const fixes = [];
  const patch = {};
  if (typeof el?.html === "string" && el.html) {
    const r = fixGluedInHtml(el.html, opts);
    if (r.fixes.length) {
      patch.html = r.html;
      fixes.push(...r.fixes);
    }
  }
  const d = el?.data;
  if (d && typeof d === "object") {
    const next = { ...d };
    let touched = false;
    const fixText = (v) => {
      if (typeof v !== "string" || !v) return v;
      const r = fixGluedText(v, opts);
      if (!r.fixes.length) return v;
      fixes.push(...r.fixes);
      touched = true;
      return r.text;
    };
    if (Array.isArray(d.rows)) {
      next.rows = d.rows.map((row) =>
        Array.isArray(row) ? row.map((c) => (c && typeof c === "object" ? { ...c, text: fixText(c.text) } : c)) : row
      );
    }
    if (Array.isArray(d.entries)) next.entries = d.entries.map((e) => (e && typeof e === "object" ? { ...e, text: fixText(e.text) } : e));
    if (Array.isArray(d.series)) next.series = d.series.map((s) => (s && typeof s === "object" ? { ...s, label: fixText(s.label) } : s));
    if (Array.isArray(d.nodes)) next.nodes = d.nodes.map((n) => (n && typeof n === "object" ? { ...n, text: fixText(n.text) } : n));
    if (Array.isArray(d.items)) {
      next.items = d.items.map((n) => (n && typeof n === "object" ? { ...n, label: fixText(n.label), value: fixText(n.value) } : n));
    }
    if (typeof d.title === "string") next.title = fixText(d.title);
    if (typeof d.label === "string") next.label = fixText(d.label);
    if (touched) patch.data = next;
  }
  return { patch, fixes };
}

/**
 * Corrige TOUTES les pages du Studio. Renvoie les changements à appliquer
 * (`changes` = un par élément concerné, avec le patch et le détail des
 * corrections) et le nombre total de corrections — l'appelant décide quand
 * appliquer (historique, sauvegarde, annulation).
 */
export function fixGluedInPages(pages, opts = {}) {
  const changes = [];
  let count = 0;
  for (const page of Array.isArray(pages) ? pages : []) {
    for (const el of page?.elements || []) {
      const { patch, fixes } = fixGluedInElement(el, opts);
      if (!fixes.length) continue;
      changes.push({ pageId: page.id, elId: el.id, patch, fixes });
      count += fixes.length;
    }
  }
  return { changes, count };
}

/** Applique les changements renvoyés par `fixGluedInPages` (copie des pages). */
export function applyGluedChanges(pages, changes) {
  if (!changes?.length) return pages;
  const byPage = new Map();
  for (const c of changes) {
    if (!byPage.has(c.pageId)) byPage.set(c.pageId, new Map());
    byPage.get(c.pageId).set(c.elId, c.patch);
  }
  return (pages || []).map((p) => {
    const els = byPage.get(p.id);
    if (!els) return p;
    return {
      ...p,
      elements: (p.elements || []).map((el) => (els.has(el.id) ? { ...el, ...els.get(el.id) } : el)),
    };
  });
}

/**
 * Corrige les champs TEXTE du document (titre, sous-titre, auteur, couverture
 * et quatrième de couverture) : sans cela, une couverture régénérée depuis ces
 * métadonnées réafficherait les mots collés.
 */
export function fixGluedDoc(docMeta, opts = {}) {
  const src = docMeta || {};
  const patch = {};
  const fixes = [];
  const fixField = (value) => {
    if (typeof value !== "string" || !value) return value;
    const r = fixGluedText(value, opts);
    if (!r.fixes.length) return value;
    fixes.push(...r.fixes);
    return r.text;
  };
  for (const k of ["title", "subtitle", "author"]) {
    const v = fixField(src[k]);
    if (v !== src[k]) patch[k] = v;
  }
  for (const k of ["cover", "back_cover"]) {
    const c = src[k];
    if (!c || typeof c !== "object") continue;
    const next = { ...c };
    let touched = false;
    for (const f of ["title", "subtitle", "author", "tagline", "text"]) {
      const v = fixField(c[f]);
      if (v !== c[f]) {
        next[f] = v;
        touched = true;
      }
    }
    if (touched) patch[k] = next;
  }
  return { patch, fixes, count: fixes.length };
}
