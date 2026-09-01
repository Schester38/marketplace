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
  category: z.string().max(100).optional(),
  warranty: z.string().max(60).optional().nullable(),
  delivery_fee: z.coerce.number().min(0, "Frais de livraison invalides").default(0),
  contact: z.string().max(200).optional().nullable(),
  quantity: z.coerce.number().int("Quantité invalide").min(1, "Quantité minimale 1"),
  currency: z.string().max(10).optional(),
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
  seller_code: z.string().min(1, "Code vendeur requis").max(20),
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
      .max(3, "Maximum 3 photos")
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
  sort: z.enum(["recent", "popular", "sales", "price_asc", "price_desc", "rating"]).optional(),
  scope: z.enum(["shop", "creation"]).optional(),
  min_price: z.coerce.number().min(0, "Prix minimum invalide").optional(),
  max_price: z.coerce.number().min(0, "Prix maximum invalide").optional(),
  city: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(60, "Maximum 60 résultats par page").optional(),
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
