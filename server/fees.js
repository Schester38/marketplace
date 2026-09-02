// Frais d'adhésion Mboppi — module partagé sans effet de bord, utilisé par :
//   — server/auth.js (rôles, roleRequired, inscription) ;
//   — server/services/ikeepay.js (payin d'adhésion en ligne).
//
// Seul le rôle `seller` est soumis à l'adhésion (1 500 F / 30 jours). Les
// boutiques et créateurs accèdent directement à leur espace (aucun frais, quel
// que soit le mode de paiement) ; l'admin vérifie les comptes via le panneau.
export const MEMBERSHIP_FEES = { seller: 1500 };
export const MEMBERSHIP_DAYS = 30;