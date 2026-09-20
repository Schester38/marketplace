// Reset des préférences push : flash/digest/messages = ON pour les comptes
// désignés. Sauvegarde l'état AVANT (réversibilité) puis vérifie APRÈS.
// Usage : node scripts/push-reset-prefs.mjs .env 313 308 292 291
import fs from "node:fs";
import pg from "pg";

const envFile = process.argv[2] || ".env";
const ids = process.argv.slice(3).map(Number).filter(Number.isInteger);
if (!ids.length) {
  console.error("Aucun user_id fourni. Usage : node scripts/push-reset-prefs.mjs [env] id1 id2 ...");
  process.exit(1);
}
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const q = (t, p) => client.query(t, p);

const names = await q(`SELECT id, name, role FROM users WHERE id = ANY($1::int[]) ORDER BY id`, [ids]);
console.log("Comptes ciblés :", names.rows.map((r) => `#${r.id} ${r.name} [${r.role}]`).join(" | "));

// 1) État AVANT (sauvegarde pour réversibilité).
const before = await q(
  `SELECT pp.user_id, pp.flash_ok, pp.digest_ok, pp.messages_ok
   FROM push_prefs pp WHERE pp.user_id = ANY($1::int[]) ORDER BY pp.user_id`,
  [ids]
);
console.log("\n=== AVANT (sauvegarde) ===");
console.log(JSON.stringify(before.rows));
const missing = ids.filter((id) => !before.rows.some((r) => r.user_id === id));
if (missing.length) console.log("(pas de ligne push_prefs pour :", missing.join(", "), "→ défaut serveur = tout ON)");

// 2) Reset complet.
const upd = await q(
  `UPDATE push_prefs SET flash_ok = TRUE, digest_ok = TRUE, messages_ok = TRUE, updated_at = now()
   WHERE user_id = ANY($1::int[]) RETURNING user_id`,
  [ids]
);
console.log(`\n=== RESET appliqué : ${upd.rows.length} ligne(s) mise(s) à jour ===`);

// 3) Pour ceux qui n'avaient pas de ligne : insérer explicite tout-ON.
for (const id of missing) {
  await q(
    `INSERT INTO push_prefs (user_id, flash_ok, digest_ok, messages_ok, updated_at)
     VALUES ($1, TRUE, TRUE, TRUE, now()) ON CONFLICT (user_id) DO NOTHING`,
    [id]
  );
  console.log(`ligne créée pour user #${id}`);
}

// 4) Vérification APRÈS.
const after = await q(
  `SELECT pp.user_id, u.name, pp.flash_ok, pp.digest_ok, pp.messages_ok, pp.updated_at
   FROM push_prefs pp JOIN users u ON u.id = pp.user_id
   WHERE pp.user_id = ANY($1::int[]) ORDER BY pp.user_id`,
  [ids]
);
console.log("\n=== APRÈS ===");
for (const r of after.rows) {
  console.log(
    `user #${r.user_id} ${r.name} : flash=${r.flash_ok ? "ON" : "OFF"} digest=${r.digest_ok ? "ON" : "OFF"} messages=${r.messages_ok ? "ON" : "OFF"} (maj ${r.updated_at.toISOString().slice(0, 16)})`
  );
}

// 5) Nouvelle portée totale des campagnes.
const reach = await q(
  `SELECT COUNT(DISTINCT ps.user_id)::int AS recevront,
          (SELECT COUNT(*)::int FROM push_subscriptions) AS endpoints
   FROM push_subscriptions ps LEFT JOIN push_prefs pp ON pp.user_id = ps.user_id
   WHERE COALESCE(pp.messages_ok, TRUE) = TRUE`
);
console.log(`\n>>> Portée campagne push : ${reach.rows[0].recevront} utilisateurs / ${reach.rows[0].endpoints} appareils`);

// Rappel rollback.
console.log("\nRollback possible (état sauvegardé ci-dessus) : ex. pour tout remettre OFF :");
console.log(`UPDATE push_prefs SET flash_ok = FALSE, digest_ok = FALSE, messages_ok = FALSE WHERE user_id IN (${ids.join(", ")});`);

await client.end();
console.log("\nTerminé.");