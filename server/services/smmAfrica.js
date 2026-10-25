import { SMMProviderInterface } from "./smmProviderBase.js";

export class SmmAfricaAdapter extends SMMProviderInterface {
  get name() { return "SMM Africa"; }
  get providerKey() { return "smm_africa"; }

  constructor(config = {}) {
    super();
    this.config = config || {};
    this.baseUrl = (config.baseUrl || "https://smm.africa/api/v3").replace(/\/+$/, "");
    this.timeoutMs = Number(config.timeoutMs) || 30000;
    this.apiKey = config.apiKey || null;
  }

  async _request(body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = { "Content-Type": "application/json" };
      if (this.apiKey) headers["Authorization"] = "Bearer " + this.apiKey;
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
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
      if (data && data.error) {
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
      raw: s,
    }));
  }

  async placeOrder(order) {
    const body = {
      action: "add",
      service: order.external_service_id || order.service_id,
      link: order.link,
      quantity: order.quantity,
    };
    if (order.comments) body.comments = order.comments;
    if (order.username) body.username = order.username;
    if (order.idempotency_key) body.idempotency_key = order.idempotency_key;
    if (order.extra && typeof order.extra === "object") Object.assign(body, order.extra);
    const data = await this._request(body);
    const ref = data.order ?? data.order_id ?? data.id ?? null;
    return {
      ok: true,
      external_reference: ref != null ? String(ref) : null,
      provider_reference: ref != null ? String(ref) : null,
      status: "submitted",
      rawResponse: data,
    };
  }

  async checkOrderStatus(externalReference) {
    const data = await this._request({ action: "status", order: externalReference });
    const status = data.status || (data.orders && data.orders[externalReference] && data.orders[externalReference].status) || null;
    return {
      ok: true,
      external_reference: externalReference,
      status,
      charge: data.charge ?? null,
      remains: data.remains ?? null,
      rawResponse: data,
    };
  }

  async cancelOrder(externalReference) {
    const data = await this._request({ action: "cancel", order: externalReference });
    return { ok: true, rawResponse: data };
  }

  async refillOrder(externalReference) {
    const data = await this._request({ action: "refill", order: externalReference });
    const ref = data.refill ?? data.refill_id ?? data.order ?? null;
    return { ok: true, refill_reference: ref != null ? String(ref) : null, rawResponse: data };
  }
}