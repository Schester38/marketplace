// Bascule « adhésion obligatoire » — contrôlée par l'admin depuis le panneau
// (Administration → Système de paiement). Stockée dans platform_settings
// (clé membership_gate), le serveur fait autorité :
//   — "seller" (défaut) : seuls les vendeurs paient l'adhésion ; boutiques et
//     créateurs accèdent gratuitement à leur espace ;
//   — "all" : boutiques, vendeurs ET créateurs sont soumis à l'adhésion
//     (30 jours, compte à rebours posé à chaque paiement ou approbation).
// Module autonome (aucune dépendance circulaire) : réutilise le motif
// auto-réparant de ikeepay.js pour la table platform_settings.
import { q } from "../db.js";

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

async function ensureTable() {
  await q(TABLE_SQL);
}

function isMissingRelation(err) {
  return Boolean(
    err && (err.code === "42P01" || /relation .* does not exist/i.test(err.message || ""))
  );
}

export async function getMembershipGate() {
  try {
    const row = (
      await q("SELECT value FROM platform_settings WHERE key = 'membership_gate'")
    )[0];
    return row && row.value === "all" ? "all" : "seller";
  } catch (err) {
    if (isMissingRelation(err)) {
      try {
        await ensureTable();
      } catch {
        /* ignoré : on retombera sur le défaut */
      }
    }
    // Défaut sûr : boutiques et créateurs restent gratuits si la lecture
    // échoue (jamais de blocage accidentel de boutiques).
    return "seller";
  }
}

export async function setMembershipGate(gate) {
  const clean = gate === "all" ? "all" : "seller";
  await ensureTable();
  await q(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('membership_gate', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [clean]
  );
  return clean;
}

// Rôles soumis à l'adhésion selon la bascule. Le vendeur l'est toujours ;
// boutique et créateur uniquement quand l'admin a activé le blocage global.
export async function membershipRoles() {
  const gate = await getMembershipGate();
  return gate === "all" ? ["seller", "shop", "creator"] : ["seller"];
}