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

Règle financière Mboppi : **tout ce qui entre est encaissé à 100 %** — l'acheteur paie le prix normal sans supplément — et **tout ce qui sort via Ikeepay transfère 90 % du montant** au bénéficiaire ; les 10 % couvrent les frais de traitement. Les paiements manuels restent directs et sans frais :

- espèces à la livraison ;
- virement Mobile Money direct ;
- virement bancaire.

Deux types de paiement sont possibles :

**1. Paiement manuel** (direct, sans frais) :
- espèces à la livraison ;
- Mobile Money direct ;
- virement bancaire.

**2. Paiement en ligne via iKeePay** (au moment de la livraison) : le livreur choisit « En ligne (iKeePay) » sur son formulaire (opérateur + numéro du client), une **lightbox** iKeePay s'ouvre pour que le client paie le prix normal (`total_price + delivery_fee`, encaissé à 100 %), et ce **n'est qu'après la confirmation du paiement dans la lightbox** que la livraison est enregistrée (notifications + facture) puis que les reversements sont déclenchés (net 90 %). Si le paiement échoue ou est abandonné, la commande reste en attente et peut être réglée en espèces / mobile.

Après paiement confirmé, Mboppi reverse automatiquement à chaque bénéficiaire sa part sur le moyen de paiement Mobile Money enregistré (boutique, vendeur, parrain, livreur), **net de 10 % de frais de traitement** pour les paiements en ligne ; les paiements manuels réglés par la boutique avec preuve sont crédités à 100 % sans frais. Tous les montants sont suivis dans les wallets internes et les reversements Ikeepay dans `automatic_payouts`.

Les adhésions, valables 30 jours, donnent accès aux espaces professionnels : 2 500 XAF pour une boutique, 1 500 XAF pour un vendeur, 2 500 XAF pour un créateur. Un compte validé par l'administrateur accède à son espace sans paiement. Lorsqu'un vendeur ou créateur inscrit avec le code d'un vendeur paie son adhésion, le parrain reçoit 1 000 XAF et 500 XAF de part plateforme reviennent à Mboppi — chaque reversement part net de frais (90 %).

La commission du vendeur est définie par la boutique sur chaque produit (0 à 100 %) ; pendant une promotion éclair, elle passe à 0 %. Le parrainage client rapporte 2 % au vendeur référent lorsque le client s'est inscrit avec son code ; le versement automatique du cumul intervient à partir de 5 000 XAF. Les frais de livraison sont saisis par le livreur à la livraison et lui sont reversés.

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
- [server/services/payouts.js](server/services/payouts.js) calcule la répartition (`computeRedistribution`), les écritures wallet et les reversements Ikeepay (nets 90 %).
- [server/ikeepay.js](server/ikeepay.js) encapsule le prestataire de paiement (payins, payouts, pays et devises).

## Démarrage local

Prérequis : Node.js 22.5 ou supérieur et une base PostgreSQL.

Configurer `server/.env` (ne jamais committer ce fichier) :

```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
JWT_SECRET=une-chaine-aleatoire-d-au-moins-32-caracteres
ADMIN_PASSWORD=mot-de-passe-admin
```

Variables optionnelles : `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`, `SITE_URL`, `PUBLIC_URL`, `ALLOWED_ORIGIN`, `IKEEPAY_API_KEY` (ou `IKE_SECRET_KEY`), `IKEEPAY_API_URL`, `MBOPPI_PAYOUT_COUNTRY` (défaut CM), `MBOPPI_PAYOUT_PHONE` (portefeuille Mboppi recevant les 90 % des adhésions/dons/part plateforme ; défaut +237699486146), `MBOPPI_PAYOUT_OPERATOR` (défaut ORANGE), `GEMINI_API_KEY`, `GEMINI_MODEL`, `SENTRY_DSN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` et les variables SMTP. `IKEEPAY_API_URL` vaut par défaut `https://api.ikeepay.com`.

Pour activer les paiements automatiques, renseigner `IKEEPAY_API_KEY` dans Vercel puis configurer chez Ikeepay l’URL webhook `https://<domaine>/api/payments/ikeepay/webhook`. Le fournisseur doit envoyer les événements `transaction.created` et `transaction.updated`. **Sécurité (fail-closed)** : iKeePay ne documente aucun secret/signature sur les callbacks entrants ; chaque webhook reçu est donc journalisé (`payment_webhook_logs`) puis **rejeté en 401 sans aucun traitement ni payout** tant que le mécanisme d'authentification n'est pas confirmé par iKeePay et implémenté dans `server/services/paymentSecurity.js`. La confirmation de paiement se fait via `POST /api/payments/ikeepay/confirm` (JWT + propriétaire pour vente/adhésion ; `confirm_token` secret pour les dons). Les clés ne doivent jamais être placées dans le frontend ou dans Git.

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
| POST | `/api/payments/ikeepay/membership` | connecté | Payer son adhésion (30 jours) |
| POST | `/api/payments/ikeepay/payin` | public/connecté | Payer une commande en ligne |
| POST | `/api/payments/ikeepay/webhook` | Ikeepay | Confirmer payins et reversements |
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
