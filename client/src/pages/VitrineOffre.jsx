import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import OfferCard from '../components/OfferCard.jsx';

export default function VitrineOffre() {
  const [products, setProducts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.listProducts(), api.listOffers()])
      .then(([p, o]) => {
        setProducts(p.products);
        setOffers(o.offers);
      })
      .catch((e) => setError(e.message));
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
        {offers.length === 0 ? (
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
        {products.length === 0 ? (
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
