import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';

export default function VitrineOffre() {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listProducts()
      .then((d) => setProducts(d.products))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main className="container">
      <section className="hero">
        <h1>Vitrine d'offre</h1>
        <p>
          Toutes les offres publiées par les boutiques partenaires : prix de vente et
          commission vendeur affichés pour chaque produit.
        </p>
      </section>
      {error && <p className="error">{error}</p>}
      {products.length === 0 ? (
        <p className="empty">Aucune offre disponible pour le moment.</p>
      ) : (
        <div className="grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
