# Marketplace — Boutiques & Vendeurs

Site de vente en ligne avec deux types de comptes :

- **Compte boutique** : le propriétaire publie jusqu'à **5 produits** maximum. Chaque produit affiche le **prix de vente** et la **commission** que gagnera le vendeur.
- **Compte vendeur** : toute personne peut s'inscrire, vendre les produits postés par les boutiques et gagner une commission sur chaque vente.

## Fonctionnement

1. Une boutique s'inscrit, publie ses produits (nom, prix, % de commission, image optionnelle). La commission en FCFA est calculée automatiquement.
2. Un vendeur s'inscrit, choisit un produit, enregistre une vente (acheteur, quantité).
3. La boutique confirme ou annule les ventes.
4. Le vendeur suit ses commissions dans son espace, la boutique suit son chiffre d'affaires et les commissions versées.

## Technologies

- **Backend** : Node.js + Express, base **PostgreSQL** (Neon, cloud), JWT + bcrypt
- **Frontend** : React 18 + Vite + React Router
- **Déploiement** : Render (web service), base de données Neon, redéploiement automatique à chaque `git push`

## Démarrage en local

Prérequis : Node.js 22.5+ (testé avec Node 24)

```bash
# 1. Configurer la base (fichier server/.env, NON commité)
#    Copier le fichier .env.example vers .env et coller votre clé Neon :
#    DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require
#    JWT_SECRET=une-longue-chaine-secrete

# 2. Terminal 1 — API (http://localhost:4000)
cd server
npm install
npm run dev

# 3. Terminal 2 — Frontend (http://localhost:5173)
cd client
npm install
npm run dev
```

Ouvrir **http://localhost:5173**.

## Déploiement sur Render (gratuit)

1. Pousser le code sur GitHub (dépôt déjà créé : `github.com/Schester38/marketplace`).
2. Créer un compte sur **https://render.com** (connexion avec GitHub).
3. **New + → Web Service** → connecter le dépôt `marketplace`.
4. Configurer :
   - **Build Command** : `npm run build`
   - **Start Command** : `npm start`
   - Plan : **Free**
5. Ajouter les variables d'environnement :
   - `DATABASE_URL` → la clé de connexion de la base Neon
   - `JWT_SECRET` → une longue chaîne aléatoire
   - `NODE_ENV` → `production`
6. **Deploy** — le site est disponible sur `https://marketplace.onrender.com`

Le frontend buildé est servi automatiquement par l'API (dossier `client/dist`).
Les données sont conservées dans la base Neon, même si le serveur Render est mis en veille.

## Structure

```
server/
  index.js          # API Express + service statique du frontend
  db.js             # Connexion PostgreSQL (Neon) + schéma
  auth.js           # JWT + middlewares
  routes/
    auth.js         # inscription / connexion
    products.js     # produits (max 5 par boutique)
    sales.js        # ventes + commissions + statuts
client/
  src/
    api.js          # client HTTP
    App.jsx         # routage + contexte d'auth
    components/     # Navbar, ProductCard
    pages/          # Home, Login, Register, ShopDashboard, SellerDashboard
```

## API principale

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| POST | /api/auth/register | public | Inscription (`role`: `shop` ou `seller`) |
| POST | /api/auth/login | public | Connexion |
| GET | /api/products | public | Liste des produits (prix + commission calculée) |
| GET | /api/products/mine | shop | Produits de ma boutique + limite |
| POST | /api/products | shop | Publier un produit (max 5) |
| DELETE | /api/products/:id | shop | Supprimer un produit |
| POST | /api/sales | seller | Enregistrer une vente (commission calculée) |
| GET | /api/sales/my | seller | Mes ventes + statistiques |
| GET | /api/sales/shop/:id | shop | Ventes de ma boutique + statistiques |
| PATCH | /api/sales/:id/status | shop | Confirmer / annuler une vente |

## Personnalisation

- Le nombre max de produits par boutique est défini par `MAX_PRODUCTS_PER_SHOP` dans `server/routes/products.js` (5 par défaut).
- La commission est un pourcentage du prix défini par la boutique, calculée côté serveur.
- Le secret JWT est modifiable via la variable d'environnement `JWT_SECRET`.
