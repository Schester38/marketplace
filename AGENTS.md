# AGENTS.md — Mboppi Marketplace

Contexte de travail pour toute session IA sur ce dépôt. Lire ce fichier avant de modifier quoi que ce soit.

## Vue d'ensemble

Marketplace **Mboppi** (Cameroun et Afrique) : vente en ligne, boutiques physiques, vendeurs indépendants, créateurs, livreurs, commandes par téléphone/WhatsApp et paiement mobile.

- **Client** : React 18 + Vite 5 (`client/`, dev 5173, proxy `/api` → `localhost:4000`), version `1.52.2`.
- **Serveur** : Express 4 (`server/`, port 4000), PostgreSQL via Supabase (`server/db.js` : `DATABASE_URL_POOLED`, fallback `DATABASE_URL`, `ssl rejectUnauthorized: false` ; exports `q()`, `withTransaction()`, `initDb()`).
- **Finance** : `server/services/payouts.js` — `computeRedistribution`, `normalizeWalletPrimary`, seuils de commission. Il n'existe **pas** de `server/finance.js`.
- **Déploiement** : Vercel, entrée serverless `api/index.js` → `server/app.js` + `initDb()`. `vercel.json` route `/api/*`, `/produit/:id`, `/boutique/:id`, `/createur/:id`, `/ville/:x`, `/offre/:id`, `/sitemap.xml`, `/` vers l'API, le reste vers le SPA.
- **Prod** : `https://mboppi-mboppi.vercel.app` (client + API). `BASE_URL`, `SITE_URL`, `PUBLIC_URL` par défaut sur ce domaine.

## Rôles utilisateurs

`users.role` accepte `('shop','seller','client','creator','livreur')` ; la contrainte est étendue à `'admin'` par une migration (`db.js`). L'admin est un utilisateur virtuel (id 0), authentifié par `ADMIN_PASSWORD` → `POST /api/admin/pass`.

- **shop** : boutique (max **5 produits**, `MAX_PRODUCTS_PER_SHOP` = 5), promos éclair, partage, paiement des commissions.
- **seller** : vendeur indépendant, code vendeur 6 caractères, commissions de vente et de parrainage.
- **creator** : crée des créations/offres et publie des produits (catégorie forcée « Arts & Artisanat »). Moyens de paiement partagés avec les boutiques (`shop_payment_methods`).
- **client / livreur** : espaces distincts ; le livreur confirme les livraisons (`/:id/deliver`).
- **Adhésion** : **seul le vendeur paie** (1 500 XAF / 30 jours ; `MEMBERSHIP_FEES`/`MEMBERSHIP_DAYS` définis dans `server/fees.js`, re-exportés par `server/auth.js`). `roleRequired` renvoie **402 MEMBERSHIP_REQUIRED** pour le `seller` tant que `admin_approved` est faux et `membership_expires_at` n'est pas dans le futur. Boutiques, créateurs, clients et livreurs accèdent **directement** à leur espace (aucun frais), quel que soit le mode de paiement — l'admin vérifie les comptes dans le panneau.
- Auth : JWT (`JWT_SECRET` **requis, min 32 caractères** sinon le serveur refuse de démarrer), 24 h. Email verification (24 h TTL, `SITE_URL`), Google OAuth optionnel.

## Commission et argent

### Frais de service — 0 %, deux systèmes de paiement (manuel ↔ automatique)

L'admin bascule entre les deux systèmes via le panneau **Administration → Système de paiement** (bouton « Basculer vers le manuel / automatique »). Le mode est stocké dans `platform_settings` (clés `payment_mode`, `ikeepay_public_key`, `ikeepay_secret_key`) et le **serveur fait autorité** : les routes de payin sont refusées en mode manuel.

- **Mode manuel (défaut)** : adhésions et dons payés hors plateforme (Mobile Money direct, virement UBA, MoneyFusion) ; l'admin valide chaque adhésion (`PATCH /api/admin/users/:id/admin-approved`, `POST /api/admin/referrals/:id/pay`) et la page d'adhésion affiche les instructions de virement.
- **Mode automatique (iKeePay — PAYIN uniquement, pas de payout)** : l'adhésion **vendeur** (`POST /api/payments/membership-payin`) et le don (`POST /api/payments/donation-payin`) sont payés en ligne via le checkout inline `https://ikeepay.com/checkout/v1/inline` (iframe + `postMessage`). Un **webhook** `POST /api/ikeepay/webhook?k=SECRET` (deux formats gérés : `payment.success` et `transaction.updated/created` avec `data.status`/`data.type` ; référence cherchée dans la racine, `data` **et** `data.data`) confirme la transaction → activation immédiate du compte (`admin_approved = TRUE`, 30 jours, dans la **même transaction** que le passage à `completed`) et notification du parrain si adhésion parrainée. **Les versements vendeur/parrain restent manuels** dans les deux modes.
- **Sécurité webhook (TOKEN OBLIGATOIRE)** : le webhook est protégé par un secret auto-généré (`platform_settings` clé `ikeepay_webhook_secret`, 32 hex) accepté via `?k=...` ou le header `x-ikeepay-token`, comparé en temps constant (`timingSafeEqual`). **Sans token valide → 403 `invalid_webhook_token`.** L'URL complète (avec token) est affichée avec bouton « Copier » dans le panneau Admin → Système de paiement : c'est **elle** qui doit être enregistrée chez iKeePay. Montant + devise vérifiés au webhook (XAF/XOF tolérés, parité CFA) ; clé secrète iKeePay jamais exposée au client ; origine iKeePay autorisée (`originCheck` + CSP `frame-src`/`form-action` dans `vercel.json` **et** `server/security.js`).
- **Fiabilité / auto-réparation (post-1.52.2, non versionné)** :
  - chaque webhook reçu est **journalisé AVANT traitement** dans `payment_webhook_logs` (un crash/timeout laisse une trace exploitable) ;
  - la purge des paiements en attente > 30 min **archive** (`status='expired'`) au lieu de supprimer : la liste admin filtre les `expired`, mais ils restent réconciliables **24 h** ;
  - réconciliation webhook tardive par **email prioritaire puis montant** (lignes `pending` **et** `expired`, ≤ 24 h) ;
  - `GET /api/payments/membership-status` (auth requis) : filet d'activation — si un paiement du compte est `completed` (< 24 h) alors que le compte n'est pas actif, il est activé à la volée (idempotent) ; sinon réconciliation depuis les logs de webhooks non rattachés (cooldown 5 s, max 10 logs, budget 4 s) ;
  - la page d'adhésion **sonde** ce endpoint toutes les 4 s (6 min max) avec diagnostic dans la console (`[adhésion] statut : ...`, liste des 5 derniers webhooks) → redirection automatique dès activation (via l'effet `membershipActive` d'`App.jsx`) ;
  - secours admin : boutons « Marquer complété » sur dons **et** adhésions (`POST /api/admin/payments/{donations,memberships}/:id/complete`).

Les moyens de paiement sont enregistrés par chaque espace pour permettre les transferts directs entre parties.

**Panneau admin (quel que soit le mode)** : la section **Utilisateurs** (recherche, ouvrir/fermer, vérifier, adhésion) et la section **Retraits d'activation** sont **toujours visibles** pour que l'admin puisse vérifier les comptes et payer les retraits (qui restent manuels dans les deux modes). Seule la section **Parrainages** (marquage « payé » manuel) est propre au mode manuel ; en mode automatique, elle est remplacée par le suivi des paiements en ligne iKeePay.

### Répartition d'une vente — `server/services/payouts.js` `computeRedistribution`

`totalPrice = prix × quantité` (le prix de référence : catalogue OU promo éclair active — un prix client arbitraire ne modifie jamais le calcul). Champs d'une vente : `commission`, `referral_commission` (2 % parrainage), `delivery_fee` (saisie par le livreur, défaut 0).

- `shopAmount = totalPrice − commission − referralCommission` (ce que touche la boutique)
- `sellerAmount = commission` (le vendeur)
- `referrerAmount = referralCommission` (le parrain)
- `livreurAmount = deliveryFee` (le livreur)

Le paiement des gains est **manuel** et comptabilisé dans `wallet_transactions` **sans frais** :
- vendeur : `POST /api/sales/:id/pay` (boutique, **preuve `data:` obligatoire**) → `commission_credit` ;
- parrain : `POST /api/sales/:id/pay-referral` → `referral_credit` ;
- groupé (boutique) : `POST /api/sales/grouped-pay` (`kind: seller|referral`, `seller_id`, `proof`).

### Seuils de commission — `payouts.js`

`REFERRAL_CLAIM_THRESHOLD = COMMISSION_CLAIM_THRESHOLD = 5000` XAF.

- **Vente unitaire** : `POST /api/sales/:id/pay` et `POST /api/sales/:id/claim` (vendeur) sont refusés si la **commission de cette vente** < 5 000 XAF ; `POST /api/sales/:id/claim-referral` pareil sur le parrainage de la vente. `POST /api/sales/:id/pay-referral` (simple, parrain) n'a **pas** de seuil.
- **Groupé** : le vendeur réclame (`POST /api/sales/grouped-claim`, `kind: sale|referral`, `shop_id`) puis la boutique paie (`grouped-pay`) ; le **cumul** par bénéficiaire et par boutique doit atteindre 5 000 XAF.

### Parrainage client — 2 % (clients affiliés)

1. Un **client** s'inscrit avec le `seller_code` d'un vendeur (`ref`) → son compte est marqué `referred_by = id_du_vendeur`, rôle forcé `client`.
2. Quand ce client **authentifié** (`req.user`) achète, `referral_commission = prix × quantité × 2 %` et `referred_by` est enregistré sur la vente (`purchases.js`, `orders.js`). Un achat invité ne déclenche **jamais** le 2 %.
3. Le 2 % est **réclamé puis payé manuellement** par la boutique (`claim-referral` / `pay-referral` / groupé) ; aucun versement automatique.

### Parrainage d'activation vendeur (distinct)

Un nouveau **vendeur** s'inscrit avec le code d'un autre vendeur (`ref_seller`) → `referred_by`. Le rôle du parrainé est **forcé à `seller`** à l'inscription (email ou Google), même si le lien comportait un rôle `creator` — la doc « vendeur/créateur » est obsolète. Quand l'admin marque l'adhésion payée (`POST /api/admin/referrals/:id/pay` → `membership_paid_at`), le parrainé est simultanément **activé** (`admin_approved = TRUE`, `membership_expires_at = now() + 30 jours`) et le parrain gagne **1 000 XAF par parrainé**. 

La notification push au parrain (type `activation_referral_paid`) est déclenchée **à chaque nouvelle adhésion payée** (balance en hausse), que l'admin passe par l'onglet **Parrainages** (`POST /api/admin/referrals/:id/pay`) ou par l'approbation dans l'onglet **Utilisateurs** (`PATCH /api/admin/users/:id/admin-approved`, qui pose aussi `membership_paid_at`). `membership_paid_at` n'est posé **que lors d'une approbation** (`admin_approved = TRUE`) : désapprouver ne marque jamais l'adhésion payée. Un re-clic sur un parrainé déjà payé n'envoie pas de doublon de notification.

Il retire le cumul via `activation-withdrawals` (montant **multiple de 1 000**, **minimum 5 000 XAF**) ; l'admin paie la demande (`POST /api/admin/activation-withdrawals/:id/pay`). Aucun reversement automatique.
**Comptabilité** : une demande payée insère un **débit** `payout_debit` dans `wallet_transactions` sans crédit d'activation préalable — le solde du wallet (`GET /api/wallet/me`) peut donc être **négatif**. La balance vit dans `activation_withdrawals`, séparée du wallet.

### Commission de vente d'un produit

- `products.commission_percent` est choisi par la **boutique à la création du produit** (0-100). Commission vente seller = `prix × commission_percent % × quantité`.
- Pendant une **promo éclair**, la ligne `flash_promotions.commission_percent = 0` (le produit est masqué des catalogues ; le vendeur est exclu).
- `wallet_transactions.transaction_type` inclut `commission_credit`, `referral_credit`, `payout_debit`, `adjustment`, `online_collect`, `online_payout` (les deux derniers sont des résidus iKeePay, jamais émis).

### Wallet et moyens de paiement

- **Wallet** (`server/routes/wallet.js`) : `GET /api/wallet/me` réservé à **seller, creator, livreur** ; `wallet_transactions`, `balance = SUM(amount)` (montants signés), devise XAF.
- Moyens de paiement : `shop_payment_methods` / `seller_payment_methods` / `livreur_payment_methods` (PK = `*_id`, `full_name`, `wallets` jsonb — liste `{name, value, primary}`, upsert `ON CONFLICT`).
- `normalizeWalletPrimary` (payouts.js) garantit **au plus un** wallet `primary` (le premier par défaut). Il n'existe **pas** de priorité « orange » ni de préfixe pays automatique.
- Pays et moyens de paiement : liste statique dans `client/src/config.js`. Les coordonnées servent aux transferts directs ; Mboppi ne collecte pas les paiements.

## Promotions éclair (flash promotions)

- **Règles serveur** (`server/routes/flashPromotions.js`) : **uniquement les boutiques**, **max 1 promo sur les 7 derniers jours** (MAX_WEEKLY_PER_SHOP = 1, compté sur starts_at, MIN_WEEK_GAP_DAYS = 7), durée max **24 h** (MAX_MINUTES = 1440, défaut 180), prix promo < prix produit, **commission 0** (colonne commission_percent de la ligne), purgées à expiration.
- `GET /api/flash-promotions` : liste publique `ends_at > now() AND quantity > 0`, `ORDER BY ends_at ASC LIMIT 20`.
- **Produit masqué pendant la promo** : `NOT EXISTS (SELECT 1 FROM flash_promotions fp WHERE fp.product_id = p.id AND fp.ends_at > now())` partout (catalogues, boutique, créateur, SEO, compteurs). Seule `/produit/:id` reste accessible (landing promo, prix via `flash_promo`).
- **Prix promo côté client** : `product.flash_promo` (`{id, price, discount_percent, commission_percent, commission, starts_at, ends_at, duration_minutes}`) dans ProductDetail.jsx, PurchasePage.jsx, store.jsx (panier, old_price), ProductCard. `data-flash` dans les commandes.
- **Popup publique** (FlashPromoPopup.jsx) : rendue globalement dans App.jsx (toutes les pages). Promos actives superposées (`.flash-popup-stack`, `position: fixed`, bas à droite), rotation **5 s** (ROTATE_MS = 5000), max 4, refresh 30 s. Titre centré « ⚡ PROMOTION DU JOUR ». La croix ✕ ferme tout + localStorage `mboppi_flash_dismissed`.
- **CSS important** : `.flash-popup` en `position: absolute; bottom: 0` — **ne jamais les ancrer en top** (bug corrigé). Cartes inactives : opacité 0.55, translateY(-8px), pointer-events: none.
- Form boutique : `ShopDashboard.jsx` (`flash-promo-form`), carte `FlashPromoCard` (partage 🔗 / annulation). URL directe : `/produit/{id}` = landing promo (badge, compte à rebours, ancien prix barré).
- **État actuel (code)** : `POST /api/sales` ne vérifie **pas** `flash_promotions` — pendant une promo, le produit est seulement masqué des lectures catalogue, il n'y a pas de blocage serveur à l'écriture d'une vente.

## SEO (SSR)

- `server/routes/seo.js` : lit `client/dist/index.html`, cache 30 s, `injectHead()` → title/description/canonical/og ; routes `/`, `/boutique/:id`, `/produit/:id`, `/sitemap.xml`. Base `https://mboppi-mboppi.vercel.app` (`PUBLIC_URL`).
- Produits sous promo **exclus** des listings SEO.

## Ventes / commandes

- `sales` : statuts `pending → confirmed (shop_confirmed_at) → delivered`, ou `cancelled`. `bought` existe dans la contrainte DB et l'UI mais **n'est jamais posé par le serveur**. Retraits « soft » via `hidden_for[]`.
- `purchases.js` : `POST /api/purchases` avec `product_id, seller_code (uppercasé), purchase_price (inutilisé), quantity, buyer_*, payment_method ('espece'|'mobile' ; 'automatic' accepté mais résidu iKeePay inutilisé)` ; auth **optionnelle**. Prix de référence = catalogue OU promo active. Achat authentifié avec `referred_by` → 2 %.
- `orders.js` : panier multi-articles, code de confirmation 6 caractères unique aussi contre `sales`, réservation atomique du stock, ordre enregistré si client authentifié.
  - ⚠️ Articles **sans code vendeur** : `seller_id = NULL` **mais** `commission` calculée (commission_percent) — non payable (`/:id/pay` refuse). À connaître avant toute évolution métier.
- **Livraison** (`POST /api/sales/:id/deliver`) : **livreur** ; `delivery_fee`, `payment_method` uniquement `espèce`/`espece`/`mobile`/`mobile_money` (**« en ligne » refusé**), `client_code` (le confirm_code), `shop_code` (boutique du produit) ; décrémente stock / `reserved_quantity` ; `signature` PNG optionnelle ; notifications. **Aucun paiement automatique**.
- **Paiement** : **manuel uniquement** ; plus de payin/webhook iKeePay ; `paySaleAutomatically()` = no-op de compatibilité.
- **Retraits/annulation** : `DELETE /api/sales/:id` (seller), `DELETE /api/sales/:id/referral` (parrain), `DELETE /api/sales/:id/delivered` (boutique/livreur) → `hidden_for`, bloqués si commissions impayées. `POST /api/sales/:id/cancel` (code client) restaure le stock. `PATCH /api/sales/:id/status` (shop) : `confirmed` = `shop_confirmed_at` seul (statut reste pending) ; `cancelled` libère le stock.
- **Facture PDF** : `client/src/components/Invoice.jsx` (jspdf 4.2.1 dynamique), boutons Shop/Seller/Livreur.

## Tableaux principaux (`server/db.js` `initDb`)

Créés par `initDb()` : `users`, `products`, `sales`, `offers`, `orders`, `push_subscriptions`, `newsletter_subscribers`, `seller_payment_methods`, `shop_payment_methods`, `livreur_payment_methods`, `notifications`, `reviews`, `audit_log`, `client_logs`, `admin_messages`, `admin_message_reads`, `wallet_accounts`, `wallet_transactions`, `automatic_payouts` (résidu), `payment_webhook_logs` (journal iKeePay — utilisé), `membership_payments` (adhésions en ligne — utilisé), `platform_payouts` (résidu), `donations`, `platform_settings` (mode de paiement, clés iKeePay, `ikeepay_webhook_secret`).

> ⚠️ `initDb()` **ne crée pas** `flash_promotions`, `item_views`, `daily_visits`, `activation_withdrawals`, `activation_withdrawal_items` : ces tables existent en base via des migrations externes. Sur une base neuve, les routes associées échoueraient tant qu'elles n'existent pas.

`purgeOldTransactions` : notifications supprimées après 90 jours ; ventes/commandes **jamais** purgées (historique financier). `server/cleanup.js` : purge stats > 6 mois + stock épuisé (dry-run possible).

## Autres fonctionnalités notables

- **Chat IA** (`server/routes/chat.js`) : Gemini (`GEMINI_MODEL`, fallbacks), max 2000 caractères, historique 12, injecte les produits en stock.
- **Push** (`server/push.js`) : VAPID **uniquement** via env — **aucune clé par défaut** ; sans clés, push désactivés. Nettoyage 404/410. Consentement requis pour inscription shop.
- **Verone / Vitrine** (`server/routes/offers.js`, `server/routes/presentation.js`) : `GET /api/offers` public ; `POST /api/offers` et `DELETE /api/offers/:id` **non authentifiés** (état actuel — la protection documentée en V2 n'existe plus) ; `GET /api/offers/mine` renvoie toutes les offres. `pageRouter` → `/p`, `imageRouter` → `/api/img`. Pages Verone.jsx, VitrineOffre.jsx, OfferDetail.jsx.
- **Métriques** : `POST /api/metrics/views`, `POST /api/metrics/visit` (X-Visitor-Id), `GET /api/metrics/trending` (exclut les promos, cache s-maxage 120).
- **i18n** : toutes les traductions (fr/en/es/ar) dans `client/src/i18n.jsx` (`I18N = { fr: {}, en: {...EN, ...RICH_EN}, ar: {...AR, ...RICH_AR}, es: {...ES, ...RICH_ES} }`), clés françaises. `client/src/i18n/{en,es,ar}.js` supprimés (jamais importés). RTL pour ar.
- **PWA** : `client/public/sw.js`, cache `mboppi-v202`, app shell + API_SWR + push + 4 manifests.
- **Audit/sécurité** : `server/security.js`, rate limits, originCheck, CSP.
 - **Photos** : `server/storage.js` — buckets publics `photos` et `payment-proofs` ; clé `sb_secret_...` signée HS256 (`SUPABASE_JWT_SECRET`) ; fallback base64. `server/photo.js` : `{thumb, medium, large}`. **Conversion WebP automatique** : tout upload (produits, offres, preuves de paiement) passe par `toWebp()` (sharp, qualité 80, max 2000px, EXIF/rotate) — JPEG/PNG/HEIC convertis, GIF/AVIF/WebP conservés tels quels, micro-images < 8 ko et conversions « plus lourdes » ignorées ; en cas d'échec, l'image originale est conservée (aucune rupture d'upload).
- **Menu** (Navbar.jsx) : Produits, Créateurs, Je soutiens, Formations et Digital (chariow.pics), Formation Mboppi (YouTube), espaces par rôle, Administration 🛡️.
- **Livreurs** : `server/routes/livreurs.js` (`GET /api/livreurs`, `/options`) **non monté dans app.js** et `api.listLivreurs` absent côté client → page `/shop/livreurs` non fonctionnelle (état actuel).
- **Donations** : en mode **manuel**, `POST /api/donations` enregistre un don déclaratif (virement direct hors plateforme, validation par l'équipe). En mode **automatique**, `POST /api/payments/donation-payin` ouvre le checkout iKeePay et le webhook marque le don `completed`. Le suivi admin des paiements en ligne est sur `GET /api/admin/payments`.

## Conventions de dev (IMPORTANT)

1. **Ne jamais committer sans demande explicite.** Quand le user demande « deployer » / « mettre en ligne » : bump + commit + push.
2. **Bump de version à chaque déploiement** : `client/package.json` + `client/package-lock.json` (lignes 3 **et** 9, ne pas toucher les entrées deps `loose-envify@1.8.3` / `update-browserslist-db@1.8.3`) + `package.json` racine. PWA : `client/public/sw.js` CACHE_NAME `mboppi-vXXX` incrémenté. État actuel : **1.52.2 / mboppi-v202**.
3. **Build** : `npm run build` dans `client/` (le hash du JS local diffère de celui de Vercel pour des raisons d'environnement ; vérifier le déploiement via le CSS hash ou en cherchant une chaîne caractéristique du nouveau code dans le JS servi).
4. **Vérifier le déploiement** : attendre ~75–90 s après push, puis `curl` sur `https://mboppi-mboppi.vercel.app/` (header `Accept: text/html` pour le HTML SEO) et chercher le hash CSS/JS du build local ; tester les API concernées.
5. Commandes utiles : `node --check server/routes/*.js` pour la syntaxe serveur.
6. Lignes de commande Windows : PowerShell — ne pas utiliser `&&`, utiliser `;` / `if ($?)`. Test-Path avant de créer des dossiers. `curl.exe` (pas l'alias PowerShell).
7. Le produit sous promo est invisible SAUF via son lien direct `/produit/:id` (landing promo) — c'est voulu.

## Historique récent des modifications

(Changelog partiel — version courante **1.52.2** / cache PWA **v202**.)

- **1.10.0 / v51** : refonte promotion éclair (masquage catalogue, règles serveur, UI shop).
- **1.11.0 / v52** : masquage SEO complet, commission promo 0, partage promo, offres Verone dans l'accueil (rail), suppression commission duo.
- **1.12.0 / v53** : popup promos superposées avec rotation 5 s et titre « PROMOTION DU JOUR » ; correctif ancrage `bottom: 0` ; retrait des emojis 🎨/🎓 du menu.
- **1.13.0** : commission d'activation vendeur 1 000 XAF (parrainage vendeur) ; seuil de parrainage client porté à 5 000 XAF.
- **1.14.0** : suppression complète du système iKeePay (paiements en ligne, webhooks, reversements automatiques) ; passage au paiement manuel exclusif ; commissions et parrainages versés manuellement par la boutique ; facture PDF jsPDF.
- **1.49.1 / v194** : activation automatique des parrainés marqués « payés » + push commission au parrain via l'onglet Utilisateurs ; correction COALESCE (désapprobation ne marque plus l'adhésion payée).
- **1.50.0 / v195** : retour d'iKeePay en **PAYIN uniquement** (adhésion + don) avec **bascule admin manuel ↔ automatique** (`platform_settings`, panneau Admin → Système de paiement). En mode auto : checkout inline `ikeepay.com/checkout/v1/inline`, webhook `POST /api/ikeepay/webhook` (formats `payment.success` / `transaction.updated|created`), activation immédiate de l'adhésion + notification du parrain ; les versements (retraits d'activation, commissions) restent manuels. `server/fees.js` extrait les frais d'adhésion ; CSP Vercel (`vercel.json`) autorise l'origine iKeePay.
- **1.50.1 / v196** : correctif 500 sur l'enregistrement des clés iKeePay — le stockage des réglages devient **auto-réparant** (`setSetting` crée la table `platform_settings` à la volée si elle manque ; `donor_email` garanti dans `GET /api/admin/payments`).
- **1.50.2 / v197** : **accès direct à l'espace pour tous les rôles sauf le vendeur** (boutique, créateur, client, livreur — aucun frais, quel que soit le mode de paiement) ; panneau admin : sections **Utilisateurs** et **Retraits d'activation** toujours visibles dans les deux modes, seule la section **Parrainages** reste propre au mode manuel.
- **1.51.0 / v198** : **webhook iKeePay fiabilisé** — monté avant `originCheck` (un header Origin iKeePay ne le bloquait plus), lecture tolérante du corps brut (`req.rawBody`), **journalisation de chaque webhook reçu** dans `payment_webhook_logs` (visible dans le panneau Admin → Paiements en ligne → Journal des webhooks) ; **secours admin** pour marquer un don resté « en attente » comme complété (`POST /api/admin/payments/donations/:id/complete`).
- **1.51.1 / v199** : **webhook iKeePay réparé pour le format réel envoyé** — `payment.success` peut porter la référence imbriquée dans `data.external_reference` (et non seulement `order_id` racine) : `normalizeWebhook` cherche désormais la référence (et montant/devise) dans plusieurs champs, racine **et** `data`. Devise absente tolérée (la sécurité reste par référence + montant). Journal admin : bouton « Voir le payload » pour diagnostiquer le contenu exact reçu.
- **1.52.0 / v200** : **gestion des paiements en ligne côté admin** — bouton **« Supprimer »** sur chaque ligne (dons et adhésions) dans la section « Paiements en ligne (iKeePay) » ; **purge automatique** des paiements restés « en attente » depuis **plus de 30 minutes** (au chargement de la liste admin).
- **1.52.1 / v201** : **panneau admin (paiements en ligne)** — section « Journal des webhooks » retirée ; une adhésion d'un **vendeur parrainé** affiche le badge **« Vendeur parrainé »** et **son parrain** (nom + référence) ; recherche d'utilisateur par nom / email / **numéro de référence** (déjà couverte).
- **1.52.2 / v202** : **webhook adhésion fiabilisé** — parsing de la référence/montant/devise élargi (racine + `data` + `data.data`, plus de noms de champs) ; **réconciliation automatique par montant** : si la référence ne matche pas, on complète l'adhésion `pending` récente (≤ 30 min) du **même montant** → activation + redirection automatique ; **secours admin** pour compléter une adhésion manuellement (`POST /api/admin/payments/memberships/:id/complete`, bouton UI).
- **Post-1.52.2 (correctifs déployés sans bump de version)** :
  - **504 webhook adhésion corrigé** : push de notification parrain borné à 2,5 s (`Promise.race`) et boucle de réparation à budget temps (cooldown 5 s, max 10 logs, 4 s) — le webhook répond toujours vite, même en cas de lenteur push/DB ;
  - **webhook journalisé avant traitement** (plus d'angle mort si crash/timeout) ; diagnostic enrichi côté client (`[adhésion] statut : ...` + 5 derniers webhooks) ;
  - **purge → archivage** : les paiements en attente > 30 min passent en `expired` (invisibles côté admin mais réconciliables 24 h) au lieu d'être supprimés ;
  - **réconciliation 24 h par email prioritaire puis montant** (`pending` et `expired`) ; **filet d'activation** : un paiement `completed` < 24 h d'un compte non actif → activation à la volée ;
  - **polling client** : la page d'adhésion sonde `GET /api/payments/membership-status` toutes les 4 s (6 min) → redirection automatique vers l'espace dès activation ; **testé de bout en bout avec succès** (paiement → webhook → activation → redirection sans intervention admin) ;
  - **webhook protégé par token secret** (`ikeepay_webhook_secret` auto-généré ; `?k=` ou `x-ikeepay-token` ; 403 sinon) — **URL avec token à enregistrer chez iKeePay** (affichée/copiable dans le panneau Admin) ; correctif d'un import manquant (`getWebhookSecret`) qui provoquait un 500 sur `GET /api/admin/settings/payments`.
- Après 1.14.0 : correctifs méga-menu et catégories mobiles, retrait de PayPal de la page de soutien (remplacement par MoneyFusion), compteur d'adhésion 30 jours, libellés parrainage/admin, etc.
