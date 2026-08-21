import crypto from 'crypto';

const SEBPAY_BASE_URL = process.env.SEBPAY_BASE_URL || 'https://newapi.sebpay.bj/api/v1';
const SEBPAY_PUBLIC_KEY = process.env.SEBPAY_PUBLIC_KEY;
const SEBPAY_SECRET_KEY = process.env.SEBPAY_SECRET_KEY;
const SEBPAY_WEBHOOK_SECRET = process.env.SEBPAY_WEBHOOK_SECRET;

function sebpayEnabled() {
  return Boolean(SEBPAY_PUBLIC_KEY && SEBPAY_SECRET_KEY);
}

function sebpayHeaders() {
  return {
    'X-Public-Key': SEBPAY_PUBLIC_KEY,
    'X-Secret-Key': SEBPAY_SECRET_KEY,
    'Content-Type': 'application/json',
  };
}

async function sebpayRequest(path, options = {}) {
  if (!sebpayEnabled()) throw new Error('SebPay non configuré (clés manquantes)');
  const url = `${SEBPAY_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...sebpayHeaders(), ...(options.headers || {}) },
    timeout: 20000,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || `HTTP ${res.status}`;
    throw new Error(`SebPay ${path}: ${msg}`);
  }
  return data;
}

export async function sebpayPayin({
  amount,
  currency = 'XAF',
  phone,
  operator,
  country,
  externalReference,
  callbackUrl,
  otpCode,
}) {
  const body = {
    amount: Math.round(amount),
    currency,
    phone: String(phone).replace(/\D/g, ''),
    operator,
    country: country.toUpperCase(),
    external_reference: externalReference,
    callback_url: callbackUrl,
  };
  if (otpCode) body.otp_code = String(otpCode);
  const data = await sebpayRequest('/collections', { method: 'POST', body: JSON.stringify(body) });
  return {
    transactionId: data.data?.transaction_id || data.data?.id,
    status: data.data?.status || 'pending',
    ussdCode: data.data?.ussd_code,
    otpRequired: data.data?.otp_required,
    raw: data,
  };
}

export async function sebpayPayout({
  amount,
  currency = 'XAF',
  phone,
  operator,
  country,
  externalReference,
  callbackUrl,
  recipientName,
}) {
  const body = {
    amount: Math.round(amount),
    currency,
    phone: String(phone).replace(/\D/g, ''),
    operator,
    country: country.toUpperCase(),
    external_reference: externalReference,
    callback_url: callbackUrl,
    recipient_name: recipientName,
  };
  const data = await sebpayRequest('/payouts', { method: 'POST', body: JSON.stringify(body) });
  return {
    transactionId: data.data?.transaction_id || data.data?.id,
    status: data.data?.status || 'pending',
    raw: data,
  };
}

export async function sebpayGetTransaction(idOrRef) {
  const data = await sebpayRequest(`/collections/${encodeURIComponent(idOrRef)}`);
  return data.data;
}

export async function sebpayGetPayout(idOrRef) {
  const data = await sebpayRequest(`/payouts/${encodeURIComponent(idOrRef)}`);
  return data.data;
}

export async function sebpayGetOperators(country) {
  const path = country ? `/operators?country=${country.toUpperCase()}` : '/operators';
  const data = await sebpayRequest(path);
  return data.data || [];
}

export async function sebpayGetCountries() {
  const data = await sebpayRequest('/countries');
  return data.data || [];
}

export async function sebpayCalculateFee({ amount, sourceCountry, destinationCountry, transactionType }) {
  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    source_country: sourceCountry.toLowerCase(),
    destination_country: destinationCountry.toLowerCase(),
    transaction_type: transactionType,
  });
  const data = await sebpayRequest(`/c/calculate-fee?${params}`);
  return Number(data.data?.fee_amount || 0);
}

export function sebpayVerifyWebhook(rawBody, signature) {
  if (!SEBPAY_WEBHOOK_SECRET) throw new Error('SEBPAY_WEBHOOK_SECRET manquant');
  const expected = crypto.createHmac('sha256', SEBPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function sebpayParseWebhook(body) {
  return {
    transactionId: body.transaction_id,
    externalReference: body.external_reference,
    status: body.status,
    amount: Number(body.amount),
    currency: body.currency,
    customerPhone: body.customer_phone,
    createdAt: body.created_at,
    updatedAt: body.updated_at,
  };
}

export { sebpayEnabled };