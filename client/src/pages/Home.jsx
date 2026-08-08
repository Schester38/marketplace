import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { useAuth } from '../App.jsx';

export default function Home() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listProducts({ search })
      .then((d) => setProducts(d.products))
      .catch((e) => setError(e.message));
  }, [search]);

  return (
    <main className="container">
      <section className="hero">
        <h1>Vendez les produits des boutiques, gagnez vos commissions</h1>
        <p>
          Les boutiques publient jusqu'à 5 produits. Les vendeurs enregistrent les ventes
          et touchent une commission sur chaque produit vendu.
        </p>
        {!user && (
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary">Créer un compte gratuit</Link>
            <Link to="/login" className="btn btn-outline">Se connecter</Link>
          </div>
        )}
      </section>

      <section>
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Rechercher un produit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {error && <p className="error">{error}</p>}
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
