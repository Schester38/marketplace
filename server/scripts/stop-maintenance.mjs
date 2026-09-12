// Arrête la maintenance pas-à-pas (pose la garde done) — le proxy /api/photo
// avec cache eternal rend la correction des objets Storage non nécessaire.
import fs from "fs";
import pg from "pg";
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const url =
  (env.match(/^DATABASE_URL=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "") ||
  (env.match(/^DATABASE_URL_POOLED=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
await pool.query(
  `INSERT INTO platform_settings (key, value, updated_at)
   VALUES ('storage_maintenance_done', $1, now())
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
  [new Date().toISOString()]
);
await pool.query(
  `DELETE FROM platform_settings WHERE key IN
   ('storage_fix_keys','storage_fix_cursor','storage_fix_phase','storage_fix_failed')`
);
console.log("garde posee, etat de maintenance nettoie");
await pool.end();