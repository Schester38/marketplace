import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryEmoji, countrySymbol } from '../config.js';
import { useLang } from '../i18n.jsx';
import { useCart, useFavs } from '../store.jsx';

export function formatMoney(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n || 0));
}

export default function ProductCard({ product, action, onAction, secondaryAction, onSecondaryAction, showCommission }) {
  const { t } = useLang();
  const { addToCart } = useCart();
  const { isFav, toggleFav } = useFavs();
  const [added, setAdded] = useState(false);
  const commission = Number(product.commission || 0);
  const photo = (product.photos && product.photos[0]) || product.image;
  const deliveryFee = Number(product.delivery_fee || 0);
  const qty = Number(product.quantity || 0);
  const symbol = countrySymbol(product?.shop_country);
  const fav = isFav(product.id);
  const sold = Number(product.sold || 0);
  const oldPrice = product.old_price === null || product.old_price === undefined ? null : Number(product.old_price);
  const hasPromo = oldPrice !== null && oldPrice > Number(product.price);

  const add = (e) => {
    e.preventDefault();
    addToCart(product, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="card product-card">
      <Link to={`/produit/${product.id}`} className="product-link">
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
      {sold > 0 && <span className="badge badge-sold">🔥 {sold} {t('vendus')}</span>}
      <div className="product-body">
        <h3><Link to={`/produit/${product.id}`}>{product.name}</Link></h3>
        {product.category && (
          <p className="product-cat">{categoryEmoji(product.category)} {t(product.category)}</p>
        )}
        {product.description && <p className="product-desc">{product.description}</p>}
        <p className="product-shop">
          {t('Boutique : {shop}', { shop: product.shop_name })}
          {product.shop_location ? <span className="shop-loc"> · 📍 {product.shop_location}</span> : null}
        </p>
        <div className="product-meta">
          {product.warranty && <span className="meta-chip">🛡️ {t('Garantie : {warranty}', { warranty: product.warranty })}</span>}
          <span className="meta-chip">🚚 {deliveryFee > 0 ? t('Livraison {price} {symbol}', { price: formatMoney(deliveryFee), symbol }) : t('Livraison gratuite')}</span>
          {product.contact && <span className="meta-chip">📞 {product.contact}</span>}
        </div>
        <div className="price-box">
          <div>
            <span className="label">{t('Prix de vente')}</span>
            <span className="price-line">
              {hasPromo && <span className="old-price">{formatMoney(oldPrice)} {symbol}</span>}
              <span className="price">{formatMoney(product.price)} {symbol}</span>
            </span>
          </div>
          {showCommission && (
            <div>
              <span className="label">{t('Commission ({n}%)', { n: product.commission_percent })}</span>
              <span className="commission">+{formatMoney(commission)} {symbol}</span>
            </div>
          )}
        </div>
        <p className={`stock-line ${qty > 0 ? '' : 'out'}`}>
          {qty > 0 ? t('En stock : {n}', { n: qty }) : t('Rupture de stock')}
        </p>
        {action && (
          <div className="card-actions">
            <button className="btn btn-primary btn-block" onClick={() => onAction(product)}>{t(action)}</button>
            {secondaryAction && (
              <button className="btn btn-danger btn-block" onClick={() => onSecondaryAction(product)}>{t(secondaryAction)}</button>
            )}
          </div>
        )}
        {!action && (
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
