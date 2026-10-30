/* ========================================================================
   MBOPPIBOOST — Couche d'abstraction API SMM.
   Architecture indépendante du fournisseur, aucun secret exposé.
   ======================================================================== */

import { q } from "../db.js";
import { SMMProviderInterface } from "./smmProviderBase.js";
export { SMMProviderInterface } from "./smmProviderBase.js";

/* ========================================================================
   1. Catalogue des fournisseurs supportés
   ======================================================================== */

export const SMM_PROVIDERS = [
  {
    key: "smm_africa",
    name: "SMM Africa",
    baseUrl: "https://smm.africa/api/v3",
    envKeys: ["SMM_AFRICA_API_KEY", "SMM_API_KEY"],
  },
  {
    key: "prm4u",
    name: "PRM4U",
    baseUrl: "https://prm4u.com/api/v2",
    envKeys: ["PRM4U_API_KEY"],
  },
];

export function findSmmProvider(providerKey) {
  return SMM_PROVIDERS.find((provider) => provider.key === providerKey) || null;
}

function envApiKey(providerKey) {
  const provider = findSmmProvider(providerKey);
  for (const name of provider?.envKeys || []) {
    if (process.env[name]) return process.env[name];
  }
  return null;
}

/**
 * URL de base effective d'un fournisseur.
 * Une URL dédiée (smm_api_base_url:<clé>) est prioritaire ; l'ancienne clé
 * globale reste lue pour SMM Africa afin de ne rien casser.
 */
export function resolveSmmBaseUrl(settings, providerKey) {
  const provider = findSmmProvider(providerKey);
  return (
    settings[`smm_api_base_url:${providerKey}`] ||
    (providerKey === "smm_africa" ? settings["smm_api_base_url"] : "") ||
    provider?.baseUrl ||
    ""
  );
}

/** Clé API effective d'un fournisseur (stockée par fournisseur, sinon env). */
export function resolveSmmApiKey(settings, providerKey) {
  return (
    settings[`smm_api_key:${providerKey}`] ||
    (providerKey === "smm_africa" ? settings["smm_api_key"] : "") ||
    envApiKey(providerKey) ||
    null
  );
}

async function readSmmSettings() {
  const rows = await q(`SELECT key, value FROM platform_settings WHERE key LIKE 'smm_%'`, []);
  const settings = {};
  for (const row of rows) settings[row.key] = row.value;
  return settings;
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

async function instantiateAdapter(providerKey, config) {
  if (providerKey === "smm_africa") {
    const mod = await import("./smmAfrica.js");
    return new mod.SmmAfricaAdapter(config);
  }
  if (providerKey === "prm4u") {
    const mod = await import("./prm4u.js");
    return new mod.Prm4uAdapter(config);
  }
  return null;
}

function buildConfig(settings, providerKey) {
  return {
    baseUrl: resolveSmmBaseUrl(settings, providerKey),
    timeoutMs: Number(settings["smm_api_timeout"]) || 10000,
    apiKey: resolveSmmApiKey(settings, providerKey),
    ...(settings["smm_provider_config"] ? JSON.parse(settings["smm_provider_config"]) : {}),
  };
}

export async function getActiveProviderConfig() {
  try {
    const settings = await readSmmSettings();

    const providerKey = settings["smm_provider_key"] || "none";
    const isEnabled = settings["smm_provider_enabled"] === "true";

    if (!isEnabled || providerKey === "none") {
      return { provider: null, config: {}, adapter: new NoProviderAdapter() };
    }

    const config = buildConfig(settings, providerKey);
    const adapter = await instantiateAdapter(providerKey, config);
    if (!adapter) {
      return { provider: providerKey, config, adapter: new NoProviderAdapter() };
    }
    return { provider: providerKey, config, adapter };
  } catch (err) {
    console.error("[smmProvider] Erreur lecture config :", err.message);
    return { provider: null, config: {}, adapter: new NoProviderAdapter() };
  }
}

/**
 * Adaptateur d'un fournisseur précis, même s'il n'est pas le fournisseur actif.
 * Utilisé pour suivre les commandes déjà transmises avant une bascule.
 */
export async function getProviderConfig(providerKey) {
  try {
    if (!providerKey || providerKey === "none") {
      return { provider: null, config: {}, adapter: new NoProviderAdapter() };
    }
    const settings = await readSmmSettings();
    const config = buildConfig(settings, providerKey);
    const adapter = await instantiateAdapter(providerKey, config);
    return { provider: providerKey, config, adapter: adapter || new NoProviderAdapter() };
  } catch (err) {
    console.error("[smmProvider] Erreur lecture config fournisseur :", err.message);
    return { provider: providerKey, config: {}, adapter: new NoProviderAdapter() };
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
