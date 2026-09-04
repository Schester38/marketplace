// Notification WhatsApp de l'administrateur (demandes de retrait d'activation).
// Deux fournisseurs pris en charge, configurables dans le panneau Admin :
//   — « callmebot » : gratuit, aucune validation Meta — il suffit d'un numéro
//     admin au format international + d'une clé API obtenue sur callmebot.com ;
//   — « cloud » : WhatsApp Cloud API officielle de Meta (token + phone number ID).
//     IMPORTANT : hors fenêtre de 24 h (le destinataire n'a pas écrit au numéro
//     pro récemment), Meta refuse les messages texte libres et n'accepte que des
//     messages « template » approuvés. Le template attendu est « utilitaire »,
//     langue fr, avec NEUF variables dans le corps :
//       {{1}} parrain (nom + réf) · {{2}} montant · {{3}} parrainés · {{4}} email ·
//       {{5}} commentaire · {{6}} titulaire · {{7}} wallet 1 · {{8}} wallet 2 ·
//       {{9}} wallet 3.
//     Chaque valeur est volontairement courte (< 128 car.) car Meta limite chaque
//     variable. Sans template renseigné, on tente l'envoi en texte libre
//     (fonctionne uniquement dans la fenêtre de 24 h).
// Aucune clé n'est renvoyée au client (elles restent côté serveur).
// L'envoi ne doit JAMAIS bloquer une requête métier : toujours passer par
// sendWhatsAppSafe() (timeout + erreurs avalées et journalisées).
import { q } from "../db.js";

const TIMEOUT_MS = 5000;

async function getSetting(key, fallback = "") {
  try {
    const row = (await q("SELECT value FROM platform_settings WHERE key = $1", [key]))[0];
    return row && row.value != null ? String(row.value) : fallback;
  } catch {
    return fallback;
  }
}

// Configuration complète (usage serveur uniquement — contient les secrets).
export async function getWhatsAppConfig() {
  const [
    provider,
    adminPhone,
    callmebotKey,
    cloudToken,
    cloudPhoneId,
    notifyEmail,
    cloudTemplate,
  ] = await Promise.all([
    getSetting("whatsapp_provider"),
    getSetting("whatsapp_admin_phone"),
    getSetting("whatsapp_callmebot_key"),
    getSetting("whatsapp_cloud_token"),
    getSetting("whatsapp_cloud_phone_id"),
    getSetting("notify_email"),
    getSetting("whatsapp_cloud_template"),
  ]);
  return { provider, adminPhone, callmebotKey, cloudToken, cloudPhoneId, notifyEmail, cloudTemplate };
}

// Email admin de notification (utilisé par le branchement « retraits »).
export async function getAdminNotifyEmail() {
  return (await getWhatsAppConfig()).notifyEmail;
}

// Config « publique » pour le panneau admin : booléens de configuration +
// numéro masqué. Aucune clé secrète complète n'est exposée.
export async function getPublicWhatsAppSettings() {
  const c = await getWhatsAppConfig();
  const mask = (s) =>
    s ? (s.length <= 6 ? "••••" : s.slice(0, 3) + "••••" + s.slice(-3)) : "";
  return {
    provider: c.provider || "",
    configured:
      (c.provider === "callmebot" && Boolean(c.adminPhone && c.callmebotKey)) ||
      (c.provider === "cloud" && Boolean(c.cloudToken && c.cloudPhoneId)),
    admin_phone_masked: mask(c.adminPhone),
    notify_email: c.notifyEmail || "",
    cloud_template: c.cloudTemplate || "",
  };
}

export async function setWhatsAppSettings({
  provider,
  adminPhone,
  callmebotKey,
  cloudToken,
  cloudPhoneId,
  notifyEmail,
  cloudTemplate,
}) {
  const map = {
    whatsapp_provider: provider || "",
    whatsapp_admin_phone: adminPhone || "",
    whatsapp_callmebot_key: callmebotKey || "",
    whatsapp_cloud_token: cloudToken || "",
    whatsapp_cloud_phone_id: cloudPhoneId || "",
    notify_email: notifyEmail || "",
    whatsapp_cloud_template: cloudTemplate || "",
  };
  for (const [key, value] of Object.entries(map)) {
    await q(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value]
    );
  }
}

// Normalise un numéro vers le format international sans « + » requis par
// CallMeBot (ex. 237699486146). Tolère « +237... », espaces et tirets.
function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

async function fetchWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaCallmebot(cfg, message) {
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${normalizePhone(cfg.adminPhone)}` +
    `&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(cfg.callmebotKey)}`;
  const res = await fetchWithTimeout(url, { method: "GET" });
  if (!res.ok) throw new Error(`callmebot HTTP ${res.status}`);
}

async function sendViaCloudApi(cfg, message, templateParams) {
  // Le destinataire doit être au format E.164 avec « + » (ex. +237699486146).
  const to = "+" + normalizePhone(cfg.adminPhone);
  let payload;
  if (cfg.cloudTemplate && templateParams && templateParams.length) {
    // Template approuvé dans Meta Business Manager. Corps attendu (utilitaire,
    // langue fr) : « ... Parrain : {{1}} / Montant : {{2}} / ... / {{9}} wallet 3 »
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: cfg.cloudTemplate,
        language: { code: "fr" },
        components: [
          {
            type: "body",
            parameters: templateParams.map((t) => ({ type: "text", text: String(t) })),
          },
        ],
      },
    };
  } else {
    // Texte libre : uniquement valable dans la fenêtre de service de 24 h.
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    };
  }
  const res = await fetchWithTimeout(
    `https://graph.facebook.com/v20.0/${cfg.cloudPhoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.cloudToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) throw new Error(`cloud api HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);
}

// Envoi effectif. Retourne le provider utilisé ou lève une erreur.
// templateParams : tableau de valeurs (chaînes) pour les variables {{1}}, {{2}}…
// — utilisé uniquement en mode « cloud » avec template renseigné.
export async function sendWhatsApp(message, templateParams) {
  const cfg = await getWhatsAppConfig();
  if (cfg.provider === "callmebot") {
    if (!cfg.adminPhone || !cfg.callmebotKey) throw new Error("callmebot non configuré");
    await sendViaCallmebot(cfg, message);
    return "callmebot";
  }
  if (cfg.provider === "cloud") {
    if (!cfg.cloudToken || !cfg.cloudPhoneId || !cfg.adminPhone) {
      throw new Error("cloud api non configurée");
    }
    await sendViaCloudApi(cfg, message, templateParams);
    return "cloud";
  }
  throw new Error("whatsapp non configuré");
}

// Envoi « sans risque » pour la requête métier : ne lève jamais, journalise.
export async function sendWhatsAppSafe(message, templateParams) {
  try {
    const provider = await sendWhatsApp(message, templateParams);
    console.log(`[whatsapp] notification envoyée via ${provider}`);
    return true;
  } catch (err) {
    console.error("[whatsapp] envoi impossible :", err.message);
    return false;
  }
}
