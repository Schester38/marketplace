import { Router } from "express";
import jwt from "jsonwebtoken";
import { ensureDonationPaymentColumns, q } from "../db.js";
import {
  authorizeConfirm,
  verifyIkeepayWebhookAuth,
} from "../services/paymentSecurity.js";
import { authRequired } from "../auth.js";
import {
  countryCode,
  currencyForCountry,
  inlineCheckoutUrl,
  normalizePhone,
  payin,
  publicBaseUrl,
} from "../ikeepay.js";
import {
  completeAutomaticPayout,
  completeMembershipPayment,
  completePlatformPayout,
  markSalePaid,
  payoutPlatformShare,
} from "../services/payouts.js";

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {}
  }
  next();
};

router.post(
  "/ikeepay/membership",
  authRequired,
  ah(async (req, res) => {
    const user = (await q("SELECT * FROM users WHERE id = $1", [req.user.id]))[0];
    // Adhésions : boutique 2 500 XAF, vendeur 1 500 XAF, créateur 2 500 XAF
    // (MEMBERSHIP_FEES). Sans le créateur ici, un créateur fermé par l'admin
    // ne pourrait jamais payer son adhésion et resterait bloqué.
    const fee =
      user?.role === "shop" ? 2500 : user?.role === "seller" ? 1500 : user?.role === "creator" ? 2500 : 0;
    if (!user || !fee)
      return res.status(403).json({ error: "Ce rôle ne nécessite pas d’adhésion" });
    if (
      user.admin_approved ||
      (user.membership_expires_at && new Date(user.membership_expires_at) > new Date())
    )
      return res.json({ ok: true, active: true });
    const existing = (
      await q(
        "SELECT * FROM membership_payments WHERE user_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1",
        [user.id]
      )
    )[0];
    if (existing)
      return res.json({
        ok: true,
        pending: true,
        payment_link: existing.payment_link,
        external_reference: existing.external_reference,
      });
    const country = countryCode(req.body?.country || user.country);
    const operator = String(req.body?.operator || "")
      .trim()
      .toUpperCase();
    const phone = normalizePhone(req.body?.phone || user.phone, country);
    if (!country || !operator || !phone)
      return res.status(400).json({ error: "Pays, opérateur et numéro de paiement requis" });
    const external = `MEMBERSHIP:${user.id}:${Date.now()}`;
    const created = (
      await q(
        "INSERT INTO membership_payments (user_id, amount, currency, external_reference) VALUES ($1, $2, $3, $4) RETURNING id",
        [
          user.id,
          fee,
          user.country === "Côte d'Ivoire" ? "XOF" : currencyForCountry(country),
          external,
        ]
      )
    )[0];
    try {
      const result = await payin({
        amount: fee,
        currency: user.country === "Côte d'Ivoire" ? "XOF" : currencyForCountry(country),
        country,
        phoneNumber: phone,
        operator,
        external_reference: external,
        customer_email: user.email,
      });
      const link = result.payment_link || result.data?.payment_link || null;
      await q("UPDATE membership_payments SET payment_link = $1 WHERE id = $2", [link, created.id]);
      return res
        .status(201)
        .json({ ok: true, payment_link: link, external_reference: external, provider: result });
    } catch (error) {
      // Repli : checkout hébergé iKeePay (le client choisit son opérateur).
      console.error(
        "[ikeepay] payin adhésion rejeté :",
        error.statusCode,
        error.message,
        JSON.stringify(error.providerPayload || null)
      );
      let fallbackLink = null;
      try {
        fallbackLink = inlineCheckoutUrl({
          amount: fee,
          currency: user.country === "Côte d'Ivoire" ? "XOF" : currencyForCountry(country),
          orderId: external,
          email: user.email,
          redirectUrl: `${publicBaseUrl()}/`,
        });
        if (fallbackLink) {
          await q("UPDATE membership_payments SET payment_link = $1 WHERE id = $2", [
            fallbackLink,
            created.id,
          ]);
        }
      } catch (fallbackError) {
        console.error("[ikeepay] repli adhésion en échec :", fallbackError.message);
        fallbackLink = null;
      }
      if (fallbackLink) {
        return res.status(201).json({
          ok: true,
          payment_link: fallbackLink,
          external_reference: external,
          fallback: true,
        });
      }
      const fallbackReason =
        process.env.IKEEPAY_PUBLIC_KEY || process.env.IKE_PUBLIC_KEY
          ? "Construction du lien impossible"
          : "Clé publique iKeePay absente du déploiement (variable IKEEPAY_PUBLIC_KEY)";
      console.error("[ikeepay] repli adhésion indisponible :", fallbackReason);
      try {
        await q("UPDATE membership_payments SET status = 'failed', error = $1 WHERE id = $2", [
          error.message,
          created.id,
        ]);
      } catch {}
      const status =
        Number(error.statusCode) >= 400 && Number(error.statusCode) < 600
          ? Number(error.statusCode)
          : 502;
      return res.status(status).json({
        error: `${error.message || "Initialisation du paiement impossible"} · Repli indisponible : ${fallbackReason}`,
        detail: error.providerPayload || null,
        fallback_reason: fallbackReason,
      });
    }
  })
);

router.post(
  "/ikeepay/payin",
  optionalAuth,
  ah(async (req, res) => {
    const saleId = Number(req.body?.sale_id);
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [saleId]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    // Le livreur peut initier le payin au nom de son client (flux « En ligne
    // (iKeePay) » du formulaire de livraison). Le payin précède désormais la
    // confirmation de la livraison, donc delivered_by peut ne pas être posé.
    const isLivreurForSale = req.user && req.user.role === "livreur";
    if (sale.buyer_id && (!req.user || (sale.buyer_id !== req.user.id && !isLivreurForSale)))
      return res.status(403).json({ error: "Cette commande ne vous appartient pas" });
    if (
      !sale.buyer_id &&
      !isLivreurForSale &&
      String(req.body?.confirm_code || "")
        .trim()
        .toUpperCase() !== String(sale.confirm_code || "").toUpperCase()
    )
      return res.status(403).json({ error: "Code de confirmation incorrect" });
    if (sale.status === "cancelled")
      return res.status(409).json({ error: "Cette commande est annulée" });
    if (sale.payment_status === "paid" || sale.payment_status === "completed")
      return res.json({ ok: true, already_paid: true });
    if (sale.payment_external_reference)
      return res.json({ ok: true, pending: true, payment_link: sale.payment_link });

    const country = countryCode(
      req.body?.country || sale.payment_country || req.user?.country || sale.payment_country
    );
    const operator = String(req.body?.operator || "")
      .trim()
      .toUpperCase();
    const phone = normalizePhone(req.body?.phone || sale.buyer_phone, country);
    if (!country || !operator || !phone)
      return res.status(400).json({ error: "Pays, opérateur et numéro Mobile Money requis" });
    const externalReference = `SALE:${sale.id}:${Date.now()}`;
    // Le delivery_fee peut être fourni par le livreur (il précède la livraison)
    // car au moment du payin la vente n'est pas encore marquée livrée.
    const deliveryFee =
      req.body?.delivery_fee != null
        ? Number(req.body.delivery_fee)
        : Number(sale.delivery_fee || 0);
    const saleAmount = Math.round(
      (Number(sale.total_price) + deliveryFee) * 100
    ) / 100;
    const saleCurrency = sale.currency || currencyForCountry(country);
    let result;
    try {
      result = await payin({
        amount: saleAmount,
        currency: saleCurrency,
        country,
        phoneNumber: phone,
        operator,
        external_reference: externalReference,
        customer_email: req.user?.email || undefined,
      });
    } catch (error) {
      // Repli : checkout hébergé iKeePay (le client choisit son opérateur).
      console.error(
        "[ikeepay] payin vente rejeté :",
        error.statusCode,
        error.message,
        JSON.stringify(error.providerPayload || null)
      );
      let fallbackLink = null;
      try {
        fallbackLink = inlineCheckoutUrl({
          amount: saleAmount,
          currency: saleCurrency,
          orderId: externalReference,
          email: req.user?.email,
          redirectUrl: `${publicBaseUrl()}/suivi/${sale.id}`,
        });
      } catch (fallbackError) {
        console.error("[ikeepay] repli vente en échec :", fallbackError.message);
      }
      try {
        await q(
          `UPDATE sales SET online_payment = TRUE, payment_status = 'pending', payment_provider = 'ikeepay',
           payment_external_reference = $1, payment_link = $2, payment_country = $3, payment_operator = $4,
           payment_error = CASE WHEN $2 IS NULL THEN $6 ELSE NULL END WHERE id = $5`,
          [externalReference, fallbackLink, country, operator, sale.id, error.message]
        );
      } catch (dbError) {
        console.error("[ikeepay] mise à jour vente échouée :", dbError.message);
      }
      if (fallbackLink) {
        return res.status(201).json({
          ok: true,
          external_reference: externalReference,
          payment_link: fallbackLink,
          fallback: true,
        });
      }
      const fallbackReason =
        process.env.IKEEPAY_PUBLIC_KEY || process.env.IKE_PUBLIC_KEY
          ? "Construction du lien impossible"
          : "Clé publique iKeePay absente du déploiement (variable IKEEPAY_PUBLIC_KEY)";
      console.error("[ikeepay] repli vente indisponible :", fallbackReason);
      const status =
        Number(error.statusCode) >= 400 && Number(error.statusCode) < 600
          ? Number(error.statusCode)
          : 502;
      return res.status(status).json({
        error: `${error.message || "Initialisation du paiement impossible"} · Repli indisponible : ${fallbackReason}`,
        detail: error.providerPayload || null,
        fallback_reason: fallbackReason,
      });
    }
    const paymentLink = result.payment_link || result.data?.payment_link || null;
    await q(
      `UPDATE sales SET online_payment = TRUE, payment_status = 'pending', payment_provider = 'ikeepay',
       payment_external_reference = $1, payment_link = $2, payment_country = $3, payment_operator = $4,
       payment_error = NULL WHERE id = $5`,
      [externalReference, paymentLink, country, operator, sale.id]
    );
    res.status(201).json({
      ok: true,
      external_reference: externalReference,
      payment_link: paymentLink,
      provider: result,
    });
  })
);

router.post(
  "/ikeepay/webhook",
  ah(async (req, res) => {
    // Journalisation systématique (avant tout traitement).
    const data = (req.body && req.body.data) || {};
    const external = String(data.external_reference || "").trim();
    let logged = null;
    try {
      const ins = await q(
        `INSERT INTO payment_webhook_logs (provider, provider_transaction_id, provider_order_id, event, payload, status, authenticated, error)
         VALUES ('ikeepay', $1, $2, $3, $4, $5, FALSE, 'IKEEPAY_WEBHOOK_AUTH_FAILED reason=auth_unconfirmed_no_mechanism') RETURNING id`,
        [
          data.provider_reference || null,
          external || null,
          req.body?.event || null,
          req.body,
          data.status || null,
        ]
      );
      logged = ins[0];
    } catch (logErr) {
      console.error("[ikeepay] journalisation webhook échouée :", logErr.message);
    }

    // ── SÉCURITÉ — authentification fail-closed du webhook entrant ─────────
    // iKeePay ne documente aucun secret/signature sur les callbacks entrants :
    // aucun webhook n'est traité (aucun payout, aucune mutation de statut).
    // Le flux nominal continue via /ikeepay/confirm (JWT / jeton de transaction).
    // Réactivation : implémenter la vérification dans verifyIkeepayWebhookAuth()
    // une fois le mécanisme réel confirmé par iKeePay.
    const auth = verifyIkeepayWebhookAuth();
    if (!auth.ok) {
      console.error(`[ikeepay] IKEEPAY_WEBHOOK_AUTH_FAILED reason=${auth.reason}`);
      if (logged) {
        await q(
          "UPDATE payment_webhook_logs SET handled = FALSE, error = $1 WHERE id = $2",
          [`IKEEPAY_WEBHOOK_AUTH_FAILED reason=${auth.reason}`, logged.id]
        ).catch(() => {});
      }
      return res.status(401).json({ error: "Webhook non authentifié" });
    }

    // ── Traitement (non atteignable tant que le mécanisme n'est pas confirmé) ──
    // Auto-réparation schéma : donations.provider_reference / completed_at sur
    // les bases au schéma ancien.
    try {
      await ensureDonationPaymentColumns();
    } catch {}
    const sale = (
      await q("SELECT * FROM sales WHERE payment_external_reference = $1", [external])
    )[0];
    const membership = (
      await q("SELECT * FROM membership_payments WHERE external_reference = $1", [external])
    )[0];
    const platformPayout =
      external.startsWith("MBOPPI_ACTIVATION:") || external.startsWith("MBOPPI_SHARE:");
    const donation = (
      await q("SELECT * FROM donations WHERE external_reference = $1", [external])
    )[0];
    if (String(data.type || "").toLowerCase() === "payout") {
      const payoutStatus = String(data.status || "").toLowerCase();
      let payoutResult;
      if (platformPayout && payoutStatus === "completed") {
        payoutResult = await completePlatformPayout(external, data.provider_reference || null);
      } else if (payoutStatus === "failed") {
        await q(
          "UPDATE automatic_payouts SET status = 'failed', provider_reference = COALESCE($1, provider_reference), error = $2 WHERE external_reference = $3",
          [data.provider_reference || null, "Le prestataire a refusé le retrait", external]
        );
        await q(
          "UPDATE platform_payouts SET status = 'failed', provider_reference = COALESCE($1, provider_reference), error = $2 WHERE external_reference = $3 AND status <> 'completed'",
          [data.provider_reference || null, "Le prestataire a refusé le reversement Mboppi", external]
        );
        payoutResult = { ok: false, error: "Le prestataire a refusé le retrait" };
      } else if (payoutStatus === "completed") {
        payoutResult = await completeAutomaticPayout(external, data.provider_reference || null);
      } else {
        await q(
          "UPDATE automatic_payouts SET status = 'pending', provider_reference = COALESCE($1, provider_reference) WHERE external_reference = $2",
          [data.provider_reference || null, external]
        );
        payoutResult = { ok: true, pending: true };
      }
      await q("UPDATE payment_webhook_logs SET handled = $1, error = $2 WHERE id = $3", [
        payoutResult.ok,
        payoutResult.error || null,
        logged[0].id,
      ]);
    } else if (donation && String(data.type || "").toLowerCase() === "payin") {
      const status = String(data.status || "").toLowerCase();
      await q(
        "UPDATE donations SET status = $1, provider_reference = COALESCE($2, provider_reference), completed_at = CASE WHEN $1 = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END WHERE id = $3",
        [
          status === "completed" ? "completed" : status === "failed" ? "failed" : "pending",
          data.provider_reference || null,
          donation.id,
        ]
      );
      // Règle Mboppi : 90 % de chaque don encaissé via Ikeepay est reversé sur
      // les portefeuilles Mboppi (les 10 % couvrent les frais de traitement).
      if (status === "completed") {
        await payoutPlatformShare({
          kind: "donation",
          sourceId: donation.id,
          amount: Number(donation.amount),
          currency: donation.currency,
        });
      }
      await q("UPDATE payment_webhook_logs SET handled = TRUE WHERE id = $1", [logged[0].id]);
    } else if (membership && String(data.type || "").toLowerCase() === "payin") {
      const status = String(data.status || "").toLowerCase();
      if (status === "completed")
        await completeMembershipPayment(membership.id, data.provider_reference || null);
      else if (status === "failed")
        await q(
          "UPDATE membership_payments SET status = 'failed', provider_reference = COALESCE($1, provider_reference), error = $2 WHERE id = $3",
          [data.provider_reference || null, data.status || null, membership.id]
        );
      await q("UPDATE payment_webhook_logs SET handled = TRUE WHERE id = $1", [logged[0].id]);
    } else if (sale && String(data.type || "").toLowerCase() === "payin") {
      const status = String(data.status || "").toLowerCase();
      const next = status === "completed" ? "paid" : status === "failed" ? "failed" : "pending";
      await q(
        `UPDATE sales SET payment_status = $1, payment_provider_reference = COALESCE($2, payment_provider_reference),
         payment_error = CASE WHEN $1 = 'failed' THEN $3 ELSE NULL END, paid = CASE WHEN $1 = 'paid' THEN TRUE ELSE paid END,
         paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END
       WHERE id = $4`,
        [next, data.provider_reference || null, data.status || null, sale.id]
      );
      if (next === "paid") await markSalePaid(sale.id, {});
      await q("UPDATE payment_webhook_logs SET sale_id = $1, handled = TRUE WHERE id = $2", [
        sale.id,
        logged[0].id,
      ]);
    }
    res.json({ ok: true });
  })
);

// Le checkout hébergé iKeePay ne notifie PAS notre serveur via webhook :
// iKeePay confirme le paiement UNIQUEMENT côté client (postMessage
// « ikeepay-success »), comme le fait le plugin WooCommerce officiel. Ce
// endpoint permet au client de remonter la confirmation une fois le paiement
// réussi, afin qu'on marque le paiement « completed » et qu'on déclenche les
// reversements (90 % vers les portefeuilles Mboppi pour les dons).
// Cette route est idempotente : appelée plusieurs fois, elle ne re-paye pas.
router.post(
  "/ikeepay/confirm",
  optionalAuth,
  ah(async (req, res) => {
    const external = String(req.body?.external_reference || "").trim();
    if (!external) return res.status(400).json({ error: "Référence externe manquante" });

    // 1) Donation (protégée par jeton de transaction — permet les dons d'invités)
    const donation = (
      await q("SELECT * FROM donations WHERE external_reference = $1", [external])
    )[0];
    if (donation) {
      const authz = authorizeConfirm({
        kind: "donation",
        record: donation,
        user: req.user || null,
        token: req.body?.confirm_token || null,
      });
      if (!authz.ok) return res.status(authz.code).json({ error: authz.error });
      if (donation.status === "completed")
        return res.json({ ok: true, already: true });
      await q(
        "UPDATE donations SET status = 'completed', completed_at = COALESCE(completed_at, now()) WHERE id = $1",
        [donation.id]
      );
      let payout;
      try {
        payout = await payoutPlatformShare({
          kind: "donation",
          sourceId: donation.id,
          amount: Number(donation.amount),
          currency: donation.currency,
        });
      } catch (pErr) {
        payout = { ok: false, error: pErr.message };
      }
      // Traçabilité du reversement sur la ligne donation (colonnes
      // payout_status / payout_error présentes sur la table réelle).
      try {
        await q(
          "UPDATE donations SET payout_status = $1, payout_error = $2, payout_provider_transaction_id = COALESCE($3, payout_provider_transaction_id) WHERE id = $4",
          [
            payout?.ok ? (payout.pending ? "pending" : "completed") : "failed",
            payout?.ok ? null : payout?.error || null,
            payout?.provider_reference ||
              payout?.provider?.provider_reference ||
              payout?.provider?.data?.provider_reference ||
              null,
            donation.id,
          ]
        );
      } catch (traceErr) {
        console.error("[ikeepay] trace payout donation échouée :", traceErr.message);
      }
      return res.json({ ok: true, donation: donation.id, payout });
    }

    // 2) Adhésion (paiement d'adhésion) — réservée à son propriétaire (JWT)
    const membership = (
      await q("SELECT * FROM membership_payments WHERE external_reference = $1", [external])
    )[0];
    if (membership) {
      const authz = authorizeConfirm({
        kind: "membership",
        record: membership,
        user: req.user || null,
        token: null,
      });
      if (!authz.ok) return res.status(authz.code).json({ error: authz.error });
      if (membership.status === "completed")
        return res.json({ ok: true, already: true });
      const result = await completeMembershipPayment(membership.id, null).catch((mErr) => ({
        ok: false,
        error: mErr.message,
      }));
      return res.json({ ok: true, ...result });
    }

    // 3) Vente (paiement automatique d'une commande) — acheteur (JWT) ou livreur (JWT)
    const sale = (
      await q("SELECT * FROM sales WHERE payment_external_reference = $1", [external])
    )[0];
    if (sale) {
      const authz = authorizeConfirm({
        kind: "sale",
        record: sale,
        user: req.user || null,
        token: null,
      });
      if (!authz.ok) return res.status(authz.code).json({ error: authz.error });
      // markSalePaid est atomique et idempotent : il verrouille la vente
      // (payout_initiated FALSE -> TRUE) et déclenche UN SEUL jeu de
      // reversements. Une confirmation déjà traitée retourne already:true.
      let payouts;
      try {
        payouts = await markSalePaid(sale.id, {});
      } catch (pErr) {
        payouts = { ok: false, error: pErr.message };
      }
      return res.json({ ok: true, sale: sale.id, ...payouts });
    }

    return res.status(404).json({ error: "Aucun paiement en attente pour cette référence" });
  })
);

export default router;
