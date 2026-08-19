import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { countrySymbol, waLink } from '../config.js';
import { useLang } from '../i18n.jsx';
import { useCart, useFavs } from '../store.jsx';

export function formatMoney(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n || 0));
}

export default function ProductCard({ product, action, onAction, secondaryAction, onSecondaryAction, showCommission, badge, extraAction }) {
  const { t } = useLang();
  const { addToCart } = useCart();
  const { isFav, toggleFav } = useFavs();
  const [added, setAdded] = useState(false);
  const commission = Number(product.commission || 0);
  const photo = (product.photos && product.photos[0]) || product.image;
  const qty = Number(product.quantity || 0);
  const symbol = countrySymbol(product?.shop_country);
  const fav = isFav(product.id);
  const sold = Number(product.sold || 0);
  const pendingCount = Number(product.pending_count || 0);
  const oldPrice = product.old_price === null || product.old_price === undefined ? null : Number(product.old_price);
  const hasPromo = oldPrice !== null && oldPrice > Number(product.price);
  const promoPct = hasPromo ? Math.round((1 - Number(product.price) / oldPrice) * 100) : 0;

  const add = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="card product-card">
      <Link to={`/produit/${product.id}`} className="product-link" aria-label={product.name}>
        <div className="product-thumb">
          {photo ? (
            <img src={photo} alt={product.name} loading="lazy" decoding="async" />
          ) : (
            <span>📦</span>
          )}
        </div>
      </Link>
      <button
        type="button"
        className={`fav-btn ${fav ? 'active' : ''}`}
        aria-label={fav ? t('Retirer des favoris') : t('Ajouter aux favoris')}
        title={fav ? t('Retirer des favoris') : t('Ajouter aux favoris')}
        onClick={() => toggleFav(product.id)}
      >
        {fav ? '❤️' : '🤍'}
      </button>
      <a
        className="share-btn"
        href={waLink('', `${product.name} — ${product.price} ${symbol} sur Mboppi → https://${window.location.host}/produit/${product.id}`)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('Partager')}
        title={t('Partager')}
        onClick={(e) => e.stopPropagation()}
      >
        <ShareIcon />
      </a>
      {hasPromo && <span className="badge badge-promo">-{promoPct}%</span>}
      {pendingCount > 0 && <span className="badge badge-pending">⏳ {pendingCount} {t('en attente')}</span>}
      {sold > 0 && <span className="badge badge-sold">🔥 {sold} {t('vendus')}</span>}
      {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
      <Link to={`/produit/${product.id}`} className="product-body">
        <h3>{product.name}</h3>
        {product.review_count > 0 && (
          <p className="card-rating">
            <span className="stars stars-12">
              {'★'.repeat(Math.round(Number(product.rating_avg) || 0))}
              {'☆'.repeat(5 - Math.round(Number(product.rating_avg) || 0))}
            </span>
            <span className="rating-count">
              {Number(product.rating_avg).toFixed(1)} ({product.review_count})
            </span>
          </p>
        )}
        {product.shop_name && (
          <p className="card-shop">
            <Link
              to={product.shop_role === 'creator' ? `/createur/${product.shop_id}` : `/boutique/${product.shop_id}`}
              onClick={(e) => e.stopPropagation()}
            >
              {product.shop_name} {product.shop_verified && <span title={t('Boutique vérifiée')}>✓</span>}
            </Link>
          </p>
        )}
        <div className="price-box">
          <span className="price-line">
            {hasPromo && <span className="old-price">{formatMoney(oldPrice)} {symbol}</span>}
            <span className="price">{formatMoney(product.price)} {symbol}</span>
          </span>
          {showCommission && (
            <span className="commission">+{formatMoney(commission)} {symbol}</span>
          )}
        </div>
        <p className={`stock-line ${qty > 0 ? '' : 'out'}`}>
          {qty > 0 ? t('En stock : {n}', { n: qty }) : t('Rupture de stock')}
        </p>
      </Link>
      <div className="card-actions">
        {action ? (
          <>
            <button className="btn btn-primary btn-block" onClick={() => onAction(product)}>{t(action)}</button>
            {secondaryAction && (
              <button className="btn btn-danger btn-block" onClick={() => onSecondaryAction(product)}>{t(secondaryAction)}</button>
            )}
            {extraAction && (
              <button className="btn btn-outline btn-block" onClick={() => extraAction.onClick(product)}>{extraAction.label}</button>
            )}
          </>
        ) : (
          <button
            className={`btn btn-block ${qty > 0 ? 'btn-cart' : ''}`}
            disabled={qty <= 0}
            onClick={add}
          >
            {added ? t('Ajouté au panier ✓') : qty > 0 ? `🛒 ${t('Ajouter au panier')}` : t('Rupture de stock')}
          </button>
        )}
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
