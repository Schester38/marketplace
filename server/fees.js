// Frais d'adhésion Mboppi — module partagé sans effet de bord, utilisé par :
//   — server/auth.js (rôles, roleRequired, inscription) ;
//   — server/services/ikeepay.js (payin d'adhésion en ligne).
//
// Vendeur, boutique et créateur sont soumis à l'adhésion (renouvelable tous
// les 30 jours : paiement en ligne ou approbation admin → expiry = now + 30 j).
// Les clients et livreurs accèdent directement à leur espace (aucun frais).
export const MEMBERSHIP_FEES = { seller: 1500, shop: 2500, creator: 2500 };
export const MEMBERSHIP_DAYS = 30;