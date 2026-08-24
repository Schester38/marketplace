# Mboppi

Mboppi est une marketplace pour le Cameroun et l'Afrique. Elle met en relation des boutiques, des vendeurs indépendants, des clients, des créateurs et des livreurs.

## Fonctionnalités

- **Boutique** : publie jusqu'à 5 produits, définit les prix, le stock et la commission du vendeur, confirme les commandes et règle les commissions.
- **Vendeur** : s'inscrit gratuitement, génère un code vendeur, partage les produits et reçoit la commission prévue pour chaque vente.
- **Client** : commande avec ou sans compte, reçoit un code de confirmation et suit sa commande.
- **Créateur** : publie des créations et gère son espace.
- **Livreur** : utilise le code de la boutique, saisit les frais de livraison et confirme la remise avec le code client.
- **Administrateur** : consulte les statistiques, utilisateurs, ventes, messages, journaux et sauvegardes.
- **Promotions éclair** : une promotion par semaine et par boutique, pendant 24 heures maximum. Le produit est masqué des catalogues et sa commission vendeur devient 0 %.
- **SEO et partage** : pages publiques optimisées, sitemap, Open Graph, JSON-LD et liens de partage de produits, boutiques et offres.

## Paiements et commissions

Mboppi conserve le paiement manuel et propose aussi un paiement automatique via Ikeepay pour les adhésions, les dons et les ventes, lorsqu’il est configuré. Les paiements manuels restent directs :

- espèces à la livraison ;
- virement Mobile Money direct ;
- virement bancaire.

Le moyen choisi est enregistré sur la vente. Après livraison, la boutique règle manuellement le vendeur et le parrain, ou les Payouts Ikeepay sont déclenchés après un Payin confirmé. Les montants sont suivis dans les wallets internes.

Les boutiques et vendeurs doivent aussi régler une adhésion valable 30 jours : 2 500 XAF pour une boutique et 1 500 XAF pour un vendeur. Un compte validé par l’administrateur peut accéder à son espace sans paiement. Un vendeur parrain reçoit 1 000 XAF lorsqu’un vendeur inscrit avec son code paie son adhésion ; 500 XAF sont reversés au compte Mboppi.

La commission du vendeur est définie par la boutique sur chaque produit. Le parrainage client rapporte 2 % au vendeur référent, lorsque le client s'est inscrit avec son code ; le versement automatique du cumul intervient à partir de 5 000 XAF.

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
- [server/finance.js](server/finance.js) calcule la répartition des montants et les écritures wallet.

## Démarrage local

Prérequis : Node.js 22.5 ou supérieur et une base PostgreSQL.

Configurer `server/.env` (ne jamais committer ce fichier) :

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET=une-chaine-aleatoire-d-au-moins-32-caracteres
ADMIN_PASSWORD=mot-de-passe-admin
```

Variables optionnelles : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `SITE_URL`, `PUBLIC_URL`, `ALLOWED_ORIGIN`, `IKEEPAY_API_KEY` (ou `IKE_SECRET_KEY`), `IKEEPAY_API_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `SENTRY_DSN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` et les variables SMTP. `IKEEPAY_API_URL` vaut par défaut `https://api.ikeepay.com`.

Pour activer les paiements automatiques, renseigner `IKEEPAY_API_KEY` dans Vercel puis configurer chez Ikeepay l’URL webhook `https://<domaine>/api/payments/ikeepay/webhook`. Le fournisseur doit envoyer les événements `transaction.created` et `transaction.updated`. Les clés ne doivent jamais être placées dans le frontend ou dans Git.

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
| GET/POST | `/api/flash-promotions` | public / shop | Consulter ou créer une promotion |
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
