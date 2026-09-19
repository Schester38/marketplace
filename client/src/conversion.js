// Conversion de devise — AFFICHAGE UNIQUEMENT (aucun montant en base n'est
// converti : les prix, commissions et seuils restent dans la devise du vendeur,
// cf. AGENTS.md). Affichée seulement quand la devise du produit diffère de
// celle du pays du visiteur connecté. Module PUR (aucune dépendance, importable
// sous Node) — testé par client/tmp-money-test.mjs ; le composant React
// `PriceEquivalent` qui l'utilise vit dans client/src/money.jsx.
//
// Taux exprimés en XAF pour 1 unité de devise :
//  - XAF/XOF : parité 1:1 (même monnaie CFA, CEMAC / UEMOA) — exact ;
//  - EUR : 655,957 (taux FIXE officiel euro → franc CFA) — exact ;
//  - tout le reste : taux INDICATIFS cohérents autour de ~600 XAF/USD, à
//    réviser périodiquement. Une devise absente de la table → conversion
//    impossible → le composant n'affiche RIEN (jamais de valeur fausse).
export const RATES_TO_XAF = {
  XAF: 1,
  XOF: 1,
  EUR: 655.957,
  USD: 600,
  CAD: 438,
  CHF: 667,
  GBP: 769,
  MAD: 60,
  DZD: 4.5,
  TND: 193,
  LYD: 124,
  MRU: 15,
  SDG: 1,
  EGP: 12.5,
  NGN: 0.39,
  GHS: 40,
  KES: 4.65,
  UGX: 0.16,
  TZS: 0.23,
  RWF: 0.46,
  BIF: 0.21,
  CDF: 0.21,
  GNF: 0.07,
  ZAR: 33,
  ETB: 10.5,
  MZN: 9.4,
  AOA: 0.66,
  MGA: 0.13,
  MUR: 13,
  ZMW: 23,
  ZWL: 25,
  PLN: 150,
  RON: 130,
  SEK: 57,
  NOK: 56,
  DKK: 88,
  RUB: 6,
  TRY: 17.6,
  UAH: 14.6,
  MXN: 35,
  BRL: 120,
  ARS: 0.63,
  COP: 0.15,
  CLP: 0.63,
  PEN: 158,
  VES: 16,
  CNY: 83,
  JPY: 4,
  INR: 7.1,
  KRW: 0.44,
  IDR: 0.038,
  MYR: 128,
  THB: 17.6,
  VND: 0.024,
  PHP: 10.5,
  PKR: 2.1,
  BDT: 5.1,
  SAR: 160,
  AED: 163,
  QAR: 165,
  ILS: 165,
  SGD: 450,
  AUD: 400,
  NZD: 360,
};

// Symboles d'affichage non-ISO utilisés par COUNTRIES (config.js) → code ISO.
const SYMBOL_TO_CODE = { "GH₵": "GHS", "₦": "NGN" };

// Devise ISO d'un pays (miroir de server/currency.js CURRENCIES). Repli : le
// symbole du pays s'il est déjà un code ISO. Inconnu → null (pas de
// conversion affichée — jamais une devise inventée).
const COUNTRY_CURRENCY = {
  Cameroun: "XAF",
  "Côte d'Ivoire": "XOF",
  Sénégal: "XOF",
  Mali: "XOF",
  "Burkina Faso": "XOF",
  Niger: "XOF",
  Togo: "XOF",
  Bénin: "XOF",
  Guinée: "GNF",
  Gabon: "XAF",
  Tchad: "XAF",
  "République du Congo": "XAF",
  Congo: "XAF",
  "République démocratique du Congo": "CDF",
  "Guinée équatoriale": "XAF",
  "République centrafricaine": "XAF",
  Rwanda: "RWF",
  Burundi: "BIF",
  Kenya: "KES",
  Nigeria: "NGN",
  Ghana: "GHS",
  "Afrique du Sud": "ZAR",
  Ouganda: "UGX",
  Tanzanie: "TZS",
  Éthiopie: "ETB",
  Mozambique: "MZN",
  Angola: "AOA",
  Madagascar: "MGA",
  "Île Maurice": "MUR",
  Zambie: "ZMW",
  Zimbabwe: "ZWL",
  Libye: "LYD",
  Mauritanie: "MRU",
  Soudan: "SDG",
  Algérie: "DZD",
  Maroc: "MAD",
  Tunisie: "TND",
  Égypte: "EGP",
  France: "EUR",
  Belgique: "EUR",
  Suisse: "CHF",
  Luxembourg: "EUR",
  Autriche: "EUR",
  Allemagne: "EUR",
  Espagne: "EUR",
  Italie: "EUR",
  Portugal: "EUR",
  "Pays-Bas": "EUR",
  Pologne: "PLN",
  Roumanie: "RON",
  Grèce: "EUR",
  Irlande: "EUR",
  Suède: "SEK",
  Norvège: "NOK",
  Danemark: "DKK",
  Finlande: "EUR",
  "Royaume-Uni": "GBP",
  Russie: "RUB",
  Turquie: "TRY",
  Ukraine: "UAH",
  Canada: "CAD",
  "États-Unis": "USD",
  Mexique: "MXN",
  Brésil: "BRL",
  Argentine: "ARS",
  Colombie: "COP",
  Chili: "CLP",
  Pérou: "PEN",
  Venezuela: "VES",
  Équateur: "USD",
  Chine: "CNY",
  Japon: "JPY",
  Inde: "INR",
  "Corée du Sud": "KRW",
  Indonésie: "IDR",
  Malaisie: "MYR",
  Thaïlande: "THB",
  Vietnam: "VND",
  Philippines: "PHP",
  Pakistan: "PKR",
  Bangladesh: "BDT",
  "Arabie saoudite": "SAR",
  "Émirats arabes unis": "AED",
  Qatar: "QAR",
  Israël: "ILS",
  Singapour: "SGD",
  Australie: "AUD",
  "Nouvelle-Zélande": "NZD",
};

// Code ISO depuis un nom de pays OU un symbole/code (pour normaliser la
// devise d'un produit qui peut venir de `products.currency` ou de
// `countrySymbol(shop_country)` — ex. « GH₵ »).
export function currencyCode(countryOrCode) {
  const raw = String(countryOrCode || "").trim();
  if (!raw) return null;
  if (SYMBOL_TO_CODE[raw]) return SYMBOL_TO_CODE[raw];
  const upper = raw.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper) && RATES_TO_XAF[upper] !== undefined) return upper;
  return COUNTRY_CURRENCY[raw] || null;
}

export const visitorCurrency = (countryName) => currencyCode(countryName);

// Montant converti, ou null si conversion indisponible/inutile (devise source
// = devise cible, taux inconnu, montant non numérique). Pur affichage.
export function convertedPrice(amount, fromCode, toCode) {
  const from = currencyCode(fromCode);
  const to = currencyCode(toCode);
  // Montants vides refusés (Number(null) === 0 et Number("") === 0 : sans ce
  // garde, un prix manquant afficherait « ≈ 0 »).
  if (amount === null || amount === undefined || amount === "") return null;
  const n = Number(amount);
  if (!from || !to || from === to || !Number.isFinite(n)) return null;
  const f = RATES_TO_XAF[from];
  const t = RATES_TO_XAF[to];
  if (!f || !t) return null;
  const out = (n * f) / t;
  return out >= 100 ? Math.round(out) : Math.round(out * 10) / 10;
}

export function equivLabel(amount, fromCode, toCode) {
  const to = currencyCode(toCode);
  const v = convertedPrice(amount, fromCode, toCode);
  if (v === null || !to) return null;
  return `≈ ${new Intl.NumberFormat("fr-FR").format(v)} ${to}`;
}
