import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

export default function Creators() {
  const { t } = useLang();
  const [creators, setCreators] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .listShops({ role: 'creator' })
      .then((d) => {
        setCreators(d.shops);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOnFocus(load);

  return (
    <main className="container">
      <Seo
        title={t('Créateurs de Mboppi')}
        description={t('Découvrez les créateurs de Mboppi et leurs créations artisanales.')}
      />
      <h2 className="section-title">🎨 {t('Les créateurs')}</h2>
      {error ? (
        <p className="error">{error}</p>
      ) : creators === null ? (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 140 }}></div>
        </div>
      ) : creators.length === 0 ? (
        <div className="card page-center">
          <p className="empty">{t('Aucun créateur pour le moment.')}</p>
        </div>
      ) : (
        <div className="grid">
          {creators.map((c) => (
            <Link key={c.id} to={`/createur/${c.id}`} className="card creator-card underlink">
              <div className="shop-item-head">
                <span className="shop-avatar creator-avatar">🎨</span>
                <div>
                  <h3 className="md">
                    {c.name}
                    {c.verified && (
                      <span className="badge badge-verified" title={t('Boutique vérifiée')}>✓</span>
                    )}
                  </h3>
                  <p className="hint">
                    {c.location && <span>📍 {c.location}</span>}
                    {c.location && c.city ? ' · ' : ''}
                    {c.city && <span>{c.city}</span>}
                  </p>
                </div>
              </div>
              <p className="hint">
                {Number(c.product_count || 0) === 0
                  ? t('Aucun produit pour le moment.')
                  : t('{n} produits', { n: c.product_count || 0 })}
              </p>
              <span className="btn btn-outline shop-item-cta">{t('Voir les créations')}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}