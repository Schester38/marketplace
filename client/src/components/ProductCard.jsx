import React from 'react';
import { Link } from 'react-router-dom';
import { categoryEmoji, countrySymbol } from '../config.js';
import { useLang } from '../i18n.jsx';

export function formatMoney(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n || 0));
}

export default function ProductCard({ product, action, onAction, showCommission }) {
  const { t } = useLang();
  const commission = Number(product.commission || 0);
  const photo = (product.photos && product.photos[0]) || product.image;
  const deliveryFee = Number(product.delivery_fee || 0);
  const qty = Number(product.quantity || 0);
  const symbol = countrySymbol(product?.shop_country);
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
      <div className="product-body">
        <h3><Link to={`/produit/${product.id}`}>{product.name}</Link></h3>
        {product.category && (
          <p className="product-cat">{categoryEmoji(product.category)} {product.category}</p>
        )}
        {product.description && <p className="product-desc">{product.description}</p>}
        <p className="product-shop">
          {t('Boutique : {shop}', { shop: product.shop_name })}
          {product.shop_location ? <span className="shop-loc"> · 📍 {product.shop_location}</span> : null}
        </p>
        <div className="product-meta">
          {product.warranty > 0 && <span className="meta-chip">🛡️ {t('Garantie {n} mois', { n: product.warranty })}</span>}
          <span className="meta-chip">🚚 {deliveryFee > 0 ? t('Livraison {price} {symbol}', { price: formatMoney(deliveryFee), symbol }) : t('Livraison gratuite')}</span>
          {product.contact && <span className="meta-chip">📞 {product.contact}</span>}
        </div>
        <div className="price-box">
          <div>
            <span className="label">{t('Prix de vente')}</span>
            <span className="price">{formatMoney(product.price)} {symbol}</span>
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
        {action && <button className="btn btn-primary btn-block" onClick={() => onAction(product)}>{t(action)}</button>}
      </div>
    </div>
  );
}
