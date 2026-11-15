// Référentiel éditorial des fonctionnalités présentées par le Studio publicitaire.
// Ajouter une entrée ici lorsqu'une nouvelle fonctionnalité mérite une campagne.
export const AD_FEATURES = [
  {
    id: "marketplace",
    name: "Marketplace MboppiShop",
    description:
      "Marketplace camerounaise pour découvrir des produits et services, avec boutiques, créateurs et vendeurs indépendants.",
    audience: "Acheteurs, boutiques, vendeurs et créateurs",
    cta: "Découvrir MboppiShop",
  },
  {
    id: "physical-products",
    name: "Produits physiques",
    description:
      "Catalogue de produits physiques proposés par les boutiques, avec recherche, catégories et commande.",
    audience: "Acheteurs au Cameroun et en Afrique",
    cta: "Découvrir les produits",
  },
  {
    id: "digital-products",
    name: "Produits digitaux",
    description:
      "Produits numériques de créateurs, dont des fichiers téléchargeables et certains contenus vidéo protégés.",
    audience: "Acheteurs et créateurs de contenus numériques",
    cta: "Découvrir les produits digitaux",
  },
  {
    id: "protected-content",
    name: "Contenus numériques protégés",
    description:
      "Accès contrôlé aux contenus numériques après vérification des droits d'achat, notamment pour certains contenus vidéo.",
    audience: "Acheteurs et créateurs de contenus",
    cta: "Découvrir les contenus numériques",
  },
  {
    id: "shops",
    name: "Espace boutiques",
    description:
      "Espace permettant aux boutiques de publier des produits physiques et de gérer leur activité sur la marketplace.",
    audience: "Boutiques et commerçants",
    cta: "Rejoindre MboppiShop comme boutique",
  },
  {
    id: "sellers",
    name: "Espace vendeurs",
    description:
      "Espace vendeur permettant de recommander et vendre des produits de la marketplace avec un code vendeur.",
    audience: "Vendeurs indépendants",
    cta: "Découvrir l'espace vendeur",
  },
  {
    id: "creators",
    name: "Espace créateurs",
    description:
      "Espace de publication et de gestion de créations numériques par les créateurs.",
    audience: "Créateurs et formateurs",
    cta: "Découvrir l'espace créateur",
  },
  {
    id: "delivery",
    name: "Livraison et suivi de commande",
    description:
      "Parcours de commande et de suivi de livraison impliquant clients, boutiques et livreurs.",
    audience: "Acheteurs, boutiques et livreurs",
    cta: "Découvrir le suivi de commande",
  },
  {
    id: "flash-promotions",
    name: "Promotions éclair",
    description:
      "Offres promotionnelles à durée limitée proposées par les boutiques.",
    audience: "Acheteurs et boutiques",
    cta: "Voir les promotions",
  },
  {
    id: "verone",
    name: "Vitrine Vérone",
    description:
      "Présentation d'offres et de services sur une vitrine dédiée de la plateforme.",
    audience: "Prestataires et clients",
    cta: "Découvrir les offres",
  },
  {
    id: "ai-assistant",
    name: "Assistante Vérone",
    description:
      "Assistante conversationnelle qui aide les visiteurs à s'orienter et à découvrir les produits et services.",
    audience: "Visiteurs et acheteurs",
    cta: "Découvrir MboppiShop",
  },
  {
    id: "referrals",
    name: "Parrainage vendeur",
    description:
      "Programme permettant aux vendeurs de recommander la plateforme et de suivre les adhésions parrainées.",
    audience: "Vendeurs indépendants",
    cta: "Découvrir le parrainage",
  },
  {
    id: "membership",
    name: "Adhésion des professionnels",
    description:
      "Parcours d'adhésion pour les boutiques, vendeurs et créateurs selon les règles de la plateforme.",
    audience: "Boutiques, vendeurs et créateurs",
    cta: "Découvrir les espaces professionnels",
  },
  {
    id: "donations",
    name: "Soutien à MboppiShop",
    description:
      "Espace permettant aux personnes qui le souhaitent de soutenir le développement de la plateforme.",
    audience: "Communauté et sympathisants",
    cta: "Découvrir la page de soutien",
  },
  {
    id: "generator",
    name: "Générateur de documents",
    description:
      "Outils de création et de mise en page de documents numériques, avec export et options de publication.",
    audience: "Créateurs et administrateurs",
    cta: "Découvrir le Générateur",
  },
  {
    id: "mboppi-boost",
    name: "MboppiBoost",
    description:
      "Service distinct proposant des outils de développement d'audience et de marketing digital.",
    audience: "Créateurs, marques et professionnels",
    cta: "Découvrir MboppiBoost",
  },
  {
    id: "freelance",
    name: "Espace Freelance",
    description:
      "Outils de prospection B2B, suivi de prospects et préparation de messages personnalisés.",
    audience: "Freelances et prestataires de services",
    cta: "Découvrir l'espace Freelance",
  },
  {
    id: "offers",
    name: "Offres et publications",
    description:
      "Espace de présentation d'offres et de publications visibles sur la plateforme.",
    audience: "Entrepreneurs, prestataires et clients",
    cta: "Découvrir les offres",
  },
  {
    id: "formation-funnel",
    name: "Tunnel de vente de formations",
    description:
      "Pages de présentation et d'achat de formations numériques, avec un parcours de reçu après paiement.",
    audience: "Formateurs et apprenants",
    cta: "Découvrir les formations",
  },
  {
    id: "mobile-app",
    name: "Applications et outils mobiles",
    description:
      "Applications et services mobiles liés à l'écosystème Mboppi.",
    audience: "Utilisateurs mobiles",
    cta: "Découvrir les applications Mboppi",
  },
];

export const AD_ROLES = {
  shop: {
    name: "Boutiques",
    description: "Commerçants qui présentent leurs produits physiques.",
  },
  seller: {
    name: "Vendeurs indépendants",
    description: "Vendeurs qui recommandent et vendent les produits de la marketplace.",
  },
  creator: {
    name: "Créateurs",
    description: "Créateurs qui publient et gèrent des produits numériques.",
  },
  client: {
    name: "Clients",
    description: "Acheteurs qui découvrent et commandent sur la marketplace.",
  },
  livreur: {
    name: "Livreurs",
    description: "Livreurs qui assurent le suivi et la confirmation des livraisons.",
  },
};

export const AD_STYLES = {
  ugc: "UGC naturel, face caméra, comme un témoignage spontané de créateur.",
  cinema: "Cinématique, mise en scène visuelle, rythme et ambiance de film.",
  presentation: "Présentation claire et soignée de la marque ou du service.",
  demonstration: "Démonstration concrète du produit ou du parcours utilisateur.",
  storytelling: "Récit court avec situation, tension et résolution.",
  humor: "Humour accessible, chaleureux et respectueux.",
  testimonial:
    "Scène de témoignage jouée et clairement fictive, sans inventer de client ni de résultat réel.",
};

export const AD_PLATFORMS = {
  general: "Réseaux sociaux (format adaptable)",
  tiktok: "TikTok, vidéo verticale courte",
  reels: "Instagram Reels / Facebook Reels, vidéo verticale",
  shorts: "YouTube Shorts, vidéo verticale",
  facebook: "Facebook, vidéo ou publication sociale",
  whatsapp: "WhatsApp, statut ou vidéo courte",
  linkedin: "LinkedIn, format professionnel",
};

export const AD_LANGUAGES = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  ar: "arabe",
};
