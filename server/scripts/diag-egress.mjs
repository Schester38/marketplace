// Diagnostic egress : DB (lecture seule) + probe des images servies
import fs from "fs";
import pg from "pg";

const mb = (b) => (b / 1048576).toFixed(2) + " Mo";
const env = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const url =
  (env.match(/^DATABASE_URL=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "") ||
  (env.match(/^DATABASE_URL_POOLED=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "");
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
const one = async (sql, p = []) => (await pool.query(sql, p)).rows[0];

// ---- DB ----
const cat = await one(`
  SELECT COUNT(*) AS n,
         COALESCE(SUM(octet_length(to_jsonb(p.*)::text)), 0) AS bytes_all
  FROM products p WHERE p.quantity > 0`);
console.log(`Catalogue actif: ${cat.n} produits — payload complet GET /products: ${mb(Number(cat.bytes_all))}`);

const b64 = await one(`
  SELECT COUNT(*) AS n, COALESCE(SUM(octet_length(photos::text)),0) AS bytes
  FROM products WHERE photos::text LIKE '%data:image/%'`);
console.log(`Produits avec base64 inline dans photos: ${b64.n} (${mb(Number(b64.bytes))})`);

const misc = await one(`
  SELECT (SELECT COUNT(*) FROM notifications) AS notif,
         (SELECT COUNT(*) FROM audit_log) AS audit,
         (SELECT COUNT(*) FROM client_logs) AS clogs`);
console.log(`Lignes: notifications=${misc.notif} audit=${misc.audit} client_logs=${misc.clogs}`);

const recent = await pool.query(`SELECT id, created_at FROM products ORDER BY id DESC LIMIT 5`);
for (const r of recent.rows) console.log(`produit ${r.id}: créé ${r.created_at?.toISOString?.() || r.created_at}`);

// ---- Images ----
const rows = (await pool.query(`SELECT id, photos, image FROM products`)).rows;
const urls = new Set();
for (const r of rows) {
  const raw = (r.photos || "") + " " + (r.image || "");
  for (const m of raw.matchAll(/https?:\/\/[^"'\\\s\]]+/g)) urls.add(m[0]);
}
console.log(`\nURLs d'images référencées: ${urls.size}`);
let totalBytes = 0;
const stats = [];
for (const u of urls) {
  try {
    const h = await fetch(u, { method: "HEAD" });
    const size = Number(h.headers.get("content-length") || 0);
    const cc = h.headers.get("cache-control") || "(aucun)";
    stats.push({ u, size, cc, status: h.status });
    if (h.ok) totalBytes += size;
  } catch (e) {
    stats.push({ u, size: 0, cc: "ERREUR " + e.message, status: 0 });
  }
}
console.log(`Poids total images: ${mb(totalBytes)}`);
for (const s of stats.sort((a, b) => b.size - a.size).slice(0, 10)) {
  console.log(`   ${mb(s.size)}  HTTP ${s.status}  cache: ${s.cc}  …${s.u.slice(-55)}`);
}
const ok = stats.filter((s) => s.status === 200);
console.log(`Images SANS cache navigateur: ${ok.filter((s) => !/max-age/i.test(s.cc)).length}/${ok.length}`);
console.log(`Images servies depuis Supabase Storage: ${ok.filter((s) => /supabase/i.test(s.u)).length}/${ok.length}`);

// Test revalidation conditionnelle (304 ?) sur les 5 plus grosses images
console.log("\n--- Test 304 (If-None-Match) ---");
for (const s of ok.sort((a, b) => b.size - a.size).slice(0, 5)) {
  try {
    const h1 = await fetch(s.u);
    const etag = h1.headers.get("etag");
    const h2 = await fetch(s.u, { headers: etag ? { "If-None-Match": etag } : {} });
    console.log(
      `GET#1 ${h1.status} ${mb(Number(h1.headers.get("content-length") || 0))} etag=${etag ? "oui" : "non"} ; GET#2 conditionnel: ${h2.status} ${mb(Number(h2.headers.get("content-length") || 0))}`
    );
  } catch (e) {
    console.log("erreur", e.message);
  }
}
await pool.end();
