import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import OfferCard from '../components/OfferCard.jsx';

function SkeletonCard() {
  return (
    <div className="card offer-card skeleton">
      <div className="skeleton-block skeleton-photo"></div>
      <div className="offer-body">
        <div className="skeleton-block" style={{ height: 18, width: '70%' }}></div>
        <div className="skeleton-block" style={{ height: 12, width: '90%' }}></div>
        <div className="skeleton-block" style={{ height: 34, width: '100%' }}></div>
        <div className="skeleton-block" style={{ height: 34, width: '100%' }}></div>
      </div>
    </div>
  );
}

export default function VitrineOffre() {
  const [products, setProducts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    Promise.all([api.listProducts(), api.listOffers()])
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
  }, []);

  return (
    <main className="container">
      <section className="hero">
        <h1>Vitrine d'offre</h1>
        <p>
          Toutes les offres promotionnelles de Verone et les produits des boutiques
          partenaires : prix, promotions et coordonnées pour commander.
        </p>
      </section>

      {error && <p className="error">{error}</p>}

      <section>
        <h2 className="section-title">Offres promotionnelles</h2>
        {loading ? (
          <div className="grid">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : offers.length === 0 ? (
          <p className="empty">Aucune offre pour le moment.</p>
        ) : (
          <div className="grid">
            {offers.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">Produits des boutiques</h2>
        {loading ? (
          <div className="grid">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
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
