const API_BASE = process.env.IKE_API_BASE || 'https://api.ikeepay.com';

const COUNTRIES = {
  'Cameroun': { code: 'CM', prefix: '237' },
  "Côte d'Ivoire": { code: 'CI', prefix: '225' },
  'Sénégal': { code: 'SN', prefix: '221' },
  'Mali': { code: 'ML', prefix: '223' },
  'Burkina Faso': { code: 'BF', prefix: '226' },
  'Niger': { code: 'NE', prefix: '227' },
  'Togo': { code: 'TG', prefix: '228' },
  'Bénin': { code: 'BJ', prefix: '229' },
  'Guinée': { code: 'GN', prefix: '224' },
  'Gabon': { code: 'GA', prefix: '241' },
  'Tchad': { code: 'TD', prefix: '235' },
  'République du Congo': { code: 'CG', prefix: '242' },
  'République démocratique du Congo': { code: 'CD', prefix: '243' },
  'Guinée équatoriale': { code: 'GQ', prefix: '240' },
  'République centrafricaine': { code: 'CF', prefix: '236' },
  'Rwanda': { code: 'RW', prefix: '250' },
  'Burundi': { code: 'BI', prefix: '257' },
  'Kenya': { code: 'KE', prefix: '254' },
  'Nigeria': { code: 'NG', prefix: '234' },
  'Ghana': { code: 'GH', prefix: '233' },
  'Afrique du Sud': { code: 'ZA', prefix: '27' },
  'Ouganda': { code: 'UG', prefix: '256' },
  'Tanzanie': { code: 'TZ', prefix: '255' },
  'Éthiopie': { code: 'ET', prefix: '251' },
  'Mozambique': { code: 'MZ', prefix: '258' },
  'Angola': { code: 'AO', prefix: '244' },
  'Madagascar': { code: 'MG', prefix: '261' },
  'Île Maurice': { code: 'MU', prefix: '230' },
  'Zambie': { code: 'ZM', prefix: '260' },
  'Zimbabwe': { code: 'ZW', prefix: '263' },
  'Maroc': { code: 'MA', prefix: '212' },
  'Tunisie': { code: 'TN', prefix: '216' },
  'Algérie': { code: 'DZ', prefix: '213' },
  'Égypte': { code: 'EG', prefix: '20' },
};

const OPERATOR_MAP = {
  'orange money': 'ORANGE',
  'mtn mobile money': 'MTN',
  'moov money': 'MOOV',
  'moov': 'MOOV',
  'wave': 'WAVE',
  'airtel money': 'AIRTEL',
  'airtel': 'AIRTEL',
  'm-pesa': 'VODACOM',
  'm-pesa tigo': 'VODACOM',
  'tigo pesa': 'VODACOM',
  't-money': 'MOBICASH',
  'flooz': 'MOOV',
  'free money': 'ORANGE',
  'yoomee': 'ORANGE',
};

export function countryInfo(country) {
  return COUNTRIES[country] || null;
}

export function operatorFor(walletName) {
  if (!walletName) return null;
  const key = String(walletName).trim().toLowerCase();
  return OPERATOR_MAP[key] || null;
}

export function normalizePhone(phone, countryName) {
  let p = String(phone || '').replace(/[^\d]/g, '');
  if (!p) return '';
  const info = COUNTRIES[countryName];
  if (info && p.startsWith(info.prefix)) p = p.slice(info.prefix.length);
  if (/^0/.test(p)) p = p.slice(1);
  return p;
}

async function ikeepayFetch(path, body) {
  const secretKey = process.env.IKE_SECRET_KEY;
  if (!secretKey) {
    const error = new Error('Clé secrète iKeePay non configurée');
    error.statusCode = 503;
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': secretKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (fetchError) {
    clearTimeout(timer);
    const error = new Error(`iKeePay injoignable : ${fetchError.message}`);
    error.statusCode = 504;
    throw error;
  }
  clearTimeout(timer);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const error = new Error(data.error || data.message || `Erreur iKeePay ${res.status}`);
    error.statusCode = res.status >= 500 ? 502 : 422;
    error.ikeepayData = data;
    throw error;
  }
  return data;
}

export async function ikeepayPayin({
  amount,
  currency,
  country,
  phoneNumber,
  operator,
  external_reference,
  customer_email,
}) {
  return ikeepayFetch('/h2h-payin', {
    amount,
    currency,
    country,
    phoneNumber,
    operator,
    external_reference,
    customer_email,
  });
}

export async function ikeepayPayout({
  amount,
  currency,
  country,
  phoneNumber,
  operator,
  external_reference,
}) {
  return ikeepayFetch('/h2h-payout', {
    amount,
    currency,
    country,
    phoneNumber,
    operator,
    external_reference,
  });
}

export function ikeepayEnabled() {
  return Boolean(process.env.IKE_SECRET_KEY && process.env.IKE_PUBLIC_KEY);
}

export function operatorsForCountry(countryName) {
  return [
    'ORANGE', 'MTN', 'WAVE', 'MOOV', 'MOBICASH', 'AIRTEL', 'VODACOM',
  ];
}

export default ikeepayFetch;