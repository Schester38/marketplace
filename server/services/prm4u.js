import { SMMProviderInterface } from "./smmProviderBase.js";

const DEFAULT_BASE_URL = "https://prm4u.com/api/v2";

/**
 * Adaptateur PRM4U — API v2 standard (https://prm4u.com/api/v2).
 * POST form-urlencoded : key + action (services, add, status, balance, refill, cancel).
 * Réponses JSON ; une erreur fournisseur est un objet { error: "..." }.
 */
export class Prm4uAdapter extends SMMProviderInterface {
  get name() { return "PRM4U"; }
  get providerKey() { return "prm4u"; }

  constructor(config = {}) {
    super();
    this.config = config || {};
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = Number(config.timeoutMs) || 30000;
    this.apiKey = config.apiKey || null;
  }

  async _request(fields = {}) {
    if (!this.apiKey) {
      const err = new Error("Clé API PRM4U non configurée.");
      err.statusCode = 400;
      throw err;
    }
    const body = new URLSearchParams();
    body.set("key", this.apiKey);
    for (const [name, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== "") body.set(name, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal,
      });
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      if (!res.ok) {
        const err = new Error(data && (data.error || data.message) ? (data.error || data.message) : ("HTTP " + res.status));
        err.statusCode = res.status;
        err.payload = data;
        throw err;
      }
      if (data && !Array.isArray(data) && data.error) {
        const err = new Error(String(data.error));
        err.statusCode = 400;
        err.payload = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchBalance() {
    const data = await this._request({ action: "balance" });
    return { balance: data.balance, currency: data.currency || "USD" };
  }

  async fetchCatalog() {
    const data = await this._request({ action: "services" });
    const list = Array.isArray(data) ? data : (data.services || data.data || []);
    return list.map((s) => ({
      external_service_id: String(s.service ?? s.id ?? s.service_id ?? ""),
      name: s.name || s.service_name || "",
      type: s.type || s.service_type || null,
      category: s.category || s.category_name || null,
      rate: s.rate ?? s.price ?? null,
      min: s.min ?? s.min_quantity ?? null,
      max: s.max ?? s.max_quantity ?? null,
      refill: !!(s.refill ?? s.refill_supported),
      cancel: !!(s.cancel ?? s.cancel_supported),
      dripfeed: !!(s.dripfeed ?? s.drip_feed),
      description: s.description || "",
      start_time: s.start_time || s.start || null,
      speed: s.speed || null,
      drop_rate: s.drop_rate ?? s.dropRate ?? null,
      reliability: s.reliability ?? null,
      raw: s,
    }));
  }

  async placeOrder(order) {
    const rawService = order.external_service_id ?? order.service_id;
    const numericService = Number(rawService);
    const body = {
      action: "add",
      service:
        String(rawService ?? "").trim() !== "" && Number.isFinite(numericService)
          ? numericService
          : rawService,
      link: order.link,
      quantity: Number(order.quantity),
    };
    if (order.comments) body.comments = order.comments;
    if (order.username) body.username = order.username;
    if (order.extra && typeof order.extra === "object") Object.assign(body, order.extra);
    const data = await this._request(body);
    const ref = data.order ?? data.order_id ?? data.id ?? null;
    if (ref === null) {
      const err = new Error("PRM4U n'a pas renvoyé de numéro de commande.");
      err.statusCode = 502;
      err.payload = data;
      throw err;
    }
    return {
      ok: true,
      external_reference: String(ref),
      provider_reference: String(ref),
      status: "submitted",
      rawResponse: data,
    };
  }

  async checkOrderStatus(externalReference) {
    const data = await this._request({ action: "status", order: externalReference });
    return {
      ok: true,
      external_reference: externalReference,
      status: data.status || null,
      charge: data.charge ?? null,
      remains: data.remains ?? null,
      start_count: data.start_count ?? null,
      rawResponse: data,
    };
  }

  async cancelOrder(externalReference) {
    const data = await this._request({ action: "cancel", orders: externalReference });
    if (Array.isArray(data)) {
      const match = data.find((entry) => String(entry?.order ?? "") === String(externalReference));
      if (match && match.cancel && typeof match.cancel === "object" && match.cancel.error) {
        const err = new Error(String(match.cancel.error));
        err.statusCode = 400;
        err.payload = data;
        throw err;
      }
    }
    return { ok: true, rawResponse: data };
  }

  async refillOrder(externalReference) {
    const data = await this._request({ action: "refill", order: externalReference });
    const ref = data.refill ?? data.refill_id ?? null;
    return { ok: true, refill_reference: ref != null ? String(ref) : null, rawResponse: data };
  }
}
