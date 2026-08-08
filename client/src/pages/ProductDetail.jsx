import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import { formatMoney } from '../components/ProductCard.jsx';
import { whatsappLink, categoryEmoji } from '../config.js';
import { useAuth } from '../App.jsx';

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
