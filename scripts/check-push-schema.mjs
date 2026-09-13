// Diagnostic READ-ONLY : contraintes de push_subscriptions en prod. Aucune écriture.
import pg from "pg";
import { readFileSync } from "fs";

let CONN = process.env.DATABASE_URL || "";
if (!CONN) {
  const env = readFileSync(new URL("../server/.env", import.meta.url), "utf8");
  const line = env.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, "")).find((l) => /^DATABASE_URL=/.test(l));
  const m = line ? line.match(/^DATABASE_URL="?([^"\r\n]+)"?\s*$/) : null;
  if (m) CONN = m[1];
}
const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
await client.connect();
const r = await client.query(`
  SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE conrelid = 'push_subscriptions'::regclass`);
console.log(JSON.stringify(r.rows, null, 1));
const idx = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='push_subscriptions'`);
console.log(JSON.stringify(idx.rows, null, 1));
await client.end();