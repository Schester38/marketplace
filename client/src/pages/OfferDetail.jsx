import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatMoney } from '../components/ProductCard.jsx';
import { offerUrl, whatsappLink, offerDiscount, offerSavings, categoryEmoji } from '../config.js';
import Seo from '../components/Seo.jsx';

export default function OfferDetail() {
  const { id } = useParams();
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    api
      .getOffer(id)
      .then((d) => setOffer(d.offer))
      .catch((e) => setError(e.message));
  }, [id]);

  const photos = offer ? offer.photos || [] : [];
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') setLightboxIndex((i) => (i + 1) % photos.length);
      if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, photos.length]);

  if (error) {
    return (
      <main className="container narrow">
        <p className="error">{error}</p>
        <Link to="/vitrine-offre" className="btn btn-outline">← Retour à la vitrine</Link>
      </main>
    );
  }

  if (!offer) {
    return (
      <main className="container narrow">
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 260 }}></div>
        </div>
      </main>
    );
  }

  const waMessage = `Bonjour, je suis intéressé(e) par votre offre « ${offer.name} » : ${offerUrl(offer.id)}`;
  const discount = offerDiscount(offer);
  const savings = offerSavings(offer);

  return (
    <main className="container narrow">
      <Seo
        title={offer ? `${offer.name} — Mboppi` : 'Offre du moment — Mboppi'}
        description={offer ? `Découvrez « ${offer.name} » à ${formatMoney(offer.price)} sur Mboppi.` : undefined}
      />
      <Link to="/vitrine-offre" className="btn btn-outline" style={{ marginBottom: 16 }}>
        ← Retour à la vitrine
      </Link>

      <div className="card offer-detail">
        <div
          className="offer-photo"
          style={{ height: 260, cursor: photos.length > 0 ? 'zoom-in' : undefined }}
          onClick={() => photos.length > 0 && setLightbox(true)}
        >
          {photos.length > 0 ? (
            <img src={photos[lightboxIndex]} alt={offer.name} />
          ) : (
            <span>🛍️</span>
          )}
          {discount > 0 && <span className="discount-badge">−{discount}%</span>}
          {photos.length > 1 && (
            <span className="offer-photo-count">{photos.length} photos — cliquez pour agrandir</span>
          )}
        </div>

        <div className="offer-body">
          <div className="offer-tags">
            <span className="badge badge-offer">Offre</span>
            {offer.category && <span className="badge badge-cat">{categoryEmoji(offer.category)} {offer.category}</span>}
          </div>
          <h2>{offer.name}</h2>
          {offer.description && <p>{offer.description}</p>}
          {offer.warranty && <p className="offer-warranty">🛡️ Garantie : {offer.warranty}</p>}
          <div className="offer-prices">
            <span className="old-price">{formatMoney(offer.original_price)} F</span>
            <span className="promo-price">{formatMoney(offer.promo_price)} F</span>
          </div>
          {savings > 0 && <p className="offer-savings">💰 Économisez {formatMoney(savings)} F par rapport au prix d'origine</p>}
          <p className="offer-qty">Disponibilité : {offer.quantity} unité(s)</p>

          {offer.phone && (
            <a className="btn btn-primary btn-block" href={`tel:${offer.phone}`}>
              📞 Appeler
            </a>
          )}
          <a className="btn btn-whatsapp btn-block" href={whatsappLink(waMessage)} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon /> Commander sur WhatsApp
          </a>
        </div>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(false)}>
          <button className="lightbox-close" onClick={() => setLightbox(false)} aria-label="Fermer">✕</button>
          {photos.length > 1 && (
            <button
              className="lightbox-nav prev"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + photos.length) % photos.length); }}
              aria-label="Photo précédente"
            >‹</button>
          )}
          <img
            className="lightbox-img"
            src={photos[lightboxIndex]}
            alt={offer.name}
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <button
              className="lightbox-nav next"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i + 1) % photos.length); }}
              aria-label="Photo suivante"
            >›</button>
          )}
        </div>
      )}
    </main>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
    </svg>
  );
}
