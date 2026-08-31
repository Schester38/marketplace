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
- **seller** : vendeur indépendant ; adhésion **1 500 XAF / 30 jours** requise (comme shop et creator) pour accéder au dashboard.
- **client / creator / livreur** : espaces distincts (créateur : adhésion 2 500 XAF / 30 jours). Livreur confirme les livraisons (flux `submitDeliver`).
- Auth : JWT (`JWT_SECRET` **requis, min 32 chars** sinon le serveur refuse de démarrer), 24 h. Email verification (24 h TTL, `SITE_URL`), Google OAuth optionnel.

## Commission et argent

### Règle financière — ENTRÉE 100 % / SORTIE 90 %

- **Tout ce qui entre est encaissé à 100 %** : l'acheteur paie le prix normal (aucun supplément), les adhésions et les dons au tarif plein.
- **Tout ce qui sort via Ikeepay transfère 90 % du montant** au bénéficiaire (`IKEEPAY_FEE_RATE = 0.1` dans `server/services/payouts.js`) ; les 10 % couvrent les frais de traitement / marge Mboppi.
- **Exception — paiements manuels** : la boutique qui règle vendeur/parrain en espèces/mobile avec preuve crédite le wallet à **100 %, sans frais**.

### Répartition d'une vente — `server/services/payouts.js` `computeRedistribution`

`totalPrice = prix × quantité`. Le **prix de référence** est celui du catalogue OU de la promo éclair active (`purchases.js:93-101`), jamais le prix client. Champs d'une vente : `commission` (commission vendeur), `referral_commission` (parrainage client affilié 2 %), `delivery_fee` (saisis par le livreur à la livraison, défaut 0).

- `shopAmount = totalPrice − commission − referralCommission` (la boutique)
- `sellerAmount = commission` (le vendeur)
- `referrerAmount = referralCommission` (le parrain)
- `livreurAmount = deliveryFee` (le livreur)

### Flux de paiement d'une vente

1. **Manuel (défaut)** : achat `POST /api/purchases` (`payment_method` 'mobile'|'espece') → statuts `pending → bought → confirmed → delivered` → la boutique règle via `POST /api/sales/:id/pay` avec **preuve photo/vidéo obligatoire** (data URI ≤ 12 M) → wallet vendeur crédité **sans frais** + notification `sale_paid`. Parrain : `POST /api/sales/:id/pay-referral`.
2. **Automatique Ikeepay — à la livraison (lightbox)** : au moment de la livraison, le livreur choisit « En ligne (iKeePay) » sur son formulaire (opérateur + numéro du client). `POST /api/payments/ikeepay/payin` (autorisé pour le livreur, `sale_id` + `delivery_fee`) débite le client `total_price + delivery_fee` (100 %) et renvoie un `payment_link` → la **lightbox** `IkeepayCheckout` s'ouvre pour que le client règle. **Tant que le paiement n'est pas confirmé par le bouton « Confirmer » de la lightbox, rien n'est finalisé** : la vente reste `pending`, aucune notification ni facture. Après confirmation (webhook `/confirm` ou `/webhook` → `payment_status='paid'`), le client (`LivreurDashboard.onConfirmed`) appelle `POST /api/sales/:id/deliver` (`payment_method` → `'automatic'`, `online_payment=TRUE`) → notifications, facture PDF, puis `markSalePaid` (verrou atomique sur `sales.payout_initiated`) → `paySaleAutomatically` reverse à chaque bénéficiaire (boutique `online_collect`, vendeur `commission_credit`, parrain `referral_credit`, livreur `online_payout`) **net 90 %** via `providerPayout` (réservation atomique `INSERT ON CONFLICT (external_reference) DO NOTHING RETURNING id`).
3. **Repli manuel** : si le paiement échoue ou est abandonné dans la lightbox, la vente n'est **pas** confirmée (aucune notification/facture) ; elle reste en `pending` et le livreur peut la rouvrir et la finaliser en **espèces / mobile** (`deliverSale` manuel).
- `providerPayout` : lit le **premier wallet dont le nom contient un opérateur connu** (orange, mtn, wave, moov, free, airtel, vodacom/mpesa, mobicash, tigo, halopesa, zamtel, opay, moniepoint) dans `wallets` jsonb des `*_payment_methods`, numéro normalisé avec préfixe pays. Trace dans `automatic_payouts` (amount, fee, net). Sans wallet valide → pas de reversement.
- Reversements « pending » confirmés par le webhook (`type=payout`, `status=completed`) via `completeAutomaticPayout` ; échecs tracés + push « Paiement échoué ». Anti-doublon : `automatic_payouts.external_reference` UNIQUE + **réservation atomique** (`INSERT ... ON CONFLICT DO NOTHING RETURNING id`) — seul le worker qui obtient la ligne appelle `iKeePay payout()`.

### Commission vendeur (2 % — PARRAINAGE DE CLIENTS AFFILIÉS)

**Ne pas confondre** : le **2 % est lié à un CLIENT affilié**, pas à un « vendeur affilié ». Le flux :

1. Un **client** s'inscrit avec le code vendeur d'un vendeur (`ref` = `seller_code`) → son compte est marqué `referred_by` et son rôle forcé à `client`.
2. Quand ce **client affilié** (auth obligatoire) achète — `purchases.js:128-136` ou `orders.js:114` — `referralCommission = prix × quantité × 2 %` et `referred_by` est enregistré sur la vente.
3. Le 2 % est versé **immédiatement par vente** (dès la confirmation du paiement de la vente) via `paySaleAutomatically`/`providerPayout` sur le moyen de paiement du parrain, net 90 %, puis `sales.referral_paid = TRUE` (géré par `completeAutomaticPayout`). Plus de mécanisme de cumul (l'ancien `payReferralAutomatically` + `REFERRAL_AUTO_PAY_MIN` ont été retirés en Phase 3).

Il existe aussi le **parrainage d'activation vendeur/créateur** (distinct) : un nouveau vendeur OU créateur s'inscrit avec le code d'un vendeur (`ref_seller`) ; quand il paie son adhésion, le parrain reçoit **1 000 XAF** (transfert net 90 % = 900) et **500 XAF** de part plateforme sont reversés aux portefeuilles Mboppi (net 450) — `completeMembershipPayment` + `payoutPlatformShare`.

### Commission de vente d'un produit

- `products.commission_percent` est choisi par la **boutique/créateur à la création du produit**, validé Zod **0 à 100 %** (`server/validators.js`), défaut 0. Commission vente seller = `prix × commission_percent % × qty`.
- Pendant une **promo éclair, commission = 0 %** (stockée dans `flash_promotions.commission_percent`) : le vendeur est exclu du produit (masqué de son catalogue, vente bloquée pendant la promo).

### Adhésions (accès aux espaces pro)

> **⚠️ Gratuit pour l'instant (accès direct après inscription)** : depuis v1.47.38, les comptes **shop / seller / creator** s'inscrivent avec `admin_approved = TRUE` (`server/routes/auth.js`, inserts email + Google) → accès immédiat et indéfini à leur espace, **sans payer les frais d'adhésion**. Tout le code de l'adhésion (déblocage via paiement / adhésion payante) reste en place mais est inopérant pour ces nouveaux comptes tant qu'ils restent approuvés. **Pour « bloquer après »** : l'admin utilise le bouton « Fermer » sur /admin (passe `admin_approved` à `FALSE`), ce qui déclenche le blocage 402 tant que le compte n'a pas d'adhésion active. (Les comptes pro existants déjà bloqués et non approuvés ne sont **pas** modifiés par ce changement — l'admin peut les « Ouvrir » individuellement.)

- Tarifs (`server/auth.js` `MEMBERSHIP_FEES`) : **shop 2 500 · seller 1 500 · creator 2 500 XAF**, valables **30 jours**. Livreur/client : pas d'adhésion.
- Accès accordé si `admin_approved = TRUE` (« Ouvrir » sur /admin — désormais activé d'office à l'inscription des rôles pro) **ou** adhésion active (`membership_expires_at` dans le futur). « Fermer » (admin_approved = FALSE) coupe l'accès sauf si une adhésion active existe.
- Sinon accès bloqué : `roleRequired` renvoie **402 MEMBERSHIP_REQUIRED** → le client intercepte ce code (événement `membership-required` dans `client/src/api.js`), rafraîchit la session et redirige vers `/adhesion` (page de paiement).
- Paiement : `POST /api/payments/ikeepay/membership` → webhook completed → `completeMembershipPayment` active 30 jours puis **balaye 90 % du frais vers les portefeuilles Mboppi** (`MBOPPI_SHARE:membership:{paymentId}`).

### Dons

- Manuels (`POST /api/donations`, virement direct hors système) ou Ikeepay (`POST /api/donations/ikeepay`). À la confirmation webhook d'un don Ikeepay, **90 % sont balayés vers les portefeuilles Mboppi** (`MBOPPI_SHARE:donation:{id}`).

### Portefeuille Mboppi

- Configuré par env `MBOPPI_PAYOUT_COUNTRY` (défaut CM), `MBOPPI_PAYOUT_PHONE` (défaut +237699486146), `MBOPPI_PAYOUT_OPERATOR` (défaut ORANGE). Balayages tracés dans `platform_payouts` (`MBOPPI_SHARE:{kind}:{sourceId}`, UNIQUE) ; échecs visibles en base.

### Wallet et moyens de paiement

- **Wallet** (`server/routes/wallet.js`) : `GET /api/wallet/me` pour seller/creator, `wallet_transactions`, `balance = SUM(amount)` (montants signés), devise affichée XAF.
- Moyens de paiement des gains : `shop_payment_methods` / `seller_payment_methods` / `livreur_payment_methods` (le créateur réutilise `shop_payment_methods`/`shop_id`) — `full_name`, `wallets` jsonb liste `{name, value}` (max 20).

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
- `purchases.js` : `POST /` avec `product_id, seller_code (uppercasé), quantity, buyer_*, payment_method ('mobile'|'espece'|'automatic')`; auth optionnelle. Le **prix de référence** est celui du catalogue OU de la promo active (`purchases.js:93-101`), jamais le prix client.
- `orders.js` : panier multi-articles (code 6 chars).
- **Livraison** (`sales.js` `/:id/deliver`) : le livreur saisit `delivery_fee` + `payment_method` (`espèce`/`mobile`/`automatic`), doit fournir le `shop_code` de la boutique et le `client_code` du client ; décrémente le stock (ou `reserved_quantity` si `stock_reserved`). En mode `automatic`, `online_payment` passe à `TRUE`. **En paiement en ligne, `deliverSale` n'est appelé qu'après confirmation du paiement dans la lightbox** (cf. flux ci-dessus) ; en manuel il est appelé directement. Après livraison, le cumul de parrainage du vendeur référent peut être versé automatiquement.
- **Paiement d'une vente** : manuel avec preuve (`POST /api/sales/:id/pay`, wallet crédité 100 %) **ou** en ligne Ikeepay à la livraison (`POST /api/payments/ikeepay/payin` déclenché par le livreur → lightbox → confirmation → reversements nets 90 % — voir « Commission et argent »).
- **Suppression de livraison** : bloquée si commission vendeur (`paid`) ou parrainage (`referral_paid`) non payés. Paiement groupé des commissions par la boutique : `/:id/claim` et `/:id/pay-referral`.
- **Facture PDF** : `client/src/components/Invoice.jsx` — jspdf **v4.2.1** importé dynamiquement, `doc.save('facture-{id}.pdf')`, logo `/navbar-logo.png`, boutons dans Shop/Seller/Livreur dashboards.

### Suppressions sur /admin — deux types bien distincts

- **Masquages doux SUPPRIMÉS (v1.47.39)** : les boutons « Supprimer » / « Restaurer » des sections **Par statut, Par boutique, Par vendeur, Dernières transactions** et les tables `admin_hidden_*` ont été entièrement retirés (erreurs 500 « erreur interne du serveur » en production). Ces sections restent en lecture seule ; seule la suppression réelle des produits publiés existe encore (`router.delete('/products/:id')`).
- **Vraie suppression de produit (AFFECTE l'utilisateur)** : le bouton « Supprimer » du bloc **Produits** (en haut de /admin) fait un `DELETE FROM products` réel + notification + push à la boutique concernée (`router.delete('/products/:id')`). Le produit disparaît définitivement du catalogue et de l'espace de la boutique.
- La **suppression de comptes utilisateurs est désactivée** (`DELETE /admin/users/:id` → 403 « Fermez pour couper l'accès »).

## Tableaux principaux (créés dans `server/db.js` initDb)

`users` (dont `email_verified`, `admin_approved`, `membership_paid_at`, `membership_expires_at`, `membership_fee`, `referred_by`, `seller_code`, `shop_code`), `products` (dont `commission_percent`, `delivery_fee`), `photos`, `sales` (dont `commission`, `referral_commission`, `delivery_fee`, `paid`, `referral_paid`, `payment_status`, champs Ikeepay), `orders`, `offers` (Verone/Vitrine), `flash_promotions(id, shop_id, product_id, promo_price, duration_minutes, starts_at, ends_at, created_at, currency)`, `wallet_transactions`, `wallet_accounts`, `shop_payment_methods`, `seller_payment_methods`, `livreur_payment_methods`, `livreurs`, `notifications`, `reviews`, `push_subscriptions`, `newsletter_subscribers`, `admin_messages`, `admin_message_reads`, `audit_log`, `client_logs`, `item_views`, `daily_visits` (purge 6 mois via `server/cleanup.js`), `membership_payments`, `automatic_payouts`, `platform_payouts`, `payment_webhook_logs`, `donations`.

## Autres fonctionnalités notables

- **Chat IA** (`server/routes/chat.js`) : Gemini (`GEMINI_MODEL` défaut `gemini-flash-latest`), max 2000 chars, historique 12, injecte les produits en stock dans le prompt système.
- **Push** : `server/push.js` (VAPID par défaut codé en dur, `contact@mboppi.app`), subscriptions en table, nettoyage 404/410. Le consentement push est **requis pour s'inscrire comme shop** (Navbar : `api.pushKey()` + `api.pushSubscribe()`).
- **Verone / Vitrine d'offres** : `server/routes/offers.js` (public, 3 photos max) + `presentation.js` (`GET /image/:id`, page HTML) ; pages client `Verone.jsx`, `VitrineOffre.jsx`.
- **Métriques** : `POST /views` (batch 50 → `item_views`), `POST /visit` (X-Visitor-Id → `daily_visits`), `GET /trending` (cache s-maxage 120).
- **i18n** : fr (clés = chaînes), en/es/ar chargés dynamiquement, RTL pour ar. `t()` dans `client/src/i18n.jsx`.
- **PWA** : `client/public/sw.js`, cache `mboppi-v139` (incrémenté à chaque déploiement), app shell + push handler + 4 manifest.
- **Audit/sécurité** : `server/security.js` (origines autorisées, audit log), rate limits par route.
- **Photos** : Supabase Storage bucket `photos`, jusqu'à 3 par produit/offre, `{thumb, full}`, `SUPABASE_JWT_SECRET` pour clé opaque `sb_secret_...`.
- **Menu** (`client/src/components/Navbar.jsx`) : Produits, Créateurs (sans emoji 🎨), Je soutiens, Formations et Digital (lien externe chariow.pics), Formation Mboppi (YouTube, sans emoji 🎓), espaces par rôle, Administration 🛡️.

## Conventions de dev (IMPORTANT)

1. **Ne jamais committer sans demande explicite.** Quand le user demande « deployer » / « mettre en ligne » : bump + commit + push.
2. **Bump de version à chaque déploiement** : `client/package.json` + `client/package-lock.json` (occurrences `"version"` lignes 3 **et** 9, ne pas toucher les entrées deps) + `package.json` racine. PWA : `client/public/sw.js` `CACHE_NAME = 'mboppi-vXXX'` incrémenté. Historique : v109 → 1.46.0, v110 → 1.47.0, v111 → 1.47.1, v112 → 1.47.2, v113 → 1.47.3, … v135 → 1.47.25, v136 → 1.47.26, v137 → 1.47.27, v138 → 1.47.28, v139 → 1.47.29 (voir « Historique récent »).
3. **Build** : `npm run build` dans `client/` (le hash du JS local diffère de celui de Vercel pour des raisons d'environnement ; vérifier le déploiement via le CSS hash ou en cherchant une chaîne caractéristique du nouveau code dans le JS servi).
4. **Vérifier le déploiement** : attendre ~75–90 s après push, puis `curl` sur `https://mboppi-mboppi.vercel.app/` (avec header `Accept: text/html` pour le HTML SEO) et chercher le hash CSS/JS du build local ; tester les API concernées.
5. Commandes utiles : `node --check server/routes/*.js` pour la syntaxe serveur.
6. Lignes de commande Windows : PowerShell — ne pas utiliser `&&`, utiliser `;` / `if ($?)`. Test-Path avant de créer des dossiers. `curl.exe` (pas l'alias PowerShell).
7. Le produit sous promo est invisible SAUF via son lien direct `/produit/:id` (landing promo) — c'est voulu.

## Historique récent des modifications

- **1.46.0 / v109** : rôle livreur réaffiché après login, déballage `{ user }` de `/me` dans AuthProvider, auto-réparation des sessions corrompues, audit google.register.
- **1.47.0 / v110** : « Ouvrir/Fermer » admin — le 402 MEMBERSHIP_REQUIRED rafraîchit la session et redirige vers `/adhesion` ; fix adhésion créateur (2 500 XAF, avant : bloqué à vie) ; popup messages admin réparée (LEFT JOIN — les messages « à tous » n'étaient jamais affichés — ciblage créateurs, liste chargée à l'ouverture) ; boutons Supprimer /admin réparés (10 méthodes api manquantes) ; suppression de comptes désactivée (bouton retiré + serveur 403), seuls les produits publiés sont supprimables ; masquages doux transactions/boutiques/vendeurs opérationnels ; fix crash Déconnexion (`setLogs` inexistant).
- **1.47.1 / v111** : fix crash dashboards livreur et créateur (`useCallback` non importé) + audit automatique de tous les hooks React du client.
- **1.47.2 / v112** : règle financière **entrée 100 % / sortie 90 %** — suppression du supplément « Frais Ikeepay 6 % » côté acheteur ; reversements sortants Ikeepay transfèrent le net 90 % ; FAQ/mentions légales harmonisées à 10 %.
- **1.47.3 / v113** : balayage de **90 % des adhésions, dons Ikeepay et part plateforme 500 XAF** vers les portefeuilles Mboppi (`payoutPlatformShare` généralisé `MBOPPI_SHARE:{kind}:{id}`, devise d'origine conservée) ; échecs plateforme tracés en base ; audit complet de la chaîne de reversement.
- **1.47.4 / v114** : documentation et textes utilisateurs harmonisés à la règle 100/90 (AGENTS, README, chat IA fr/en/ar, i18n 5000 F, FAQ/CGV/CGU/Privacy/About).
- **1.47.5 / v115** : fix « Contacter un livreur » — méthodes `listLivreurs`/`livreurOptions` ajoutées au client.
- **1.47.6 / v116** : paiement déplacé vers la livraison (formulaire commande épuré), annuaire livreurs branché (`app.use("/api/livreurs")`), Trustpilot retiré (erreurs Edge), lisibilité dark/light page livreurs.
- **1.47.7 / v117** : colonne Paiement fidèle aux modes dans /admin/transactions (`payment_status`, `online_payment`), auto-refresh admin 30 s, synchronisation de session 60 s (Ouvrir/Fermer instantané, retour auto depuis /adhesion).
- **1.47.8 / v118** : courbe des visites (MiniChart aire dégradée) + répartition des utilisateurs par rôle sur /admin ; visites rafraîchies toutes les 30 s.
- Facture PDF : parfaitement fonctionnelle (vérifié — téléchargement jsPDF OK).
- **1.47.25 / v135** : suppression du formulaire de paiement sur la fiche de commande — le paiement se fait uniquement à la livraison via le formulaire du livreur.
- **1.47.26 / v136** : **paiement iKeePay en ligne à la livraison (lightbox)** — option « En ligne (iKeePay) » sur le formulaire du livreur (opérateur + numéro client) ; `deliver` accepte `payment_method='automatic'`/`online` (`online_payment=TRUE`) ; reversements auto par acteur net 90 % ; **gap comblé** : acteur sans moyen de paiement configuré = échec tracé dans `automatic_payouts` + push d'alerte ; fix panier.
- **1.47.27 / v137** : affichage des **moyens de paiement de la boutique** sur le formulaire de livraison (« Par Mobile » → `GET /shop/:id/payment-methods` : nom du titulaire + portefeuilles).
- **1.47.28 / v138** : fix 403 « Cette commande ne vous appartient pas » du payin — le livreur de la vente peut initier le payin au nom de son client.
- **1.47.29 / v139** : **flux finalisé après paiement** — en paiement en ligne, `deliverSale` (notifications + facture + reversements) n'est appelé **qu'après** la confirmation du paiement dans la lightbox ; en cas d'échec/abandon la vente reste `pending` avec repli manuel (espèces/mobile).