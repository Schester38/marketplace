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
//   - 2 espaces ou plus → tableaux de PDF (colonnes alignées) ;
//   - point-virgule     → CSV « ; ».
//
// GARDE-FOUS ANTI-PROSE (un paragraphe n'est JAMAIS transformé en tableau) :
//   - les séparateurs « risqués » (espaces, « ; ») exigent au moins 3 lignes,
//     des cellules ≤ 60 caractères, aucune cellule terminée par une ponctuation
//     de phrase, et un signal tabulaire (colonne numérique, cellules très
//     courtes, majuscules systématiques ou en-tête repérable) ;
//   - les colonnes espacées doivent être ALIGNÉES : les cellules d'une même
//     colonne commencent (ou finissent) à la même position — une double espace
//     au milieu d'une phrase ne suffit donc jamais ;
//   - tabulation et barre verticale sont tenues pour fiables : elles
//     n'apparaissent pas dans de la prose.
//
// Module PUR (aucun accès DOM) : testé sous Node par tmp-tables-test.mjs et
// utilisable aussi bien par l'import que par l'éditeur.

// Espaces typographiques (copie de PDF français : insécables, fines…) traités
// comme des espaces ordinaires — sans quoi « 3 663 000 » ou des colonnes
// issues d'InDesign ne se découpent pas.
const UNICODE_SPACES_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const TABS_RE = /\t/g;
const PIPES_RE = /\|/g;
const MULTISPACE_RE = /\s{2,}/g;
const SEMICOLON_RE = /;/g;
const HAS_MULTISPACE_RE = /\s\s/; // test non global (pas de lastIndex)
const MD_RULE_RE = /^:?-{2,}:?$/; // ligne « |---|---| » d'un tableau Markdown
const SENTENCE_END_RE = /[.!?]$/; // fin de phrase → cellule de prose
const NUMBER_CELL_RE = /^[+-]?[\d\s.,'’]*\d[\d\s.,'’%:/°+-]*$/;
const MONEY_SUFFIX_RE = /(%|€|\$|FCFA|XAF|XOF|USD|EUR|CHF|F)\s*$/i;

// Longueur au-delà de laquelle une cellule n'est plus une cellule de tableau
// mais un morceau de paragraphe (garde anti-prose des séparateurs risqués).
const PROSE_CELL_MAX = 60;

// Règles par séparateur : nombre de lignes minimal, longueur maximale d'une
// cellule, proportion de cellules remplies, contrôles supplémentaires.
const RULES = {
  tab: { minRows: 2, maxCell: 200, minFill: 0.5 },
  pipe: { minRows: 2, maxCell: 200, minFill: 0.5 },
  space: { minRows: 3, maxCell: PROSE_CELL_MAX, minFill: 0.75, risky: true, aligned: true },
  semicolon: { minRows: 3, maxCell: PROSE_CELL_MAX, minFill: 0.75, risky: true },
};

// Ordre d'essai des séparateurs : du plus fiable au plus ambigu.
const KINDS = ["tab", "pipe", "space", "semicolon"];

export function normalizeTableLine(raw) {
  return String(raw ?? "").replace(/\r/g, "").replace(UNICODE_SPACES_RE, " ");
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
  return null;
}

// ─── Validation d'un bloc candidat ─────────────────────────────────────────

// Nombre de colonnes dont les cellules sont alignées (mêmes débuts à ±4
// caractères ou mêmes fins à ±3). C'est le signal décisif des tableaux de PDF :
// dans de la prose, deux espaces tombent à des endroits différents à chaque
// ligne. Une colonne trop peu remplie compte comme neutre (elle n'apporte ni
// preuve ni contre-preuve).
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
      ends.push(off.end);
    }
    if (starts.length < 2) {
      aligned += 1;
      continue;
    }
    const spreadStart = Math.max(...starts) - Math.min(...starts);
    const spreadEnd = Math.max(...ends) - Math.min(...ends);
    if (spreadStart <= 4 || spreadEnd <= 3) aligned += 1;
  }
  return aligned;
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

function validBlock(rows, offsets, kind) {
  const rule = RULES[kind];
  const cells = rows.flat();
  const filled = cells.filter((c) => c !== "").length;
  if (filled < Math.ceil(cells.length * rule.minFill)) return false;
  if (cells.some((c) => c.length > rule.maxCell)) return false;
  if (rule.aligned && alignedColumns(rows, offsets) < Math.min(2, rows[0].length)) return false;
  if (rule.risky) {
    // Une phrase se termine par un point : jamais une cellule de tableau.
    if (cells.some((c) => SENTENCE_END_RE.test(c))) return false;
    const dataRows = rows.filter((r) => r.some(looksNumeric)).length;
    const shortCells = cells.every((c) => c.length <= 22);
    if (dataRows === 0 && !shortCells && !looksLikeHeaderRow(rows[0], rows.slice(1))) return false;
    if (kind === "space" && dataRows === 0 && capitalizedRatio(cells) < 0.6) return false;
  }
  // Une ligne sans aucune cellule remplie terminerait le tableau.
  return rows.every((r) => r.some((c) => c !== ""));
}

// ─── Collecte d'un bloc candidat ───────────────────────────────────────────

function collectRun(lines, start, kind) {
  const rows = [];
  const offsets = [];
  const lineIndexes = [];
  let headerRule = false; // règle Markdown « |---|---| » juste après la 1re ligne
  let lastRuleLine = null;
  let i = start;
  while (i < lines.length) {
    const line = normalizeTableLine(lines[i]).trim();
    if (!line) break;
    const cells = cellsFor(kind, line);
    if (!cells || cells.length < 2) break;
    // Ligne « |---|---| » : elle sépare l'en-tête des données (l'en-tête est
    // reconstruit depuis les cellules <th>), jamais une ligne du tableau.
    if (kind === "pipe" && cells.every((c) => MD_RULE_RE.test(c.text))) {
      if (!rows.length) break; // règle sans en-tête au-dessus : pas un tableau
      if (rows.length === 1) headerRule = true;
      lastRuleLine = i;
      i += 1;
      continue;
    }
    rows.push(cells.map((c) => c.text));
    offsets.push(cells.map((c) => ({ start: c.start, end: c.end })));
    lineIndexes.push(i);
    i += 1;
  }
  return { rows, offsets, lineIndexes, headerRule, lastRuleLine, end: i };
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

function blockForKind(lines, start, kind, minRows) {
  const firstLine = normalizeTableLine(lines[start]).trim();
  const first = cellsFor(kind, firstLine);
  if (!first || first.length < 2) return null;
  const run = collectRun(lines, start, kind);
  if (run.rows.length < minRows) return null;

  const mode = modeOf(run.rows.map((r) => r.length));
  if (mode < 2) return null;

  // Plus long préfixe de largeur homogène : une ligne qui a perdu sa DERNIÈRE
  // colonne (vide) est complétée à droite — cas très fréquent dans les PDF.
  const rows = [];
  const offsets = [];
  for (let k = 0; k < run.rows.length; k += 1) {
    const r = run.rows[k];
    if (r.length === mode) {
      rows.push(r);
      offsets.push(run.offsets[k]);
    } else if (r.length === mode - 1) {
      rows.push([...r, ""]);
      offsets.push([...run.offsets[k], { start: -1, end: -1 }]);
    } else {
      break; // largeur franchement différente : le tableau s'arrête ici
    }
  }
  if (rows.length < minRows) return null;
  if (!validBlock(rows, offsets, kind)) return null;

  // Fin du bloc : la dernière ligne retenue, règle Markdown comprise si elle
  // tombe dans le tableau.
  let end = run.lineIndexes[rows.length - 1] + 1;
  if (run.lastRuleLine !== null) end = Math.max(end, run.lastRuleLine + 1);

  return {
    rows,
    offsets,
    separator: kind,
    header: run.headerRule || looksLikeHeaderRow(rows[0], rows.slice(1)),
    end,
  };
}

// ─── API publique ──────────────────────────────────────────────────────────

/**
 * Détecte un tableau qui commence à la ligne `lines[start]`.
 * @returns null | { rows: string[][], offsets, end: number,
 *                   separator: "tab"|"pipe"|"space"|"semicolon", header: boolean }
 */
export function detectTableBlock(lines, start = 0, { minRows = 2 } = {}) {
  if (!Array.isArray(lines) || start < 0 || start >= lines.length) return null;
  for (const kind of KINDS) {
    const block = blockForKind(lines, start, kind, Math.max(2, RULES[kind].minRows, minRows));
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
