import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { countrySymbol } from '../config.js';
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
      {pendingCount > 0 && <span className="badge badge-pending">⏳ {pendingCount} {t('en attente')}</span>}
      {sold > 0 && <span className="badge badge-sold">🔥 {sold} {t('vendus')}</span>}
      {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
      <Link to={`/produit/${product.id}`} className="product-body">
        <h3>{product.name}</h3>
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
            className={`btn btn-block ${qty > 0 ? 'btn-primary' : ''}`}
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
