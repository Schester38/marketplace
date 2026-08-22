# AGENTS.md — Mboppi Marketplace

Contexte de travail pour toute session IA sur ce dépôt. Lire ce fichier avant de modifier quoi que ce soit.

## Vue d'ensemble

Marketplace **Mboppi** (Cameroun et Afrique) : vente en ligne, boutiques physiques, vendeurs indépendants, créateurs, livreurs, commandes par téléphone/WhatsApp et paiement mobile.

- **Client** : React 18 + Vite 5 (`client/`, port dev 5173, proxy `/api` → `localhost:4000`).
- **Serveur** : Express 4 (`server/`, port 4000), PostgreSQL via Supabase (`server/db.js` : `DATABASE_URL_POOLED`, fallback `DATABASE_URL`, `ssl rejectUnauthorized: false`; exports `q()`, `withTransaction()`, `initDb()` qui crée toutes les tables).
- **Déploiement** : Vercel, entrée serverless `api/index.js` → `server/app.js` + `initDb()`. `vercel.json` route `/api/*`, `/produit/:id`, `/boutique/:id`, `/createur/:id`, `/ville/:x`, `/offre/:id`, `/sitemap.xml`, `/` vers l'API, le reste vers le SPA.
- **Prod** : `https://mboppi-mboppi.vercel.app` (client + API). `BASE_URL`, `SITE_URL`, `PUBLIC_URL` par défaut sur ce domaine.

## Rôles utilisateurs

`role IN ('shop','seller','client','creator','livreur')` — contrainte DB. Admin = utilisateur virtuel (id 0), auth par `ADMIN_PASSWORD` env → `POST /api/admin/pass`.

- **shop** : boutique (Max **5 produits**), peut lancer des **promos éclair**, boutons partage.
- **seller** : vendeur indépendant, plus d'activation payante (gratuite), accès direct au dashboard.
- **client / creator / livreur** : espaces distincts. Livreur confirme les livraisons (flux `submitDeliver`).
- Auth : JWT (`JWT_SECRET` **requis, min 32 chars** sinon le serveur refuse de démarrer), 24 h. Email verification (24 h TTL, `SITE_URL`), Google OAuth optionnel.

## Commission et argent

### Frais de service — 0 % (paiements manuels)

**Tous les paiements sont manuels** : pas de frais de plateforme, pas de frais iKeePay. Les transactions se font en espèces, virement Mobile Money direct vers le bénéficiaire, ou virement bancaire. Les montants sont reversés intégralement aux bénéficiaires.

### Répartition d'une vente — `server/finance.js` `computeRedistribution`

`totalPrice = prix × quantité` (le prix de référence : erreur de sécurité si le client fournit un prix inférieur). Champs d'une vente : `commission` (commission vendeur), `referral_commission` (commission de parrainage 2 %), `delivery_fee` (frais de livraison, saisis par le livreur à la livraison, valeur par défaut 0).

- `shopAmount = totalPrice − commission − referralCommission` (ce que touche la boutique)
- `sellerAmount = commission` (le vendeur)
- `referrerAmount = referralCommission` (le parrain)
- `livreurAmount = deliveryFee` (le livreur)

Reverse automatique `sendSalePayouts` (après validation manuelle, `markSalePaid`) : chaque montant > 0 est enregistré dans `wallet_transactions` **sans frais**, vers le portefeuille Mobile Money du bénéficiaire (`payoutTargetFor` : lit `wallets` jsonb de `*_payment_methods`, priorité au wallet dont le nom contient « orange », numéro normalisé avec le préfixe pays). Sans wallet valide → pas de reverse + notification `payment_need_wallet`.

### Commission vendeur (2 % — PARRAINAGE DE CLIENTS AFFILIÉS)

**Ne pas confondre** : le **2 % est lié à un CLIENT affilié**, pas à un « vendeur affilié ». Le flux :

1. Un **client** s'inscrit avec le code vendeur d'un vendeur (`ref` = `seller_code`, `auth.js:63-72`) → son compte est marqué `referred_by = id_du_vendeur` et son rôle est forcé à `client`. Ce client est maintenant **client affilié** du vendeur.
2. Quand ce **client affilié** (identifié par `req.user`, donc auth obligatoire pour déclencher le 2 %) achète un produit — `purchases.js:101-107` ou `orders.js:75-80` — alors `referralCommission = prix × quantité × 2 %` et `referred_by` est enregistré sur la vente. Le **vendeur parrain** (le référent) reçoit ces 2 %.
3. Le 2 % **n'est pas payé vente par vente** : il s'accumule (`referral_commission` non payée, `referral_paid = false`) et est versé automatiquement quand le cumul du parrain atteint `REFERRAL_AUTO_PAY_MIN = 1500` (`finance.js:154` `maybeAutoPayReferrals`, déclenché à la livraison `sales.js:609-615`), vers le wallet seller du parrain **sans frais**, avec notification + push « Parrainage versé ».

Il existe aussi le **parrainage d'activation vendeur** (distinct) : un nouveau vendeur s'inscrit avec le `seller_code` d'un autre vendeur (`ref_seller`, `auth.js:73-82`) ; l'activation est maintenant **gratuite** (plus de frais), le parrain ne reçoit plus de commission d'activation.

### Commission de vente d'un produit

- `products.commission_percent` est choisi par la **boutique à la création du produit** (0-100, `products.js:261,273,384,396`). Commission vente seller = `prix × commission_percent % × qty`.
- Pendant une **promo éclair, commission = 0 %** : le vendeur est exclu du produit (le produit est masqué de son catalogue et `sales.js:41-50` bloque la vente pendant la promo).
- Activation seller : **gratuite** (plus de `SELLER_ACTIVATION_FEE`), durée illimitée.

### Wallet et moyens de paiement

- **Wallet** (`server/routes/wallet.js`) : `GET /api/wallet/me` pour seller/creator, `wallet_transactions`, `balance = SUM(amount)` (montants signés), devise XAF.
- Moyens de paiement des gains : `shop_payment_methods` / `seller_payment_methods` / `livreur_payment_methods` (PK = `*_id`, `full_name`, `wallets` jsonb — liste `{name, value}`, upsert `ON CONFLICT`).
- Pays/pays africains : liste statique dans `ikeepay.js` (ex. Cameroun CM/237). Mapping noms de wallets → opérateur dans `OPERATOR_MAP` (« free money »/« yoomee » → ORANGE, « m-pesa » → VODACOM, « t-money » → MOBICASH…).

## Promotions éclair (flash promotions)

- **Règles serveur** (`server/routes/flashPromotions.js`) : **uniquement les boutiques** (sellers bloqués), **max 1 promo/semaine/boutique** (`MAX_WEEKLY_PER_SHOP = 1`, `MIN_WEEK_GAP_DAYS = 7`), durée max **24 h** (`MAX_MINUTES = 1440`, défaut 180), prix promo ≤ prix produit, **commission 0 %**, `currency` défaut XAF, purgées à expiration. `GET /api/flash-promotions` : liste publique filtrée `ends_at > now() AND quantity > 0`, `ORDER BY ends_at ASC LIMIT 20`.
- **Produit masqué pendant la promo** : tout le code utilise `NOT EXISTS (SELECT 1 FROM flash_promotions fp WHERE fp.product_id = p.id AND fp.ends_at > now())` pour cacher le produit du catalogue : listings produits, produits de la boutique (ShopDashboard), vendeurs, SEO (accueil, boutique, créateur) et compteurs SEO. Seule la page `/produit/:id` reste accessible (page d'atterrissage de la promo, sert le prix promo via `flash_promo`).
- **Prix promo côté client** : `product.flash_promo` (objet `{id, price, discount_percent, commission_percent, commission, starts_at, ends_at, duration_minutes}`) — utilisé dans `ProductDetail.jsx`, `PurchasePage.jsx` (`displayPrice`), `store.jsx` (panier, `old_price`), `ProductCard`. `data-flash` dans les commandes.
- **Popup publique** (`client/src/components/FlashPromoPopup.jsx`) : s'affiche sur `/`, `/shop`, `/seller`, `/client`, `/creator`, `/livreur`. **Toutes les promos actives sont superposées sur le même cadre** (conteneur `.flash-popup-stack`, `position: fixed`, bas à droite), rotation **toutes les 5 s** (`ROTATE_MS = 5000`), max 4, refresh 30 s. Titre centré « ⚡ PROMOTION DU JOUR » (bandeau rouge dégradé). La croix ✕ (dans la carte active, `z-index` haut) **ferme tout** et marque les promos fermées pour la journée dans **localStorage `mboppi_flash_dismissed`** (`{id: toDateString()}`).
- **CSS important** : `.flash-popup` sont `position: absolute; bottom: 0` dans le cadre (hauteur nulle du conteneur) — **ne jamais les ancrer en `top`** sinon elles sortent de l'écran (bug déjà corrigé). Cartes inactives : opacité 0.55, `translateY(-8px)`, `pointer-events: none`. La croix est rendue **dans** chaque carte (`depth === 0`).
- Form boutique : `ShopDashboard.jsx` (`flash-promo-form`, select produit, prix promo, durée, bouton « ⚡ Lancer la promotion », carte `FlashPromoCard` avec partage 🔗 et annulation). `FlashPromoCard` accepte `onDelete`/`onShare`/`showShop`.
- Url directe : `/produit/{id}` = landing promo (badge, compte à rebours, ancien prix barré).

## SEO (SSR)

- `server/routes/seo.js` : lit `client/dist/index.html`, cache 30 s, `injectHead()` → title/description/canonical/og; routes `/`, `/boutique/:id`, `/produit/:id`, `/sitemap.xml`. Base `https://mboppi-mboppi.vercel.app`.
- Les produits sous promo sont **exclus** des listings SEO (ItemList accueil, compteurs boutique/créateur, sample image).

## Ventes / commandes

- `sales` : status `pending → bought → confirmed → delivered`; `confirm_code` 6 chars (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), unique aussi contre `orders`.
- `purchases.js` : `POST /` avec `product_id, seller_code (uppercasé), purchase_price, quantity, buyer_*, payment_method ('mobile'|'espece')`; auth optionnelle. Le **prix de référence** est celui du catalogue OU de la promo active (`purchases.js:75`), jamais le prix client.
- `orders.js` : panier multi-articles (code 6 chars).
- **Livraison** (`sales.js:540` `/:id/deliver`) : le livreur saisit `delivery_fee` + `payment_method` (`espèce`/`mobile`/`en ligne`), doit fournir le `shop_code` de la boutique et le `confirm_code` du client ; décrémente le stock (ou `reserved_quantity` si `stock_reserved`). À la livraison : déclenche `maybeAutoPayReferrals` pour le parrain (`sales.js:609-615`).
- **Paiement d'une vente** : maintenant **manuel uniquement** (espèces, mobile money direct, virement). Plus de `POST /api/payments/payin` ni webhook iKeePay. Validation manuelle via `POST /sales/:id/pay` (boutique paie vendeur) et `POST /sales/:id/pay-referral` (boutique paie parrain).
- **Suppression de livraison** : bloquée si commission vendeur (`paid`) ou parrainage (`referral_paid`) non payés (`sales.js:436-444`). Paiement groupé des commissions par la boutique : `/:id/claim` et `/:id/pay-referral` (`sales.js:782-917`).
- **Facture PDF** : `client/src/components/Invoice.jsx` — jspdf **v4.2.1** importé dynamiquement, `doc.save('facture-{id}.pdf')`, logo `/navbar-logo.png`, boutons dans Shop/Seller/Livreur dashboards.

## Tableaux principaux (créés dans `server/db.js` initDb)

`users` (dont `email_verified`, `activation_fee_paid`, `activation_fee_paid_at`), `products`, `photos`, `sales`, `orders`, `offers` (Verone/Vitrine), `flash_promotions(id, shop_id, product_id, promo_price, duration_minutes, starts_at, ends_at, created_at, currency)`, `wallet_transactions`, `shop_payment_methods`, `seller_payment_methods`, `livreur_payment_methods`, `livreurs`, `notifications`, `reviews`, `push_subscriptions`, `newsletter_subscribers`, `admin_messages`, `admin_message_reads`, `audit_log`, `client_logs`, `item_views`, `daily_visits` (purge 6 mois via `server/cleanup.js`).

## Autres fonctionnalités notables

- **Chat IA** (`server/routes/chat.js`) : Gemini (`GEMINI_MODEL` défaut `gemini-flash-latest`), max 2000 chars, historique 12, injecte les produits en stock dans le prompt système.
- **Push** : `server/push.js` (VAPID par défaut codé en dur, `contact@mboppi.app`), subscriptions en table, nettoyage 404/410. Le consentement push est **requis pour s'inscrire comme shop** (Navbar : `api.pushKey()` + `api.pushSubscribe()`).
- **Verone / Vitrine d'offres** : `server/routes/offers.js` (public, 3 photos max) + `presentation.js` (`GET /image/:id`, page HTML) ; pages client `Verone.jsx`, `VitrineOffre.jsx`.
- **Métriques** : `POST /views` (batch 50 → `item_views`), `POST /visit` (X-Visitor-Id → `daily_visits`), `GET /trending` (cache s-maxage 120).
- **i18n** : fr (clés = chaînes), en/es/ar chargés dynamiquement, RTL pour ar. `t()` dans `client/src/i18n.jsx`.
- **PWA** : `client/public/sw.js`, cache `mboppi-v53`, app shell + push handler + 4 manifest.
- **Audit/sécurité** : `server/security.js` (origines autorisées, audit log), rate limits par route.
- **Photos** : Supabase Storage bucket `photos`, jusqu'à 3 par produit/offre, `{thumb, full}`, `SUPABASE_JWT_SECRET` pour clé opaque `sb_secret_...`.
- **Menu** (`client/src/components/Navbar.jsx`) : Produits, Créateurs (sans emoji 🎨), Je soutiens, Formations et Digital (lien externe chariow.pics), Formation Mboppi (YouTube, sans emoji 🎓), espaces par rôle, Administration 🛡️.

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
- **1.13.0** : suppression complète d'iKeePay (paiements 100% manuels, plus de frais 6 %, plus de webhook, plus de payout automatique).
- Facture PDF : parfaitement fonctionnelle (vérifié — téléchargement jsPDF OK).