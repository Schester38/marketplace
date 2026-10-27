const BASE_CURRENCY = "USD";
const FRESH_MS = 60_000;
const MAX_STALE_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 4_500;

export const CURRENCY_DECIMALS = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  XAF: 0,
  XOF: 0,
  NGN: 2,
  GHS: 2,
  KES: 2,
  ZAR: 2,
  MAD: 2,
  CDF: 2,
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_DECIMALS);

export const TOPUP_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "XAF", "XOF"];

export class FxRatesUnavailableError extends Error {
  constructor(message = "Taux de change indisponibles pour le moment.") {
    super(message);
    this.name = "FxRatesUnavailableError";
    this.statusCode = 503;
    this.code = "FX_RATES_UNAVAILABLE";
  }
}

export function normalizeCurrency(code) {
  return String(code || "").trim().toUpperCase();
}

export function roundMoney(value, currency = BASE_CURRENCY) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const decimals = CURRENCY_DECIMALS[normalizeCurrency(currency)] ?? 2;
  const factor = 10 ** decimals;
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export function convertAmount(amount, from, to, rates) {
  const source = normalizeCurrency(from);
  const target = normalizeCurrency(to);
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new TypeError("Montant invalide.");
  if (source === target) return roundMoney(value, target);
  if (!rates || typeof rates !== "object") throw new FxRatesUnavailableError();
  const sourceRate = source === BASE_CURRENCY ? 1 : Number(rates[source]);
  const targetRate = target === BASE_CURRENCY ? 1 : Number(rates[target]);
  if (!(sourceRate > 0) || !(targetRate > 0)) {
    throw new FxRatesUnavailableError(`Devise non prise en charge : ${source} ou ${target}.`);
  }
  return roundMoney((value / sourceRate) * targetRate, target);
}

export function availableCurrencies(rates) {
  return SUPPORTED_CURRENCIES.filter(
    (code) => code === BASE_CURRENCY || Number(rates?.[code]) > 0
  );
}

export function usableTopupCurrencies(rates) {
  const available = new Set(availableCurrencies(rates));
  return TOPUP_CURRENCIES.filter((code) => available.has(code));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "MboppiShop/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function normalizeRates(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Réponse de taux invalide");
  const rates = { USD: 1 };
  for (const code of SUPPORTED_CURRENCIES) {
    if (code === BASE_CURRENCY) continue;
    const value = Number(raw[code]);
    if (Number.isFinite(value) && value > 0) rates[code] = value;
  }
  if (Object.keys(rates).length < 2) throw new Error("Aucun taux exploitable");
  return rates;
}

const PROVIDERS = [
  {
    name: "coinbase",
    url: "https://api.coinbase.com/v2/exchange-rates?currency=USD",
    extract: (json) => json?.data?.rates,
  },
  {
    name: "open.er-api",
    url: "https://open.er-api.com/v6/latest/USD",
    extract: (json) => (json?.result === "success" ? json?.rates : null),
  },
  {
    name: "exchangerate-api",
    url: "https://api.exchangerate-api.com/v4/latest/USD",
    extract: (json) => json?.rates,
  },
];

let cache = null;
let inFlight = null;

function serialize(rates, source, fetchedAt) {
  return {
    base: BASE_CURRENCY,
    rates,
    currencies: availableCurrencies(rates),
    source,
    fetched_at: new Date(fetchedAt).toISOString(),
    stale: false,
  };
}

async function fetchFreshRates() {
  let lastError = null;
  for (const provider of PROVIDERS) {
    try {
      const json = await fetchJson(provider.url);
      const rates = normalizeRates(provider.extract(json));
      return serialize(rates, provider.name, Date.now());
    } catch (error) {
      lastError = error;
    }
  }
  throw new FxRatesUnavailableError(
    `Impossible de joindre un fournisseur de taux : ${lastError?.message || "inconnu"}.`
  );
}

export async function getUsdRates({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < FRESH_MS) {
    return { ...cache.payload, stale: false, age_seconds: Math.round((now - cache.fetchedAt) / 1000) };
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const payload = await fetchFreshRates();
      cache = { payload, fetchedAt: now };
      return { ...payload, age_seconds: 0 };
    } catch (error) {
      if (cache && now - cache.fetchedAt <= MAX_STALE_MS) {
        return {
          ...cache.payload,
          stale: true,
          age_seconds: Math.round((now - cache.fetchedAt) / 1000),
          warning: error.message,
        };
      }
      throw error;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function resetFxCacheForTests() {
  cache = null;
  inFlight = null;
}
