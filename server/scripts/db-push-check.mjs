// Vérification lecture-seule des abonnements push (clés, user, fraîcheur).
// Usage : node scripts/db-push-check.mjs .env
import "./_load-env.mjs";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = (t, p) => c.query(t, p);

const rows = await q(`SELECT id, user_id, endpoint,
  (keys IS NULL) AS keys_null,
  (COALESCE(keys::text, '') = '{}') AS keys_obj_vide,
  (keys IS NOT NULL AND keys::text <> '{}' AND keys->>'p256dh' IS NULL) AS p256dh_manquant,
  created_at
  FROM push_subscriptions ORDER BY id`);
console.log("total lignes :", rows.rows.length);
const summary = { keys_null: 0, keys_obj_vide: 0, p256dh_manquant: 0, ok: 0 };
for (const r of rows.rows) {
  if (r.keys_null) summary.keys_null++;
  else if (r.keys_obj_vide) summary.keys_obj_vide++;
  else if (r.p256dh_manquant) summary.p256dh_manquant++;
  else summary.ok++;
}
console.log("résumé :", JSON.stringify(summary));
for (const r of rows.rows) {
  console.log(`#${r.id} user=${r.user_id} créé=${(r.created_at || "").toISOString?.() || r.created_at}`,
    r.keys_null ? "KEYS=NULL ❌" : r.keys_obj_vide ? "KEYS={} ❌" : r.p256dh_manquant ? "p256dh absent ❌" : "clés OK ✅",
    String(r.endpoint || "").slice(0, 70));
}
try {
  const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='push_prefs' ORDER BY ordinal_position`);
  console.log("\npush_prefs colonnes :", cols.rows.map((x) => x.column_name).join(", "));
} catch (e) {
  console.log("\npush_prefs inaccessible :", e.message);
}
await c.end();