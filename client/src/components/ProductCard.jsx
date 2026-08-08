import React from 'react';

export function formatMoney(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n || 0));
}

export default function ProductCard({ product, action, onAction }) {
  const commission = Number(product.commission || 0);
  const photo = (product.photos && product.photos[0]) || product.image;
  return (
    <div className="card product-card">
      <div className="product-thumb">
        {photo ? (
          <img src={photo} alt={product.name} loading="lazy" decoding="async" />
        ) : (
          <span>📦</span>
        )}
      </div>
      <div className="product-body">
        <h3>{product.name}</h3>
        {product.description && <p className="product-desc">{product.description}</p>}
        <p className="product-shop">Boutique : {product.shop_name}</p>
        <div className="price-box">
          <div>
            <span className="label">Prix de vente</span>
            <span className="price">{formatMoney(product.price)} F</span>
          </div>
          <div>
            <span className="label">Commission ({product.commission_percent}%)</span>
            <span className="commission">+{formatMoney(commission)} F</span>
          </div>
        </div>
        {action && <button className="btn btn-primary btn-block" onClick={() => onAction(product)}>{action}</button>}
      </div>
    </div>
  );
}
