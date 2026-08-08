import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import OfferCard from '../components/OfferCard.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import { offerDiscount } from '../config.js';
import { useAuth } from '../App.jsx';

export default function Home() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.all([api.listProducts({ search }), api.listOffers()])
      .then(([p, o]) => {
        if (!mounted) return;
        setProducts(p.products);
        setOffers(o.offers);
      })
      .catch((e) => mounted && setError(e.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [search]);

  const topOffers = [...offers].sort((a, b) => offerDiscount(b) - offerDiscount(a)).slice(0, 6);
  const totalSavings = offers.reduce(
    (sum, o) => sum + Math.max(0, Math.round(o.original_price - o.promo_price)),
    0
  );

  return (
    <main className="container">
      <section className="hero vitrine-hero">
        <div className="hero-floats" aria-hidden="true">
          <span>🛍️</span>
          <span>💸</span>
          <span>🛒</span>
          <span>✨</span>
          <span>💰</span>
          <span>🎊</span>
        </div>
        <span className="hero-badge">🛍️ Bienvenue chez Mboppi</span>
        <h1>Le marché du quartier, en un clic</h1>
        <p>
          Découvrez les offres du moment, commandez les produits des boutiques partenaires,
          ou devenez vendeur et gagnez une commission sur chaque vente.
        </p>
        <div className="hero-stats">
          <div className="stat">
            <strong>{offers.length}</strong>
            <span>Offres actives</span>
          </div>
          <div className="stat">
            <strong>{products.length}</strong>
            <span>Produits en boutique</span>
          </div>
          <div className="stat">
            <strong>{formatMoney(totalSavings)} F</strong>
            <span>Économies à saisir</span>
          </div>
        </div>
        <div className="hero-actions" style={{ marginTop: 24 }}>
          <Link to="/vitrine-offre" className="btn btn-primary">🔥 Voir les offres du moment</Link>
          {user ? (
            <Link to={user.role === 'shop' ? '/shop' : '/seller'} className="btn btn-outline">
              Accéder à mon espace
            </Link>
          ) : (
            <Link to="/register" className="btn btn-outline">Devenir vendeur</Link>
          )}
        </div>
      </section>

      <section className="steps">
        <div className="step">
          <span className="step-num">1</span>
          <span className="step-icon">🏪</span>
          <h3>Les boutiques publient</h3>
          <p>Elles mettent en ligne leurs produits et fixent la commission de vente.</p>
        </div>
        <div className="step">
          <span className="step-num">2</span>
          <span className="step-icon">🛒</span>
          <h3>Les vendeurs vendent</h3>
          <p>Ils enregistrent les ventes et trouvent les clients, au quartier ou en ligne.</p>
        </div>
        <div className="step">
          <span className="step-num">3</span>
          <span className="step-icon">💰</span>
          <h3>Chacun y gagne</h3>
          <p>La boutique écoule ses produits, le vendeur encaisse sa commission à chaque vente.</p>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <section>
        <div className="section-head">
          <h2 className="section-title">⚡ Offres du moment</h2>
          <Link to="/vitrine-offre" className="section-link">Tout voir →</Link>
        </div>
        {loading ? (
          <div className="grid">
            {[1, 2, 3].map((i) => <div key={i} className="card offer-card skeleton"><div className="skeleton-block skeleton-photo"></div></div>)}
          </div>
        ) : topOffers.length === 0 ? (
          <p className="empty">Aucune offre pour le moment. Revenez très vite ! 🔥</p>
        ) : (
          <div className="grid">
            {topOffers.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2 className="section-title">🏪 Produits des boutiques</h2>
        </div>
        <div className="toolbar">
          <input
            className="input search"
            placeholder="🔍 Rechercher un produit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="grid">
            {[1, 2, 3].map((i) => <div key={i} className="card offer-card skeleton"><div className="skeleton-block skeleton-photo"></div></div>)}
          </div>
        ) : products.length === 0 ? (
          <p className="empty">Aucun produit disponible pour le moment.</p>
        ) : (
          <div className="grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
