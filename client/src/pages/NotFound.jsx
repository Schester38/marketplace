import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';

export default function NotFound() {
  const { t } = useLang();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    api
      .listProducts()
      .then((d) => setProducts(d.products.slice(0, 4)))
      .catch(() => {});
  }, []);

  return (
    <main className="container">
      <Seo title={t('Page introuvable') + ' — Mboppi'} description={t('Page introuvable')} noindex/>
      <div className="card page-center notfound">
        <span className="notfound-icon">🧭</span>
        <h1>{t('Page introuvable')}</h1>
        <p className="hint">{t("La page que vous cherchez n'existe pas ou a été déplacée.")}</p>
        <div className="notfound-actions">
          <Link to="/" className="btn btn-primary">{t('Retour à l\'accueil')}</Link>
          <Link to="/vitrine-offre" className="btn btn-outline">{t('Voir les offres')}</Link>
        </div>
      </div>
      {products.length > 0 && (
        <section>
          <h2 className="section-title">🛍️ {t('Suggestions')}</h2>
          <div className="grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
