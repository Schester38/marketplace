import { q } from "../db.js";
import { sendPushToUsers } from "../push.js";

// ---------------------------------------------------------------------------
// Notifications « cloche » (in-app) couplées au push.
//
// Principe retenu pour la plateforme : chaque événement notable (nouveau
// produit, promotion flash, message admin, paiement…) doit produire deux
// livraisons complémentaires :
//   1. une ligne dans `notifications` (la cloche 🔔, consultée par toutes les
//      visites, quel que soit l'abonnement push) ;
//   2. un push (uniquement aux appareils abonnés, filtrable par canal
//      push_prefs : flash / digest / messages).
// Ce fichier centralise les deux opérations pour éviter les oublis côté métier.
// ---------------------------------------------------------------------------

const INSERT_BATCH = 500;

/**
 * Insère une notification « cloche » pour une liste d'utilisateurs.
 * Insertion unique paramétrée (aucune interpolation SQL), par lots.
 * Colonnes utilisées : user_id, type, sale_id, product_id, product_name,
 * body (texte libre : nom/prix de promo, message admin…), amount.
 * @returns {Promise<number>} nombre de lignes insérées.
 */
export async function insertNotificationsForUsers(
  userIds,
  { type, sale_id, product_id, product_name, body, amount } = {}
) {
  const ids = [
    ...new Set((userIds || []).map(Number).filter((v) => Number.isInteger(v) && v > 0)),
  ];
  if (!ids.length) return 0;
  let inserted = 0;
  for (let i = 0; i < ids.length; i += INSERT_BATCH) {
    const chunk = ids.slice(i, i + INSERT_BATCH);
    const ph = [];
    const params = [];
    chunk.forEach((uid, j) => {
      const b = j * 7;
      params.push(
        uid,
        String(type || "info"),
        sale_id ? Number(sale_id) : null,
        product_id ? Number(product_id) : null,
        product_name ? String(product_name).slice(0, 200) : null,
        body ? String(body).slice(0, 500) : null,
        amount != null ? Number(amount) : null
      );
      ph.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`);
    });
    await q(
      `INSERT INTO notifications (user_id, type, sale_id, product_id, product_name, body, amount)
       VALUES ${ph.join(", ")}`,
      params
    );
    inserted += chunk.length;
  }
  return inserted;
}

/**
 * Diffusion « cloche + push » à (quasi) tous les utilisateurs, avec les mêmes
 * filtres que sendPushToAll : country, roles, excludeUserId, channel.
 * - Le push est envoyé en DIRECT à tous les abonnements des utilisateurs
 *   ciblés (comme le bouton « Tester ») : TOUS les abonnés sont traités, sans
 *   coupure budget-temps qui sauterait les abonnés en fin de liste.
 * - La cloche est ensuite insérée pour TOUTES les cibles (l'in-app ne dépend
 *   pas de l'abonnement push).
 * Le canal (flash / digest / messages) respecte les préférences push de chaque
 * utilisateur (Mon compte). Chaque étape est isolée dans un try/catch — jamais
 * bloquant pour l'appelant (la route répond toujours).
 * @returns {Promise<{users: number, inserted: number, sent: number}>}
 */
export async function broadcastNotification({
  type,
  payload,
  country,
  roles,
  excludeUserId,
  channel,
} = {}) {
  // 1. Sélection des utilisateurs cibles (mêmes filtres que sendPushToAll).
  const filters = [];
  const params = [];
  if (country) {
    params.push(String(country).trim());
    filters.push(`u.country = $${params.length}`);
  }
  if (roles && roles.length) {
    params.push(roles);
    filters.push(`u.role = ANY($${params.length})`);
  }
  if (excludeUserId) {
    params.push(Number(excludeUserId));
    filters.push(`u.id <> $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  let ids = [];
  try {
    const rows = await q(`SELECT u.id FROM users u ${where}`);
    ids = rows.map((r) => Number(r.id));
  } catch (err) {
    console.error("[notifications] sélection des utilisateurs impossible :", err.message);
  }

  // 2. Push (AVANT la cloche, comme le bouton « Tester ») : envoi DIRECT aux
  //    abonnements des cibles, tous traités (pas de coupure budget-temps).
  let sent = 0;
  if (payload && payload.title) {
    try {
      sent = await sendPushToUsers(ids, payload, { channel, timeoutMs: 2000, batch: 50 });
    } catch (err) {
      console.error("[notifications] push impossible :", err.message);
    }
  }

  // 3. Cloche (in-app) : une ligne par utilisateur (champ type obligatoire).
  let inserted = 0;
  if (ids.length && type && type.type) {
    try {
      inserted = await insertNotificationsForUsers(ids, type);
    } catch (err) {
      console.error("[notifications] insertion cloche impossible :", err.message);
    }
  }

  return { users: ids.length, inserted, sent };
}