// Lecture de platform_settings (garde + journal de maintenance storage)
import fs from "fs";
import pg from "pg";

const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const url =
  (env.match(/^DATABASE_URL=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "") ||
  (env.match(/^DATABASE_URL_POOLED=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
const rows = (
  await pool.query(
    `SELECT key, value, updated_at FROM platform_settings
      WHERE key LIKE 'storage_%' ORDER BY key`
  )
).rows;
if (!rows.length) console.log("Aucune clé storage_* dans platform_settings");
for (const r of rows) console.log(`${r.key} = ${(r.value || "").slice(0, 400)}  (maj: ${r.updated_at?.toISOString?.() || r.updated_at})`);
await pool.end();
