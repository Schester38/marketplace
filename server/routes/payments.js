import { Router } from "express";
import { q } from "../db.js";
import { authRequired, authOptional, MEMBERSHIP_FEES } from "../auth.js";
import {
  PAYMENT_MODE_AUTO,
  getPaymentMode,
  getIkeepayKeys,
  getPublicPaymentSettings,
  isIkeepayConfigured,
  buildInlineCheckoutUrl,
  addPublicKey,
  genExternalRef,
  processWebhook,
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
