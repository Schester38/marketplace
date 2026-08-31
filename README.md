# Mboppi

Mboppi est une marketplace pour le Cameroun et l'Afrique. Elle met en relation des boutiques, des vendeurs indépendants, des clients, des créateurs et des livreurs.

## Fonctionnalités

- **Boutique** : publie jusqu'à 5 produits, définit les prix, le stock et la commission du vendeur, confirme les commandes et règle les commissions.
- **Vendeur** : génère un code vendeur, partage les produits et reçoit la commission prévue pour chaque vente (adhésion 1 500 XAF / 30 jours).
- **Client** : commande avec ou sans compte, reçoit un code de confirmation et suit sa commande.
- **Créateur** : publie des créations et gère son espace (adhésion 2 500 XAF / 30 jours).
- **Livreur** : utilise le code de la boutique, saisit les frais de livraison et confirme la remise avec le code client.
- **Administrateur** : consulte les statistiques, utilisateurs, ventes, messages, journaux et sauvegardes.
- **Promotions éclair** : une promotion par semaine et par boutique, pendant 24 heures maximum. Le produit est masqué des catalogues et sa commission vendeur devient 0 %.
- **SEO et partage** : pages publiques optimisées, sitemap, Open Graph, JSON-LD et liens de partage de produits, boutiques et offres.

## Paiements et commissions

Règle financière Mboppi : **les paiements sont exclusivement manuels et directs**. Mboppi ne collecte aucun paiement et ne prélève aucun frais de plateforme. L'acheteur paie le prix normal sans supplément :

- espèces à la livraison ;
- virement Mobile Money direct ;
- virement bancaire.

Les adhésions, valables 30 jours, donnent accès aux espaces professionnels : 2 500 XAF pour une boutique, 1 500 XAF pour un vendeur, 2 500 XAF pour un créateur. Un compte validé par l'administrateur accède à son espace sans paiement. Lorsqu'un vendeur ou créateur s'inscrit avec le code d'un vendeur, le parrain reçoit **1 000 XAF** (versé manuellement par l'administration).

La commission du vendeur est définie par la boutique sur chaque produit (0 à 100 %) ; pendant une promotion éclair, elle passe à 0 %. Le parrainage client rapporte 2 % au vendeur référent lorsque le client s'est inscrit avec son code ; le cumul est versé **manuellement** par la boutique via `POST /api/sales/:id/pay-referral`. Les frais de livraison sont saisis par le livreur à la livraison et lui sont versés directement.

## Architecture

```text
client/       React 18 + Vite + React Router
server/       Express 4 + PostgreSQL
api/index.js  Entrée Vercel serverless
```

- [client/src/App.jsx](client/src/App.jsx) contient le routage, l'authentification et les espaces par rôle.
- [client/src/api.js](client/src/api.js) centralise les appels HTTP.
- [client/src/store.jsx](client/src/store.jsx) persiste panier et favoris dans le navigateur.
- [server/app.js](server/app.js) monte les routes API et sert le frontend compilé en local.
- [server/db.js](server/db.js) configure PostgreSQL et initialise le schéma.
- [server/routes/products.js](server/routes/products.js) gère produits, stock et photos.
- [server/routes/orders.js](server/routes/orders.js) crée les commandes multi-produits.
- [server/routes/purchases.js](server/routes/purchases.js) crée les achats directs.
- [server/routes/sales.js](server/routes/sales.js) gère statuts, livraison, commissions et preuves de paiement.
- [server/services/payouts.js](server/services/payouts.js) calcule la répartition comptable (`computeRedistribution`) et la normalisation des moyens de paiement (`normalizeWalletPrimary`).

## Démarrage local

Prérequis : Node.js 22.5 ou supérieur et une base PostgreSQL.

Configurer `server/.env` (ne jamais committer ce fichier) :

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET=une-chaine-aleatoire-d-au-moins-32-caracteres
ADMIN_PASSWORD=mot-de-passe-admin
```

Variables optionnelles : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `SITE_URL`, `PUBLIC_URL`, `ALLOWED_ORIGIN`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SENTRY_DSN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` et les variables SMTP.

```powershell
cd server
npm install
npm run dev
```

Dans un second terminal :

```powershell
cd client
npm install
npm run dev
```

Le frontend est disponible sur http://localhost:5173 et l'API sur http://localhost:4000.

## API principale

| Méthode | Route | Accès | Fonction |
|---|---|---|---|
| POST | `/api/auth/register` | public | Inscription et parrainage |
| POST | `/api/auth/login` | public | Connexion JWT |
| GET | `/api/products` | public | Catalogue |
| POST | `/api/products` | shop, creator | Publier un produit |
| POST | `/api/purchases` | public | Achat direct avec code vendeur |
| POST | `/api/orders` | public | Commande du panier |
| PATCH | `/api/sales/:id/status` | shop | Confirmer ou annuler |
| POST | `/api/sales/:id/deliver` | livreur | Confirmer la livraison |
| POST | `/api/sales/:id/pay` | shop | Enregistrer le paiement du vendeur |
| POST | `/api/sales/:id/pay-referral` | shop | Enregistrer le paiement du parrain |
| GET | `/api/wallet/me` | seller, creator | Consulter le wallet |
| GET | `/api/messages/popup` | connecté | Message admin non lu (popup) |
| GET/POST | `/api/flash-promotions` | public / shop | Consulter ou créer une promotion |
| PATCH | `/api/admin/users/:id/admin-approved` | admin | Ouvrir/Fermer l'accès d'un compte |
| PATCH | `/api/admin/users/:id/verify` | admin | Vérifier / dé-vérifier un compte (badge vert) |
| POST | `/api/admin/pass` | public | Ouvrir la session admin |

## Build et déploiement

Le build frontend est lancé depuis la racine :

```powershell
npm run build
```

Vercel utilise [vercel.json](vercel.json), construit `client/dist` et route `/api/*` vers [api/index.js](api/index.js). Les variables d'environnement de production doivent contenir au minimum `DATABASE_URL` et `JWT_SECRET`.

Les scripts de maintenance se trouvent dans [server/scripts](server/scripts) : sauvegarde NDJSON, restauration, migration des images, nettoyage du stock et rapport d'utilisation Supabase.

## Sécurité et données

Les mots de passe sont hachés avec bcrypt, les sessions utilisent JWT, les routes sensibles appliquent des rôles et des limites de débit, et les actions d'administration sont auditées. Les données métier sont conservées dans PostgreSQL ; les photos peuvent être stockées dans Supabase Storage.

