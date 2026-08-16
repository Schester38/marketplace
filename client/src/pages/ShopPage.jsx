import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Logo from '../components/Logo.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import { waLink, countryPhone } from '../config.js';

export default function ShopPage() {
  const { id } = useParams();
  const { t } = useLang();
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .shop(id)
      .then((d) => {
        setShop(d.shop);
        setProducts(d.products);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOnFocus(load);

  if (error) {
    return (
      <main className="container narrow">
        <p className="error">{error}</p>
        <Link to="/" className="btn btn-outline">← {t('Retour aux produits')}</Link>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="container narrow">
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 140 }}></div>
        </div>
      </main>
    );
  }

  const phone = shop.phone || countryPhone(shop.country).replace('+', '');

  return (
    <main className="container">
      <Seo title={`${shop.name} — Mboppi`} description={`${shop.name}${shop.location ? ' — ' + shop.location : ''} sur Mboppi.`} />
      <Link to="/" className="btn btn-outline" style={{ marginBottom: 16 }}>
        ← {t('Retour aux produits')}
      </Link>

      <div className="card shop-header-card">
        <div className="shop-header">
          <span className="shop-avatar">🏪</span>
          <div>
            <h2>
              {shop.name}
              {shop.verified && <span className="badge badge-verified" title={t('Boutique vérifiée')}>✓ {t('Vérifiée')}</span>}
            </h2>
            <p className="hint">
              {shop.location && <span>📍 {shop.location}</span>}
              {shop.location && shop.country ? ' · ' : ''}
              {shop.country && <span>{shop.country}</span>}
            </p>
          </div>
          {phone && (
            <a
              className="btn btn-primary shop-wa"
              href={waLink(phone, t('Bonjour {shop}, je vous contacte depuis Mboppi.', { shop: shop.name }))}
              target="_blank"
              rel="noopener noreferrer"
            >
              💬 {t('Contacter sur WhatsApp')}
            </a>
          )}
        </div>
      </div>

      <h2 className="section-title"><Logo className="logo-inline" /> {t('Produits de la boutique')}</h2>
      {products === null ? (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 120 }}></div>
        </div>
      ) : products.length === 0 ? (
        <div className="card page-center">
          <p className="empty">{t('Aucun produit pour le moment.')}</p>
        </div>
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
