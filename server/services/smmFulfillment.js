import crypto from "node:crypto";
import { q } from "../db.js";
import { getActiveProviderConfig, logSmmCall, NoProviderAdapter } from "./smmProvider.js";

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

export async function notifySmmUser(userId, title, body) {
  if (!userId) return;
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
       WHERE id = $2`,
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
      "Commande MboppiBoost transmise 🚀",
      `Votre commande #${order.id} (${order.service_name}) est en cours de traitement.`
    );
    return { ok: true, external_reference: reference, provider };
  } catch (err) {
    await q(
      `UPDATE smm_orders SET provider_status = 'dispatch_error', updated_at = now() WHERE id = $1`,
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
            "Commande MboppiBoost terminée ✅",
            `Votre commande #${order.id} (${order.service_name}) est terminée.`
          );
        } else if (nextStatus === "failed" || nextStatus === "cancelled") {
          await notifySmmUser(
            order.user_id,
            "Commande MboppiBoost interrompue",
            `Votre commande #${order.id} (${order.service_name}) est ${nextStatus === "failed" ? "échouée" : "annulée"}. Contactez le support.`
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
