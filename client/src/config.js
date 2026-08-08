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

export const PRODUCT_CATEGORIES = [
  'Électronique & Téléphones',
  'Téléphones & Tablettes',
  'Ordinateurs & Accessoires',
  'TV, Audio & Vidéo',
  'Consoles & Jeux vidéo',
  'Mode & Vêtements',
  'Chaussures',
  'Sacs & Accessoires',
  'Beauté & Cosmétiques',
  'Parfums',
  'Soins capillaires',
  'Bijoux & Montres',
  'Maison & Déco',
  'Meubles',
  'Cuisine & Ustensiles',
  'Linge de maison',
  'Électroménager',
  'Alimentation & Épicerie',
  'Produits frais & Marché',
  'Boissons',
  'Santé & Bien-être',
  'Sport & Fitness',
  'Jouets & Jeux',
  'Bébé & Enfants',
  'Papeterie & Bureau',
  'Livres & Formation',
  'Arts & Artisanat',
  'Auto & Moto',
  'Jardin & Extérieur',
  'Animaux & Accessoires',
  'Services & Prestations',
  'Immobilier',
  'Autre',
];

const CATEGORY_EMOJI = {
  'électronique': '📱',
  'electronique': '📱',
  'électronique & téléphones': '📱',
  'téléphones & tablettes': '📱',
  'ordinateurs & accessoires': '💻',
  'tv, audio & vidéo': '📺',
  'consoles & jeux vidéo': '🎮',
  'mode': '👗',
  'mode & vêtements': '👗',
  'chaussures': '👟',
  'sacs & accessoires': '👜',
  'beauté': '💄',
  'beaute': '💄',
  'beauté & cosmétiques': '💄',
  'parfums': '🌸',
  'soins capillaires': '💇',
  'bijoux & montres': '⌚',
  'maison': '🏠',
  'maison & déco': '🏠',
  'meubles': '🛋️',
  'cuisine & ustensiles': '🍳',
  'linge de maison': '🛏️',
  'électroménager': '🧺',
  'alimentation': '🥘',
  'alimentation & épicerie': '🥘',
  'produits frais & marché': '🥬',
  'boissons': '🥤',
  'sport': '⚽',
  'sport & fitness': '⚽',
  'jouets': '🧸',
  'jouet': '🧸',
  'jouets & jeux': '🧸',
  'bébé': '🍼',
  'bebe': '🍼',
  'bébé & enfants': '🍼',
  'papeterie & bureau': '✏️',
  'livres & formation': '📚',
  'arts & artisanat': '🎨',
  'accessoires': '👜',
  'auto': '🚗',
  'automobile': '🚗',
  'auto & moto': '🚗',
  'jardin & extérieur': '🌱',
  'animaux & accessoires': '🐶',
  'services & prestations': '🛠️',
  'immobilier': '🏢',
  'santé': '💊',
  'sante': '💊',
  'santé & bien-être': '💊',
  'autre': '🏷️',
};

export function categoryEmoji(category) {
  if (!category) return '🏷️';
  return CATEGORY_EMOJI[category.trim().toLowerCase()] || '🏷️';
}
