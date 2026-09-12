// HEAD direct : cache-control servi pour CHAQUE image référencée (rapide)
import fs from "fs";
import pg from "pg";
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const url =
  (env.match(/^DATABASE_URL=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "") ||
  (env.match(/^DATABASE_URL_POOLED=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
const rows = (await pool.query(`SELECT photos::text AS photos FROM products WHERE photos IS NOT NULL`)).rows;
const urls = new Set();
for (const r of rows) {
  for (const m of r.photos.matchAll(/https?:\/\/[^"'\\\s]+/g)) urls.add(m[0]);
}
let fixed = 0;
let noCache = 0;
for (const u of urls) {
  try {
    const h = await fetch(u, { method: "HEAD" });
    const cc = (h.headers.get("cache-control") || "").toLowerCase();
    if (cc.includes("max-age=31536000")) fixed += 1;
    else noCache += 1;
    console.log(`${cc.includes("max-age=31536000") ? "OK " : "NO "} ${cc}  …${u.slice(-50)}`);
  } catch (e) {
    console.log(`ERREUR ${e.message}`);
  }
}
console.log(`\nFixes: ${fixed} / no-cache: ${noCache}`);
await pool.end();