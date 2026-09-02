// Frais d'adhésion Mboppi — module partagé sans effet de bord, utilisé par :
//   — server/auth.js (rôles, roleRequired, inscription) ;
//   — server/services/ikeepay.js (payin d'adhésion en ligne).
export const MEMBERSHIP_FEES = { shop: 2500, seller: 1500, creator: 2500 };
export const MEMBERSHIP_DAYS = 30;