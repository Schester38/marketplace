// Réinitialise l'état de la maintenance storage (relance propre après le
// correctif du listing des dossiers du bucket).
import fs from "fs";
import pg from "pg";
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const url =
  (env.match(/^DATABASE_URL=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "") ||
  (env.match(/^DATABASE_URL_POOLED=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
const del = await pool.query(
  `DELETE FROM platform_settings
    WHERE key IN ('storage_maintenance_done','storage_fix_keys','storage_fix_cursor','storage_fix_failed','storage_maintenance_log')`
);
console.log(`clés réinitialisées : ${del.rowCount}`);
await pool.end();