// Reconstruction automatique des TABLEAUX à partir d'un texte copié.
//
// Le problème visé : un tableau copié depuis un PDF, un aperçu, un logiciel
// qui n'expose pas de HTML → le presse-papiers ne transporte que le TEXTE, les
// colonnes arrivent « à plat », séparées par des tabulations, des barres
// verticales, plusieurs espaces ou des points-virgules. Ce module repère ces
// blocs et les reconstruit en vraies lignes/colonnes.
//
// UNE SEULE vérité, partagée par les trois entrées du Générateur :
//   1. l'import TXT/Markdown (structure.js → detectStructureHtml) ;
//   2. le collage dans l'éditeur (headings.js → HeadingAutoDetect) ;
//   3. la passe « 🔳 Détecter les tableaux » (formatTables, ruban du haut).
//
// Séparateurs reconnus, par ordre de priorité :
//   - tabulation        → tableur / « texte non formaté » (une cellule vide du
//                         tableur donne une tabulation de plus) ;
//   - barre verticale   → tableaux Markdown (| a | b |) et texte « a | b » ;
//   - 2 espaces ou plus → tableaux de PDF (colonnes alignées) ; une cellule
//                         repliée sur la ligne suivante est RECOLLÉE et une
//                         ligne de tirets (soulignement d'en-tête) est consommée ;
//   - point-virgule     → CSV « ; » ;
//   - UNE seule espace  → copie de PDF/HTML « aplatie » (dernier recours) :
//                         même nombre de mots sur toutes les lignes et colonne
//                         numérique fiable — les milliers groupés (« 3 663 000 »)
//                         restent une seule cellule.
//
// LÉGENDE « Tableau … » (détection PAR MOT) : une ligne qui COMMENCE par
// « Tableau », « Tableaux », « Table », « Tab. » (éventuellement numérotée
// « 2. Tableau », « Annexe 3 — Tableau ») annonce un tableau : le bloc qui
// suit est alors détecté avec des règles ASSOUPLIES (dès 2 lignes, cellules
// jusqu'à 90 caractères, tableau de libellés sans aucun chiffre, cellules
// moins courtes) — les garde-fous de fond restent (pas de ponctuation de
// phrase, colonnes de même largeur, libellés capitalisés, pas de colonnes
// entièrement répétées).
//
// GARDE-FOUS ANTI-PROSE (un paragraphe n'est JAMAIS transformé en tableau) :
//   - les séparateurs « risqués » (espaces, « ; ») exigent au moins 3 lignes,
//     des cellules courtes, aucune cellule terminée par une ponctuation de
//     phrase, et un signal tabulaire (colonne numérique, cellules très courtes,
//     majuscules systématiques ou en-tête repérable) ;
//   - les colonnes espacées doivent être ALIGNÉES : les cellules d'une même
//     colonne commencent (ou finissent) à la même position — mesurée sur 75 %
//     des lignes, pour qu'une seule ligne qui dérape ne fasse pas tout échouer ;
//   - la détection à UNE espace est la plus prudente : nombre de mots identique
//     sur toutes les lignes, colonne numérique (au-delà de la première) à
//     valeurs distinctes, libellés capitalisés ou en-tête, et rejet des
//     colonnes entièrement répétées (signature d'un texte de prose) ;
//   - tabulation et barre verticale sont tenues pour fiables : elles
//     n'apparaissent pas dans de la prose.
//
// Module PUR (aucun accès DOM) : testé sous Node par tmp-tables-test.mjs et
// utilisable aussi bien par l'import que par l'éditeur.

// Espaces typographiques (copie de PDF français : insécables, fines…) traités
// comme des espaces ordinaires — sans quoi « 3 663 000 » ou des colonnes
// issues d'InDesign ne se découpent pas. Les caractères invisibles (BOM,
// largeur nulle) ajoutés par certains PDF sont supprimés.
const UNICODE_SPACES_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
const TABS_RE = /\t/g;
const PIPES_RE = /\|/g;
const MULTISPACE_RE = /\s{2,}/g;
const ANY_SPACE_RE = /\s+/g; // découpage « une espace » (copie aplatie)
const SEMICOLON_RE = /;/g;
const HAS_MULTISPACE_RE = /\s\s/; // test non global (pas de lastIndex)
const MD_RULE_RE = /^:?[-–—_=]{2,}:?$/; // « |---|---| », « --- », soulignement
const BARE_RULE_RE = /^[-–—_=]{2,}$/; // ligne faite UNIQUEMENT de tirets
const SENTENCE_END_RE = /[.!?]$/; // fin de phrase → cellule de prose
const NUMBER_CELL_RE = /^[+-]?[\d\s.,'’]*\d[\d\s.,'’%:/°+-]*$/;
const MONEY_SUFFIX_RE = /(%|€|\$|FCFA|XAF|XOF|USD|EUR|CHF|F)\s*$/i;
// Jeton d'un nombre (« 250 », « 3 663 ») et unité accolée (« 12 % », « 5 kg ») :
// ils servent à recoller les milliers groupés d'une copie de PDF.
const NUMERIC_TOKEN_RE = /^[+-]?\d+(?:[.,]\d+)?$/;
const UNIT_TOKEN_RE =
  /^(%|‰|€|\$|£|FCFA|XAF|XOF|USD|EUR|CHF|CAD|F|kg|g|km²|km|m²|m|cm|mm|L|cl|ml|h|min|s|ans?|jours?|mois|semaines?)$/i;

// Longueur au-delà de laquelle une cellule n'est plus une cellule de tableau
// mais un morceau de paragraphe (garde anti-prose des séparateurs risqués).
const PROSE_CELL_MAX = 60;
// Idem pour la détection à UNE seule espace — plus stricte encore.
const SINGLE_CELL_MAX = 45;
// Sonde de coût (séparateurs risqués) : une cellule plus longue que cela ou
// terminée par une ponctuation de phrase est de la PROSE — inutile de scanner
// la suite du document depuis cette ligne (condition nécessaire, donc jamais de
// tableau valide perdu). `PROBE_DEPTH` : profondeur de la sonde d'un bloc
// candidat (un début de bloc qui n'est toujours pas tabulaire au bout de ces
// lignes ne le deviendra pas) ; `MAX_RUN_ROWS` : plafond d'un bloc.
const PROBE_CELL_MAX = 60;
const PROBE_DEPTH = 16;
const MAX_RUN_ROWS = 400;
// Légende de tableau (détection PAR MOT) : la ligne COMMENCE par le mot-clé
// (éventuellement précédé d'un numéro « 2. », « 2.1 », d'un « Annexe N »).
// Le bloc suivant est détecté avec des règles assouplies (voir `caption`).
const TABLE_CAPTION_RE =
  /^(?:(?:\d{1,3}(?:\.\d{1,3})*[.)]?|annexe\s*\d{0,3})\s*[:—–-]?\s*)?(?:tableaux?|tables?|tabl?\.?)\b/i;
// En mode légende, une cellule peut aller jusqu'à cette longueur (au lieu de
// 45-60 caractères) : un tableau annoncé peut porter des libellés plus longs.
const CAPTION_CELL_MAX = 90;

// Règles par séparateur : nombre de lignes minimal, longueur maximale d'une
// cellule, proportion de cellules remplies, contrôles supplémentaires.
// `continuation` : la ligne suivante sans séparateur peut être la suite
// repliée d'une cellule (copie de PDF) et est alors recollée à celle-ci.
// `probe` : abandon immédiat dès qu'une ligne ressemble à une phrase.
const RULES = {
  tab: { minRows: 2, maxCell: 200, minFill: 0.5 },
  pipe: { minRows: 2, maxCell: 200, minFill: 0.5 },
  space: {
    minRows: 3,
    maxCell: PROSE_CELL_MAX,
    minFill: 0.75,
    risky: true,
    aligned: true,
    continuation: true,
    probe: true,
  },
  semicolon: { minRows: 3, maxCell: PROSE_CELL_MAX, minFill: 0.75, risky: true },
  space1: { minRows: 3, maxCell: SINGLE_CELL_MAX, minFill: 0.9, risky: true, probe: true },
};

// Ordre d'essai des séparateurs : du plus fiable au plus ambigu.
const KINDS = ["tab", "pipe", "space", "semicolon", "space1"];

export function normalizeTableLine(raw) {
  return String(raw ?? "")
    .replace(/\r/g, "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(/[\f\v]/g, " ")
    .replace(UNICODE_SPACES_RE, " ");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Cellule « donnée » : nombre, montant, quantité, pourcentage, date… Sert à
// repérer un en-tête posé au-dessus de valeurs et à écarter la prose.
export function looksNumeric(cell) {
  const s = String(cell ?? "").trim();
  if (!/\d/.test(s)) return false;
  return NUMBER_CELL_RE.test(s.replace(MONEY_SUFFIX_RE, "").trim());
}

// Découpe une ligne selon un séparateur donné en conservant, pour chaque
// cellule, sa position dans la ligne (colonnes 0-based) : c'est cette position
// qui permet de vérifier l'ALIGNEMENT des colonnes d'un tableau de PDF.
function splitLine(line, re) {
  const parts = [];
  re.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (!m[0].length) break;
    parts.push({ raw: line.slice(last, m.index), start: last });
    last = m.index + m[0].length;
  }
  parts.push({ raw: line.slice(last), start: last });
  return parts.map((p) => {
    const text = p.raw.trim();
    const lead = p.raw.length - p.raw.trimStart().length;
    return { text, start: p.start + lead, end: p.start + lead + text.length };
  });
}

// Un nombre écrit avec des espaces (« 3 663 000 ») arrive en plusieurs jetons :
// on recolle les jetons numériques consécutifs en UNE cellule (ainsi que
// l'unité qui les suit : « 12 % »). Deux lectures restent donc possibles pour
// une ligne donnée — « 3 663 000 » = 1 cellule ou 3 cellules : la détection à
// une espace essaie les deux et garde celle qui donne le même nombre de
// colonnes sur tout le bloc.
function mergeNumberGroups(parts) {
  const out = [];
  let run = null; // cellule numérique en cours d'assemblage
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const next = parts[i + 1];
    if (NUMERIC_TOKEN_RE.test(p.text)) {
      // « 210 km² » : le jeton suivant est une UNITÉ — le nombre qui le précède
      // commence alors un nouveau nombre (il ne complète pas le groupe de trois
      // chiffres que le run vient de fermer)… sauf s'il complète exactement une
      // tête courte : dans « 800 000 FCFA », « 000 » complète bien « 800 ».
      const unitNext = !!next && UNIT_TOKEN_RE.test(next.text);
      const completesRun = run && !(unitNext && run.text.includes(" "));
      if (completesRun) {
        run.text = `${run.text} ${p.text}`;
        run.end = p.end;
      } else {
        run = { text: p.text, start: p.start, end: p.end };
        out.push(run);
      }
      continue;
    }
    if (run && UNIT_TOKEN_RE.test(p.text)) {
      run.text = `${run.text} ${p.text}`; // « 12 % », « 5 kg », « 210 km² »
      run.end = p.end;
      run = null;
      continue;
    }
    run = null;
    out.push({ text: p.text, start: p.start, end: p.end });
  }
  return out;
}

// Cellules d'une ligne pour un type de séparateur donné, ou null si la ligne
// ne peut pas être une ligne de tableau de ce type.
function cellsFor(kind, line) {
  if (kind === "tab") {
    // Séparateur EXACT : « a\t\tc » = 3 cellules dont une vide (format du
    // tableur pour une cellule vide) — une suite de tabulations ne doit pas
    // être écrasée en une seule.
    if (!line.includes("\t")) return null;
    return splitLine(line, TABS_RE);
  }
  if (kind === "pipe") {
    if (!line.includes("|")) return null;
    let s = line;
    let base = 0;
    if (s.startsWith("|")) {
      s = s.slice(1);
      base = 1;
    }
    if (s.endsWith("|")) s = s.slice(0, -1);
    return splitLine(s, PIPES_RE).map((c) => ({
      text: c.text,
      start: c.start + base,
      end: c.end + base,
    }));
  }
  if (kind === "space") {
    if (!HAS_MULTISPACE_RE.test(line)) return null;
    return splitLine(line, MULTISPACE_RE);
  }
  if (kind === "semicolon") {
    if (!line.includes(";")) return null;
    return splitLine(line, SEMICOLON_RE);
  }
  if (kind === "space1") {
    if (!/\s/.test(line)) return null;
    return mergeNumberGroups(splitLine(line, ANY_SPACE_RE));
  }
  return null;
}

// ─── Validation d'un bloc candidat ─────────────────────────────────────────

// Étendue d'une majorité (75 %) de valeurs : une seule ligne qui « dérape »
// ne fait plus échouer l'alignement d'une colonne de PDF.
function spreadMajority(values, ratio = 0.75) {
  const sorted = [...values].sort((a, b) => a - b);
  const keep = Math.max(2, Math.ceil(sorted.length * ratio));
  if (sorted.length <= keep) return sorted[sorted.length - 1] - sorted[0];
  let best = Infinity;
  for (let i = 0; i + keep - 1 < sorted.length; i += 1) {
    best = Math.min(best, sorted[i + keep - 1] - sorted[i]);
  }
  return best;
}

// Nombre de colonnes dont les cellules sont alignées (mêmes débuts ou mêmes
// fins pour la majorité des lignes). C'est le signal décisif des tableaux de
// PDF : dans de la prose, deux espaces tombent à des endroits différents à
// chaque ligne. Une colonne trop peu remplie compte comme neutre (elle
// n'apporte ni preuve ni contre-preuve) et une cellule recollée (suite d'une
// ligne repliée) n'apporte pas de fin fiable.
function alignedColumns(rows, offsets) {
  const n = rows[0].length;
  let aligned = 0;
  for (let c = 0; c < n; c += 1) {
    const starts = [];
    const ends = [];
    for (let r = 0; r < rows.length; r += 1) {
      const off = offsets[r][c];
      if (!rows[r][c] || !off || off.start < 0) continue;
      starts.push(off.start);
      if (off.end >= 0) ends.push(off.end);
    }
    if (starts.length < 2) {
      aligned += 1;
      continue;
    }
    if (spreadMajority(starts) <= 5) aligned += 1;
    else if (ends.length >= 2 && spreadMajority(ends) <= 4) aligned += 1;
  }
  return aligned;
}

// Colonnes dont TOUTES les valeurs sont identiques (ligne d'en-tête comprise) :
// deux telles colonnes ou plus dans un petit tableau trahissent de la prose
// (mots répétés en fin de phrase) plutôt qu'un vrai tableau.
function identicalColumns(rows) {
  const n = rows[0].length;
  let count = 0;
  for (let c = 0; c < n; c += 1) {
    const first = rows[0][c];
    if (rows.every((r) => r[c] === first)) count += 1;
  }
  return count;
}

// Part des cellules qui commencent par une majuscule ou un chiffre : un
// tableau de libellés est capitalisé (« Ville », « Population »), de la prose
// écrasée sur deux espaces a ses cellules en minuscules (« monde », « planète »).
function capitalizedRatio(cells) {
  const filled = cells.filter((c) => c !== "");
  if (!filled.length) return 0;
  const caps = filled.filter((c) => /^[A-ZÀ-ÖØ-Þ0-9]/.test(c)).length;
  return caps / filled.length;
}

// La première ligne est-elle un en-tête (libellés au-dessus de valeurs) ?
export function looksLikeHeaderRow(row, rest) {
  if (!row.length || !rest.length) return false;
  if (row.some((c) => !c || c.length > 30)) return false;
  if (row.some((c) => SENTENCE_END_RE.test(c))) return false;
  if (row.some(looksNumeric)) return false;
  const numericRows = rest.filter((r) => r.some(looksNumeric)).length;
  return numericRows >= Math.ceil(rest.length / 2) || row.every((c) => c.length <= 20);
}

function validBlock(rows, offsets, kind, flags, caption = false) {
  const rule = RULES[kind];
  const cells = rows.flat();
  // Cellules complétées par une ligne de continuation : leur ponctuation
  // finale et leur longueur viennent du texte d'origine, pas d'une phrase.
  const merged = flags ? flags.flat() : [];
  const relaxed = (idx) => merged[idx] === true;
  // Mode légende (« Tableau 3 : … ») : le tableau est annoncé, les seuils de
  // forme sont assouplis — jamais les garde-fous de fond (ponctuation de
  // phrase, alignement, colonnes répétées).
  const maxCell = caption ? Math.max(rule.maxCell, CAPTION_CELL_MAX) : rule.maxCell;
  const minFill = caption ? Math.min(rule.minFill, 0.6) : rule.minFill;
  const filled = cells.filter((c) => c !== "").length;
  if (filled < Math.ceil(cells.length * minFill)) return false;
  if (cells.some((c, idx) => c.length > maxCell && !relaxed(idx))) return false;
  if (rule.aligned && alignedColumns(rows, offsets) < Math.min(2, rows[0].length)) return false;
  if (rule.risky) {
    // Une phrase se termine par un point : jamais une cellule de tableau.
    if (cells.some((c, idx) => SENTENCE_END_RE.test(c) && !relaxed(idx))) return false;
    const dataRows = rows.filter((r) => r.some(looksNumeric)).length;
    const shortCells = cells.every((c) => c.length <= 22);
    const caps = capitalizedRatio(cells);
    if (caption) {
      // Bloc annoncé par une légende : des libellés capitalisés suffisent.
      if (dataRows === 0 && caps < 0.3) return false;
    } else if (dataRows === 0 && !shortCells && !looksLikeHeaderRow(rows[0], rows.slice(1))) {
      return false;
    } else if (kind === "space" && dataRows === 0 && caps < 0.6) {
      return false;
    }
  }
  // Une ligne sans aucune cellule remplie terminerait le tableau.
  return rows.every((r) => r.some((c) => c !== ""));
}

// ─── Collecte d'un bloc candidat ───────────────────────────────────────────

// Ligne faite uniquement de tirets (« ----- », « ____ ») : soulignement
// d'en-tête ou bordure de tableau (très fréquent dans les copies de PDF) —
// consommée, jamais une ligne de données.
function isBareRuleLine(line) {
  return BARE_RULE_RE.test(line);
}

// Une cellule peut se replier sur la ligne suivante (copie de PDF) : la ligne
// recollée commence à la verticale de la cellule qu'elle poursuit et débute
// par une minuscule (« … de la région » poursuit « La population de la »).
// Sans cette règle, une seule cellule longue coupait tout le tableau.
function mergeContinuation(rows, offsets, flags, text, lead) {
  const last = offsets[offsets.length - 1];
  if (!last) return false;
  if (text.length > 90) return false;
  if (!/^[a-zà-öø-ÿ0-9(«"'’\-–—]/.test(text)) return false;
  let col = -1;
  let distance = Infinity;
  for (let c = 0; c < last.length; c += 1) {
    const off = last[c];
    if (!off || off.start < 0) continue;
    const d = Math.abs(off.start - lead);
    if (d < distance) {
      distance = d;
      col = c;
    }
  }
  if (col < 0 || distance > 8) return false;
  const row = rows[rows.length - 1];
  const joined = row[col] ? `${row[col]} ${text}` : text;
  if (joined.length > 240) return false;
  row[col] = joined;
  flags[flags.length - 1][col] = true;
  offsets[offsets.length - 1][col] = { start: last[col].start, end: -1 };
  return true;
}

// Sonde de coût : une cellule de phrase (ponctuation finale) ou trop longue
// élimine le bloc. C'est une condition NÉCESSAIRE des garde-fous anti-prose —
// la vérifier tôt évite de scanner tout le document depuis chaque ligne
// (les textes à lignes uniformes étaient sinon parcourus en O(n²)).
function probeCells(cells) {
  return !cells.some((c) => c && (c.length > PROBE_CELL_MAX || SENTENCE_END_RE.test(c)));
}

function collectRun(lines, start, kind, { continuation = false, limit = MAX_RUN_ROWS } = {}) {
  const rows = [];
  const offsets = [];
  const flags = [];
  const lineIndexes = [];
  const probe = !!RULES[kind].probe;
  let headerRule = false; // règle Markdown « |---|---| » juste après la 1re ligne
  let lastRuleLine = null;
  let i = start;
  while (i < lines.length && rows.length < limit) {
    const raw = normalizeTableLine(lines[i]);
    const line = raw.trim();
    if (!line) break;
    if (isBareRuleLine(line)) {
      if (!rows.length) break; // soulignement sans tableau au-dessus
      if (rows.length === 1) headerRule = true;
      else break; // bordure de fin : rendue au document (trait horizontal)
      lastRuleLine = i;
      i += 1;
      continue;
    }
    const cells = cellsFor(kind, line);
    if (!cells || cells.length < 2) {
      // Ligne sans séparateur : peut-être la SUITE repliée de la cellule
      // précédente — recollée, jamais ajoutée comme ligne.
      if (continuation && rows.length) {
        const lead = raw.length - raw.trimStart().length;
        if (mergeContinuation(rows, offsets, flags, line, lead)) {
          i += 1;
          continue;
        }
      }
      break;
    }
    // Ligne de règle écrite avec le séparateur (« ---  --- », « |---|---| ») :
    // elle sépare l'en-tête des données (l'en-tête est reconstruit depuis les
    // cellules <th>), jamais une ligne du tableau.
    if (cells.every((c) => MD_RULE_RE.test(c.text))) {
      if (!rows.length) break; // règle sans en-tête au-dessus : pas un tableau
      if (rows.length === 1) headerRule = true;
      lastRuleLine = i;
      i += 1;
      continue;
    }
    rows.push(cells.map((c) => c.text));
    offsets.push(cells.map((c) => ({ start: c.start, end: c.end })));
    flags.push(cells.map(() => false));
    lineIndexes.push(i);
    if (probe && !probeCells(rows[rows.length - 1])) break;
    i += 1;
  }
  return {
    rows,
    offsets,
    flags,
    lineIndexes,
    headerRule,
    lastRuleLine,
    end: i,
    hitLimit: rows.length >= limit,
  };
}

// Largeur (nombre de colonnes) la plus fréquente du bloc — pas forcément celle
// de la première ligne.
function modeOf(values) {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  let best = 0;
  let bestCount = 0;
  for (const [v, n] of count) {
    if (n > bestCount || (n === bestCount && v > best)) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

// Deux lignes seulement : accepté UNIQUEMENT sur un signal fort — la seconde
// porte des données numériques et les colonnes sont alignées. Une double
// espace dans deux phrases ne suffit jamais.
function strongTwoRowSpace(rows, offsets) {
  if (rows.length !== 2) return false;
  if (rows[0].some((c) => !c || c.length > 30)) return false;
  if (!rows[1].some(looksNumeric)) return false;
  return alignedColumns(rows, offsets) >= Math.min(2, rows[0].length);
}

// Assemblage d'un bloc candidat : largeur de référence = mode des lignes (une
// ligne qui a perdu sa DERNIÈRE colonne vide est complétée à droite — cas très
// fréquent dans les PDF), puis garde-fous anti-prose. null = bloc rejeté.
function assembleSpaceBlock(run, kind, minRows, caption = false) {
  const mode = modeOf(run.rows.map((r) => r.length));
  if (mode < 2) return null;
  const rows = [];
  const offsets = [];
  const flags = [];
  for (let k = 0; k < run.rows.length; k += 1) {
    const r = run.rows[k];
    if (r.length === mode) {
      rows.push(r);
      offsets.push(run.offsets[k]);
      flags.push(run.flags[k]);
    } else if (r.length === mode - 1) {
      rows.push([...r, ""]);
      offsets.push([...run.offsets[k], { start: -1, end: -1 }]);
      flags.push([...run.flags[k], false]);
    } else {
      break; // largeur franchement différente : le tableau s'arrête ici
    }
  }
  const strongTwo = kind === "space" && !caption && strongTwoRowSpace(rows, offsets);
  if (rows.length < minRows && !strongTwo) return null;
  if (!validBlock(rows, offsets, kind, flags, caption)) return null;
  return { rows, offsets };
}

function blockForKind(lines, start, kind, minRows, caption = false) {
  const firstLine = normalizeTableLine(lines[start]).trim();
  const first = cellsFor(kind, firstLine);
  if (!first || first.length < 2) return null;
  const continuation = !!RULES[kind].continuation;
  const sonde = !!RULES[kind].probe;
  // 1) Sonde courte : un bloc qui n'est toujours pas tabulaire au bout de
  //    PROBE_DEPTH lignes ne le deviendra pas — sans elle, les textes à lignes
  //    uniformes étaient parcourus en O(n²) (plusieurs secondes).
  let run = collectRun(lines, start, kind, {
    continuation,
    limit: sonde ? PROBE_DEPTH : MAX_RUN_ROWS,
  });
  let block = run.rows.length ? assembleSpaceBlock(run, kind, minRows, caption) : null;
  if (sonde && run.hitLimit) {
    if (!block) return null; // sonde non concluante : rien à faire ici
    // 2) Sonde concluante : on collecte le bloc entier (plafonné) et on valide.
    run = collectRun(lines, start, kind, { continuation, limit: MAX_RUN_ROWS });
    block = assembleSpaceBlock(run, kind, minRows, caption);
  }
  if (!block) return null;

  // Fin du bloc : la dernière ligne retenue, règle Markdown comprise si elle
  // tombe dans le tableau.
  let end = run.lineIndexes[block.rows.length - 1] + 1;
  if (run.lastRuleLine !== null) end = Math.max(end, run.lastRuleLine + 1);

  return {
    rows: block.rows,
    offsets: block.offsets,
    separator: kind,
    header: run.headerRule || looksLikeHeaderRow(block.rows[0], block.rows.slice(1)),
    end,
  };
}

// ─── Détection à UNE seule espace (copie de PDF/HTML « aplatie ») ───────────
// Dernier recours : quand le presse-papiers ne transporte plus qu'une espace
// entre les colonnes. Deux lectures d'une même ligne sont possibles — chaque
// jeton = une colonne, ou milliers groupés recollés (« 3 663 000 » = une
// cellule). On garde celle qui donne le MÊME nombre de colonnes sur le plus
// grand nombre de lignes, et la lecture recollée à égalité (un nombre groupé
// est plus probable que deux colonnes numériques collées).

// Découpage « une espace » de TOUTES les lignes, mémorisé par tableau de lignes
// (les mêmes lignes sont réanalysées depuis chaque position : import, bouton 🔳,
// collage). Les deux lectures possibles (jetons bruts / milliers recollés) sont
// préparées d'avance. WeakMap : rien n'est retenu quand le tableau de lignes est
// libéré.
const singleSpaceCache = new WeakMap();

function singleSpaceTable(lines) {
  let table = singleSpaceCache.get(lines);
  if (table) return table;
  table = lines.map((raw) => {
    const line = normalizeTableLine(raw).trim();
    if (!line) return null;
    const split = splitLine(line, ANY_SPACE_RE);
    const grouped = mergeNumberGroups(splitLine(line, ANY_SPACE_RE));
    return {
      raw: {
        cells: split.map((c) => c.text),
        offsets: split.map((c) => ({ start: c.start, end: c.end })),
      },
      grouped: {
        cells: grouped.map((c) => c.text),
        offsets: grouped.map((c) => ({ start: c.start, end: c.end })),
      },
    };
  });
  singleSpaceCache.set(lines, table);
  return table;
}

function collectSingleSpace(lines, start, variant, limit = MAX_RUN_ROWS) {
  const table = singleSpaceTable(lines);
  const rows = [];
  const offsets = [];
  let count = 0;
  let headerRule = false;
  let lastRuleLine = null;
  let i = start;
  while (i < lines.length && rows.length < limit) {
    const line = normalizeTableLine(lines[i]).trim();
    if (!line) break;
    if (isBareRuleLine(line)) {
      if (!rows.length) break;
      if (rows.length === 1) headerRule = true;
      else break;
      lastRuleLine = i;
      i += 1;
      continue;
    }
    const entry = table[i] ? table[i][variant] : null;
    if (!entry || entry.cells.length < 2) break;
    if (!rows.length) count = entry.cells.length;
    else if (entry.cells.length !== count) break;
    rows.push([...entry.cells]);
    offsets.push([...entry.offsets]);
    if (!probeCells(entry.cells)) break; // ligne de prose : on arrête
    i += 1;
  }
  return {
    rows,
    offsets,
    count,
    headerRule,
    lastRuleLine,
    end: i,
    hitLimit: rows.length >= limit,
  };
}

function validSingleSpace(rows, caption = false) {
  const n = rows[0].length;
  const cells = rows.flat();
  if (cells.some((c) => !c)) return false; // pas de cellule vide ici
  const maxCell = caption ? Math.max(RULES.space1.maxCell, PROSE_CELL_MAX) : RULES.space1.maxCell;
  if (cells.some((c) => c.length > maxCell)) return false;
  if (cells.some((c) => SENTENCE_END_RE.test(c))) return false; // pas une phrase
  const caps = capitalizedRatio(cells);
  const header = looksLikeHeaderRow(rows[0], rows.slice(1));
  // Une colonne numérique fiable, jamais la première (une ligne commençant par
  // un nombre — « 3 pommes rouges » — est une énumération, pas un tableau)…
  let numericCol = -1;
  let bestShare = 0;
  for (let c = 1; c < n; c += 1) {
    const share = rows.filter((r) => looksNumeric(r[c])).length / rows.length;
    if (share > bestShare) {
      bestShare = share;
      numericCol = c;
    }
  }
  const numericOk =
    numericCol >= 1 &&
    bestShare >= (n === 2 ? 0.8 : 0.6) &&
    // … et qui porte une vraie donnée (une valeur répétée n'en est pas une).
    new Set(rows.map((r) => r[numericCol]).filter(looksNumeric)).size >= 2;
  // Après une légende « Tableau N », des libellés capitalisés suffisent — le
  // tableau a été explicitement annoncé par l'auteur.
  if (!numericOk && !(caption && caps >= 0.45)) return false;
  // Des cellules courtes (des phrases ne tiennent pas dans une colonne).
  if (cells.filter((c) => c.length <= 22).length / cells.length < (caption ? 0.5 : 0.6)) {
    return false;
  }
  // Des colonnes entièrement répétées : prose (« … à charge » sur chaque ligne).
  const identical = identicalColumns(rows);
  if (identical >= 2 && identical / n >= 0.4) return false;
  // Enfin, des libellés capitalisés — ou un en-tête repérable (libellés au-dessus
  // de valeurs) : « il a lu » est de la prose, « Douala » est une donnée.
  if (!header && caps < (caption ? 0.3 : 0.45)) return false;
  return true;
}

// Choix entre les deux lectures d'une suite de lignes : celle qui donne le même
// nombre de colonnes sur le plus grand nombre de lignes l'emporte ; à égalité,
// la lecture recollée (un nombre groupé est plus probable que deux colonnes
// numériques collées).
function pickSingleSpaceRun(raw, grouped, minRows) {
  const usable = (run) => run.rows.length >= minRows && run.count >= 2;
  if (usable(grouped) && (!usable(raw) || grouped.rows.length >= raw.rows.length)) {
    return { run: grouped, variant: "grouped" };
  }
  if (usable(raw)) return { run: raw, variant: "raw" };
  return null;
}

function blockForKindSingleSpace(lines, start, minRows, caption = false) {
  // 1) Sonde courte : si le début de la suite de lignes n'est pas tabulaire,
  //    inutile d'aller plus loin — c'est ce qui borne le coût sur les textes à
  //    lignes uniformes (sinon O(n²) : plusieurs secondes).
  const probe = pickSingleSpaceRun(
    collectSingleSpace(lines, start, "raw", PROBE_DEPTH),
    collectSingleSpace(lines, start, "grouped", PROBE_DEPTH),
    minRows
  );
  if (!probe) return null;
  if (probe.run.hitLimit && !validSingleSpace(probe.run.rows, caption)) return null;
  // 2) Sonde concluante : le bloc entier (plafonné) est collecté et validé.
  const run = probe.run.hitLimit
    ? collectSingleSpace(lines, start, probe.variant, MAX_RUN_ROWS)
    : probe.run;
  if (!validSingleSpace(run.rows, caption)) return null;
  return {
    rows: run.rows,
    offsets: run.offsets,
    separator: "space1",
    header: run.headerRule || looksLikeHeaderRow(run.rows[0], run.rows.slice(1)),
    end: run.end,
  };
}

// ─── Légende de tableau (détection PAR MOT) ────────────────────────────────
// « Tableau 3 : Effectifs », « TABLEAU n°2 — Population », « Tab. 4 »… : la
// ligne COMMENCE par le mot-clé (un simple renvoi dans une phrase — « voir le
// tableau 3 » — ne compte pas). Le bloc qui suit est un tableau ANNONCÉ : les
// seuils de forme sont assouplis (voir `caption` dans les validateurs).

export function isTableCaption(raw) {
  return TABLE_CAPTION_RE.test(normalizeTableLine(raw).trim());
}

/**
 * La dernière ligne non vide au-dessus de `start` (au plus 2 lignes vides
 * d'écart) est-elle une légende de tableau ?
 */
export function tableCaptionBefore(lines, start) {
  if (!Array.isArray(lines) || start <= 0) return false;
  let blanks = 0;
  for (let i = start - 1; i >= 0; i -= 1) {
    const line = normalizeTableLine(lines[i]).trim();
    if (!line) {
      blanks += 1;
      if (blanks > 2) return false;
      continue;
    }
    return TABLE_CAPTION_RE.test(line);
  }
  return false;
}

// ─── API publique ──────────────────────────────────────────────────────────

/**
 * Détecte un tableau qui commence à la ligne `lines[start]`.
 * Une ligne « Tableau 3 : … » juste au-dessus assouplit les seuils (le bloc
 * suivant est un tableau annoncé : dès 2 lignes, cellules plus longues,
 * tableau de libellés sans chiffres).
 * @returns null | { rows: string[][], offsets, end: number,
 *                   separator: "tab"|"pipe"|"space"|"semicolon"|"space1",
 *                   header: boolean }
 */
export function detectTableBlock(lines, start = 0, { minRows = 2 } = {}) {
  if (!Array.isArray(lines) || start < 0 || start >= lines.length) return null;
  const caption = tableCaptionBefore(lines, start);
  for (const kind of KINDS) {
    const need = caption
      ? Math.max(2, RULES[kind].minRows - 1)
      : Math.max(2, RULES[kind].minRows, minRows);
    const block =
      kind === "space1"
        ? blockForKindSingleSpace(lines, start, need, caption)
        : blockForKind(lines, start, kind, need, caption);
    if (block) return block;
  }
  return null;
}

/**
 * Repère TOUS les blocs tabulaires d'une liste de lignes (lignes de texte ou
 * paragraphes du document) : chaque bloc est contigu et n'en chevauche aucun.
 * @returns Array<{ start, end, rows, header, separator }>
 */
export function planTableBlocks(lines, { minRows = 2, maxBlocks = 80 } = {}) {
  const out = [];
  const list = Array.isArray(lines) ? lines : [];
  let i = 0;
  while (i < list.length && out.length < maxBlocks) {
    const block = detectTableBlock(list, i, { minRows });
    if (block) {
      out.push({
        start: i,
        end: block.end,
        rows: block.rows,
        header: block.header,
        separator: block.separator,
      });
      i = Math.max(block.end, i + 1);
    } else {
      i += 1;
    }
  }
  return out;
}

/** HTML (TipTap) d'un tableau détecté : en-tête en <th>, données en <td>. */
export function tableBlockHtml(rows, { header = false } = {}) {
  const cell = (text) => `<p>${escapeHtml(text)}</p>`;
  const withHead = header && rows.length > 1;
  const head = withHead
    ? `<thead><tr>${rows[0].map((c) => `<th>${cell(c)}</th>`).join("")}</tr></thead>`
    : "";
  const body = (withHead ? rows.slice(1) : rows)
    .map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

// ─── Passe complète : bouton « 🔳 Détecter les tableaux » ───────────────────
// Convertit les suites de paragraphes qui SONT un tableau « à plat » (texte
// copié) en vrais tableaux TipTap — éditable ensuite comme un tableau inséré
// avec le bouton ▦. Aucun autre contenu n'est touché ; tout est annulable.

// Nœud TipTap d'un tableau détecté (cellules d'en-tête = tableHeader).
function tableNode(schema, rows, header) {
  const nodes = schema?.nodes || {};
  const { paragraph, table, tableRow, tableCell, tableHeader } = nodes;
  if (!paragraph || !table || !tableRow || !tableCell) return null;
  const cell = (text, isHeader) => {
    const type = isHeader && tableHeader ? tableHeader : tableCell;
    return type.create(null, paragraph.create(null, text ? schema.text(text) : null));
  };
  return table.create(
    null,
    rows.map((cells, ri) =>
      tableRow.create(
        null,
        cells.map((c) => cell(c, header && ri === 0))
      )
    )
  );
}

export function formatTables(editor) {
  if (!editor) return { tables: 0, rows: 0 };
  const { state } = editor;
  const { schema, doc } = state;

  // 1) Suites de paragraphes SIMPLES (texte sans mise en forme) au premier
  //    niveau du document : un titre, une liste, une citation, un tableau
  //    existant ou un paragraphe imbriqué interrompt la suite.
  const blocks = [];
  let current = null;
  doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") {
      if (node.isBlock) current = null;
      return true;
    }
    if (doc.resolve(pos).parent.type.name !== "doc") {
      current = null; // paragraphe imbriqué (cellule, citation…) : ignoré
      return true;
    }
    let plain = true;
    node.forEach((child) => {
      if (!child.isText || child.marks.length) plain = false;
    });
    if (!plain || !node.textContent.trim()) {
      current = null;
      return false;
    }
    if (current && current.end === pos) {
      current.parts.push({ pos, size: node.nodeSize, text: node.textContent });
      current.end = pos + node.nodeSize;
    } else {
      current = {
        parts: [{ pos, size: node.nodeSize, text: node.textContent }],
        end: pos + node.nodeSize,
      };
      blocks.push(current);
    }
    return false; // un paragraphe n'a pas d'enfants à explorer
  });

  // 2) Repérage des tableaux « à plat » dans chaque suite de paragraphes.
  const conversions = [];
  let rowsTotal = 0;
  for (const block of blocks) {
    const texts = block.parts.map((p) => p.text);
    for (const plan of planTableBlocks(texts, { minRows: 2 })) {
      const node = tableNode(schema, plan.rows, plan.header);
      if (!node) continue;
      const last = block.parts[plan.end - 1];
      conversions.push({
        from: block.parts[plan.start].pos,
        to: last.pos + last.size,
        node,
      });
      rowsTotal += plan.rows.length;
    }
  }
  if (!conversions.length) return { tables: 0, rows: 0 };

  // 3) Application en ordre INVERSE : les positions des blocs suivants ne
  //    bougent jamais (aucun décalage à recalculer).
  const tr = state.tr;
  for (let i = conversions.length - 1; i >= 0; i -= 1) {
    const c = conversions[i];
    tr.replaceRangeWith(c.from, c.to, c.node);
  }
  editor.view.dispatch(tr.scrollIntoView());
  return { tables: conversions.length, rows: rowsTotal };
}
