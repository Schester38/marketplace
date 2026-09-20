import { q } from "../db.js";
import { sendPushToUsers } from "../push.js";
import { insertNotificationsForUsers } from "./notifications.js";
import { sendMail } from "../mailer.js";

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
let cachedEmails = [];
let cachedAt = 0;

async function getAdminContacts() {
  const now = Date.now();
  if (cachedIds.length && now - cachedAt < 60000) {
    return { ids: cachedIds, emails: cachedEmails };
  }
  try {
    const rows = await q("SELECT id, email FROM users WHERE role = 'admin' AND email_verified");
    cachedIds = rows.map((r) => Number(r.id)).filter(Number.isInteger);
    // E-mail : la même liste sert à la trace écrite (aucune requête de plus).
    cachedEmails = rows
      .map((r) => String(r.email || "").trim())
      .filter((e) => e.includes("@"));
    cachedAt = now;
  } catch (err) {
    console.error("[admin-notify] liste des comptes admin impossible :", err.message);
  }
  return { ids: cachedIds, emails: cachedEmails };
}

async function getAdminUserIds() {
  return (await getAdminContacts()).ids;
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
    // E-mail : trace écrite sur la boîte de l'admin (en plus du push et de la
    // cloche). Silencieux si le SMTP n'est pas configuré (mode simulé).
    try {
      const { emails } = await getAdminContacts();
      for (const to of emails) {
        try {
          await sendMail({
            to,
            subject: `Mboppi — ${title}`,
            text: `${body}\n\n${url ? `Détail : ${url}` : ""}`.trim(),
            html: `<p>${String(title)}</p><p>${String(body)}</p>${
              amount != null ? `<p><strong>Montant : ${Number(amount)}</strong></p>` : ""
            }`,
          });
        } catch (err) {
          console.error("[admin-notify] e-mail admin impossible :", err.message);
        }
      }
    } catch (err) {
      console.error("[admin-notify] e-mails admin impossibles :", err.message);
    }
    return sent;
  } catch (err) {
    console.error("[admin-notify] échec :", err?.message || err);
    return 0;
  }
}
