import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { q } from "../db.js";
import { authRequired, authOptional, MEMBERSHIP_FEES } from "../auth.js";
import {
  PAYMENT_MODE_AUTO,
  getPaymentMode,
  getIkeepayKeys,
  getPublicPaymentSettings,
  isIkeepayConfigured,
  getWebhookSecret,
  buildInlineCheckoutUrl,
  addPublicKey,
  genExternalRef,
  processWebhook,
  reconcileMembershipFromWebhookLog,
  activateMembershipUser,
} from "../services/ikeepay.js";

const router = Router();
const webhookRouter = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Infos publiques de configuration (mode actif + présence de clés) — aucun
// secret n'est exposé. Utilisé par le client pour choisir entre les deux
// systèmes (manuel / automatique).
router.get(
  "/settings",
  ah(async (req, res) => {
    res.json(await getPublicPaymentSettings());
  })
);

// Statut de l'adhésion de l'utilisateur courant + auto-réparation. S'il
// existe un webhook « payment.success » non rattaché (référence non
// reconnue) du même montant, on complete l'adhésion à la volée : le client
// qui sonde ce endpoint après le checkout obtient l'activation même si la
// référence renvoyée par iKeePay diffère. C'est ce qui rend la redirection
// vers l'espace de travail 100 % automatique, sans intervention admin.
router.get(
  "/membership-status",
  authRequired,
  ah(async (req, res) => {
    const fee = MEMBERSHIP_FEES[req.user.role];
    if (!fee) return res.json({ active: true, reconciled: false });
    const user = (
      await q(
        `SELECT id, email, admin_approved, membership_expires_at
           FROM users WHERE id = $1`,
        [req.user.id]
      )
    )[0];
    if (!user) return res.status(401).json({ error: "Session invalide" });
    const active = Boolean(
      user.admin_approved &&
        user.membership_expires_at &&
        new Date(user.membership_expires_at) > new Date()
    );
    if (active) return res.json({ active: true, reconciled: false });
    // Filet 1 : le webhook a déjà confirmé le paiement (status='completed')
    // mais la tâche d'activation asynchrone a été interrompue (serverless
    // arrêté après la réponse) → on active maintenant. Idempotent.
    const completed = (
      await q(
        `SELECT id FROM membership_payments
         WHERE user_id = $1 AND status = 'completed' AND amount = $2
           AND created_at >= now() - interval '24 hours'
         ORDER BY created_at DESC LIMIT 1`,
        [user.id, fee]
      )
    )[0];
    if (completed) {
      const ok = await activateMembershipUser(user.id).catch(() => false);
      if (ok) {
        return res.json({
          active: true,
          reconciled: true,
          debug: {
            reason: "activated_after_completed_webhook",
            pending_membership: false,
            webhooks_24h: null,
          },
        });
      }
    }
    // Diagnostic : l'adhésion en attente existe-t-elle ? Des webhooks sont-ils
    // arrivés ? Le client affiche ces informations dans sa console — cela
    // permet de savoir précisément pourquoi l'activation n'a pas eu lieu.
    const pending = await q(
      `SELECT id FROM membership_payments
       WHERE user_id = $1 AND status IN ('pending','expired') AND amount = $2
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, fee]
    );
    const [r, whCount, whRows] = await Promise.all([
      pending.length
        ? reconcileMembershipFromWebhookLog({
            userId: user.id,
            email: user.email,
            amount: fee,
          }).catch((e) => ({ ok: false, reason: "reconcile_error:" + e.message }))
        : Promise.resolve({ ok: false, reason: "no_pending_membership" }),
      q(
        `SELECT COUNT(*)::int AS n FROM payment_webhook_logs
         WHERE created_at >= now() - interval '24 hours'`
      ),
      q(
        `SELECT event, status, error, created_at FROM payment_webhook_logs
         WHERE created_at >= now() - interval '24 hours'
         ORDER BY created_at DESC LIMIT 5`
      ),
    ]);
    let activeNow = Boolean(r && r.ok);
    if (activeNow) {
      // La réconciliation a marqué le paiement 'completed' : on active le
      // compte immédiatement pour que CETTE réponse annonce déjà l'accès
      // (et déclenche la redirection côté client sans attendre le cycle suivant).
      await activateMembershipUser(user.id).catch(() => {});
    }
    const reason = activeNow ? "completed" : (r && r.reason) || "error";
    res.json({
      active: activeNow,
      reconciled: activeNow,
      debug: {
        reason,
        pending_membership: pending.length > 0,
        webhooks_24h: (whCount[0] && whCount[0].n) || 0,
        recent_webhooks: (whRows.rows || []).map((w) => ({
          event: w.event,
          status: w.status,
          error: w.error,
          at: w.created_at,
        })),
      },
    });
  })
);

// Retourne l'URL de checkout inline iKeePay pour payer une adhésion en ligne.
// En mode manuel, refusé (l'admin bascule le mode dans le panneau admin).
// NOTE : pas de roleRequired ici — un utilisateur paie justement parce qu'il
// n'a PAS d'adhésion active (roleRequired renverrait 402 MEMBERSHIP_REQUIRED).
router.post(
  "/membership-payin",
  authRequired,
  ah(async (req, res) => {
    if (!["shop", "seller", "creator"].includes(req.user.role)) {
      return res.status(403).json({ error: "Accès réservé aux boutiques / vendeurs / créateurs" });
    }
    const mode = await getPaymentMode();
    if (mode !== PAYMENT_MODE_AUTO) {
      return res.status(409).json({
        error: "Le paiement en ligne est désactivé (mode manuel actif).",
        code: "PAYMENT_MODE_MANUAL",
      });
    }
    const fee = MEMBERSHIP_FEES[req.user.role];
    if (!fee) {
      return res.status(400).json({ error: "Aucune adhésion requise pour ce rôle." });
    }
    const { publicKey } = await getIkeepayKeys();
    if (!publicKey) {
      return res.status(503).json({
        error: "Le paiement en ligne n'est pas configuré par l'administration.",
        code: "IKEEPAY_NOT_CONFIGURED",
      });
    }
    const externalRef = genExternalRef("MBP-MEM");
    const email = String((req.user && req.user.email) || "");
    const currency = "XAF";
    const created = (
      await q(
        `INSERT INTO membership_payments (user_id, amount, currency, external_reference, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
        [req.user.id, fee, currency, externalRef]
      )
    )[0];
    const checkout = addPublicKey(
      buildInlineCheckoutUrl({
        amount: fee,
        currency,
        orderId: externalRef,
        email,
      }),
      publicKey
    );
    res.json({
      ok: true,
      payment_id: created.id,
      order_id: externalRef,
      amount: fee,
      currency,
      checkout_url: checkout,
    });
  })
);

// Retourne l'URL de checkout inline iKeePay pour effectuer un don en ligne.
router.post(
  "/donation-payin",
  authOptional,
  ah(async (req, res) => {
    const mode = await getPaymentMode();
    if (mode !== PAYMENT_MODE_AUTO) {
      return res.status(409).json({
        error: "Le don en ligne est désactivé (mode manuel actif).",
        code: "PAYMENT_MODE_MANUAL",
      });
    }
    const amount = Math.round(Number((req.body && req.body.amount) || 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Montant de don invalide." });
    }
    const { publicKey } = await getIkeepayKeys();
    if (!publicKey) {
      return res.status(503).json({
        error: "Le paiement en ligne n'est pas configuré par l'administration.",
        code: "IKEEPAY_NOT_CONFIGURED",
      });
    }
    const externalRef = genExternalRef("MBP-DON");
    const email = String((req.body && req.body.email) || "");
    const currency = "XAF";
    const created = (
      await q(
        `INSERT INTO donations (amount, currency, country, status, external_reference, payment_link)
         VALUES ($1, $2, 'Cameroun', 'pending', $3, '') RETURNING id`,
        [amount, currency, externalRef]
      )
    )[0];
    const checkout = addPublicKey(
      buildInlineCheckoutUrl({ amount, currency, orderId: externalRef, email }),
      publicKey
    );
    res.json({
      ok: true,
      donation_id: created.id,
      order_id: externalRef,
      amount,
      currency,
      checkout_url: checkout,
    });
  })
);

// Webhook iKeePay : iKeePay POST un JSON dès qu'une transaction est confirmée.
// Répond 200 dès que le payload est reconnu pour stopper les retries.
// (même si la référence est inconnue → on journalise et on répond quand même).
webhookRouter.post(
  "/webhook",
  ah(async (req, res) => {
    // Authentification du webhook : seul iKeePay (qui connaît l'URL secrète
    // configurée dans son dashboard) peut poster ici. Sans ce token, toute
    // requête est rejetée — sinon n'importe qui pourrait activer une adhésion
    // en forgant un « payment.success » (le endpoint est public).
    const expected = await getWebhookSecret();
    const given = String(req.query.k || req.get("x-ikeepay-token") || "");
    const a = Buffer.from(String(given));
    const b = Buffer.from(String(expected));
    if (
      a.length !== b.length ||
      !timingSafeEqual(a, b)
    ) {
      return res
        .status(403)
        .json({ received: false, error: "invalid_webhook_token" });
    }
    // Tolérance : certains clients envoient le JSON avec un content-type
    // différent → express.json ne l'a pas parsé (req.body = {}). On tente un
    // reparsing depuis le corps brut si disponible.
    let body = req.body;
    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      const raw = req.rawBody || (req.body && req.body.raw);
      if (raw) {
        try {
          body = JSON.parse(String(raw));
        } catch {
          /* garder {} */
        }
      }
    }
    const result = await processWebhook(body || {});
    res.json({ received: true, ...result });
  })
);

// Diagnostic : permet de voir rapidement si le webhook a bien été reçu (garde
// le même corps que POST mais ne fait aucun traitement). Protégé par le fait
// qu'il ne renvoie que les dernières entrées de logs via l'API admin.
webhookRouter.get(
  "/webhook",
  ah(async (req, res) => {
    res.json({ ok: true, note: "iKeePay webhook endpoint (POST JSON)" });
  })
);

export { router as default, webhookRouter };
