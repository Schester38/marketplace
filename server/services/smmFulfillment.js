import crypto from "node:crypto";
import { q } from "../db.js";
import { mailConfigured, sendMail } from "../mailer.js";
import { SITE_URL } from "../urls.js";
import { sendWhatsAppText } from "./whatsapp.js";
import { getActiveProviderConfig, logSmmCall, NoProviderAdapter } from "./smmProvider.js";
import { notifyAdmins } from "./adminNotify.js";

export function generatePublicToken() {
  return crypto.randomBytes(16).toString("hex");
}

export function providerStatusToOrderStatus(raw) {
  const status = String(raw || "").trim().toLowerCase();
  if (!status) return null;
  if (["completed", "complete", "terminé", "termine"].includes(status)) return "completed";
  if (["partial", "partiel"].includes(status)) return "completed";
  if (["in progress", "in_progress", "processing", "en cours", "active"].includes(status)) return "processing";
  if (["pending", "submitted", "en attente", "queued", "in queue", "in_queue", "en file"].includes(status)) return "submitted";
  if (["canceled", "cancelled", "annulé", "annule"].includes(status)) return "cancelled";
  if (["refunded", "remboursé", "rembourse"].includes(status)) return "refunded";
  if (["fail", "failed", "error", "échoué", "echoue"].includes(status)) return "failed";
  return null;
}

export async function notifySmmUser(userId, title, body, options = {}) {
  const orderId = Number(options.orderId) || null;
  let email = String(options.email || "").trim();
  let phone = String(options.phone || "").trim();

  if (orderId && (!email || !phone)) {
    try {
      const rows = await q(
        `SELECT o.client_info, u.email AS user_email, u.phone AS user_phone
           FROM smm_orders o
           LEFT JOIN users u ON u.id = o.user_id
          WHERE o.id = $1`,
        [orderId]
      );
      const row = rows[0];
      const info = row?.client_info && typeof row.client_info === "object" ? row.client_info : {};
      email = email || String(info.email || row?.user_email || "").trim();
      phone = phone || String(info.phone || row?.user_phone || "").trim();
    } catch {
      /* contact best-effort */
    }
  }

  if (userId) {
    try {
      await q(
        `INSERT INTO notifications (user_id, type, body) VALUES ($1, 'smm_order', $2)`,
        [userId, String(body).slice(0, 500)]
      );
      const { sendPush } = await import("../push.js");
      sendPush(userId, { title, body, url: "/mboppi-boost/mes-commandes" }).catch(() => {});
    } catch {
      /* notification best-effort : ne jamais bloquer le traitement de la commande */
    }
  }

  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && mailConfigured()) {
    const suffix = orderId ? `\n\nSuivi : ${SITE_URL}/mboppi-boost/mes-commandes` : "";
    sendMail({ to: email, subject: title, text: `${body}${suffix}` }).catch(() => {});
  }

  if (phone && phone.replace(/\D/g, "").length >= 8) {
    sendWhatsAppText(phone, `${title}\n\n${body}`).catch(() => {});
  }
}

async function addEvent(orderId, eventType, oldStatus, newStatus, message, payload = {}) {
  try {
    await q(
      `INSERT INTO smm_order_events (order_id, event_type, old_status, new_status, message, provider_payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())`,
      [orderId, eventType, oldStatus || null, newStatus || null, message || null, JSON.stringify(payload || {})]
    );
  } catch {
    /* journal best-effort */
  }
}

/**
 * Marque une commande comme payée, de manière idempotente.
 * Utilisé par le webhook iKeePay et par la validation manuelle admin.
 */
export async function completeSmmPayment(orderId, providerRef = null, note = null) {
  const rows = await q(
    `UPDATE smm_orders
        SET status = 'paid', payment_status = 'paid',
            payment_reference = COALESCE(payment_reference, $2),
            paid_at = COALESCE(paid_at, now()), updated_at = now()
      WHERE id = $1
        AND status IN ('draft', 'pending_payment')
        AND payment_status <> 'paid'
      RETURNING id, user_id, service_name, total, currency, status`,
    [orderId, providerRef || null]
  );

  if (!rows.length) {
    const existing = (
      await q(
        `SELECT id, user_id, service_name, total, currency, status, payment_status
           FROM smm_orders WHERE id = $1`,
        [orderId]
      )
    )[0];
    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.status === "refund_pending") {
      return { ok: true, already: true, refund_required: true, order: existing };
    }
    if (existing.payment_status === "paid") {
      return { ok: true, already: true, order: existing };
    }
    if (["cancelled", "failed"].includes(existing.status)) {
      const refunded = await q(
        `UPDATE smm_orders
            SET status = 'refund_pending', payment_status = 'paid',
                payment_reference = COALESCE(payment_reference, $2),
                paid_at = COALESCE(paid_at, now()), updated_at = now()
          WHERE id = $1 AND status IN ('cancelled', 'failed')
            AND payment_status IS DISTINCT FROM 'refunded'
          RETURNING id, user_id, service_name, total, currency, status, payment_status`,
        [orderId, providerRef || null]
      );
      if (refunded.length) {
        const order = refunded[0];
        await addEvent(
          order.id,
          "payment_after_cancel",
          existing.status,
          "refund_pending",
          `Paiement recu apres ${existing.status === "failed" ? "echec" : "annulation"} - remboursement requis`,
          { provider_reference: providerRef || null }
        );
        await notifySmmUser(
          order.user_id,
          "Paiement recu apres annulation MboppiBoost",
          `Votre paiement pour la commande #${order.id} a ete recu alors que la commande etait ${existing.status === "failed" ? "en echec" : "annulee"}. Un remboursement est en cours de traitement.`,
          { orderId: order.id }
        );
        notifyAdmins({
          title: "MboppiBoost - remboursement requis",
          body: `Paiement recu apres ${existing.status === "failed" ? "echec" : "annulation"} : commande #${order.id} (${order.service_name}) - ${order.total} ${order.currency}.`,
          amount: Number(order.total),
        }).catch(() => {});
        return { ok: true, refund_required: true, order };
      }
    }
    return {
      ok: existing.payment_status === "paid" || existing.status !== "pending_payment",
      already: true,
      order: existing,
    };
  }

  const order = rows[0];
  await addEvent(
    order.id,
    "payment_confirmed",
    "pending_payment",
    "paid",
    note || "Paiement confirmé",
    { provider_reference: providerRef || null, source: note ? "admin" : "ikeepay" }
  );
  await notifySmmUser(
    order.user_id,
    "Paiement MboppiBoost confirmé",
    `Votre paiement pour la commande #${order.id} (${order.service_name}) est confirmé. Nous préparons sa transmission.`,
    { orderId: order.id }
  );
  return { ok: true, order };
}

/**
 * Transmet immédiatement une commande qui vient d'être payée.
 * Ne lève jamais : un échec de dispatch ne doit pas faire échouer le webhook.
 * Le cron reste le filet de sécurité pour les commandes restées en attente.
 */
export async function dispatchSmmOrderNow(orderId) {
  try {
    return await dispatchSmmOrder(orderId);
  } catch (err) {
    console.error(`[smm] dispatch immédiat #${orderId} impossible :`, err.message);
    return { ok: false, error: err.message || "dispatch_error" };
  }
}

/**
 * Filet de sécurité : transmet les commandes payées qui n'ont pas encore de
 * référence externe. Le webhook, lui, appelle `dispatchSmmOrderNow` tout de suite.
 */
export async function dispatchPaidSmmOrders(limit = 5) {
  const max = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const rows = await q(
    `SELECT id FROM smm_orders
      WHERE status = 'paid' AND payment_status = 'paid' AND external_reference IS NULL
        AND (provider_status IS DISTINCT FROM 'dispatching'
             OR updated_at < now() - interval '10 minutes')
      ORDER BY paid_at ASC NULLS LAST, created_at ASC
      LIMIT $1`,
    [max]
  );
  const results = [];
  for (const row of rows) {
    results.push({ order_id: row.id, ...(await dispatchSmmOrderNow(row.id)) });
  }
  return { checked: rows.length, dispatched: results.filter((r) => r.ok).length, results };
}

/**
 * Annule les commandes impayées trop anciennes. Les commandes payées ne sont
 * jamais touchées (historique financier).
 */
export async function cleanupSmmOrders({ olderThanHours = 48, dryRun = false, limit = 200 } = {}) {
  const hours = Math.min(Math.max(Number(olderThanHours) || 48, 1), 24 * 90);
  const max = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const rows = await q(
    `SELECT id, status FROM smm_orders
      WHERE status IN ('draft', 'pending_payment')
        AND COALESCE(payment_status, 'unpaid') = 'unpaid'
        AND payment_declared_at IS NULL
        AND created_at < now() - ($1::text || ' hours')::interval
      ORDER BY created_at ASC
      LIMIT $2`,
    [hours, max]
  );
  if (dryRun) return { dry_run: true, would_cancel: rows.length, order_ids: rows.map((r) => r.id) };

  for (const row of rows) {
    await q(
      `UPDATE smm_orders
          SET status = 'cancelled', payment_status = 'cancelled', updated_at = now()
        WHERE id = $1 AND status IN ('draft', 'pending_payment')`,
      [row.id]
    );
    await addEvent(
      row.id,
      "auto_cancelled",
      row.status,
      "cancelled",
      `Commande impayée annulée automatiquement après ${hours} h`,
      {}
    );
  }
  return { dry_run: false, cancelled: rows.length, order_ids: rows.map((r) => r.id) };
}

/**
 * Envoie une commande payée au fournisseur SMM configuré.
 * Ne fait rien si la commande a déjà une référence externe (idempotence).
 */
export async function dispatchSmmOrder(orderId) {
  const rows = await q(
    `SELECT o.*, s.external_service_id AS service_external_id,
            m.external_service_id AS mapping_external_id
     FROM smm_orders o
     JOIN smm_services s ON s.id = o.service_id
     LEFT JOIN smm_providers p ON p.provider_key = 'smm_africa' AND p.is_active = TRUE
     LEFT JOIN smm_provider_mappings m
       ON m.smm_service_id = o.service_id AND m.provider_id = p.id AND m.is_active = TRUE
     WHERE o.id = $1`,
    [orderId]
  );
  if (!rows.length) return { ok: false, error: "Commande introuvable" };
  const order = rows[0];

  if (order.external_reference) {
    return { ok: true, already_sent: true, external_reference: order.external_reference };
  }
  if (order.provider_status === "submitted") {
    return { ok: true, already_sent: true };
  }

  if (!["paid", "submitted", "processing"].includes(order.status)) {
    return {
      ok: false,
      error: `La commande n'est pas éligible à une transmission (statut ${order.status}).`,
    };
  }
  if (order.payment_status !== "paid") {
    return { ok: false, error: "Le paiement de cette commande n'est pas confirmé." };
  }

  const { provider, adapter } = await getActiveProviderConfig();
  if (!provider || !adapter || adapter instanceof NoProviderAdapter) {
    return { ok: false, error: "Aucun fournisseur SMM configuré. La commande reste payée et sera traitée manuellement." };
  }

  const externalServiceId = order.mapping_external_id || order.service_external_id;
  if (!externalServiceId) {
    return {
      ok: false,
      error: "Ce service n'a pas de correspondance chez le fournisseur. Importez le catalogue ou associez le service.",
    };
  }

  const clientInfo = order.client_info || {};
  const link = clientInfo.profile_url || clientInfo.link || clientInfo.target || "";
  if (!link) {
    return { ok: false, error: "Le client n'a pas fourni de lien ou de compte cible." };
  }

  // Verrou atomique : le webhook, le polling et le cron peuvent confirmer le
  // même paiement en parallèle. Un seul appelant transmet la commande.
  const claimed = await q(
    `UPDATE smm_orders
        SET provider_status = 'dispatching', updated_at = now()
      WHERE id = $1
        AND status IN ('paid', 'submitted', 'processing')
        AND payment_status = 'paid'
        AND external_reference IS NULL
        AND (provider_status IS DISTINCT FROM 'dispatching'
             OR updated_at < now() - interval '10 minutes')
      RETURNING id`,
    [order.id]
  );
  if (!claimed.length) {
    const current = (
      await q(
        `SELECT external_reference, provider_status, status FROM smm_orders WHERE id = $1`,
        [order.id]
      )
    )[0];
    if (current?.external_reference) {
      return { ok: true, already_sent: true, external_reference: current.external_reference };
    }
    return {
      ok: false,
      already_in_progress: current?.provider_status === "dispatching",
      error:
        current?.provider_status === "dispatching"
          ? "La transmission de cette commande est déjà en cours."
          : `La commande n'est plus éligible à une transmission (statut ${current?.status || order.status}).`,
    };
  }

  try {
    const result = await adapter.placeOrder({
      external_service_id: externalServiceId,
      service_id: order.service_id,
      link,
      quantity: order.quantity,
      comments: clientInfo.objectif || clientInfo.comments || null,
      username: clientInfo.username || null,
      idempotency_key: order.idempotency_key || `smm-${order.id}`,
    });

    if (!result || !result.ok) {
      throw new Error(result?.error || "Le fournisseur a refusé la commande");
    }

    const reference = result.external_reference || result.provider_reference || null;
    await q(
      `UPDATE smm_orders
       SET status = 'submitted', provider_status = 'submitted',
           external_reference = $1, provider_reference = $1, updated_at = now()
       WHERE id = $2 AND external_reference IS NULL`,
      [reference, order.id]
    );
    await addEvent(
      order.id,
      "submitted_to_provider",
      order.status,
      "submitted",
      `Commande transmise au fournisseur${reference ? ` (réf. ${reference})` : ""}`,
      { provider, external_reference: reference }
    );
    await logSmmCall({
      provider,
      event: "place_order",
      payload: { order_id: order.id, external_service_id: externalServiceId, quantity: order.quantity },
      status: "ok",
      orderId: order.id,
    });
    await notifySmmUser(
      order.user_id,
      "Commande MboppiBoost transmise",
      `Votre commande #${order.id} (${order.service_name}) est en cours de traitement.`,
      { orderId: order.id }
    );
    return { ok: true, external_reference: reference, provider };
  } catch (err) {
    await q(
      `UPDATE smm_orders SET provider_status = 'dispatch_error', updated_at = now()
        WHERE id = $1 AND external_reference IS NULL`,
      [order.id]
    );
    await addEvent(order.id, "provider_error", order.status, order.status, `Échec fournisseur : ${err.message}`, {
      provider,
    });
    await logSmmCall({
      provider,
      event: "place_order_error",
      payload: { order_id: order.id, message: err.message },
      status: "error",
      orderId: order.id,
    });
    return { ok: false, error: err.message || "Erreur fournisseur" };
  }
}

/**
 * Met à jour les commandes en cours depuis le fournisseur SMM.
 * Limité aux commandes déjà transmises et possédant une référence externe.
 */
export async function syncSmmOrders(limit = 20) {
  const { provider, adapter } = await getActiveProviderConfig();
  if (!provider || !adapter || adapter instanceof NoProviderAdapter) {
    return { ok: false, error: "Aucun fournisseur SMM configuré.", checked: 0, updated: 0 };
  }

  const max = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const rows = await q(
    `SELECT id, user_id, service_name, status, provider_status, external_reference
     FROM smm_orders
     WHERE status IN ('submitted', 'processing')
       AND external_reference IS NOT NULL
     ORDER BY updated_at ASC
     LIMIT $1`,
    [max]
  );

  let updated = 0;
  const errors = [];
  for (const order of rows) {
    try {
      const result = await adapter.checkOrderStatus(order.external_reference);
      const nextStatus = providerStatusToOrderStatus(result.status);
      const rawProviderStatus = result.status ? String(result.status).slice(0, 100) : order.provider_status;

      if (nextStatus && nextStatus !== order.status) {
        await q(
          `UPDATE smm_orders
           SET status = $1, provider_status = $2, updated_at = now(),
               completed_at = CASE WHEN $1 IN ('completed', 'refunded', 'cancelled')
                                   THEN COALESCE(completed_at, now()) ELSE completed_at END
           WHERE id = $3`,
          [nextStatus, rawProviderStatus, order.id]
        );
        await addEvent(
          order.id,
          "provider_status_sync",
          order.status,
          nextStatus,
          `Statut fournisseur : ${result.status || "inconnu"}`,
          { provider, remains: result.remains ?? null, charge: result.charge ?? null }
        );
        if (nextStatus === "completed") {
          await notifySmmUser(
            order.user_id,
            "Commande MboppiBoost terminée",
            `Votre commande #${order.id} (${order.service_name}) est terminée.`,
            { orderId: order.id }
          );
        } else if (nextStatus === "failed" || nextStatus === "cancelled") {
          await notifySmmUser(
            order.user_id,
            "Commande MboppiBoost interrompue",
            `Votre commande #${order.id} (${order.service_name}) est ${nextStatus === "failed" ? "échouée" : "annulée"}. Contactez le support.`,
            { orderId: order.id }
          );
        }
        updated++;
      } else if (rawProviderStatus && rawProviderStatus !== order.provider_status) {
        await q(`UPDATE smm_orders SET provider_status = $1, updated_at = now() WHERE id = $2`, [
          rawProviderStatus,
          order.id,
        ]);
      }
      await logSmmCall({
        provider,
        event: "check_status",
        payload: { order_id: order.id, status: result.status },
        status: "ok",
        orderId: order.id,
      });
    } catch (err) {
      errors.push({ order_id: order.id, error: err.message });
      await logSmmCall({
        provider,
        event: "check_status_error",
        payload: { order_id: order.id, message: err.message },
        status: "error",
        orderId: order.id,
      });
    }
  }

  return { ok: true, checked: rows.length, updated, errors };
}

export { addEvent };
