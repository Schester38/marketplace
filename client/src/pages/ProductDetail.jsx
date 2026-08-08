import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import { formatMoney } from '../components/ProductCard.jsx';
import { whatsappLink, categoryEmoji } from '../config.js';
import { useAuth } from '../App.jsx';

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.52 14.9L2 22l5.24-1.47A9.9 9.9 0 1 0 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.35-.5.05-1.12.23-3.78-.78-3.2-1.23-5.24-4.42-5.4-4.63-.16-.2-1.29-1.72-1.29-3.28 0-1.56.82-2.33 1.11-2.65.29-.32.63-.4.84-.4.21 0 .42 0 .6.01.19.01.45-.07.7.54.26.62.88 2.15.96 2.31.08.16.13.35.03.56-.1.21-.15.34-.3.53-.15.19-.32.42-.45.56-.15.16-.31.33-.13.64.18.32.79 1.3 1.7 2.11 1.17 1.04 2.15 1.36 2.46 1.51.3.16.48.13.66-.08.18-.2.76-.88.96-1.19.2-.3.4-.25.68-.15.28.1 1.76.83 2.06.98.3.15.5.23.58.35.07.13.07.73-.17 1.4z" />
    </svg>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    api
      .getProduct(id)
      .then((d) => setProduct(d.product))
      .catch((e) => setError(e.message));
  }, [id]);

  const photos = product ? product.photos || [] : [];
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
        <Link to="/" className="btn btn-outline">← Retour aux produits</Link>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="container narrow">
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 260 }}></div>
        </div>
      </main>
    );
  }

  const isOwner = user && Number(user.id) === Number(product.shop_id);
  const deliveryFee = Number(product.delivery_fee || 0);
  const qty = Number(product.quantity || 0);
  const waMessage = `Bonjour, je suis intéressé(e) par le produit « ${product.name} » à ${formatMoney(product.price)} F (${product.shop_name}).`;

  const removeProduct = async () => {
    if (!window.confirm(`Retirer « ${product.name} » définitivement ?`)) return;
    setDeleting(true);
    try {
      await api.deleteProduct(product.id);
      navigate(isOwner ? '/shop' : '/');
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <main className="container narrow">
      <Seo
        title={`${product.name} — Mboppi`}
        description={`Découvrez « ${product.name} » à ${formatMoney(product.price)} F chez ${product.shop_name} sur Mboppi.`}
      />
      <Link to="/" className="btn btn-outline" style={{ marginBottom: 16 }}>
        ← Retour aux produits
      </Link>

      <div className="card offer-detail">
        <div
          className="offer-photo"
          style={{ height: 260, cursor: photos.length > 0 ? 'zoom-in' : undefined }}
          onClick={() => photos.length > 0 && setLightbox(true)}
        >
          {photos.length > 0 ? (
            <img src={photos[lightboxIndex]} alt={product.name} />
          ) : (
            <span>📦</span>
          )}
          {photos.length > 1 && (
            <span className="offer-photo-count">{photos.length} photos — cliquez pour agrandir</span>
          )}
        </div>

        {photos.length > 1 && (
          <div className="thumb-row">
            {photos.map((photo, i) => (
              <button
                key={i}
                type="button"
                className={`thumb-btn ${i === lightboxIndex ? 'active' : ''}`}
                onClick={() => setLightboxIndex(i)}
              >
                <img src={photo} alt={`Photo ${i + 1}`} />
              </button>
            ))}
          </div>
        )}

        <div className="offer-body">
          <div className="offer-tags">
            {product.category && <span className="badge badge-cat">{categoryEmoji(product.category)} {product.category}</span>}
          </div>
          <h2>{product.name}</h2>
          <p className="product-shop">Boutique : {product.shop_name}</p>
          {product.description && <p>{product.description}</p>}
          <div className="product-meta">
            {product.warranty > 0 && <span className="meta-chip">🛡️ Garantie {product.warranty} mois</span>}
            <span className="meta-chip">🚚 {deliveryFee > 0 ? `Livraison ${formatMoney(deliveryFee)} F` : 'Livraison gratuite'}</span>
            {product.contact && <span className="meta-chip">📞 {product.contact}</span>}
          </div>
          <div className="offer-prices">
            <span className="promo-price">{formatMoney(product.price)} F</span>
          </div>
          <p className={`offer-qty ${qty > 0 ? '' : 'out'}`}>
            {qty > 0 ? `Disponibilité : ${qty} en stock` : 'Rupture de stock'}
          </p>

          <a className="btn btn-whatsapp btn-block" href={whatsappLink(waMessage)} target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon /> Commander sur WhatsApp
          </a>

          {isOwner && (
            <button className="btn btn-danger btn-block" onClick={removeProduct} disabled={deleting}>
              {deleting ? 'Retrait…' : '🗑️ Rétirer ce produit'}
            </button>
          )}
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
            alt={product.name}
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
