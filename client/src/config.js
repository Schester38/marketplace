export const WHATSAPP_NUMBER = '237679475343';
export const BASE_URL = 'https://mboppi-mboppi.vercel.app';

export const COUNTRIES = [
  { name: 'Cameroun', flag: '🇨🇲', phone: '+237', symbol: 'F' },
  { name: 'Côte d\'Ivoire', flag: '🇨🇮', phone: '+225', symbol: 'F' },
  { name: 'Sénégal', flag: '🇸🇳', phone: '+221', symbol: 'F' },
  { name: 'Mali', flag: '🇲🇱', phone: '+223', symbol: 'F' },
  { name: 'Burkina Faso', flag: '🇧🇫', phone: '+226', symbol: 'F' },
  { name: 'Niger', flag: '🇳🇪', phone: '+227', symbol: 'F' },
  { name: 'Togo', flag: '🇹🇬', phone: '+228', symbol: 'F' },
  { name: 'Bénin', flag: '🇧🇯', phone: '+229', symbol: 'F' },
  { name: 'Guinée', flag: '🇬🇳', phone: '+224', symbol: 'GF' },
  { name: 'Gabon', flag: '🇬🇦', phone: '+241', symbol: 'F' },
  { name: 'Tchad', flag: '🇹🇩', phone: '+235', symbol: 'F' },
  { name: 'République du Congo', flag: '🇨🇬', phone: '+242', symbol: 'F' },
  { name: 'République démocratique du Congo', flag: '🇨🇩', phone: '+243', symbol: 'FC' },
  { name: 'Guinée équatoriale', flag: '🇬🇶', phone: '+240', symbol: 'F' },
  { name: 'République centrafricaine', flag: '🇨🇫', phone: '+236', symbol: 'F' },
  { name: 'Rwanda', flag: '🇷🇼', phone: '+250', symbol: 'FRw' },
  { name: 'Burundi', flag: '🇧🇮', phone: '+257', symbol: 'FBu' },
  { name: 'Kenya', flag: '🇰🇪', phone: '+254', symbol: 'KSh' },
  { name: 'Nigeria', flag: '🇳🇬', phone: '+234', symbol: '₦' },
  { name: 'Ghana', flag: '🇬🇭', phone: '+233', symbol: 'GH₵' },
  { name: 'Afrique du Sud', flag: '🇿🇦', phone: '+27', symbol: 'R' },
  { name: 'Algérie', flag: '🇩🇿', phone: '+213', symbol: 'DA' },
  { name: 'Maroc', flag: '🇲🇦', phone: '+212', symbol: 'DH' },
  { name: 'Tunisie', flag: '🇹🇳', phone: '+216', symbol: 'DT' },
  { name: 'Égypte', flag: '🇪🇬', phone: '+20', symbol: 'LE' },
  { name: 'France', flag: '🇫🇷', phone: '+33', symbol: '€' },
  { name: 'Belgique', flag: '🇧🇪', phone: '+32', symbol: '€' },
  { name: 'Suisse', flag: '🇨🇭', phone: '+41', symbol: 'CHF' },
  { name: 'Canada', flag: '🇨🇦', phone: '+1', symbol: '$' },
  { name: 'États-Unis', flag: '🇺🇸', phone: '+1', symbol: '$' },
  { name: 'Royaume-Uni', flag: '🇬🇧', phone: '+44', symbol: '£' },
  { name: 'Allemagne', flag: '🇩🇪', phone: '+49', symbol: '€' },
  { name: 'Espagne', flag: '🇪🇸', phone: '+34', symbol: '€' },
  { name: 'Italie', flag: '🇮🇹', phone: '+39', symbol: '€' },
  { name: 'Portugal', flag: '🇵🇹', phone: '+351', symbol: '€' },
  { name: 'Pays-Bas', flag: '🇳🇱', phone: '+31', symbol: '€' },
];

export function getCountry(countryName) {
  return COUNTRIES.find((c) => c.name === countryName);
}

export function countrySymbol(countryName) {
  const c = getCountry(countryName);
  return c ? c.symbol : 'F';
}

export function countryPhone(countryName) {
  const c = getCountry(countryName);
  return c ? c.phone : '+237';
}

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
