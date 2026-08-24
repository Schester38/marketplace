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
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.message || `Ikeepay ${response.status}`);
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.providerPayload = data;
    throw error;
  }
  return data;
}

export function payin(payload) {
  return request("/h2h-payin", payload);
}

export function payout(payload) {
  return request("/h2h-payout", payload);
}

export function providerStatus(result) {
  return String(result?.status || result?.data?.status || "").toLowerCase();
}
