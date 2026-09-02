// Notification du parrain lors d'une adhésion parrainée payée (commission
// d'activation de 1 000 F). Partagé entre :
//   — les actions manuelles de l'admin (approbation / parrainages) ;
//   — le webhook de paiement automatique iKeePay (adhésion payée en ligne).
// Garantit qu'aucune notification en doublon n'est envoyée (appelé uniquement
// quand la balance du parrain augmente réellement).
import { q } from "../db.js";

export const ACTIVATION_COMMISSION = 1000;

export async function notifyActivationReferralPaid(parraine) {
  if (!parraine || !parraine.referred_by || Number(parraine.referred_by) === Number(parraine.id)) {
    return;
  }
  if (!["seller", "creator"].includes(parraine.role)) return;
  const parrain = (
    await q("SELECT id, role FROM users WHERE id = $1", [parraine.referred_by])
  )[0];
  if (!parrain || parrain.role !== "seller") return;
  await q(
    `INSERT INTO notifications (user_id, type, amount) VALUES ($1, 'activation_referral_paid', $2)`,
    [parrain.id, ACTIVATION_COMMISSION]
  );
  try {
    const { sendPush } = await import("../push.js");
    await sendPush(parrain.id, {
      title: "Adhésion payée ✅",
      body: `${parraine.name} a payé son adhésion — votre commission de ${ACTIVATION_COMMISSION} F est en attente.`,
      url: "/seller",
    });
  } catch (err) {
    console.error("[activation-referral] push impossible :", err.message);
  }
}
