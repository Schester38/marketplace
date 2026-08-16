import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import Logo from '../components/Logo.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { cityFromSlug } from '../cities.js';

export default function CityPage() {
  const { slug } = useParams();
  const { t } = useLang();
  const city = cityFromSlug(slug);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setProducts(null);
    setError('');
    api
      .listProducts({ scope: 'product', city: slug })
      .then((d) => {
        if (!mounted.current) return;
        setProducts(d.products);
      })
      .catch((e) => {
        if (!mounted.current) return;
        setError(e.message);
        setProducts([]);
      });
    return () => {
      mounted.current = false;
    };
  }, [slug]);

  return (
    <main className="container">
      <Seo
        title={t('Acheter à {city} — Boutiques et produits | Mboppi', { city })}
        description={t('Commandez des produits des boutiques de {city} en ligne : téléphones, mode, alimentation, artisanat. Livraison rapide avec Mboppi.', { city })}
      />
      <section className="hero city-hero">
        <span className="hero-badge">📍 {t('MBOPPI À {city}', { city: city.toUpperCase() })}</span>
        <h1>{t('Acheter à {city}', { city })}</h1>
        <p>
          {t('Découvrez les boutiques et les créations disponibles à {city}. Commandez en ligne ou par WhatsApp et recevez chez vous.', { city })}
        </p>
        <div className="city-links">
          <Link to="/register" className="btn btn-primary">{t('Ouvrir ma boutique')}</Link>
        </div>
      </section>

      <section className="section" aria-label={t('Produits à {city}', { city })}>
        <div className="section-head">
          <h2 className="section-title"><Logo className="logo-inline" /> {t('Produits disponibles à {city}', { city })}</h2>
        </div>
        {error && <p className="error">{error}</p>}
        {products === null ? (
          <div className="grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card page-center"><div className="skeleton-block" style={{ height: 180 }}></div></div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="card page-center">
            <p className="empty">{t('Aucun produit publié pour le moment à {city}. Revenez bientôt !', { city })}</p>
            <Link to="/" className="btn btn-outline">← {t('Tous les produits')}</Link>
          </div>
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
