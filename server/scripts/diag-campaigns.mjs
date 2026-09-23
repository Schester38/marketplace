// Diagnostic lecture-seule des campagnes programmées (AUCUN ENVOI).
// Usage : node scripts/diag-campaigns.mjs [.env.prod|.env.local|...]
import "./_load-env.mjs";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const q = (t, p) => client.query(t, p);

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
console.log("Aujourd'hui (Cameroun) :", today, "| Heure serveur :", new Date().toISOString(), "\n");

const camp = await q(`SELECT id, title, audience, channels, send_date, status, created_at, sent_at,
  LEFT(result::text, 300) AS result
  FROM scheduled_campaigns ORDER BY send_date DESC, id DESC LIMIT 40`);
console.log("=== scheduled_campaigns ===");
for (const c of camp.rows) {
  console.log(
    `#${c.id} ${c.send_date} ${c.status.padEnd(7)} «${(c.title || "").slice(0, 50)}» audience=${c.audience} channels=${(c.channels || []).join("+")} créée=${(c.created_at || "").toISOString?.() || c.created_at} envoyée=${c.sent_at ? (c.sent_at.toISOString?.() || c.sent_at) : "-"}`
  );
  if (c.result) console.log("      result:", c.result);
}

console.log("\n=== platform_settings (clés campaign_*) ===");
const ps = await q(`SELECT key, value, updated_at FROM platform_settings WHERE key LIKE 'campaign_%' ORDER BY key`);
for (const r of ps.rows) {
  let v = String(r.value);
  if (r.key.includes("secret")) v = `${v.slice(0, 6)}…(${v.length} car.)`;
  console.log(`${r.key} = ${v}  (maj: ${r.updated_at?.toISOString?.() || r.updated_at})`);
}
if (!ps.rows.length) console.log("  (aucune clé campaign_*)");

console.log("\n=== Portée push (abonnements actifs messages_ok) ===");
try {
  const push = await q(
    `SELECT COUNT(*)::int AS endpoints,
            COUNT(DISTINCT ps.user_id)::int AS users
     FROM push_subscriptions ps
     LEFT JOIN push_prefs pp ON pp.user_id = ps.user_id
     WHERE COALESCE(pp.messages_ok, TRUE) = TRUE`
  );
  console.log(`  ${push.rows[0].users} utilisateur(s) / ${push.rows[0].endpoints} appareil(s) recevront le push`);
  const prefsOff = await q(`SELECT COUNT(*)::int AS n FROM push_prefs WHERE messages_ok = FALSE`);
  console.log(`  ${prefsOff.rows[0].n} utilisateur(s) ont DÉSACTIVÉ « Messages de MboppiShop »`);
} catch (e) {
  console.log("  (push_prefs indisponible :", e.message, ")");
}

console.log("\n=== VAPID (clés configurées ?) ===");
console.log(`  VAPID_PUBLIC_KEY: ${process.env.VAPID_PUBLIC_KEY ? "configuré ✅" : "MANQUANT ❌"}`);
console.log(`  VAPID_PRIVATE_KEY: ${process.env.VAPID_PRIVATE_KEY ? "configuré ✅" : "MANQUANT ❌"}`);

const mailCfg = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
console.log(`  SMTP (emails réels): ${mailCfg ? "configuré ✅" : "NON configuré ❌ (emails simulés, jamais envoyés)"}`);

console.log("\n=== Destinataires email potentiels (email_verified) par rôle ===");
try {
  const emails = await q(
    `SELECT role, COUNT(*)::int AS n FROM users WHERE email_verified = TRUE GROUP BY role ORDER BY n DESC`
  );
  for (const r of emails.rows) console.log(`  ${r.role}: ${r.n}`);
} catch (e) {
  console.log("  (erreur :", e.message, ")");
}

await client.end();
console.log("\nTerminé ✅");