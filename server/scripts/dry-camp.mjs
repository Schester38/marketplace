// Diagnostic CRON CAMPAGNES — AUCUN ENVOI (dry uniquement).
// Usage : node scripts/dry-camp.mjs [.env]
import "./_load-env.mjs";
const { runDueCampaigns, todayDouala, getCronSecret } = await import("../services/campaigns.js");

console.log("Aujourd'hui (Cameroun) :", todayDouala());
const secret = await getCronSecret();
console.log("Secret cron (préfixe) :", String(secret).slice(0, 6) + "…");

const dry = await runDueCampaigns({ dry: true });
console.log("runDueCampaigns DRY :", JSON.stringify(dry, null, 2));

// Simulation exacte de la requête que le cron externe / Vercel enverrait.
// Sans token → doit donner invalid_cron_token ; avec token → ok.
const { cronTokenOk } = await import("../services/campaigns.js");
console.log("cronTokenOk(sans token) :", cronTokenOk("", secret));
console.log("cronTokenOk(mauvais)   :", cronTokenOk("abc", secret));
console.log("cronTokenOk(bon token) :", cronTokenOk(secret, secret));