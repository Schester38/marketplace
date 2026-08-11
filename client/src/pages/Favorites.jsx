import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { useFavs } from '../store.jsx';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

export default function Favorites() {
  const { t } = useLang();
  const { favs } = useFavs();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .listProducts({})
      .then((d) => {
        setProducts(d.products);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOnFocus(load);

  const favProducts = products.filter((p) => favs.includes(Number(p.id)));

  if (error) {
    return (
      <main className="container">
        <Seo title={t('Mes favoris') + ' — Mboppi'} />
        <h1 className="section-title">❤️ {t('Mes favoris')}</h1>
        <div className="card page-center">
          <p className="error">{error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>🔄 {t('Réessayer')}</button>
        </div>
      </main>
    );
  }

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