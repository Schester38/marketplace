import React from 'react';
import ProductCard from './ProductCard.jsx';

export default function ProductRail({ title, hint, emoji, products, badge }) {
  if (!products || products.length === 0) return null;
  return (
    <section aria-label={title} className="product-rail">
      <div className="section-head">
        <h2 className="section-title">{emoji ? `${emoji} ` : ''}{title}</h2>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <div className="rail-scroll">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} badge={badge} />
        ))}
      </div>
    </section>
  );
}