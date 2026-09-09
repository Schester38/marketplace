import { q } from "../db.js";
import { sendPushToUsers } from "../push.js";
import { insertNotificationsForUsers } from "./notifications.js";

// ---------------------------------------------------------------------------
// Notifications du compte administrateur (push + cloche 🔔).
//
// L'admin « virtuel » (mot de passe ADMIN_PASSWORD, id 0) ne peut pas recevoir
// de notifications : push_subscriptions et notifications référencent users.id.
// Depuis la carte « Compte administrateur » du panneau, l'admin dispose d'un
// VRAI compte (rôle 'admin', email vérifié) et peut s'abonner au push. Ce
// module diffuse les événements de la plateforme (inscriptions, adhésions,
// retraits, dons, ventes, livraisons) à tous les comptes de rôle 'admin'.
//
// - Push non bloquant pour la requête métier : erreurs avalées et journalisées.
// - La cloche est insérée en plus (historique visible dans la Navbar).
// - Cache des ids admin (60 s) pour éviter une requête SQL à chaque événement.
// ---------------------------------------------------------------------------

let cachedIds = [];
let cachedAt = 0;

async function getAdminUserIds() {
  const now = Date.now();
  if (cachedIds.length && now - cachedAt < 60000) return cachedIds;
  try {
    const rows = await q("SELECT id FROM users WHERE role = 'admin' AND email_verified");
    cachedIds = rows.map((r) => Number(r.id)).filter(Number.isInteger);
    cachedAt = now;
  } catch (err) {
    console.error("[admin-notify] liste des comptes admin impossible :", err.message);
  }
  return cachedIds;
}

/**
 * Diffuse un événement à tous les comptes administrateur (push + cloche).
 * Ne lève jamais : un échec de notification ne doit pas faire échouer
 * la requête métier qui l'appelle.
 * @returns {Promise<number>} nombre de push réellement envoyés.
 */
export async function notifyAdmins({
  title,
  body,
  url = "/admin",
  type = "admin_event",
  sale_id = null,
  product_id = null,
  product_name = null,
  amount = null,
} = {}) {
  try {
    if (!title || !body) return 0;
    const ids = await getAdminUserIds();
    if (!ids.length) return 0;
    let sent = 0;
    try {
      sent = await sendPushToUsers(ids, { title, body, url });
    } catch (err) {
      console.error("[admin-notify] push impossible :", err.message);
    }
    try {
      await insertNotificationsForUsers(ids, {
        type,
        sale_id,
        product_id,
        product_name,
        body: String(body).slice(0, 200),
        amount,
      });
    } catch (err) {
      console.error("[admin-notify] cloche impossible :", err.message);
    }
    return sent;
  } catch (err) {
    console.error("[admin-notify] échec :", err?.message || err);
    return 0;
  }
}
