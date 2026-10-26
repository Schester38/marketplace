import { q } from "../db.js";

// Coordonnées de paiement manuel MboppiBoost.
// Valeurs par défaut alignées sur les instructions d'adhésion ; l'admin peut
// les modifier depuis l'onglet Boost sans redéploiement.
export const SMM_PAYMENT_DEFAULTS = {
  orange_money: "699486146",
  mtn_mobile_money: "672886348",
  moneyfusion_phone: "672886348",
  account_name: "Ndjoum Jean Arthur",
  whatsapp: "237699486146",
  note: "Effectuez le dépôt du montant exact, puis déclarez votre paiement avec la référence de la transaction. Votre commande est traitée dès validation par notre équipe.",
};

const FIELD_KEYS = Object.keys(SMM_PAYMENT_DEFAULTS);

function cleanInfo(raw) {
  const info = { ...SMM_PAYMENT_DEFAULTS };
  if (!raw || typeof raw !== "object") return info;
  for (const key of FIELD_KEYS) {
    const value = raw[key];
    if (typeof value === "string") info[key] = value.trim().slice(0, 500);
  }
  return info;
}

export async function getSmmPaymentInfo() {
  try {
    const rows = await q(`SELECT value FROM platform_settings WHERE key = 'smm_payment_info'`);
    const raw = rows[0]?.value;
    return cleanInfo(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...SMM_PAYMENT_DEFAULTS };
  }
}

export async function setSmmPaymentInfo(info) {
  const clean = cleanInfo(info);
  await q(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('smm_payment_info', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(clean)]
  );
  return clean;
}
