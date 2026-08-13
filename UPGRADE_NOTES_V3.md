# MboppiShop V3 — Finance & Orders upgrade

## Nouveautés
- Ajout d'un ledger financier PostgreSQL (`wallet_accounts`, `wallet_transactions`).
- Crédit automatique du wallet du vendeur lorsqu'une commission est marquée comme payée.
- Crédit automatique du wallet du parrain lorsqu'une commission de parrainage est marquée comme payée.
- Même logique pour les paiements groupés.
- Nouvelle API authentifiée `GET /api/wallet/me` pour les vendeurs/créateurs.
- Commandes panier atomiques : réservation du stock et création des ventes dans une transaction PostgreSQL.
- Création d'un enregistrement `orders` pour les clients authentifiés.
- Retour du stock automatique via le flux d'annulation déjà sécurisé.
- Protection contre les doubles crédits du ledger grâce à une contrainte d'unicité.
- Vérification syntaxique de tous les fichiers JavaScript du serveur réussie.

## Important
Le ledger reflète les paiements de commissions effectivement validés par une boutique. Il ne constitue pas encore un moyen de paiement électronique : les paiements restent manuels avec preuve.

Le build frontend complet n'a pas pu être confirmé dans cet environnement car l'installation npm a dépassé le délai disponible. Le serveur passe toutefois la vérification syntaxique sur tous ses fichiers JavaScript.
