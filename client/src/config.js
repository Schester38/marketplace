export const WHATSAPP_NUMBER = "237672886348";
export const OFFERS_WHATSAPP_NUMBER = "237679475343";
export const BASE_URL = "https://mboppi-mboppi.vercel.app";

export const COUNTRIES = [
  { name: "Cameroun", flag: "🇨🇲", phone: "+237", symbol: "XAF" },
  { name: "Côte d'Ivoire", flag: "🇨🇮", phone: "+225", symbol: "XOF" },
  { name: "Sénégal", flag: "🇸🇳", phone: "+221", symbol: "XOF" },
  { name: "Mali", flag: "🇲🇱", phone: "+223", symbol: "XOF" },
  { name: "Burkina Faso", flag: "🇧🇫", phone: "+226", symbol: "XOF" },
  { name: "Niger", flag: "🇳🇪", phone: "+227", symbol: "XOF" },
  { name: "Togo", flag: "🇹🇬", phone: "+228", symbol: "XOF" },
  { name: "Bénin", flag: "🇧🇯", phone: "+229", symbol: "XOF" },
  { name: "Guinée", flag: "🇬🇳", phone: "+224", symbol: "GNF" },
  { name: "Gabon", flag: "🇬🇦", phone: "+241", symbol: "XAF" },
  { name: "République du Congo", flag: "🇨🇬", phone: "+242", symbol: "XAF" },
  { name: "République démocratique du Congo", flag: "🇨🇩", phone: "+243", symbol: "CDF" },
  { name: "Kenya", flag: "🇰🇪", phone: "+254", symbol: "KSh" },
  { name: "Tanzanie", flag: "🇹🇿", phone: "+255", symbol: "TZS" },
  { name: "Rwanda", flag: "🇷🇼", phone: "+250", symbol: "RWF" },
  { name: "Ouganda", flag: "🇺🇬", phone: "+256", symbol: "UGX" },
  { name: "Zambie", flag: "🇿🇲", phone: "+260", symbol: "ZMW" },
  { name: "Ghana", flag: "🇬🇭", phone: "+233", symbol: "GH₵" },
  { name: "Nigeria", flag: "🇳🇬", phone: "+234", symbol: "₦" },
  { name: "Sierra Leone", flag: "🇸🇱", phone: "+232", symbol: "SLE" },
];

COUNTRIES.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

export function getCountry(countryName) {
  return COUNTRIES.find((c) => c.name === countryName);
}

export function countrySymbol(countryName) {
  const c = getCountry(countryName);
  return c ? c.symbol : "XAF";
}

const CURRENCY_SYMBOLS = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
  INR: "₹",
  NGN: "₦",
  ZAR: "R",
  RUB: "₽",
  TRY: "₺",
  UAH: "₴",
  BRL: "R$",
  ILS: "₪",
  VND: "₫",
  CHF: "CHF",
  PLN: "zł",
  RON: "lei",
};

export function currencySymbol(code) {
  const c = String(code || "")
    .trim()
    .toUpperCase();
  return CURRENCY_SYMBOLS[c] || c || "XAF";
}

export function countryPhone(countryName) {
  const c = getCountry(countryName);
  return c ? c.phone : "+237";
}

export function offerUrl(id) {
  return `${BASE_URL}/offre/${id}`;
}

export function waLink(number, message) {
  let digits = String(number || "").replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "237" + digits.slice(1);
  else if (digits.length > 0 && digits.length <= 9) digits = "237" + digits;
  const target = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${target}?text=${encodeURIComponent(message)}`;
}

export function whatsappLink(message) {
  return waLink(WHATSAPP_NUMBER, message);
}

export function offersWhatsappLink(message) {
  return waLink(OFFERS_WHATSAPP_NUMBER, message);
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
  "Électronique & Téléphones",
  "Téléphones & Tablettes",
  "Ordinateurs & Accessoires",
  "TV, Audio & Vidéo",
  "Consoles & Jeux vidéo",
  "Mode & Vêtements",
  "Chaussures",
  "Sacs & Accessoires",
  "Beauté & Cosmétiques",
  "Parfums",
  "Soins capillaires",
  "Bijoux & Montres",
  "Maison & Déco",
  "Meubles",
  "Cuisine & Ustensiles",
  "Linge de maison",
  "Électroménager",
  "Alimentation & Épicerie",
  "Produits frais & Marché",
  "Boissons",
  "Santé & Bien-être",
  "Sport & Fitness",
  "Jouets & Jeux",
  "Bébé & Enfants",
  "Papeterie & Bureau",
  "Livres & Formation",
  "Arts & Artisanat",
  "Auto & Moto",
  "Jardin & Extérieur",
  "Animaux & Accessoires",
  "Services & Prestations",
  "Immobilier",
  "Autre",
];

export const OPERATORS_BY_COUNTRY = {
  Cameroun: ["ORANGE", "MTN"],
  "Côte d'Ivoire": ["ORANGE", "MTN"],
  Sénégal: ["ORANGE", "WAVE", "FREE", "MTN"],
  Mali: ["ORANGE", "MOOV"],
  "Burkina Faso": ["ORANGE", "MOBICASH"],
  Niger: ["MOOV", "AIRTEL"],
  Togo: ["MOOV", "MOBICASH"],
  Bénin: ["MOOV", "MTN"],
  Gabon: ["AIRTEL"],
  "République du Congo": ["AIRTEL", "MTN"],
  "République démocratique du Congo": ["AIRTEL", "ORANGE", "VODACOM"],
  Kenya: ["MPESA"],
  Tanzanie: ["AIRTEL", "HALOPESA", "TIGO"],
  Rwanda: ["MTN MOMO"],
  Ouganda: ["MTN MOMO"],
  Zambie: ["AIRTEL", "MTN", "ZAMTEL"],
  Ghana: ["AIRTEL", "MTN", "TELECEL"],
  Nigeria: ["OPAY", "MONIEPOINT", "MTN", "AIRTEL"],
};

export const DEFAULT_OPERATORS = [
  "ORANGE",
  "MTN",
  "WAVE",
  "MOOV",
  "FREE",
  "AIRTEL",
  "VODACOM",
  "MOBICASH",
];

const CATEGORY_EMOJI = {
  électronique: "📱",
  electronique: "📱",
  "électronique & téléphones": "📱",
  "téléphones & tablettes": "📱",
  "ordinateurs & accessoires": "💻",
  "tv, audio & vidéo": "📺",
  "consoles & jeux vidéo": "🎮",
  mode: "👗",
  "mode & vêtements": "👗",
  chaussures: "👟",
  "sacs & accessoires": "👜",
  beauté: "💄",
  beaute: "💄",
  "beauté & cosmétiques": "💄",
  parfums: "🌸",
  "soins capillaires": "💇",
  "bijoux & montres": "⌚",
  maison: "🏠",
  "maison & déco": "🏠",
  meubles: "🛋️",
  "cuisine & ustensiles": "🍳",
  "linge de maison": "🛏️",
  électroménager: "🧺",
  alimentation: "🥘",
  "alimentation & épicerie": "🥘",
  "produits frais & marché": "🥬",
  boissons: "🥤",
  sport: "⚽",
  "sport & fitness": "⚽",
  jouets: "🧸",
  jouet: "🧸",
  "jouets & jeux": "🧸",
  bébé: "🍼",
  bebe: "🍼",
  "bébé & enfants": "🍼",
  "papeterie & bureau": "✏️",
  "livres & formation": "📚",
  "arts & artisanat": "🎨",
  accessoires: "👜",
  auto: "🚗",
  automobile: "🚗",
  "auto & moto": "🚗",
  "jardin & extérieur": "🌱",
  "animaux & accessoires": "🐶",
  "services & prestations": "🛠️",
  immobilier: "🏢",
  santé: "💊",
  sante: "💊",
  "santé & bien-être": "💊",
  autre: "🏷️",
};

export function categoryEmoji(category) {
  if (!category) return "🏷️";
  return CATEGORY_EMOJI[category.trim().toLowerCase()] || "🏷️";
}

export function categoryIcon(category) {
  if (!category) return "🏷️";
  const emoji = CATEGORY_EMOJI[category.trim().toLowerCase()];
  return emoji || "🏷️";
}
