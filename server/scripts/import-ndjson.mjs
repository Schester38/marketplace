import fs from 'fs';
import pg from 'pg';

const { Client, escapeIdentifier } = pg;

const FILE = process.argv[2];
const URL = process.argv[3] || process.env.DIRECT_URL || process.env.SUPABASE_DIRECT_URL;

if (!FILE || !URL) {
  console.error('Usage : node import-ndjson.mjs <backup.ndjson> <connection_url>');
  process.exit(1);
}
if (!fs.existsSync(FILE)) {
  console.error(`Fichier introuvable : ${FILE}`);
  process.exit(1);
}

function pgArrayLiteral(arr) {
  if (!Array.isArray(arr)) return JSON.stringify(arr);
  const items = arr.map((e) => {
    if (Array.isArray(e)) return pgArrayLiteral(e);
    if (e === null) return 'NULL';
    if (typeof e === 'string') return `"${e.replace(/"/g, '\\"')}"`;
    return String(e);
  });
  return `{${items.join(',')}}`;
}

const client = new Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const colTypes = new Map();
{
  const r = await client.query(
    `SELECT table_name, column_name, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public'`
  );
  for (const row of r.rows) {
    if (!colTypes.has(row.table_name)) colTypes.set(row.table_name, new Map());
    colTypes.get(row.table_name).set(row.column_name, row.udt_name);
  }
}

const lines = fs.readFileSync(FILE, 'utf8').split('\n').filter((l) => l.trim());
const summary = [];
const errors = [];

for (const line of lines) {
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  const { table, rows } = entry;
  if (!table || !Array.isArray(rows)) continue;

  if (rows.length === 0) {
    summary.push(`${table}: 0`);
    continue;
  }

  const types = colTypes.get(table) || new Map();
  const allCols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cols = allCols.filter((c) => c !== 'id');
  const idCol = allCols.includes('id') ? 'id' : null;

  for (const row of rows) {
    const ordered = idCol ? [idCol, ...cols] : cols;
    const params = ordered.map((c) => {
      const v = row[c];
      if (v === undefined || v === null) return null;
      if (typeof v !== 'object') return v;
      const udt = types.get(c);
      return udt === '_int4' || udt === '_text' || udt === '_numeric' ||
             udt === '_float8' || udt === '_bool' || udt === '_timestamptz'
        ? pgArrayLiteral(v)
        : JSON.stringify(v);
    });
    const placeholders = ordered.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO ${escapeIdentifier(table)} (${ordered.map((c) => escapeIdentifier(c)).join(', ')}) VALUES (${placeholders})`;
    try {
      await client.query(sql, params);
    } catch (err) {
      errors.push(`${table} id=${row.id ?? '?'} :: ${err.message.slice(0, 160)}`);
    }
  }
  summary.push(`${table}: ${rows.length}`);
}

const seqs = await client.query(
  `SELECT t.relname AS tbl, a.attname AS col, pg_get_serial_sequence(t.oid::regclass::text, a.attname) AS seq
     FROM pg_class t
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_attribute a ON a.attrelid = t.oid
    WHERE n.nspname = 'public' AND t.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      AND pg_get_serial_sequence(t.oid::regclass::text, a.attname) IS NOT NULL`
);
for (const { tbl, col, seq } of seqs.rows) {
  try {
    await client.query(
      `SELECT setval($1, GREATEST((SELECT COALESCE(MAX(${escapeIdentifier(col)}), 1) FROM ${escapeIdentifier(tbl)}), 1), true)`,
      [seq]
    );
  } catch (err) {
    errors.push(`setval ${seq} :: ${err.message.slice(0, 120)}`);
  }
}

await client.end();

console.log('Résumé de l\'import :');
for (const s of summary) console.log('  ' + s);
console.log(`Séquences mises à jour : ${seqs.rows.length}`);
console.log(`Erreurs : ${errors.length}`);
if (errors.length) {
  console.log('\n--- Erreurs ---');
  for (const e of errors.slice(0, 40)) console.log(' * ' + e);
}
process.exit(errors.length ? 1 : 0);