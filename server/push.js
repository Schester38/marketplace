import webpush from "web-push";
import { q } from "./db.js";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!PUBLIC_KEY || !PRIVATE_KEY) {
  console.warn(
    "⚠️  VAPID keys non configurées : les push notifications seront désactivées. Définissez VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY."
  );
} else {
  webpush.setVapidDetails("mailto:contact@mboppi.app", PUBLIC_KEY, PRIVATE_KEY);
}

export const vapidPublicKey = PUBLIC_KEY || "";

function buildPayload(payload) {
  return {
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: "/favicon-32x32.png",
    tag: payload.tag,
    renotify: true,
    // Son de notification (le service worker s'en sert dans sw.js).
    sound: "/notification.wav",
    vibrate: [200, 100, 200],
    data: { url: payload.url || "/" },
  };
}

// Envoi à un abonnement : 1 si livré, 0 sinon. Les abonnements morts (404/410)
// sont purgés automatiquement. IMPORTANT : web-push exige l'OBJET subscription
// { endpoint, keys } — le passage de l'endpoint seul chiffre avec des clés
// vides et échoue/est rejeté par le push service.
async function sendToSub(sub, raw) {
  try {
    const subscription = {
      endpoint: sub.endpoint,
      keys: typeof sub.keys === "object" ? sub.keys : {},
    };
    // TTL 24 h : un appareil éteint reçoit quand même la notification au
    // redémarrage (au lieu d'une expiration après 1 h).
    await webpush.sendNotification(subscription, JSON.stringify(raw), {
      headers: { TTL: 86400 },
    });
    return 1;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await q("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]).catch(() => {});
    }
    return 0;
  }
}

export async function sendPush(userId, payload) {
  const subs = await q("SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1", [
    userId,
  ]);
  if (!subs.length) return 0;
  const raw = buildPayload(payload);
  let sent = 0;
  await Promise.allSettled(
    subs.map(async (s) => {
      sent += await sendToSub(s, raw);
    })
  );
  return sent;
}

/**
 * Diffusion à tous les abonnés (broadcast), avec filtres optionnels :
 *   - country : pays de l'utilisateur (ex. pays de la boutique émettrice)
 *   - roles   : liste de rôles cibles (ex. ["seller", "client"])
 *   - excludeUserId : exclut un utilisateur (ex. la boutique qui crée la promo)
 * Anti-timeout serverless : envoi par lots de `batch` avec un budget temps
 * global (`budgetMs`) — au-delà, l'envoi s'arrête proprement (les lots suivants
 * sont abandonnés plutôt que de faire mourir la fonction Vercel).
 * Non bloquant par conception : l'appelant n'attend pas le résultat.
 * @returns {Promise<number>} nombre de notifications réellement envoyées.
 */
export async function sendPushToAll(
  payload,
  { country, roles, excludeUserId, channel, budgetMs = 4000, batch = 50 } = {}
) {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return 0;
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
  // Préférences par canal : absence de ligne push_prefs = canal activé.
  // Si la table push_prefs n'existe pas encore (migration pas encore passée),
  // on diffuse sans filtre de préférences plutôt que d'échouer.
  const CHANNEL_COLUMNS = { flash: "flash_ok", digest: "digest_ok", messages: "messages_ok" };
  const usePrefs = channel && CHANNEL_COLUMNS[channel];
  const baseFilters = [...filters];
  const buildSql = (withPrefs) => {
    const all = [...baseFilters];
    if (withPrefs) all.push(`COALESCE(pp.${CHANNEL_COLUMNS[channel]}, TRUE) = TRUE`);
    const where = all.length ? `WHERE ${all.join(" AND ")}` : "";
    return (
      `SELECT ps.id, ps.endpoint, ps.keys
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       ${withPrefs ? "LEFT JOIN push_prefs pp ON pp.user_id = u.id" : ""}
       ${where}
      ORDER BY ps.id`
    );
  };
  let subs = null;
  try {
    subs = await q(buildSql(usePrefs), params);
  } catch (err) {
    if (!usePrefs) {
      console.error("[push] requête abonnés impossible :", err.message);
      return 0;
    }
    console.warn("[push] push_prefs indisponible, diffusion sans préférences :", err.message);
    try {
      subs = await q(buildSql(false), params);
    } catch (err2) {
      console.error("[push] requête abonnés impossible (fallback) :", err2.message);
      return 0;
    }
  }
  if (!subs.length) return 0;
  const raw = buildPayload(payload);
  const started = Date.now();
  let sent = 0;
  for (let i = 0; i < subs.length; i += batch) {
    if (Date.now() - started > budgetMs) break;
    await Promise.allSettled(
      subs.slice(i, i + batch).map(async (s) => {
        sent += await sendToSub(s, raw);
      })
    );
  }
  return sent;
}
