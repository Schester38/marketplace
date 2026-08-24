# AGENTS.md — Mboppi Marketplace

Contexte de travail pour toute session IA sur ce dépôt. Lire ce fichier avant de modifier quoi que ce soit.

## Vue d'ensemble

Marketplace **Mboppi** (Cameroun et Afrique) : vente en ligne, boutiques physiques, vendeurs indépendants, créateurs, livreurs, commandes par téléphone/WhatsApp et paiement mobile.

- **Client** : React 18 + Vite 5 (`client/`, port dev 5173, proxy `/api` → `localhost:4000`).
- **Serveur** : Express 4 (`server/`, port 4000), PostgreSQL via Supabase (`server/db.js` : `DATABASE_URL_POOLED`, fallback `DATABASE_URL`, `ssl rejectUnauthorized: false`; exports `q()`, `withTransaction()`, `initDb()` qui crée/migre toutes les tables).
- **Déploiement** : Vercel, entrée serverless `api/index.js` → `server/app.js` + `initDb()`. `vercel.json` route `/api/*`, `/produit/:id`, `/boutique/:id`, `/createur/:id`, `/ville/:x`, `/offre/:id`, `/sitemap.xml`, `/` vers l'API, le reste vers le SPA.
- **Prod** : `https://mboppi-mboppi.vercel.app` (client + API). `BASE_URL`, `SITE_URL`, `PUBLIC_URL` par défaut sur ce domaine.

## Rôles utilisateurs

`role IN ('shop','seller','client','creator','livreur')` — contrainte DB. Admin = utilisateur virtuel (id 0), auth par `ADMIN_PASSWORD` env → `POST /api/admin/pass`.

- **shop** : boutique (max **5 produits**), peut lancer des **promos éclair**, boutons partage, génère un `shop_code` 7 caractères.
- **seller** : vendeur indépendant, inscription et accès gratuits, génère un `seller_code` 6 caractères, dashboard dédié.
- **client** : achète avec ou sans compte (optionnel), reçoit un `confirm_code` 6 caractères, peut laisser des avis.
- **creator** : publie des créations (catégorie forcée `Arts & Artisanat`), espace dédié, moyens de paiement propres.
- **livreur** : confirme les livraisons (flux `submitDeliver`), saisit `delivery_fee` et `payment_method`, a besoin du `shop_code` et du `confirm_code` du client.
- **Admin** : virtuel id 0, `ADMIN_PASSWORD` env, accès via `POST /api/admin/pass`.

### Auth et sécurité

- **JWT** : `JWT_SECRET` **requis, min 32 chars** sinon le serveur refuse de démarrer. Token 24h, stockage localStorage + event `auth-expired`.
- **Email verification** : token 24h TTL, `SITE_URL`. Renvoi possible (`POST /api/auth/resend`). Login bloqué si email non vérifiée (`code: EMAIL_NOT_VERIFIED`).
- **Lockout** : 5 tentatives échouées = verrouillage 15 min (`locked_until`).
- **Google OAuth** : optionnel, `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. Supporte `ref` (parrainage client) et `ref_seller` (parrainage vendeur) dans le `state`. Si `accepted=1` requis, sinon redirection erreur.
- **Compte** : modification profil (`PUT /api/auth/me`), changement mot de passe (`PUT /api/auth/password`), suppression compte (`DELETE /api/auth/me`). Numéro de référence `MBP-XXXXXXXXXX` généré à l'inscription.
- **Inactivité** : déconnexion automatique après 30 min d'inactivité (events `mousedown`, `mousemove`, `keydown`, `touchstart`, `scroll`).

## Commission et argent

### Paiements

**Deux modes coexistent** :
1. **Manuel** : espèces à la livraison, Mobile Money direct, virement bancaire. Plus de frais de plateforme.
2. **Automatique Ikeepay** : `POST /api/payments/ikeepay/pembership`, `POST /api/payments/ikeepay/payin`, webhook `POST /api/payments/ikeepay/webhook`. Le Payin H2H est confirmé par webhook avant les Payouts. Configuré via `IKEEPAY_API_KEY` (ou `IKE_SECRET_KEY`) et `IKEEPAY_API_URL` (défaut `https://api.ikeepay.com`). Webhook doit envoyer `transaction.created` et `transaction.updated`.

### Répartition d'une vente — `server/finance.js` `computeRedistribution`

`totalPrice = prix × quantité` (prix catalogue ou promo active, jamais le prix saisi par le client). Champs d'une vente : `commission` (commission vendeur), `referral_commission` (commission de parrainage 2 %), `delivery_fee` (frais de livraison, saisis par le livreur à la livraison, valeur par défaut 0), `payment_status` (`pending`/`paid`/`completed`/`failed`).

- `shopAmount = totalPrice − commission − referralCommission` (ce que touche la boutique)
- `sellerAmount = commission` (le vendeur)
- `referrerAmount = referralCommission` (le parrain)
- `livreurAmount = deliveryFee` (le livreur)

**Paiements automatiques** (`paySaleAutomatically`) : déclenchés quand `payment_status = 'paid'` (confirmé par webhook Ikeepay ou marqué manuellement). Cibles : shop, seller, livreur. Chacun reçoit vers son wallet enregistré via Ikeepay H2H Payout. Enregistrement dans `wallet_transactions` sans frais. Sans wallet valide → pas de payout + notification `payment_need_wallet`.

**Paiements manuels** : la boutique paie le vendeur (`POST /sales/:id/pay`) et le parrain (`POST /sales/:id/pay-referral`) avec preuve photo/vidéo. Écritures `wallet_transactions` correspondantes.

### Commission vendeur (2 % — PARRAINAGE DE CLIENTS AFFILIÉS)

**Ne pas confondre** : le **2 % est lié à un CLIENT affilié**, pas à un « vendeur affilié ». Le flux :

1. Un **client** s'inscrit avec le code vendeur d'un vendeur (`ref` = `seller_code`, `auth.js:63-72`) → son compte est marqué `referred_by = id_du_vendeur` et son rôle est forcé à `client`. Ce client est maintenant **client affilié** du vendeur.
2. Quand ce **client affilié** (identifié par `req.user`, donc auth obligatoire pour déclencher le 2 %) achète un produit — `purchases.js:101-107` ou `orders.js:75-80` — alors `referralCommission = prix × quantité × 2 %` et `referred_by` est enregistré sur la vente. Le **vendeur parrain** (le référent) reçoit ces 2 %.
3. Le 2 % **n'est pas payé vente par vente** : il s'accumule (`referral_commission` non payée, `referral_paid = false`) et est versé automatiquement quand le cumul du parrain atteint **5 000 XAF** (`finance.js:4` `REFERRAL_AUTO_PAY_MIN = 5000`, `maybeAutoPayReferrals`, déclenché à la livraison `sales.js:609-615`), vers le wallet seller du parrain **sans frais**, avec notification + push « Parrainage versé ».

### Parrainage d'activation vendeur (DISTINCT)

Un nouveau vendeur s'inscrit avec le `seller_code` d'un autre vendeur (`ref_seller`, `auth.js:73-82`). Lorsque ce nouveau vendeur paie son adhésion via Ikeepay (`completeMembershipPayment`), le parrain reçoit **1 000 XAF** (`ACTIVATION_REFERRAL:${user.id}`) et **500 XAF** sont reversés au wallet plateforme Mboppi (`MBOPPI_ACTIVATION:${user.id}`).

### Commission de vente d'un produit

- `products.commission_percent` est choisi par la **boutique à la création du produit** (0-100, `products.js:261,273,384,396`). Commission vente seller = `prix × commission_percent % × qty`.
- Pendant une **promo éclair, commission = 0 %** : le vendeur est exclu du produit (le produit est masqué de son catalogue et `sales.js:41-50` bloque la vente pendant la promo).
- Adhésion : boutique **2 500 XAF** et vendeur **1 500 XAF**, valable 30 jours. Un compte validé par l’admin peut accéder à son espace sans paiement (`verified = TRUE`).

### Wallet et moyens de paiement

- **Wallet** (`server/routes/wallet.js`) : `GET /api/wallet/me` pour `seller` et `creator`, `wallet_transactions`, `balance = SUM(amount)` (montants signés), devise XAF.
- Types de transactions : `commission_credit`, `referral_credit`, `payout_debit`, `adjustment`, `online_collect`, `online_payout`.
- Moyens de paiement des gains : `shop_payment_methods` / `seller_payment_methods` / `livreur_payment_methods` (PK = `*_id`, `full_name`, `wallets` jsonb — liste `{name, value}`, upsert `ON CONFLICT`).
- **Créateurs** : utilisent `shop_payment_methods` (via `shop.js`).
- Pays et moyens de paiement : liste statique de 90+ pays dans `client/src/config.js` et `server/currency.js`. Les coordonnées servent aux transferts directs entre parties ; Mboppi ne collecte pas les paiements.

## Promotions éclair (flash promotions)

- **Règles serveur** (`server/routes/flashPromotions.js`) : **uniquement les boutiques** (sellers bloqués), **max 1 promo/semaine/boutique** (`MAX_WEEKLY_PER_SHOP = 1`, `MIN_WEEK_GAP_DAYS = 7`), durée max **24 h** (`MAX_MINUTES = 1440`, défaut 180), prix promo ≤ prix produit, **commission 0 %**, `currency` défaut XAF, purgées à expiration. `GET /api/flash-promotions` : liste publique filtrée `ends_at > now() AND quantity > 0`, `ORDER BY ends_at ASC LIMIT 20`.
- **Produit masqué pendant la promo** : tout le code utilise `NOT EXISTS (SELECT 1 FROM flash_promotions fp WHERE fp.product_id = p.id AND fp.ends_at > now())` pour cacher le produit du catalogue : listings produits, produits de la boutique (ShopDashboard), vendeurs, SEO (accueil, boutique, créateur) et compteurs SEO. Seule la page `/produit/:id` reste accessible (page d'atterrissage de la promo, sert le prix promo via `flash_promo`).
- **Prix promo côté client** : `product.flash_promo` (objet `{id, price, discount_percent, commission_percent, commission, starts_at, ends_at, duration_minutes}`) — utilisé dans `ProductDetail.jsx`, `PurchasePage.jsx` (`displayPrice`), `store.jsx` (panier, `old_price`), `ProductCard`. `data-flash` dans les commandes.
- **Popup publique** (`client/src/components/FlashPromoPopup.jsx`) : s'affiche sur `/`, `/shop`, `/seller`, `/client`, `/creator`, `/livreur`. **Toutes les promos actives sont superposées sur le même cadre** (conteneur `.flash-popup-stack`, `position: fixed`, bas à droite), rotation **toutes les 5 s** (`ROTATE_MS = 5000`), max 4, refresh 30 s. Titre centré « ⚡ PROMOTION DU JOUR » (bandeau rouge dégradé). La croix ✕ (dans la carte active, `z-index` haut) **ferme tout** et marque les promos fermées pour la journée dans **localStorage `mboppi_flash_dismissed`** (`{id: toDateString()}`).
- **CSS important** : `.flash-popup` sont `position: absolute; bottom: 0` dans le cadre (hauteur nulle du conteneur) — **ne jamais les ancrer en `top`** sinon elles sortent de l'écran (bug déjà corrigé). Cartes inactives : opacité 0.55, `translateY(-8px)`, `pointer-events: none`. La croix est rendue **dans** chaque carte (`depth === 0`).
- **Form boutique** : `ShopDashboard.jsx` (`flash-promo-form`, select produit, prix promo, durée, bouton « ⚡ Lancer la promotion », carte `FlashPromoCard` avec partage 🔗 et annulation). `FlashPromoCard` accepte `onDelete`/`onShare`/`showShop`.
- **Url directe** : `/produit/{id}` = landing promo (badge, compte à rebours, ancien prix barré).

## SEO (SSR)

- `server/routes/seo.js` : lit `client/dist/index.html`, cache 30 s, `injectHead()` → title/description/canonical/og/JsonLd; routes `/`, `/boutique/:id`, `/produit/:id`, `/createur/:id`, `/ville/:slug`, `/offre/:id`, `/sitemap.xml`, pages statiques (`/a-propos`, `/contact`, `/faq`, `/cgv`, `/cgu`, `/mentions-legales`, `/donnees`, `/soutien`, `/vitrine-offre`, `/createurs`, `/verone`). Base `https://mboppi-mboppi.vercel.app`.
- **Produits sous promo exclus** des listings SEO (ItemList accueil, compteurs boutique/créateur, sample image).
- **Villes Cameroun** : liste statique de 13 villes (`douala`, `yaounde`, `bafoussam`, `bamenda`, `garoua`, `maroua`, `kribi`, `limbe`, `buea`, `nkongsamba`, `edea`, `ngaoundere`, `kumba`) + recherche dynamique par slug.
- **Sitemap** : inclut produits, boutiques, créateurs, offres, villes, pages statiques.

## Ventes / commandes

- **Sales** : statuts `pending → bought → confirmed → delivered` (et `cancelled`). `confirm_code` 6 chars (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), unique contre `sales` et `orders`. `buyer_code` stocké pour traçabilité.
- **Orders** : panier multi-articles (`orders.js`), `confirm_code` 6 chars, statuts `new → confirmed → shipped → cancelled`, `items` JSONB.
- **Purchases** : achat direct (`purchases.js`), optionnellement auth, `product_id`, `seller_code` (uppercasé), `purchase_price`, `quantity`, coordonnées acheteur, `payment_method` (`mobile`/`espece`/`automatic`). Le **prix de référence** est celui du catalogue OU de la promo active (`purchases.js:75`), jamais le prix client.
- **Livraison** (`sales.js:529` `/:id/deliver`) : le livreur saisit `delivery_fee` + `payment_method` (`espèce`/`mobile`/`mobile_money`), doit fournir le `shop_code` de la boutique et le `confirm_code` du client ; décrémente le stock (ou `reserved_quantity` si `stock_reserved`). À la livraison : déclenche `maybeAutoPayReferrals` pour le parrain (`sales.js:609-615`) si `payment_status = 'paid'`.
- **Paiement d'une vente** : manuel (`POST /sales/:id/pay` avec preuve data URI) et/ou automatique Ikeepay après confirmation webhook. La boutique paie le vendeur et le parrain séparément. Paiement groupé possible (`POST /sales/grouped-pay`).
- **Réclamation de commission** : le vendeur réclame (`POST /sales/:id/claim`) ou réclame groupé (`POST /sales/grouped-claim`). Le parrain réclame (`POST /sales/:id/claim-referral`).
- **Suppression de livraison** : bloquée si commission vendeur (`paid`) ou parrainage (`referral_paid`) non payés (`sales.js:424-433`). Possibilité de masquer via `hidden_for` array.
- **Annulation** : par la boutique (`PATCH /:id/status` → `cancelled`), par le client (`POST /:id/cancel` avec `confirm_code`), ou par le vendeur (`DELETE /:id` pour les ventes non livrées). Remboursement de stock si `stock_reserved`.
- **Preuve de paiement** : `GET /:id/proof` pour vendeur, boutique, parrain.
- **Suivi** : `GET /sales/track/:id?code=...` pour le client avec son code.
- **Export** : `GET /sales/export` pour seller/shop/creator.
- **Facture PDF** : `client/src/components/Invoice.jsx` — jspdf **v4.2.1** importé dynamiquement, `doc.save('facture-{id}.pdf')`, logo `/navbar-logo.png`, boutons dans Shop/Seller/Livreur dashboards.

## Tableaux principaux (créés/migrés dans `server/db.js` `initDb()`)

`users` (rôles, codes, membership, referred_by, lockout, email verify, quartier, reference_number), `products` (photos JSONB, stock, old_price, warranty, delivery_fee, contact, category, currency), `sales` (lifecycle, confirm_code, commission, referral, delivery_fee, paid/referral_paid, hidden_for, payment_status/online_payment, stock_reserved), `orders` (panier multi-articles, items JSONB, currency), `offers` (Verone/Vitrine, promo_price, photos, owner_id, warranty, currency), `flash_promotions` (shop_id, product_id, promo_price, durée, starts/ends_at, currency), `wallet_accounts`, `wallet_transactions` (types: commission_credit, referral_credit, payout_debit, adjustment, online_collect, online_payout), `automatic_payouts`, `payment_webhook_logs`, `membership_payments`, `platform_payouts`, `donations`, `shop_payment_methods` / `seller_payment_methods` / `livreur_payment_methods` (wallets JSONB), `notifications`, `reviews`, `push_subscriptions`, `newsletter_subscribers`, `admin_messages`, `admin_message_reads`, `audit_log`, `client_logs`, `item_views`, `daily_visits`, `livreurs`, `photos` (legacy), `admin_hidden_sales`, `admin_hidden_statuses`, `admin_hidden_shops`, `admin_hidden_sellers`.

## Autres fonctionnalités notables

### Chat IA (`server/routes/chat.js`)
- Gemini (`GEMINI_MODEL` défaut `gemini-flash-latest`, fallbacks multiples), max 2000 chars, historique 12.
- Injection des produits en stock dans le prompt système + matching par synonymes (`chat-knowledge.js`).
- Support i18n fr/en/ar avec fallbacks.

### Push notifications (`server/push.js`)
- VAPID (clés par défaut codées en dur, `contact@mboppi.app`), subscriptions en table, nettoyage 404/410.
- Le consentement push est **requis pour s'inscrire comme shop** (Navbar : `api.pushKey()` + `api.pushSubscribe()`).
- Notifications automatiques : nouvelle commande, vente livrée, commission payée, parrainage payé, commande annulée, etc.

### Verone / Vitrine d'offres (`server/routes/offers.js` + `presentation.js`)
- Offres publiques (création possible sans auth), 3 photos max, `owner_id`, `warranty`, `currency`.
- Pages client `Verone.jsx` (rail offres), `VitrineOffre.jsx` (liste), `OfferDetail.jsx`.
- Présentation HTML `GET /p/:id` (page de partage) + `GET /api/img/:id` (redirection image).

### Avis et notations (`server/routes/reviews.js`)
- Notes 1-5 étoiles, distribution, commentaires max 500 chars.
- Une seule avis par utilisateur par produit (upsert).
- L'utilisateur doit avoir acheté ET reçu le produit (`status = 'delivered'`) avant de noter.
- Impossible de noter son propre produit.

### Métriques (`server/routes/metrics.js`)
- `POST /api/views` (batch 50 → `item_views`, produits et offres).
- `POST /api/visit` (X-Visitor-Id → `daily_visits`, déduplication par jour/visiteur/chemin).
- `GET /api/trending` (cache s-maxage 120, fenêtre 7 jours, mélange vues + ventes).

### Activité (`server/routes/activity.js`)
- `GET /api/activity` : séries temporelles (daily/weekly/monthly) avec ventes, commissions, achats, commandes, produits créés.
- `GET /api/activity/events` : timeline des événements (produits créés, ventes, paiements, achats, commandes) sur 30 jours.

### Newsletter (`server/routes/newsletter.js`)
- `POST /api/newsletter/subscribe` (public, rate limité).
- `GET /api/newsletter/unsubscribe?token=...` (page HTML dédiée).
- Admin : liste, envoi (`POST /api/newsletter/send`).

### Messages admin / popup (`server/routes/messages.js`)
- `GET /api/messages/popup` : message ciblé (all/user/shop/seller/client) non lu par l'utilisateur.
- `POST /api/messages/:id/ack` : marquer comme lu.

### Administration (`server/routes/admin.js`)
- Auth par mot de passe `ADMIN_PASSWORD` → token admin JWT.
- Statistiques globales (`GET /api/admin/stats`).
- Transactions (`GET /api/admin/transactions`) avec filtres par statut, boutique, vendeur. Masquage d'entités (`admin_hidden_sales`, `admin_hidden_statuses`, `admin_hidden_shops`, `admin_hidden_sellers`).
- Utilisateurs (`GET /api/admin/users`, `PATCH /api/admin/users/:id/verified`).
- Produits (`GET /api/admin/products`, `DELETE /api/admin/products/:id` avec notification + push).
- Messages (`GET/POST/DELETE /api/admin/messages`, `POST /api/admin/messages/:id/resend`).
- Visites (`GET /api/admin/visits`, `POST /api/admin/visits/reset`).
- Sauvegarde NDJSON (`GET /api/admin/backup`).
- Migration images (`POST /api/admin/migrate-images`).
- Nettoyage stock épuisé (`POST /api/admin/cleanup-stockout` avec `dry_run`).
- Usage DB + Storage (`GET /api/admin/usage`).

### Photos et stockage (`server/storage.js`, `server/photo.js`)
- Supabase Storage bucket `photos` (configuré via `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET`).
- Jusqu'à 3 photos par produit/offre, format `{thumb, full}` ou string URL.
- Upload base64 → Storage (fallback base64 si Storage non configuré).
- Nettoyage automatique des images à la suppression de produit/offre.
- Migration des images base64 vers Storage (`POST /api/admin/migrate-images`).
- Estimation usage Storage (`storageUsage()`).

### Recherche (`server/routes/products.js`)
- Recherche multi-mots avec normalisation diacritiques (NFD), matching nom produit + nom boutique.
- Filtres : catégorie, ville, prix min/max, shop, scope (`shop`/`creation`), tri (recent, popular, sales, price_asc, price_desc, rating).
- Pagination (limite 60 max, offset).
- **Produits en promo exclus** du catalogue (`NOT EXISTS flash_promotions ...`).

### Catégories et villes
- **30+ catégories** produits définies dans `client/src/config.js` (`PRODUCT_CATEGORIES`). Les créateurs sont forcés sur `Arts & Artisanat`.
- **Villes** : recherche dynamique (`GET /api/products/cities`) + pages SEO statiques pour 13 villes camerounaises.

### i18n
- fr (clés = chaînes), en/es/ar chargés dynamiquement, RTL pour ar. `t()` dans `client/src/i18n.jsx`.

### PWA
- `client/public/sw.js`, cache `mboppi-v53`, app shell + push handler + 4 manifests.
- Page hors-ligne `OfflinePage.jsx`.

### UI Components
- `Navbar.jsx` : menu Produits, Créateurs (sans emoji 🎨), Je soutiens, Formations et Digital (lien externe chariow.pics), Formation Mboppi (YouTube, sans emoji 🎓), espaces par rôle, Administration 🛡️.
- `BottomNav.jsx`, `BackToTop.jsx`, `BackButton.jsx`, `Footer.jsx`, `HeroCarousel.jsx`, `ProductRail.jsx`, `CategoryGrid.jsx`, `RecentSales.jsx`.
- `FlashPromoPopup.jsx` + `FlashPromo.jsx`.
- `AdminMessagePopup.jsx`, `CookiesBanner.jsx`, `LiteBanner.jsx`, `TrustBadges.jsx`.
- `ChatWidget.jsx`, `Invoice.jsx`, `Reviews.jsx`, `ReviewQuote.jsx`, `ProductCard.jsx`, `OfferCard.jsx`, `ShareVitrine.jsx`, `ExportSalesButton.jsx`, `CopyCode.jsx`, `Seo.jsx`, `PwaInstallButton.jsx`, `LoadingScreen.jsx`, `Reveal.jsx`, `SuggestionButton.jsx`, `SearchSelect.jsx`, `MegaMenu.jsx`, `Logo.jsx`.

### Favoris
- Page `Favorites.jsx` pour les clients, store global `store.jsx`.

### Sécurité
- **CORS** restrictif (localhost + domaine prod + `ALLOWED_ORIGIN` env).
- **Headers sécurité** via `security.js` + `vercel.json` (CSP, HSTS, X-Frame-Options, Permissions-Policy).
- **Rate limiting** par route (login, register, purchases, orders, chat, admin, etc.).
- **Audit log** (`audit_log`) + `client_logs` pour les erreurs front.
- **Purge automatique** : notifications > 90j, transactions > ~7ans, stats > 6 mois (best-effort au démarrage et via admin).

## Conventions de dev (IMPORTANT)

1. **Ne jamais committer sans demande explicite.** Quand le user demande « deployer » / « mettre en ligne » : bump + commit + push.
2. **Bump de version à chaque déploiement** : `client/package.json` + `client/package-lock.json` (lignes 3 **et** 9, ne pas toucher les entrées deps `loose-envify@1.8.3` / `update-browserslist-db@1.8.3`) + `package.json` racine. PWA : `client/public/sw.js` `CACHE_NAME = 'mboppi-v5X'` incrémenté. Historique : v51 → 1.10.0, v52 → 1.11.0, v53 → 1.12.0.
3. **Build** : `npm run build` dans `client/` (le hash du JS local diffère de celui de Vercel pour des raisons d'environnement ; vérifier le déploiement via le CSS hash ou en cherchant une chaîne caractéristique du nouveau code dans le JS servi).
4. **Vérifier le déploiement** : attendre ~75–90 s après push, puis `curl` sur `https://mboppi-mboppi.vercel.app/` (avec header `Accept: text/html` pour le HTML SEO) et chercher le hash CSS/JS du build local ; tester les API concernées.
5. Commandes utiles : `node --check server/routes/*.js` pour la syntaxe serveur.
6. Lignes de commande Windows : PowerShell — ne pas utiliser `&&`, utiliser `;` / `if ($?)`. Test-Path avant de créer des dossiers. `curl.exe` (pas l'alias PowerShell).
7. Le produit sous promo est invisible SAUF via son lien direct `/produit/:id` (landing promo) — c'est voulu.

## Historique récent des modifications

- **1.10.0 / v51** : refonte promotion éclair (masquage catalogue, règles serveur, UI shop).
- **1.11.0 / v52** : masquage SEO complet, blocage sellers côté serveur, commission promo 0, partage promo, offres Verone dans l'accueil (rail), suppression commission duo.
- **1.12.0 / v53** : popup promos superposées sur un même cadre avec rotation 5 s et titre « PROMOTION DU JOUR » centré (X ferme tout) ; correctif ancrage `bottom: 0` des cartes (popup cachée hors écran) ; retrait des emojis 🎨/🎓 du menu.
- **1.13.0** : intégration Ikeepay active (paiements auto + webhook + wallets), parrainage d'activation vendeur (1 000 XAF parrain + 500 XAF plateforme), système de reviews, métriques (vues/visites/trending), activité, newsletter, messages admin ciblés, avis clients, facture PDF pour livreur, export ventes, page favoris, mode lite, bannière cookies, Trustpilot, 90+ pays/devises.
