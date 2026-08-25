const BASE_URL = process.env.IKEEPAY_API_URL || "https://api.ikeepay.com";
const API_KEY = process.env.IKEEPAY_API_KEY || process.env.IKE_SECRET_KEY;

const COUNTRY_CODES = {
  Cameroun: "CM",
  "Côte d'Ivoire": "CI",
  Sénégal: "SN",
  Mali: "ML",
  "Burkina Faso": "BF",
  Niger: "NE",
  Togo: "TG",
  Bénin: "BJ",
  Guinée: "GN",
  Gabon: "GA",
  "République du Congo": "CG",
  "République démocratique du Congo": "CD",
  Kenya: "KE",
  Tanzanie: "TZ",
  Rwanda: "RW",
  Ouganda: "UG",
  Zambie: "ZM",
  Ghana: "GH",
  Nigeria: "NG",
  "Sierra Leone": "SL",
};

const CURRENCY_BY_COUNTRY = {
  CM: "XAF",
  CI: "XOF",
  SN: "XOF",
  ML: "XOF",
  BF: "XOF",
  NE: "XOF",
  TG: "XOF",
  BJ: "XOF",
  GN: "GNF",
  GA: "XAF",
  CG: "XAF",
  CD: "CDF",
  KE: "KES",
  TZ: "TZS",
  RW: "RWF",
  UG: "UGX",
  ZM: "ZMW",
  GH: "GHS",
  NG: "NGN",
  SL: "SLE",
};

export function countryCode(country) {
  const value = String(country || "")
    .trim()
    .toUpperCase();
  return value.length === 2 ? value : COUNTRY_CODES[country] || "";
}

export function currencyForCountry(country) {
  const code = countryCode(country);
  return CURRENCY_BY_COUNTRY[code] || "XAF";
}

export function normalizePhone(phone, country) {
  const digits = String(phone || "").replace(/\D/g, "");
  const code = countryCode(country);
  const prefixes = {
    CM: "237",
    CI: "225",
    SN: "221",
    ML: "223",
    BF: "226",
    NE: "227",
    TG: "228",
    BJ: "229",
    GN: "224",
    GA: "241",
    CG: "242",
    CD: "243",
    KE: "254",
    TZ: "255",
    RW: "250",
    UG: "256",
    ZM: "260",
    GH: "233",
    NG: "234",
    SL: "232",
  };
  const prefix = prefixes[code] || "";
  if (!prefix) return digits;
  if (digits.startsWith(prefix)) return digits;
  return prefix + digits.replace(/^0+/, "");
}

async function request(path, payload) {
  if (!API_KEY) {
    const error = new Error("IKEEPAY_API_KEY non configurée");
    error.statusCode = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(payload),
    });
  } catch (fetchError) {
    console.error(`[ikeepay] ${path} injoignable :`, fetchError.message);
    const error = new Error("iKeePay est momentanément injoignable. Réessaie dans un instant.");
    error.statusCode = 502;
    error.providerPayload = { cause: String(fetchError?.message || fetchError) };
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Diagnostic : payload sortant + réponse brute du partenaire (logs Vercel)
    console.error(
      `[ikeepay] ${path} -> HTTP ${response.status}`,
      "payload:", JSON.stringify(payload),
      "reponse:", JSON.stringify(data)
    );
    let message = data.error || data.message || `Ikeepay ${response.status}`;
    const raw = JSON.stringify(data);
    if (raw && raw !== "{}" && raw.length > 2) {
      message = `${message} · iKeePay: ${raw.slice(0, 350)}`;
    }
    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.providerPayload = data;
    throw error;
  }
  return data;
}

// L'API iKeePay valide en production le paramètre `provider` (alias du champ
// `operator` documenté). On normalise le nom de l'opérateur et on envoie les
// deux champs avec la même valeur pour couvrir les deux signatures.
const PROVIDER_ALIASES = {
  "ORANGE MONEY": "ORANGE",
  ORANGE: "ORANGE",
  "MTN MOBILE MONEY": "MTN",
  "MTN MONEY": "MTN",
  MTN: "MTN",
  "MTN MOMO": "MTN MOMO",
  MOMO: "MTN MOMO",
  MTN_MOMO: "MTN MOMO",
  WAVE: "WAVE",
  MOOV: "MOOV",
  "MOOV FLOOZ": "MOOV",
  "MOOV MONEY": "MOOV",
  FLOOZ: "MOOV",
  MOBICASH: "MOBICASH",
  "T-MONEY": "MOBICASH",
  "T MONEY": "MOBICASH",
  AIRTEL: "AIRTEL",
  "AIRTEL MONEY": "AIRTEL",
  FREE: "FREE",
  "FREE MONEY": "FREE",
  VODACOM: "VODACOM",
  "VODACOM MONEY": "VODACOM",
  "M-PESA": "MPESA",
  MPESA: "MPESA",
  MPESA_MOMO: "MPESA",
  HALOPESA: "HALOPESA",
  TIGO: "TIGO",
  ZAMTEL: "ZAMTEL",
  TELECEL: "TELECEL",
  OPAY: "OPAY",
  MONIEPOINT: "MONIEPOINT",
};

export function normalizeProvider(operator) {
  const key = String(operator || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return PROVIDER_ALIASES[key] || key;
}

function withProvider(payload = {}) {
  const operator = normalizeProvider(payload.operator ?? payload.provider);
  // L'API en production valide le champ `provider` : il reprend le nom de
  // l'opérateur (les codes du type ORANGE_CMR sont spécifiques au routage
  // interne pawapay et font échouer l'initialisation chez les partenaires
  // routés autrement, ex. PIXPAY pour le Cameroun).
  return { ...payload, operator, provider: operator };
}

export function payin(payload) {
  return request("/h2h-payin", withProvider(payload));
}

// Checkout hébergé officiel (utilisé par le plugin WooCommerce iKeePay) :
// le client choisit lui-même son opérateur sur la page iKeePay. Utilisé en
// repli quand l'initialisation H2H est rejetée par le partenaire.
const CHECKOUT_URL = process.env.IKEEPAY_CHECKOUT_URL || "https://ikeepay.com/checkout/v1/inline";
const PUBLIC_KEY = process.env.IKEEPAY_PUBLIC_KEY || process.env.IKE_PUBLIC_KEY;

export function inlineCheckoutUrl({ amount, currency, orderId, email }) {
  if (!API_KEY || !PUBLIC_KEY) return null;
  const params = new URLSearchParams({
    pk: PUBLIC_KEY,
    sk: API_KEY,
    amount: String(Math.round(Number(amount) || 0)),
    ...(currency ? { currency } : {}),
    order_id: orderId,
    ...(email ? { email } : {}),
  });
  return `${CHECKOUT_URL}?${params.toString()}`;
}

export function payout(payload) {
  return request("/h2h-payout", withProvider(payload));
}

export function providerStatus(result) {
  return String(result?.status || result?.data?.status || "").toLowerCase();
}
