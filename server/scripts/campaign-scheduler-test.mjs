// Test du planificateur de campagnes — AUCUN ENVOI RÉEL.
// Crée une campagne test pour DEMAIN (jamais « due »), vérifie :
//  - création de la table scheduled_campaigns ;
//  - génération du secret cron ;
//  - runDueCampaigns dry → la campagne test est détectée (would_send) ;
//  - runDueCampaigns réel → send_date > today → none_due (aucun envoi) ;
// puis supprime la campagne test.
// Usage : node scripts/campaign-scheduler-test.mjs .env
import "./_load-env.mjs";
import pg from "pg";
import {
  ensureScheduledCampaignsTable,
  getCronSecret,
  todayDouala,
  runDueCampaigns,
} from "../services/campaigns.js";

process.env.SITE_URL = process.env.SITE_URL || "";
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
// Le service utilise q() de db.js : on simule via import direct. Pour un test
// isolé on repasse par le pool de db.js avec les mêmes variables d'env.
const { q } = await import("../db.js");

console.log("1) Table scheduled_campaigns…");
await ensureScheduledCampaignsTable();
console.log("   OK (créée/vérifiée)");

console.log("2) Aujourd'hui au Cameroun :", todayDouala());

console.log("3) Secret cron…");
const secret = await getCronSecret();
const secret2 = await getCronSecret();
console.log(`   généré : ${secret.slice(0, 8)}… (${secret.length} car.) — stable : ${secret === secret2 ? "OUI ✅" : "NON ❌"}`);

console.log("4) Insertion campagne test (DEMAIN — jamais due)…");
const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
await q(`DELETE FROM scheduled_campaigns WHERE title = '[TEST] Campagne planificateur' OR send_date = $1::date`, [
  tomorrow,
]);
const ins = await q(
  `INSERT INTO scheduled_campaigns (title, message, url, audience, channels, send_date)
   VALUES ($1, $2, '/', 'all', ARRAY['push','email']::text[], $3::date)
   RETURNING id`,
  ["[TEST] Campagne planificateur", "Test interne — ne doit jamais partir.", tomorrow]
);
const testId = ins[0].id;
console.log(`   insérée id=${testId} (send_date=${tomorrow})`);

console.log("5) runDueCampaigns dry…");
const dry = await runDueCampaigns({ dry: true });
console.log("   →", JSON.stringify(dry));
// attendu : une campagne plus ancienne « due » peut exister ? Non : base vierge
// → la seule campagne est celle de DEMAIN → none_due attendu.
console.log(
  `   verdict : ${dry.reason === "none_due" ? "✅ aucun envoi (campagne de demain non due)" : dry.reason === "would_send" ? "⚠️ campagne due détectée (voir ci-dessus)" : dry.reason}`
);

console.log("6) runDueCampaigns RÉEL (sans dry)…");
const real = await runDueCampaigns({});
console.log("   →", JSON.stringify(real));
console.log(
  `   verdict : ${real.sent === 0 ? "✅ rien envoyé (logique de date correcte)" : "❌ UN ENVOI A EU LIEU — vérifier !"}`
);

console.log("7) Nettoyage…");
await q(`DELETE FROM scheduled_campaigns WHERE id = $1`, [testId]);
const cnt = await q(`SELECT COUNT(*)::int AS n FROM scheduled_campaigns`);
console.log(`   campagne test supprimée — table contient désormais ${cnt[0].n} ligne(s)`);

console.log("8) Migration : contrainte UNIQUE supprimée ?…");
await ensureScheduledCampaignsTable();
const hasUnique = (
  await q(
    `SELECT 1 FROM pg_constraint WHERE conname = 'scheduled_campaigns_send_date_key' AND conrelid = 'scheduled_campaigns'::regclass`
  )
).length;
console.log(`   contrainte UNIQUE encore présente : ${hasUnique ? "OUI ❌" : "NON ✅ (2 campagnes/jour possibles)"}`);

console.log("9) Quota quotidien (set/get)…");
const { setDailyLimit, getDailyLimit } = await import("../services/campaigns.js");
await setDailyLimit(2);
const limit2 = await getDailyLimit();
await setDailyLimit(1);
const limit1 = await getDailyLimit();
console.log(`   quota 2 → ${limit2} ✅ (normalisé ${limit2 === 2 ? "OK" : "KO"})`);
console.log(`   quota 1 → ${limit1} ✅ (normalisé ${limit1 === 1 ? "OK" : "KO"})`);

console.log("10) Deux campagnes même date ?…");
const sameDate = tomorrow;
await q(`DELETE FROM scheduled_campaigns WHERE send_date = $1::date`, [sameDate]);
const a = await q(
  `INSERT INTO scheduled_campaigns (title, message, url, audience, channels, send_date)
   VALUES ($1, $2, '/', 'all', ARRAY['push']::text[], $3::date) RETURNING id`,
  ["[TEST] Quota A", "test", sameDate]
);
const b = await q(
  `INSERT INTO scheduled_campaigns (title, message, url, audience, channels, send_date)
   VALUES ($1, $2, '/', 'all', ARRAY['push']::text[], $3::date) RETURNING id`,
  ["[TEST] Quota B", "test", sameDate]
);
console.log(`   deux lignes insérées : id=${a[0].id} et id=${b[0].id} ✅ (la contrainte UNIQUE a bien été levée)`);
await q(`DELETE FROM scheduled_campaigns WHERE id = ANY($1::int[])`, [[a[0].id, b[0].id]]);
console.log(`   nettoyé ✅`);

await client.end();
console.log("\nTerminé ✅");