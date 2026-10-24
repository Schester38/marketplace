/* ========================================================================
   MBOPPIBOOST — Couche d'abstraction API SMM.
   Architecture indépendante du fournisseur, aucun secret exposé.
   ======================================================================== */

import { q } from "../db.js";

export class SMMProviderInterface {
  get name() { throw new Error("name doit être implémenté"); }
  get providerKey() { throw new Error("providerKey doit être implémenté"); }
  async fetchCatalog() { throw new Error("fetchCatalog doit être implémenté"); }
  async placeOrder(order) { throw new Error("placeOrder doit être implémenté"); }
  async checkOrderStatus(externalReference) {
    throw new Error("checkOrderStatus doit être implémenté");
  }
  async fetchBalance() { return null; }
  async cancelOrder(externalReference) {
    return { ok: false, error: "Annulation non supportée" };
  }
}

/* ========================================================================
   2. Mode "sans fournisseur"
   ======================================================================== */

export class NoProviderAdapter extends SMMProviderInterface {
  get name() { return "Aucun fournisseur configuré"; }
  get providerKey() { return "none"; }

  async fetchCatalog() { return []; }

  async placeOrder(order) {
    return {
      ok: false,
      error: "Aucun fournisseur SMM configuré. La commande est enregistrée en brouillon.",
      external_reference: null,
      provider_reference: null,
      status: "draft",
      rawResponse: null,
    };
  }

  async checkOrderStatus(externalReference) {
    return {
      ok: false,
      error: "Aucun fournisseur configuré.",
      external_reference: externalReference,
      status: null,
      rawResponse: null,
    };
  }

  async cancelOrder(externalReference) {
    return { ok: false, error: "Annulation non disponible sans fournisseur" };
  }
}

/* ========================================================================
   3. Gestion de la configuration fournisseur (clés côté serveur uniquement)
   ======================================================================== */

export async function getActiveProviderConfig() {
  try {
    const rows = await q(`SELECT key, value FROM platform_settings WHERE key LIKE 'smm_%'`, []);
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;

    const providerKey = settings["smm_provider_key"] || "none";
    const isEnabled = settings["smm_provider_enabled"] === "true";

    if (!isEnabled || providerKey === "none") {
      return { provider: null, config: {}, adapter: new NoProviderAdapter() };
    }

    const config = {
      baseUrl: settings["smm_api_base_url"] || "",
      timeoutMs: Number(settings["smm_api_timeout"]) || 10000,
      ...(settings["smm_provider_config"] ? JSON.parse(settings["smm_provider_config"]) : {}),
    };

    return { provider: providerKey, config, adapter: null };
  } catch (err) {
    console.error("[smmProvider] Erreur lecture config :", err.message);
    return { provider: null, config: {}, adapter: new NoProviderAdapter() };
  }
}

export async function getSmmSecret(keyName) {
  try {
    const envVal = process.env[keyName.toUpperCase()];
    if (envVal) return envVal;
    const row = await q(`SELECT value FROM platform_settings WHERE key = $1`, [keyName]);
    return row?.[0]?.value || null;
  } catch (err) {
    console.error(`[smmProvider] Erreur lecture secret ${keyName} :`, err.message);
    return null;
  }
}

/* ========================================================================
   4. Journalisation des appels fournisseur (sans secrets)
   ======================================================================== */

export async function logSmmCall({ provider, event, payload, status, orderId }) {
  try {
    await q(
      `INSERT INTO payment_webhook_logs
        (provider, provider_order_id, event, payload, status, sale_id, handled, created_at)
       VALUES ('smm', $1, $2, $3, $4, $5, TRUE, now())`,
      [orderId || null, event || null, payload || {}, status || null, orderId || null]
    );
  } catch (err) {
    console.error("[smmProvider] Échec journalisation :", err.message);
  }
}

/* ========================================================================
   5. Clé d'idempotence
   ======================================================================== */

export function generateIdempotencyKey() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `smm_${ts}_${rand}`;
}