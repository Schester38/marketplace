import { z } from "zod";

export const emailSchema = z.string().email("Adresse email invalide").max(120);
export const nameSchema = z.string().min(1, "Nom requis").max(100);
export const passwordSchema = z.string().min(8, "Mot de passe trop court");

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(["shop", "seller", "client", "creator", "livreur"]),
  country: z.string().max(60).optional(),
  ref: z.string().max(20).optional(),
  ref_seller: z.string().max(20).optional(),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Vous devez accepter les CGU" }) }),
  operator: z.string().max(40).optional(),
  phone: z.string().max(30).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe requis"),
});

export const createProductSchema = z.object({
  name: nameSchema,
  description: z.string().max(2000).optional(),
  price: z.coerce.number().min(0, "Prix invalide"),
  old_price: z.coerce.number().min(0, "Prix normal invalide").optional().nullable(),
  commission_percent: z.coerce
    .number()
    .min(0, "Commission minimale 0%")
    .max(100, "Commission maximale 100%")
    .default(0),
  photos: z.any().optional(),
  // Modification d'un produit : suppression EXPLICITE de la photo (bouton ✕ du
  // formulaire). Sans ce signal, une galerie vide — URL proxée non reconnue,
  // chargement partiel, ancien client — CONSERVE la photo déjà enregistrée au
  // lieu de l'effacer (voir PUT /api/products/:id).
  remove_photos: z.boolean().optional(),
  category: z.string().max(100).optional(),
  warranty: z.string().max(60).optional().nullable(),
  delivery_fee: z.coerce.number().min(0, "Frais de livraison invalides").default(0),
  contact: z.string().max(200).optional().nullable(),
  quantity: z.coerce.number().int("Quantité invalide").min(1, "Quantité minimale 1"),
  currency: z.string().max(10).optional(),
  // Produit DIGITAL : deux modes d'envoi.
  //  1. DIRECT : le fichier a été téléversé par le navigateur directement dans
  //     le bucket PRIVÉ via une URL d'upload signée (`key` + métadonnées).
  //     Jusqu'à 20 Mo — le corps de l'API n'est plus impliqué.
  //  2. LEGACY : `data` (data-URI base64 ≤ 3 Mo), téléversé par le serveur.
  digital: z
    .object({
      name: z.string().max(160).optional(),
      mime: z.string().max(120).optional(),
      key: z.string().max(300).optional(),
      size: z.coerce.number().int().min(0).max(21 * 1024 * 1024).optional(),
      data: z.string().max(4400000, "Fichier trop volumineux").optional(),
      remove: z.boolean().optional(),
    })
    .optional()
    .nullable(),
  digital_download_limit: z.coerce.number().int().min(1).max(100).optional(),
  // Contenu PROTÉGÉ — vidéo YouTube non répertoriée (au lieu d'un fichier) :
  //  - digital_kind "youtube" : le produit est une vidéo hébergée sur YouTube,
  //    déverrouillée après vérification du droit d'accès (aucun fichier) ;
  //  - youtube_url : URL (watch/youtu.be/embed/shorts/live) ou ID brut (11 car.) ;
  //  - access_days : durée d'accès en jours après confirmation (null = illimité).
  digital_kind: z.enum(["file", "youtube"]).optional().nullable(),
  youtube_url: z.string().max(300).optional().nullable(),
  access_days: z.coerce.number().int().min(1).max(3650).optional().nullable(),
});

export const createSaleSchema = z.object({
  product_id: z.coerce.number().int().positive("Produit requis"),
  quantity: z.coerce.number().int().min(1, "Quantité minimale 1").default(1),
});

export const deliverSaleSchema = z.object({
  delivery_fee: z.coerce.number().min(0, "Frais de livraison invalides").default(0),
  payment_method: z.enum(
    [
      "espèce",
      "espece",
      "esp",
      "mobile",
      "mobile_money",
    ],
    { errorMap: () => ({ message: "Type de paiement invalide (espèce ou mobile)" }) }
  ),
  client_code: z.string().max(20).optional(),
  shop_code: z.string().min(1, "Code boutique requis").max(20),
  signature: z
    .string()
    .startsWith("data:image/png;base64,", "Signature invalide : image PNG requise")
    .max(300000, "Signature trop volumineuse (max 300 Ko)")
    .optional()
    .nullable(),
});

export const proofSchema = z
  .string()
  .startsWith("data:", "Preuve invalide : format data URI requis")
  .max(1048576, "Preuve trop volumineuse (max 1 Mo)");

export const createFlashPromoSchema = z.object({
  product_id: z.coerce.number().int().positive("Produit requis"),
  promo_price: z.coerce.number().positive("Prix promotionnel invalide"),
  duration_minutes: z.coerce.number().int().min(1).max(1440, "Durée maximale 24h").optional(),
});

export const paySaleSchema = z.object({
  proof: proofSchema,
});

export const payReferralSchema = z.object({
  proof: proofSchema,
});

export const groupedPaySchema = z.object({
  kind: z.enum(["seller", "referral"]),
  seller_id: z.coerce.number().int().positive("Vendeur invalide"),
  proof: proofSchema,
});

export const cancelSaleSchema = z.object({
  code: z.string().min(1, "Code requis").max(20),
});

export const groupedClaimSchema = z.object({
  kind: z.enum(["sale", "referral"]),
  shop_id: z.coerce.number().int().positive("Boutique invalide"),
});

export const purchaseItemSchema = z.object({
  product_id: z.coerce.number().int().positive("Produit invalide"),
  quantity: z.coerce.number().int().min(1, "Quantité minimale 1").default(1),
});

export const createPurchaseSchema = z.object({
  product_id: z.coerce.number().int().positive("Produit requis"),
  // Le code vendeur est FACULTATIF : sans code, la vente est directe
  // (seller_id NULL, commission calculée mais non payable — même modèle que
  // les articles du panier). Avec code, le vendeur suit la vente.
  seller_code: z
    .string()
    .max(20, "Code vendeur trop long")
    .transform((v) => String(v || "").trim().toUpperCase())
    .optional(),
  purchase_price: z.coerce.number().min(0, "Prix invalide").optional(),
  quantity: z.coerce.number().int().min(1, "Quantité minimale 1").default(1),
  buyer_name: z.string().min(1, "Nom requis").max(100),
  buyer_phone: z.string().min(1, "Téléphone requis").max(30),
  buyer_city: z.string().min(1, "Ville requise").max(60),
  buyer_address: z.string().min(1, "Adresse requise").max(200),
  payment_method: z.enum(["espece", "mobile", "automatic", "mobile_money"]).default("espece"),
});

export const createOrderSchema = z.object({
  items: z.array(purchaseItemSchema).min(1, "Le panier est vide").max(50, "Trop d'articles"),
  buyer_name: z.string().min(1, "Nom requis").max(100),
  buyer_phone: z.string().min(1, "Téléphone requis").max(30),
  buyer_city: z.string().min(1, "Ville requise").max(60),
  buyer_address: z.string().min(1, "Adresse requise").max(200),
  payment_method: z.enum(["espece", "mobile", "automatic", "mobile_money"]).default("espece"),
});

const walletSchema = z.object({
  name: z.string().min(1, "Nom du moyen requis").max(40),
  value: z.string().min(1, "Valeur requise").max(30),
  primary: z.boolean().optional(),
});

export const updatePaymentMethodsSchema = z.object({
  full_name: z.string().max(100).optional().nullable(),
  wallets: z.array(walletSchema).max(20).optional(),
});

export const reviewSchema = z.object({
  product_id: z.coerce.number().int().positive("Produit invalide"),
  rating: z.coerce.number().int().min(1, "Note minimale 1").max(5, "Note maximale 5"),
  comment: z.string().max(500).optional().nullable(),
});

const photoDataUriSchema = z
  .string()
  .startsWith("data:image/")
  .max(1500000, "Photo trop volumineuse (max 1.5 MB)");
const photoUrlSchema = z.string().url("URL invalide").max(500);

export const offerSchema = z
  .object({
    name: z.string().min(1, "Nom requis").max(100),
    category: z.string().max(100).optional().nullable(),
    description: z.string().max(2000).optional().nullable(),
    warranty: z.string().max(60).optional().nullable(),
    original_price: z.coerce.number().min(0, "Prix de vente invalide"),
    promo_price: z.coerce.number().min(0, "Prix promotionnel invalide"),
    phone: z.string().max(30).optional().nullable(),
    quantity: z.coerce.number().int().min(0, "Quantité invalide").default(0),
    photos: z
      .array(z.union([photoDataUriSchema, photoUrlSchema]))
      .max(1, "Maximum 1 photo")
      .optional(),
    currency: z.string().max(10).optional(),
  })
  .refine((data) => data.promo_price <= data.original_price, {
    message: "Le prix promotionnel doit être inférieur au prix normal",
    path: ["promo_price"],
  });

export const donationSchema = z.object({
  amount: z.coerce.number().positive("Montant invalide"),
  operator: z.string().min(1, "Opérateur requis").max(40),
  phone_number: z.string().min(1, "Numéro requis").max(30),
  country: z.string().max(60).optional(),
});

// NOTE : donationIkeepaySchema a été supprimé avec le système iKeePay.

export const productListQuerySchema = z.object({
  search: z.string().max(200).optional(),
  shop: z.coerce.number().int().positive("Boutique invalide").optional(),
  category: z.string().max(100).optional(),
  type: z.enum(["digital", "physical"]).optional(),
  sort: z.enum(["recent", "popular", "sales", "price_asc", "price_desc", "rating"]).optional(),
  scope: z.enum(["shop", "creation"]).optional(),
  min_price: z.coerce.number().min(0, "Prix minimum invalide").optional(),
  max_price: z.coerce.number().min(0, "Prix maximum invalide").optional(),
  city: z.string().max(60).optional(),
  country: z.string().max(60).optional(),
  // Jeton de rafraîchissement interne pour une nouvelle publication digitale.
  // Il est accepté mais n'entre jamais dans la requête SQL.
  catalog_refresh: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100, "Maximum 100 résultats par page").optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const salesListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200, "Maximum 200 résultats").optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const shopListQuerySchema = z.object({
  city: z.string().max(60).optional(),
  role: z.enum(["shop", "creator"]).optional(),
});

export const citiesQuerySchema = z.object({
  q: z.string().max(60).optional(),
});

// ===== MBOPPIBOOST : schémas de validation =====

export const smmCategorySchema = z.object({
  name: z.string().min(1, "Nom requis").max(100),
  slug: z.string().min(1, "Slug requis").max(100).regex(/^[a-z0-9-]+$/, "Slug invalide (lettres, chiffres, tirets uniquement)"),
  description: z.string().max(500).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const smmServiceSchema = z.object({
  category_id: z.coerce.number().int().positive("Catégorie requise"),
  name: z.string().min(1, "Nom requis").max(150),
  description: z.string().max(2000).optional().nullable(),
  short_description: z.string().max(300).optional().nullable(),
  price: z.coerce.number().min(0, "Prix invalide"),
  currency: z.string().min(1).max(10).default("XAF"),
  billing_unit: z.enum(["service", "mois", "campagne", "article", "heure", "1000"]).default("service"),
  status: z.enum(["active", "inactive", "draft"]).default("active"),
  is_automated: z.boolean().default(false),
  is_consulting: z.boolean().default(false),
  is_campaign: z.boolean().default(false),
  external_service_id: z.string().max(100).optional().nullable(),
  delivery_days: z.coerce.number().int().min(1).max(365).optional().nullable(),
  conditions: z.string().max(1000).optional().nullable(),
  limits: z.record(z.string(), z.any()).default({}),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export const smmOrderSchema = z.object({
  service_id: z.coerce.number().int().positive("Service requis"),
  quantity: z.coerce.number().int().min(1, "Quantité minimale 1").default(1),
  client_info: z.record(z.string(), z.any()).default({}),
  payment_method: z
    .enum(["ikeepay", "wallet", "mobile_money", "moneyfusion", "virement", "espece", "manual"])
    .default("wallet"),
  idempotency_key: z.string().max(200).optional().nullable(),
});

export const boostWalletTopupSchema = z.object({
  amount: z.coerce.number().positive("Montant requis").max(10_000_000),
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "XAF", "XOF"]).default("USD"),
});

export const boostAdminWalletCreditSchema = z.object({
  user_id: z.coerce.number().int().positive("Utilisateur requis"),
  amount_usd: z.coerce.number().positive("Montant requis").max(10_000),
  note: z.string().trim().max(300).optional().nullable(),
  transaction_type: z.enum(["admin_credit", "refund", "adjustment"]).default("admin_credit"),
});

export const smmOrderStatusSchema = z.object({
  status: z.enum([
    "draft",
    "pending_payment",
    "paid",
    "submitted",
    "processing",
    "completed",
    "failed",
    "cancelled",
    "refund_pending",
    "refunded",
  ]),
  provider_status: z.string().max(100).optional().nullable(),
  provider_reference: z.string().max(200).optional().nullable(),
  admin_note: z.string().max(500).optional().nullable(),
});

export const smmPaymentDeclareSchema = z.object({
  payment_reference: z.string().min(2, "Référence de paiement requise").max(200),
  payment_method: z
    .enum(["mobile_money", "virement", "espece", "manual", "moneyfusion"])
    .default("mobile_money"),
  phone: z.string().max(40).optional().nullable(),
  token: z.string().max(200).optional().nullable(),
});

export const smmPaymentConfirmSchema = z.object({
  payment_reference: z.string().max(200).optional().nullable(),
  admin_note: z.string().max(500).optional().nullable(),
  dispatch: z.boolean().default(true),
});

export const smmPaymentInfoSchema = z
  .object({
    orange_money: z.string().max(500),
    mtn_mobile_money: z.string().max(500),
    moneyfusion_phone: z.string().max(500),
    account_name: z.string().max(500),
    whatsapp: z.string().max(500),
    note: z.string().max(1000),
  })
  .partial();

export const smmImportCatalogSchema = z.object({
  markup: z.coerce.number().min(1).max(10).default(1),
  usd_to_xaf: z.coerce.number().min(1).max(10000).default(655.957),
  category_id: z.coerce.number().int().positive().optional().nullable(),
  types: z
    .array(z.string().trim().min(1).max(40))
    .max(10)
    .optional()
    .default(["default"]),
  limit: z.coerce.number().int().min(0).max(20000).default(0),
  dry_run: z.boolean().default(false),
});

export const smmProviderConfigSchema = z.object({
  smm_provider_enabled: z.boolean().default(false),
  smm_provider_key: z.string().max(100).optional().nullable(),
  smm_api_base_url: z.string().url("URL invalide").max(500).optional().nullable(),
  smm_api_timeout: z.coerce.number().int().min(1000).max(120000).default(10000),
  smm_provider_config: z.string().max(5000).optional().nullable(),
  smm_markup: z.coerce.number().min(1).max(10).optional(),
  smm_usd_to_xaf: z.coerce.number().min(1).max(10000).optional(),
  // Secrets : jamais retournés au client, stockés côté serveur uniquement
  smm_api_key: z.string().max(500).optional().nullable(),
});
