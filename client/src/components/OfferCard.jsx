import React, { useState } from 'react';
import { formatMoney } from './ProductCard.jsx';

export default function OfferCard({ offer }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = offer.photos || [];
  const hasPhotos = photos.length > 0;

  return (
    <div className="card offer-card">
      <div className="offer-photo" onClick={() => photos.length > 1 && setPhotoIndex((i) => (i + 1) % photos.length)}>
        {hasPhotos ? (
          <img src={photos[photoIndex]} alt={offer.name} />
        ) : (
          <span>🛍️</span>
        )}
        {photos.length > 1 && (
          <span className="offer-photo-count">{photoIndex + 1}/{photos.length}</span>
        )}
      </div>
      <div className="offer-body">
        <div className="offer-tags">
          <span className="badge badge-offer">Offre</span>
          {offer.category && <span className="badge badge-cat">{offer.category}</span>}
        </div>
        <h3>{offer.name}</h3>
        {offer.description && <p className="product-desc">{offer.description}</p>}
        {offer.warranty && <p className="offer-warranty">🛡️ Garantie : {offer.warranty}</p>}
        <div className="offer-prices">
          <span className="old-price">{formatMoney(offer.original_price)} F</span>
          <span className="promo-price">{formatMoney(offer.promo_price)} F</span>
        </div>
        {offer.phone && (
          <a className="btn btn-primary btn-block" href={`tel:${offer.phone}`}>
            📞 {offer.phone}
          </a>
        )}
        <p className="offer-qty">Disponibilité : {offer.quantity} unité(s)</p>
      </div>
    </div>
  );
}
