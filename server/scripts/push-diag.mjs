// Diagnostic push — NE PRINTE AUCUN SECRET.
// Usage : node scripts/push-diag.mjs [chemin_env]   (défaut : ../.env.prod.local)
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const envPath = process.argv[2] || path.resolve(process.cwd(), "../.env.prod.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
  console.log("env chargé :", envPath);
} else {
  console.log("env introuvable :", envPath);
}

const url = process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED;
if (!url) {
  console.error("PAS DE DATABASE_URL — abandon.");
  process.exit(1);
}
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
await client.connect();

const q = (t, p) => client.query(t, p);

console.log("\n=== 1. Abonnements push ===");
const tot = await q(`SELECT COUNT(*)::int AS n, COUNT(DISTINCT user_id)::int AS u FROM push_subscriptions`);
console.log(`total endpoints : ${tot.rows[0].n} — utilisateurs distincts : ${tot.rows[0].u}`);

const byRole = await q(`SELECT u.role, COUNT(DISTINCT ps.user_id)::int AS users, COUNT(*)::int AS endpoints
  FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id GROUP BY 1 ORDER BY 1`);
console.log("par rôle :", byRole.rows);

const hosts = await q(`SELECT split_part(replace(endpoint, 'https://', ''), '/', 1) AS host, COUNT(*)::int AS n
  FROM push_subscriptions GROUP BY 1 ORDER BY n DESC`);
console.log("push services :", hosts.rows);

console.log("\n=== 2. Préférences push (canal 'messages' utilisé par les campagnes) ===");
try {
  const prefs = await q(`SELECT COALESCE(messages_ok, TRUE) AS messages_ok, COUNT(*)::int AS n
    FROM push_prefs GROUP BY 1 ORDER BY 1`);
  console.log(prefs.rows);
} catch (e) {
  console.log("push_prefs indisponible :", e.message);
}

console.log("\n=== 3. Dernières campagnes (audit admin.campaign) ===");
try {
  const logs = await q(`SELECT * FROM audit_log WHERE action = 'admin.campaign' ORDER BY id DESC LIMIT 10`);
  for (const r of logs.rows) {
    const d = r.details || r.detail || r.message || JSON.stringify(r);
    console.log(`- ${r.created_at?.toISOString?.() || r.created_at} : ${d}`);
  }
  if (!logs.rows.length) console.log("(aucune campagne dans l'audit)");
} catch (e) {
  console.log("audit_log indisponible :", e.message);
}

console.log("\n=== 4. Clé VAPID : env local vs production ===");
const localKey = process.env.VAPID_PUBLIC_KEY || "";
console.log("clé locale (.env.prod.local) :", localKey ? localKey.slice(0, 12) + "…" + ` (${localKey.length} car.)` : "ABSENTE");
try {
  const res = await fetch("https://www.mboppishop.com/api/push/key");
  const { public_key } = await res.json();
  console.log("clé servie en production    :", public_key ? public_key.slice(0, 12) + "…" + ` (${public_key.length} car.)` : "ABSENTE");
  console.log(localKey && public_key
    ? localKey === public_key ? "✅ identiques" : "❌ DIFFÉRENTES — les abonnements clients ont été créés avec une autre clé !"
    : "⚠️ incomparable");
} catch (e) {
  console.log("fetch /api/push/key impossible :", e.message);
}

console.log("\n=== 6. Détail : qui reçoit / qui est bloqué (campagne = canal messages) ===");
{
  const r = await q(`SELECT u.id, u.role, u.name, (pp.user_id IS NULL) AS sans_prefs,
      COALESCE(pp.messages_ok, TRUE) AS recoit, u.email_verified,
      (SELECT COUNT(*) FROM push_subscriptions ps WHERE ps.user_id = u.id)::int AS appareils
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    LEFT JOIN push_prefs pp ON pp.user_id = u.id
    GROUP BY u.id, u.role, u.name, pp.user_id, pp.messages_ok, u.email_verified
    ORDER BY recoit DESC, u.role`);
  for (const x of r.rows) {
    console.log(
      `user #${x.id} [${x.role}] ${(x.name || "").slice(0, 20).padEnd(20)} ` +
        `appareils=${x.appareils} prefs=${x.sans_prefs ? "aucune (reçoit)" : x.recoit ? "messages ON" : "messages OFF ← BLOQUÉ"}`
    );
  }
  const s = await q(`SELECT COUNT(DISTINCT ps.user_id)::int AS n
    FROM push_subscriptions ps LEFT JOIN push_prefs pp ON pp.user_id = ps.user_id
    WHERE COALESCE(pp.messages_ok, TRUE) = TRUE`);
  console.log(`>>> Utilisateurs abonnés qui recevraient une campagne push aujourd'hui : ${s.rows[0].n}`);
  const verif = await q(`SELECT COUNT(DISTINCT ps.user_id)::int AS n
    FROM push_subscriptions ps
    JOIN users u ON u.id = ps.user_id
    LEFT JOIN push_prefs pp ON pp.user_id = u.id
    WHERE COALESCE(pp.messages_ok, TRUE) = TRUE AND u.email_verified = TRUE`);
  console.log(`>>> ... et avec email vérifié : ${verif.rows[0].n}`);
}

console.log("\n=== 5. Comparaison cibles email vs push ===");
const comp = await q(`SELECT
  (SELECT COUNT(*)::int FROM users WHERE email_verified = TRUE) AS emails_verifies,
  (SELECT COUNT(DISTINCT user_id)::int FROM push_subscriptions) AS users_avec_push,
  (SELECT COUNT(*)::int FROM users) AS users_total`);
console.log(comp.rows[0]);

console.log("\n=== 7. Audit : campagnes, push, messages (15 derniers) ===");
try {
  const acts = await q(`SELECT DISTINCT action FROM audit_log WHERE action ILIKE '%campaign%' OR action ILIKE '%push%' OR action ILIKE '%message%' ORDER BY 1`);
  console.log("actions connues :", acts.rows.map((r) => r.action));
  const b = await q(`SELECT action, details, created_at FROM audit_log
    WHERE action ILIKE '%campaign%' OR action ILIKE '%push%' OR action ILIKE '%message%'
    ORDER BY created_at DESC LIMIT 15`);
  if (!b.rows.length) console.log("(aucun événement campaign/push/message dans l'audit)");
  for (const r of b.rows) {
    console.log(`- ${r.created_at.toISOString().slice(0, 16)} ${r.action} | ${(r.details || "").slice(0, 90)}`);
  }
} catch (e) {
  console.log("audit indisponible :", e.message);
}

console.log("\n=== 8. Schéma + contenu récent de audit_log ===");
try {
  const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'audit_log' ORDER BY ordinal_position`);
  console.log("colonnes :", cols.rows.map((r) => r.column_name).join(", "));
  const last = await q(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 8`);
  if (!last.rows.length) console.log("(audit_log VIDE)");
  for (const r of last.rows) {
    console.log("-", JSON.stringify(r).slice(0, 180));
  }
} catch (e) {
  console.log("audit indisponible :", e.message);
}

console.log("\n=== 9. Historique des préférences (bug de masse ?) ===");
try {
  const h = await q(`SELECT user_id, flash_ok, digest_ok, messages_ok, updated_at
    FROM push_prefs ORDER BY updated_at DESC`);
  for (const r of h.rows) {
    console.log(`user #${String(r.user_id).padEnd(4)} flash=${r.flash_ok ? "ON " : "OFF"} digest=${r.digest_ok ? "ON " : "OFF"} messages=${r.messages_ok ? "ON " : "OFF"}  maj=${r.updated_at.toISOString().slice(0, 16)}`);
  }
} catch (e) {
  console.log("push_prefs indisponible :", e.message);
}

await client.end();