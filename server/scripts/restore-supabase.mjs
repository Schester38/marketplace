import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import pg from 'pg';

const { Client } = pg;

const DUMP = process.argv[2];
const TARGET = process.argv[3] || process.env.SUPABASE_DIRECT_URL;

if (!DUMP || !TARGET) {
  console.error('Usage : node restore-supabase.mjs <dump.sql.gz> <supabase_direct_url>');
  process.exit(1);
}

if (!fs.existsSync(DUMP)) {
  console.error(`Fichier introuvable : ${DUMP}`);
  process.exit(1);
}

function parseDump(raw) {
  const parts = [];
  let buf = [];
  let i = 0;
  const lines = raw.split('\n');

  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) parts.push({ type: 'sql', text });
    buf = [];
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (/^COPY\s+.+FROM\s+stdin/i.test(line)) {
      flush();
      const header = line;
      const data = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '\\.') {
        data.push(lines[i]);
        i++;
      }
      parts.push({ type: 'copy', header, data });
      continue;
    }
    if (/^(DO|CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION|CREATE\s+TRIGGER)\b/i.test(line)) {
      buf.push(line);
      while (i < lines.length && !lines[i].endsWith('$$;') && !lines[i].endsWith(';')) {
        i++;
        buf.push(lines[i]);
      }
      flush();
      continue;
    }
    buf.push(line);
    if (line.trim().endsWith(';')) flush();
  }
  flush();
  return parts;
}

const raw = zlib.gunzipSync(fs.readFileSync(DUMP)).toString('utf8');
const parts = parseDump(raw);

const client = new Client({ connectionString: TARGET, ssl: { rejectUnauthorized: false } });
await client.connect();

const errors = [];
let copies = 0;

for (const part of parts) {
  if (part.type === 'sql') {
    try {
      await client.query(part.text);
    } catch (err) {
      errors.push(`${err.message} :: ${part.text.slice(0, 120).replace(/\s+/g, ' ')}`);
    }
  } else {
    try {
      await new Promise((resolve, reject) => {
        const stream = client.copyFrom(part.header);
        stream.on('error', reject);
        stream.on('finish', resolve);
        for (const row of part.data) stream.write(row + '\n');
        stream.end();
      });
      copies++;
    } catch (err) {
      errors.push(`COPY ${part.header.slice(9, 90)} :: ${err.message}`);
    }
  }
}

await client.end();

console.log(`Restauration terminée : ${parts.length} segments, ${copies} blocs COPY, ${errors.length} erreur(s).`);
if (errors.length) {
  console.log('\n--- Erreurs (à vérifier) ---');
  for (const e of errors.slice(0, 40)) console.log(' * ' + e);
}