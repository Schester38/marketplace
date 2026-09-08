import { Router } from "express";
import { q, withTransaction } from "../db.js";
import { authRequired } from "../auth.js";
import { vapidPublicKey, sendPush } from "../push.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get("/key", (req, res) => {
  res.json({ public_key: vapidPublicKey });
});

router.post(
  "/subscribe",
  authRequired,
  ah(async (req, res) => {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: "Abonnement push invalide" });
    }
    await q(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`,
      [req.user.id, String(endpoint), { p256dh: String(keys.p256dh), auth: String(keys.auth) }]
    );
    res.json({ ok: true });
  })
);

router.post(
  "/unsubscribe",
  authRequired,
  ah(async (req, res) => {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await q("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [
        req.user.id,
        String(endpoint),
      ]);
    }
    res.json({ ok: true });
  })
);

// Envoi d'une notification de test sur TOUS les appareils abonnés de l'utilisateur
// connecté. Sert à vérifier immédiatement la livraison (écran verrouillé inclus).
router.post(
  "/test",
  authRequired,
  ah(async (req, res) => {
    const [row] = await q(
      "SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1",
      [req.user.id]
    );
    const count = Number(row?.n || 0);
    if (!count) {
      return res
        .status(400)
        .json({ error: "Aucun appareil abonné sur ce compte.", code: "NO_SUB" });
    }
    const sent = await sendPush(req.user.id, {
      title: "🔔 Test de notification Mboppi",
      body: "Si vous la voyez, les notifications push fonctionnent sur cet appareil, même écran fermé.",
      url: "/compte",
      tag: `push-test-${Date.now()}`,
    });
    res.json({ sent, configured: Boolean(vapidPublicKey), subscribers: count });
  })
);

// Mise à jour d'un abonnement expiré (déclenché côté navigateur par l'événement
// `pushsubscriptionchange` du service worker : rotation FCM, réinstallation…).
// L'ancien endpoint est un "capability URL" secret : le posséder suffit à prouver
// qu'on est bien l'auteur de l'abonnement — aucun JWT requis ici (le service
// worker ne peut pas lire le token de session).
router.post(
  "/refresh",
  ah(async (req, res) => {
    const { old_endpoint, subscription } = req.body || {};
    const newEndpoint = subscription?.endpoint;
    const keys = subscription?.keys;
    if (!old_endpoint || !newEndpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Abonnement invalide" });
    }
    let replaced = 0;
    try {
      replaced = await withTransaction(async (tx) => {
        const found = await tx.query(
          "SELECT user_id FROM push_subscriptions WHERE endpoint = $1",
          [String(old_endpoint)]
        );
        if (!found.length) return 0;
        await tx.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [
          String(old_endpoint),
        ]);
        await tx.query(
          `INSERT INTO push_subscriptions (user_id, endpoint, keys)
           VALUES ($1, $2, $3)
           ON CONFLICT (endpoint) DO UPDATE SET keys = EXCLUDED.keys, created_at = now()`,
          [
            found[0].user_id,
            String(newEndpoint),
            { p256dh: String(keys.p256dh), auth: String(keys.auth) },
          ]
        );
        return 1;
      });
    } catch (err) {
      console.error("[push] refresh échoué :", err.message);
      return res.status(500).json({ error: "Mise à jour impossible" });
    }
    if (!replaced) {
      return res.status(404).json({ error: "Ancien abonnement introuvable" });
    }
    res.json({ ok: true });
  })
);

// État réel d'abonnement push de l'utilisateur (bannière + Mon compte).
router.get(
  "/status",
  authRequired,
  ah(async (req, res) => {
    const [sub] = await q(
      "SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1",
      [req.user.id]
    );
    res.json({
      subscribed: Number(sub?.n || 0) > 0,
      configured: Boolean(vapidPublicKey), // VAPID présent côté serveur
    });
  })
);

// Préférences de notifications push (flash / digest / messages). Absence de
// ligne = tout activé par défaut.
router.get(
  "/prefs",
  authRequired,
  ah(async (req, res) => {
    const row = (
      await q("SELECT flash_ok, digest_ok, messages_ok FROM push_prefs WHERE user_id = $1", [
        req.user.id,
      ])
    )[0];
    res.json({
      prefs: {
        flash: row ? row.flash_ok !== false : true,
        digest: row ? row.digest_ok !== false : true,
        messages: row ? row.messages_ok !== false : true,
      },
    });
  })
);

router.put(
  "/prefs",
  authRequired,
  ah(async (req, res) => {
    const b = req.body || {};
    const toBool = (v, dflt) => (typeof v === "boolean" ? v : dflt);
    // Valeurs actuelles comme base (pour ne pas écraser un canal non envoyé).
    const cur = (
      await q("SELECT flash_ok, digest_ok, messages_ok FROM push_prefs WHERE user_id = $1", [
        req.user.id,
      ])
    )[0];
    const flash = toBool(b.flash, cur ? cur.flash_ok !== false : true);
    const digest = toBool(b.digest, cur ? cur.digest_ok !== false : true);
    const messages = toBool(b.messages, cur ? cur.messages_ok !== false : true);
    await q(
      `INSERT INTO push_prefs (user_id, flash_ok, digest_ok, messages_ok, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (user_id)
       DO UPDATE SET flash_ok = $2, digest_ok = $3, messages_ok = $4, updated_at = now()`,
      [req.user.id, flash, digest, messages]
    );
    res.json({ ok: true, prefs: { flash, digest, messages } });
  })
);

export default router;
