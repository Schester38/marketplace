# Notes de mise à jour — Soutien, menu, IA catalogue, devises

## 1. Page « Je soutiens » (`/soutien`)
- Nouvelle page publique (`client/src/pages/Support.jsx`) avec les moyens de soutien réels :
  - **Orange Money** — +237 699 48 61 46
  - **MTN Mobile Money** — +237 672 88 63 48
  - **PayPal** — ndjoumjeanarthur@gmail.com
  - **Virement bancaire UBA** — SWIFT UNAFCMCX / IBAN CM21 10033 05207 07002026857 58
- Logos des moyens de paiement rendus en SVG inline (Orange, MTN, PayPal, UBA) : aucune dépendance externe, vite : très léger.
- Bouton « Copier » sur chaque numéro / IBAN / e-mail (presse-papiers).
- Styles ajoutés dans `client/src/styles.css` (préfixe `support-*`).
- Traductions FR/EN/AR ajoutées dans `client/src/i18n.jsx`.

## 2. Boutons menu
- `Navbar.jsx` : nouveaux liens accessibles à tous :
  - **Je soutiens** → route interne `/soutien`
  - **Formations et Digital** → lien externe https://www.chariow.pics/U6Z28RUJ (nouvel onglet)
- Route ajoutée dans `App.jsx` (composant chargé en lazy).

## 3. Assistant IA — catalogue temps réel
- `server/routes/chat.js` : avant d'interroger Gemini, le serveur charge les produits **en stock** depuis PostgreSQL, les filtre par pertinence par rapport au message du visiteur (mots-clés) et les injecte dans le prompt système.
- L'IA peut ainsi citer de **vrais** prix, stocks, boutiques et devises, sans rien inventer. Si aucun produit ne correspond, pas d'injection.
- Échec silencieux : si la base est inaccessible, le chat retombe sur le comportement actuel.

## 4. Devise (`currency`)
- Objectif : conserver la devise à chaque étape (produit → vente → ordre).
- `server/currency.js` : carte pays → code ISO (XAF, XOF, EUR, NGN, …) + validation (`/^[A-Z]{3}$/`).
- Colonnes ajoutées (DDL + migrations `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) sur :
  - `products.currency` (défaut dérivé du pays de la boutique au moment de la création/édition),
  - `offers.currency`,
  - `sales.currency` (capturée depuis le produit au moment de l'achat),
  - `orders.currency`.
- Exposée dans les API produits / offres / ventes. Front : remplacement futur possible du symbole pays par le code ISO conservé.

## 5. Déjà en place (vérifié, aucun changement nécessaire)
- **Stock** : réservation atomique à la commande, libération à l'annulation, confirmation à la livraison — les 3 flux couvrent stock, `reserved_quantity` et notifications.
- **purchase_price** : le serveur impose le prix catalogue ; la valeur client est ignorée (le calcul financier ne peut pas être modifié).
- **Rétention** : ventes/commandes conservées environ 7 ans (`TRANSACTION_RETENTION_DAYS`), seules les notifications sont purgées après 90 jours.

## 6. Recommandation future — stockage des images
Actuellement les photos sont stockées **en base PostgreSQL** sous forme de `data:image/...` (colonnes `image` / `photos`). Cela accroît la taille de la base et ralentit les réponses. Pour passer à grande échelle, recommandation :

> **Option recommandée : stockage objet compatible S3 (Cloudflare R2 — dragueur de sortie gratuit, ou AWS S3).**

1. Les images uploadées doivent être envoyées par le client (déjà le cas : base64 temporaire en JSON).
2. Créer un utilitaire serveur (ex. `server/storage.js`) qui, si `S3_ENDPOINT`/`R2_ACCESS`, `R2_SECRET`, `R2_BUCKET`, `R2_PUBLIC_URL` sont définis :
   - télévérsionne chaque photo vers R2/S3,
   - stocke uniquement l'URL publique (`https://…/uploads/id.jpg`) dans `products.photos` / `offers.photos`,
   - conserve le support des `data:` URLs en **mode dégradé** (pas de config = comportement actuel, sans régression).
3. `server/photo.js` : accepter aussi les `http(s)://` en plus des `data:image/`.
4. Générer un nom aléatoire par fichier ; pas d'overwrite ; cache public long (`Cache-Control: public, max-age=31536000`).
5. Migration : script one-shot qui exporte les `data:` URLs existantes vers R2 et met à jour les lignes.

Ceci n'est **pas fait ici** : cela nécessite des identifiants (bucket/crédentials) qui ne sont pas disponibles dans le repo.

## Vérifications
- Build frontend Vite : réussi (`npm run build`) avec le nouveau chunk `Support-*.js`.
- Backend : tous les imports ajoutés correspondent à des modules existants (`q` de `db.js`, `defaultCurrencyFor`/`validCurrency` de `currency.js`).