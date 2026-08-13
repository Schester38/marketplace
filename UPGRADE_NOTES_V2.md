# MboppiShop V2 — modifications techniques

Cette version contient une passe de durcissement et de fiabilisation du MVP.

## Sécurité
- Secrets de production retirés de l'archive.
- VAPID configuré uniquement via variables d'environnement.
- Routes de création/suppression Verone authentifiées.
- Les offres sont désormais rattachées à leur propriétaire.
- Suppression d'une offre interdite aux autres utilisateurs (sauf admin).
- Livraison réservée aux utilisateurs `livreur` authentifiés.
- Le code boutique est requis et doit correspondre à la boutique de la commande.

## Commandes et stock
- Réservation atomique du stock lors d'une commande.
- Ajout de `reserved_quantity` sur les produits.
- Ajout de `stock_reserved` sur les ventes.
- Libération du stock lors d'une annulation.
- Compatibilité conservée pour les anciennes ventes non réservées.
- Protection contre les livraisons concurrentes avec transaction PostgreSQL.
- Le stock n'est plus décrémenté deux fois lors de la livraison.

## Finance / données
- Les montants principaux passent de `REAL` à `NUMERIC(14,2)`.
- L'historique des ventes/commandes n'est plus supprimé automatiquement après 7 jours.
- Les notifications sont conservées 90 jours par défaut.
- Rétention des transactions configurable via `TRANSACTION_RETENTION_DAYS`.

## Métier
- Correction du statut de vente lors de la confirmation boutique.
- Les avis nécessitent désormais un achat livré.
- Le prix catalogue est la source de vérité pour les commandes ; `purchase_price` arbitraire côté client n'est plus accepté.
- Ajout d'index sur statut et code de confirmation.

## Vérification
- Tous les fichiers JavaScript serveur passent `node --check`.
- Le build Vite n'a pas pu être exécuté dans cet environnement car les dépendances frontend n'étaient pas installables ici ; aucun code frontend n'a été transpilé/packagé dans cette archive.

## Variables à configurer
Copier `server/.env.example` vers `server/.env` en environnement local et renseigner les vraies valeurs.
