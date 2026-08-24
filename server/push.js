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

export async function sendPush(userId, payload) {
  const subs = await q("SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1", [
    userId,
  ]);
  if (!subs.length) return;
  const raw = {
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: "/favicon-32x32.png",
    tag: payload.tag,
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: payload.url || "/" },
  };
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s.endpoint, JSON.stringify(raw), { headers: { TTL: 3600 } });
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await q("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
        }
      }
    })
  );
}
