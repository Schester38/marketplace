# Robot WhatsApp Mboppi — Meta : ce qui est vraiment obligatoire

Guide pratique (état du dépôt : `1.52.2`). Objectif : faire répondre l'assistant IA
WhatsApp (`server/services/whatsappBot.js`) **sans attendre** la vérification
d'entreprise, puis préparer le dossier de vérification pour la mise en production.

---

## 1. Démystifier : « publier l'app » ≠ « vérifier l'entreprise »

Trois choses différentes sont souvent confondues :

| Étape Meta | À quoi ça sert | Obligatoire pour que l'IA réponde ? |
| --- | --- | --- |
| **Mode développement + numéro de test** | L'app reçoit les webhooks et répond aux **5 numéros de test** | ❌ aucun document — **ça marche déjà** |
| **Vérification de l'entreprise** (Business Verification) | Débloque l'**accès avancé** à la permission `whatsapp_business_messaging` → répondre à **n'importe quel** numéro | ✅ seulement pour la production |
| **App Review / « Publier l'application »** | Réservé aux cas d'usage hors usage standard (permissions supplémentaires) | ❌ **pas nécessaire** pour WhatsApp Cloud API standard |

Source : « Advanced Access now requires Business Verification » —
<https://developers.facebook.com/docs/development/release/business-verification>.
Autrement dit : **c'est la vérification d'entreprise qui débloque la production, pas
un « App Review »**. Le bouton « Publier » du dashboard ne fait que constater que les
« publishing requirements » (vérification incluse) sont satisfaits.

> ✅ **Conséquence immédiate** : l'IA peut répondre à de vrais messages aujourd'hui,
> sur le numéro de test Meta, pour **5 destinataires** (vous + 4 testeurs), **sans
> aucun document**. Voir la procédure §2.

---

## 2. Mode test : faire répondre le robot aujourd'hui (0 document)

### 2.1 Côté Meta (developers.facebook.com)

1. **Créer l'app** : <https://developers.facebook.com/apps> → *Create App* → cas
   d'usage **« Connect with customers through WhatsApp »** → choisir (ou créer) le
   *business portfolio*. Meta affiche une liste de « publishing requirements »
   (« You may not have any at this point ») : c'est normal en développement.
2. **API Setup** → cliquer **Start using the API** → Meta crée une
   **WhatsApp Business Account (WABA)** et attribue un **numéro de test gratuit**.
   Relever et conserver :
   - le **Phone Number ID** du numéro de test (ex. `1234567890`) ;
   - l'**ID de la WABA** (utile plus tard).
3. **Ajouter les destinataires** : dans le champ **To**, ajouter jusqu'à **5 numéros
   autorisés** (validation par SMS/code). C'est la seule limite du mode test : *le
   numéro de test ne peut écrire qu'aux numéros ainsi autorisés* (le quota exact est
   affiché dans **API Setup** ; Meta peut l'élargir avec l'activité du numéro).
4. **Jeton d'accès** :
   - *test rapide* : bouton **Generate access token** → jeton temporaire **24 h** ;
   - *durable* : **Business Settings → Utilisateurs système** → créer un utilisateur
     système → *Générer un jeton* avec les permissions `business_management`,
     `whatsapp_business_messaging`, `whatsapp_business_management` → jeton **permanent**.
     Cette étape **ne demande pas** la vérification de l'entreprise.
5. **Webhook** (obligatoire pour que le robot *reçoive* les messages) :
   - URL : `https://mboppi-mboppi.vercel.app/api/whatsapp/webhook`
   - **Verify token** : la valeur exacte de la variable d'environnement Vercel
     `WHATSAPP_VERIFY_TOKEN` (sinon le repli en base :
     `platform_settings.wa_bot_verify_token`) ;
   - s'abonner au champ **`messages`** (souscription `whatsapp_business_account`).

> ⚠️ Le token doit être **identique** des deux côtés : la comparaison est faite en
> temps constant (`server/routes/whatsappBot.js`) ; un token différent ⇒
> `403 verification failed` (visible dans les logs Vercel).

### 2.2 Côté Mboppi (panneau Admin)

Deux cartes, dans **deux onglets différents** :

1. Onglet **💰 Paiements** → carte « 📱 Notifications WhatsApp (retraits d'activation) » :
   - **Fournisseur** = `WhatsApp Cloud API (Meta)` ;
   - **Votre numéro WhatsApp (format international)** = le numéro destinataire/admin
     (ex. `237699486146`) ;
   - **Token d'accès permanent (Meta)** = le jeton de l'étape 4 ;
   - **Phone Number ID (Meta)** = celui de l'étape 2 ;
   - **Nom du template Meta** : laisser vide en mode test (le robot envoie du texte
     libre) ;
   - 💾 *Enregistrer*, puis **📨 Envoyer un test** (contrôle token + Phone Number ID).
2. Onglet **⚙️ Système** → carte « 🤖 Robot WhatsApp (assistant IA) » :
   - cocher **Activer le robot WhatsApp** ;
   - *Message d'accueil* (déclenché par « bonjour », « salut », « mbote »…) ;
   - *Réponse de repli* (si l'IA échoue) ;
   - *Instructions supplémentaires pour l'IA* (ex. « réponds court, en français,
     invite à commander sur le site ») ;
   - 💾 *Enregistrer*.

Ensuite : écrivez au **numéro de test Meta** depuis l'un des 5 numéros autorisés → le
robot répond avec le même moteur IA que le chat du site (Gemini, produits en stock,
historique de 12 messages par numéro).

### 2.3 Limitations à connaître (mode test)

- **5 destinataires maximum** (limite Meta du numéro de test, voir API Setup) —
  suffisant pour valider la qualité des réponses avant la vérification.
- Le numéro de test n'est **pas** un numéro camerounais : ne pas le communiquer
  publiquement.
- Le robot ne répond que dans la **fenêtre de service de 24 h** ouverte par le message
  du client — c'est toujours le cas ici (le client écrit d'abord). Pour écrire
  *spontanément* hors fenêtre (campagnes), il faudrait un **template approuvé**.
- Les jetons temporaires expirent en 24 h ⇒ utiliser un **jeton d'utilisateur système**
  pour que le robot survive aux redémarrages.

---

## 3. Préparer la vérification d'entreprise (dossier Cameroun)

### 3.1 Ce que Meta vérifie

Meta compare ce que vous déclarez (nom légal, adresse, téléphone, site web) avec des
**sources officielles publiques**. Trois axes :

1. **Identité** : nom légal exact de l'entité (celui du registre, pas le nom commercial) ;
2. **Adresse** : adresse du siège identique à celle des documents officiels ;
3. **Contact** : numéro de téléphone joignable **et** site web/domaine dont
   l'entreprise est propriétaire (vérification par code envoyé au numéro, par e-mail du
   domaine, ou par dépôt de documents — selon ce que Meta propose pour votre pays).

### 3.2 Documents à rassembler (Cameroun)

| Document | Où l'obtenir | Pourquoi c'est demandé |
| --- | --- | --- |
| **RCCM / attestation d'immatriculation** | GUCE / CFCE (Registre du Commerce et du Crédit Mobilier) | Prouve l'existence légale et le **nom exact** |
| **NIU + attestation NIU** | DGI (Centre des impôts / CDI) | Identifiant fiscal de l'entreprise |
| **Attestation de conformité fiscale** (ou de non-redevance) | DGI | Preuve d'activité déclarée |
| **Carte de contribuable / patente** | DGI / Mairie | Preuve d'activité locale |
| **Statuts + acte de création** (si société) | Notaire / GUCE | Représentant légal, adresse du siège |
| **Justificatif d'adresse au nom de l'entreprise** | Contrat de bail, facture ENEO / Camwater / CDE, quittance | **Adresse identique** aux documents |
| **Facture téléphonique au nom de l'entreprise** | MTN / Orange | Permet à Meta de vous appeler/texter le numéro déclaré |
| **Email professionnel sur domaine possédé** | ex. `contact@mboppi.cm` | Vérification « par e-mail du domaine » |
| **Domaine web** | Registrar (.cm via Camtel/NIC.CM, ou .com) | Meta exige un site/domaine lié à l'entreprise |
| **Pièce d'identité du dirigeant** | CNI / passeport | Contrôle du représentant |

> 🚩 **Point bloquant identifié dans le projet** : la production est servie sur
> `mboppi-mboppi.vercel.app`, un **sous-domaine Vercel** qui n'appartient pas à
> l'entreprise. Meta demande souvent un **domaine possédé** (et peut exiger une preuve
> de propriété : WHOIS / enregistrement DNS `TXT`). **Créer/acheter un domaine**
> (`mboppi.cm`, `mboppi.com`…) et le brancher sur Vercel est donc une étape à faire
> **avant** de lancer la vérification — cela sert aussi au SEO, aux e-mails pro et à la
> crédibilité de la boutique.

### 3.3 Erreurs classiques qui font échouer la vérification

- nom commercial (« Mboppi ») déclaré au lieu du **nom légal** du RCCM
  (« MBOPPI SARL », « Établissements … ») ;
- adresse approximative (« Marché Mboppi, Douala ») au lieu de l'adresse complète du
  siège ;
- orthographe/abréviations différentes d'un document à l'autre ;
- documents scannés illisibles, recadrés, ou photos d'écran ;
- numéro de téléphone non joignable au moment de l'appel de Meta ;
- entreprise **non trouvée dans les registres couverts par Meta** (cas fréquent pour
  les petites structures en Afrique) → basculer sur la vérification **par dépôt de
  documents**, joindre un maximum de pièces cohérentes, et garder le nom légal partout.

### 3.4 En cas de refus

1. Ouvrir un ticket **Meta Business Help** (« Vérification de l'entreprise ») en
   expliquant que le registre local n'est pas indexé → demander la vérification par
   documents.
2. Un **Solution Provider / BSP** (Twilio, 360dialog, Gupshup…) peut accompagner
   l'onboarding (*Embedded Signup*) et la mise en conformité — mais la vérification de
   l'entreprise cliente **reste demandée par Meta** pour lever les limites de
   production. Ce n'est donc **pas** un contournement, seulement un accompagnement.
3. Ne jamais envoyer de faux documents : le compte Business est **définitivement
   bloqué** en cas de fraude.

---

## 4. Options de repli si ni les documents ni la vérification ne sont prêts

| Option | Documents requis | Coût | Risque | Verdict |
| --- | --- | --- | --- | --- |
| **Numéro de test Meta** (mode dev) | aucun | gratuit | aucun | ✅ **à faire tout de suite** (5 numéros) |
| **Numéro propre + vérification** | dossier §3 | gratuit (Meta) | aucun | 🎯 objectif production |
| **Auto-réponses de l'application WhatsApp Business** (mobile) | aucun | gratuit | aucun |  répond « hors ligne » / message d'accueil, **sans IA** |
| **BSP officiel** (Twilio, 360dialog…) | dossier §3 (à terme) | frais du BSP | aucun | 👍 simplifie la technique, pas la vérification |
| **Fournisseur non officiel à QR** (Green API, Whapi.Cloud, UltraMsg, Evolution API) | aucun | ~quelques $/mois | ⚠️ **contraire aux CGU WhatsApp → bannissement du numéro** | ❌ déconseillé en production |

> 💡 Les fournisseurs « QR » fonctionnent techniquement (webhook entrant + API
> d'envoi, donc compatible avec Vercel), mais ils violent les conditions d'utilisation
> de WhatsApp et mettent en danger **le numéro commercial de Mboppi**. À ne considérer
> que comme test jetable sur un numéro sacrifiable.

---

## 5. Attention au numéro réel (production)

- Un numéro enregistré sur la Cloud API **ne peut plus être utilisé dans l'application
  WhatsApp** (Messenger) : les discussions « normales » du téléphone cessent.
- Si le numéro a déjà un compte WhatsApp, il faut **supprimer ce compte** avant de
  l'enregistrer (opération **irréversible** : historique perdu).
- ⇒ Prévoir une **ligne dédiée** au robot (ex. une carte SIM supplémentaire) plutôt que
  de réutiliser le numéro Mboppi actuel, et publier ce nouveau numéro sur le site
  (menu, footer, bouton WhatsApp flottant).
- Ajouter aussi un **moyen de paiement** dans la WABA si vous voulez envoyer en dehors
  du quota gratuit, et faire approuver le **nom d'affichage** (display name) du numéro.

---

## 6. Rappels techniques du dépôt (pour les prochaines sessions)

- Webhook : `server/routes/whatsappBot.js`
  - `GET /api/whatsapp/webhook` → vérification `hub.challenge` (token comparé en temps
    constant) ;
  - `POST /api/whatsapp/webhook` → répond `200 EVENT_RECEIVED` **immédiatement** puis
    traite (Meta exige une réponse rapide) ;
  - monté **avant** `originCheck` dans `server/app.js` (Meta n'est pas un navigateur).
- Moteur : `server/services/whatsappBot.js` — réglages `platform_settings`
  (`wa_bot_enabled`, `wa_bot_greeting`, `wa_bot_fallback`, `wa_bot_system_prompt`),
  historique 12 messages par `wa_id`, anti-boucle (même réponse ⇒ variante), purge
  au-delà de 500 sessions (RAM du serverless), appel de `askAI()`
  (`server/routes/chat.js`) donc **nécessite `GEMINI_API_KEY`**.
- Envoi : `sendWhatsAppText()` (`server/services/whatsapp.js`) exige
  `whatsapp_provider = cloud` **et** `whatsapp_cloud_token` **et**
  `whatsapp_cloud_phone_id` (renseignés dans l'onglet 💰 Paiements du panneau Admin).
  Le mode `callmebot` **ne fait pas** fonctionner le robot (envoi vers l'admin
  uniquement).
- Routes admin : `GET/POST /api/admin/settings/whatsapp` et
  `GET/POST /api/admin/settings/whatsapp-bot` (`server/routes/admin.js`,
  `client/src/api.js`, UI `client/src/pages/Admin.jsx`).
- Variables d'environnement à définir sur Vercel : `WHATSAPP_VERIFY_TOKEN`
  (+ `GEMINI_API_KEY` pour les réponses IA).
- Test de configuration : `POST /api/admin/settings/whatsapp/test` (envoi de contrôle
  vers le numéro admin) ; journal des tentatives dans les logs Vercel (`[wa-bot]`,
  `[whatsapp]`).

---

## 7. Plan recommandé (ordre d'exécution)

1. **Aujourd'hui, ~30 min, 0 document** : app Meta + numéro de test + webhook
   (`WHATSAPP_VERIFY_TOKEN`) + réglages Admin (§2) → l'IA répond à 5 numéros.
2. **Semaine 1** : créer le domaine (`mboppi.cm`/`.com`), le brancher sur Vercel, créer
   les e-mails pro `contact@…`, puis mettre à jour `SITE_URL` / `PUBLIC_URL` /
   `ALLOWED_ORIGIN` côté Vercel.
3. **Semaine 1-2** : rassembler le dossier §3 (RCCM, NIU, conformité fiscale, bail,
   facture téléphonique, pièce d'identité) en PDF lisibles et **cohérents**.
4. **Semaine 2** : lancer la vérification de l'entreprise dans Meta Business Suite →
   Meta Business Help si le registre local n'est pas couvert.
5. **Après validation** : ajouter une ligne téléphonique dédiée, l'enregistrer sur la
   Cloud API, approuver le display name, passer l'app en **Live**, remplacer le Phone
   Number ID + le jeton dans le panneau Admin, publier le numéro sur le site.

---

### Références officielles

- Business Verification (accès avancé) :
  <https://developers.facebook.com/docs/development/release/business-verification>
- Cloud API — mise en route (app, WABA, jeton utilisateur système) :
  <https://developers.facebook.com/docs/whatsapp/cloud-api/get-started>
- Numéros professionnels (enregistrement, nom d'affichage, prérequis) :
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers>
- Vérification de l'entreprise (aide Meta) :
  <https://www.facebook.com/business/help/1095661473946872>


