import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { useFavs } from '../store.jsx';
import { useLang } from '../i18n.jsx';

export default function Favorites() {
  const { t } = useLang();
  const { favs } = useFavs();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .listProducts({})
      .then((d) => mounted && setProducts(d.products))
      .catch(() => {})
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const favProducts = products.filter((p) => favs.includes(Number(p.id)));

  return (
    <main className="container">
      <Seo title={t('Mes favoris') + ' — Mboppi'} />
      <h1 className="section-title">❤️ {t('Mes favoris')}</h1>
      {loading ? (
        <div className="grid">
          {[1, 2, 3].map((i) => <div key={i} className="card offer-card skeleton"><div className="skeleton-block skeleton-photo"></div></div>)}
        </div>
      ) : favProducts.length === 0 ? (
        <div className="card page-center">
          <p className="empty">{t('Aucun favori pour le moment.')}</p>
          <Link to="/" className="btn btn-primary">{t('Parcourir les produits')}</Link>
        </div>
      ) : (
        <div className="grid">
          {favProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
