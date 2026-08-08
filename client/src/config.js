export const WHATSAPP_NUMBER = '237679475343';
export const BASE_URL = 'https://mboppi-mboppi.vercel.app';

export function offerUrl(id) {
  return `${BASE_URL}/offre/${id}`;
}

export function whatsappLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function offerDiscount(offer) {
  if (!offer || !offer.original_price || !offer.promo_price) return 0;
  if (offer.original_price <= offer.promo_price) return 0;
  return Math.round((1 - offer.promo_price / offer.original_price) * 100);
}

export function offerSavings(offer) {
  if (!offer || !offer.original_price || !offer.promo_price) return 0;
  return Math.max(0, Math.round(offer.original_price - offer.promo_price));
}

const CATEGORY_EMOJI = {
  'électronique': '📱',
  'electronique': '📱',
  'mode': '👗',
  'alimentation': '🥘',
  'maison': '🏠',
  'beauté': '💄',
  'beaute': '💄',
  'sport': '⚽',
  'jouets': '🧸',
  'jouet': '🧸',
  'accessoires': '👜',
  'bébé': '🍼',
  'bebe': '🍼',
  'santé': '💊',
  'sante': '💊',
  'auto': '🚗',
  'automobile': '🚗',
};

export function categoryEmoji(category) {
  if (!category) return '🏷️';
  return CATEGORY_EMOJI[category.trim().toLowerCase()] || '🏷️';
}
