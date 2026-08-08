export const WHATSAPP_NUMBER = '237679475343';
export const BASE_URL = 'https://mboppi-mboppi.vercel.app';

export function offerUrl(id) {
  return `${BASE_URL}/offre/${id}`;
}

export function whatsappLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
