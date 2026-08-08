import React from 'react';
import { Link } from 'react-router-dom';
import { categoryEmoji, countrySymbol } from '../config.js';

export function formatMoney(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n || 0));
}

export default function ProductCard({ product, action, onAction, showCommission }) {
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
          Boutique : {product.shop_name}
          {product.shop_location ? <span className="shop-loc"> · 📍 {product.shop_location}</span> : null}
        </p>
        <div className="product-meta">
          {product.warranty > 0 && <span className="meta-chip">🛡️ Garantie {product.warranty} mois</span>}
          <span className="meta-chip">🚚 {deliveryFee > 0 ? `Livraison ${formatMoney(deliveryFee)} ${symbol}` : 'Livraison gratuite'}</span>
          {product.contact && <span className="meta-chip">📞 {product.contact}</span>}
        </div>
        <div className="price-box">
          <div>
            <span className="label">Prix de vente</span>
            <span className="price">{formatMoney(product.price)} {symbol}</span>
          </div>
          {showCommission && (
            <div>
              <span className="label">Commission ({product.commission_percent}%)</span>
              <span className="commission">+{formatMoney(commission)} {symbol}</span>
            </div>
          )}
        </div>
        <p className={`stock-line ${qty > 0 ? '' : 'out'}`}>
          {qty > 0 ? `En stock : ${qty}` : 'Rupture de stock'}
        </p>
        {action && <button className="btn btn-primary btn-block" onClick={() => onAction(product)}>{action}</button>}
      </div>
    </div>
  );
}
