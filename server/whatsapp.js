export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

export async function sendOtp(phone, code) {
  if (!whatsappConfigured()) {
    console.log(`[OTP dev] code pour ${phone} : ${code}`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Le service d\'envoi des codes n\'est pas encore configuré');
    }
    return { dev: true, code };
  }
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const template = process.env.WHATSAPP_TEMPLATE_NAME || 'otp_code';
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'fr';
  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: template,
            language: { code: lang },
            components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }],
          },
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `WhatsApp API ${res.status}`);
    }
    return { ok: true };
  } catch (err) {
    console.error('[OTP] envoi WhatsApp échoué :', err.message);
    throw err;
  }
}
