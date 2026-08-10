import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { whatsappLink, countrySymbol } from '../config.js';
import Seo from '../components/Seo.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

const ORDER_STATUS = {
  new: { key: 'En attente', cls: 'badge-pending' },
  confirmed: { key: 'Confirmée', cls: 'badge-confirmed' },
  shipped: { key: 'Expédiée', cls: 'badge-confirmed' },
  cancelled: { key: 'Annulée', cls: 'badge-cancelled' },
};

const PURCHASE_STATUS = {
  pending: { key: 'Vente en attente', cls: 'badge-pending' },
  bought: { key: 'Acheté', cls: 'badge-bought' },
  confirmed: { key: 'Confirmée', cls: 'badge-confirmed' },
  cancelled: { key: 'Annulée', cls: 'badge-cancelled' },
};

export default function ClientDashboard() {
  const { user } = useAuth();
  const { t, locale } = useLang();
  const [orders, setOrders] = useState(null);
  const [purchases, setPurchases] = useState(null);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  const load = useCallback(() => {
    Promise.all([api.myOrders(), api.purchasesMy()])
      .then(([od, pd]) => {
        if (!mounted.current) return;
        setOrders(od.orders);
        setPurchases(pd.purchases);
      })
      .catch((e) => mounted.current && setError(e.message));
  }, []);

  useEffect(() => {
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useRefreshOnFocus(load);

  return (
    <main className="container">
      <Seo title={t('Mon espace client') + ' — Mboppi'} description={t('Découvrez les produits et offres des boutiques.')} />
      <section className="dash-header">
        <div>
          <h1>{t('Mon espace client')}</h1>
          <p>{t('Bienvenue {name} !', { name: user.name })} {t('Découvrez les produits et offres des boutiques.')}</p>
        </div>
      </section>

      <section className="steps">
        <Link to="/vitrine-offre" className="step">
          <span className="step-icon">⚡</span>
          <h3>{t('Les offres du moment')}</h3>
          <p>{t('Découvrez les promotions en cours avec les meilleures réductions.')}</p>
        </Link>
        <Link to="/" className="step">
          <span className="step-icon">🏪</span>
          <h3>{t('Produits des boutiques')}</h3>
          <p>{t('Parcourez les produits disponibles chez les boutiques partenaires.')}</p>
        </Link>
        <Link to="/panier" className="step">
          <span className="step-icon">🛒</span>
          <h3>{t('Mon panier')}</h3>
          <p>{t('Finalisez vos commandes en quelques clics.')}</p>
        </Link>
        <Link to="/favoris" className="step">
          <span className="step-icon">❤️</span>
          <h3>{t('Mes favoris')}</h3>
          <p>{t('Retrouvez les produits que vous avez aimés.')}</p>
        </Link>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 className="section-title">{t('🛍️ Mes achats')}</h2>
        {purchases === null ? (
          <div className="card page-center">
            <div className="skeleton-block" style={{ height: 80 }}></div>
          </div>
        ) : purchases.length === 0 ? (
          <div className="card page-center">
            <p className="empty">{t('Aucun achat pour le moment.')}</p>
            <Link to="/" className="btn btn-primary">{t('Découvrir les produits')}</Link>
          </div>
        ) : (
          <div className="order-list">
            {purchases.map((p) => {
              const st = PURCHASE_STATUS[p.status] || PURCHASE_STATUS.pending;
              return (
                <div className="card order-card" key={p.id}>
                  <div className="order-head">
                    <strong>{p.product_name} ×{p.quantity}</strong>
                    <span className={`badge ${st.cls}`}>{t(st.key)}</span>
                  </div>
                  <p className="order-date">
                    {new Date(p.created_at).toLocaleDateString(locale, { dateStyle: 'medium' })}
                    {' — '}{t('Vendeur : {seller}', { seller: p.seller_name })}
                    {p.buyer_code ? ` (${p.buyer_code})` : ''}
                  </p>
                  <div className="order-items">
                    <div className="order-item">
                      {p.photos && JSON.parse(p.photos || '[]')[0] ? (
                        <img src={JSON.parse(p.photos)[0]} alt={p.product_name} loading="lazy" />
                      ) : (
                        <span className="order-item-thumb">📦</span>
                      )}
                      <span className="order-item-name">{p.shop_name}</span>
                      <strong>{formatMoney(p.purchase_price != null ? p.purchase_price : p.total_price)} {countrySymbol(p.shop_country)}</strong>
                    </div>
                  </div>
                  <div className="order-total">
                    <span className="label">{t('Prix payé')}</span>
                    <strong>{formatMoney(p.purchase_price != null ? p.purchase_price : p.total_price)} {countrySymbol(p.shop_country)}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 className="section-title">{t('📦 Mes commandes')}</h2>
        {error && <p className="error">{error}</p>}
        {orders === null ? (
          <div className="card page-center">
            <div className="skeleton-block" style={{ height: 80 }}></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="card page-center">
            <p className="empty">{t('Aucune commande pour le moment.')}</p>
            <Link to="/" className="btn btn-primary">{t('Parcourir les produits')}</Link>
          </div>
        ) : (
          <div className="order-list">
            {orders.map((o) => {
              const st = ORDER_STATUS[o.status] || ORDER_STATUS.new;
              return (
                <div className="card order-card" key={o.id}>
                  <div className="order-head">
                    <strong>{t('Commande #{id}', { id: o.id })}</strong>
                    <span className={`badge ${st.cls}`}>{t(st.key)}</span>
                  </div>
                  <p className="order-date">{new Date(o.created_at).toLocaleDateString(locale, { dateStyle: 'medium' })}</p>
                  <div className="order-items">
                    {o.items.map((it, i) => (
                      <div className="order-item" key={i}>
                        {it.photo && <img src={it.photo} alt={it.name} loading="lazy" />}
                        <span className="order-item-name">{it.name} ×{it.quantity}</span>
                        <strong>{formatMoney(it.price * it.quantity)} {countrySymbol(user && user.country)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="order-total">
                    <span className="label">{t('Total')}</span>
                    <strong>{formatMoney(o.total)} {countrySymbol(user && user.country)}</strong>
                  </div>
                  <a
                    className="btn btn-outline btn-sm"
                    href={whatsappLink(t('Bonjour Mboppi, je souhaite suivre ma commande #{id}.', { id: o.id }))}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    💬 {t('Suivre sur WhatsApp')}
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('Mon compte')}</h2>
        <div className="info-row">
          <span className="label">{t('Nom')}</span>
          <strong>{user.name}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t('Email')}</span>
          <strong>{user.email}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t('Rôle')}</span>
          <strong>{t('Client')}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t('Inscrit le')}</span>
          <strong>{new Date(user.created_at).toLocaleDateString(locale)}</strong>
        </div>
      </section>
    </main>
  );
}
