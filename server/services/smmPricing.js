const DEFAULT_BILLING_UNIT = 1000;
export const SMM_MIN_ORDER_TOTAL_XAF = 500;
export const SMM_MAX_PUBLIC_PRICE_XAF = 1000000;

export function isSmmPricePublic(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 && price <= SMM_MAX_PUBLIC_PRICE_XAF;
}

export function smmBillingUnit(value) {
  const unit = Number(value);
  return Number.isFinite(unit) && unit > 0 ? unit : DEFAULT_BILLING_UNIT;
}

export function computeSmmTotal(unitPrice, quantity, billingUnit) {
  const price = Number(unitPrice);
  const qty = Number(quantity);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return 0;
  const total = (price * qty) / smmBillingUnit(billingUnit);
  return Math.round(total * 100) / 100;
}

export function minimumSmmQuantity({ price, billingUnit, min, currency = "XAF" } = {}) {
  const providerMin = Math.max(Number(min) || 1, 1);
  const unitPrice = Number(price);
  if (
    String(currency || "XAF").toUpperCase() !== "XAF" ||
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    return providerMin;
  }
  const needed = Math.ceil(
    (SMM_MIN_ORDER_TOTAL_XAF * smmBillingUnit(billingUnit)) / unitPrice
  );
  return Math.max(providerMin, needed);
}

export function decorateSmmService(service) {
  if (!service || typeof service !== "object") return service;
  const limits = service.limits && typeof service.limits === "object" ? service.limits : {};
  return {
    ...service,
    min_total_quantity: minimumSmmQuantity({
      price: service.price,
      billingUnit: service.billing_unit,
      min: limits.min,
      max: limits.max,
      currency: service.currency,
    }),
  };
}
