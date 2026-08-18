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
        aria-label={t('Partager sur WhatsApp')}
        title={t('Partager sur WhatsApp')}
        onClick={(e) => e.stopPropagation()}
      >
        <WhatsAppIcon />
      </a>
      {hasPromo && <span className="badge badge-promo">-{promoPct}%</span>}
      {pendingCount > 0 && <span className="badge badge-pending">⏳ {pendingCount} {t('en attente')}</span>}
      {sold > 0 && <span className="badge badge-sold">🔥 {sold} {t('vendus')}</span>}
      {product.review_count > 0 && (
        <span className="badge badge-review">⭐ {product.rating_avg} ({product.review_count})</span>
      )}
      {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
      <Link to={`/produit/${product.id}`} className="product-body">
        <h3>{product.name}</h3>
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

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}
