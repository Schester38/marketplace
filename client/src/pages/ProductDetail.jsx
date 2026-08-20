import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { api } from '../api.js';
import ProductCard, { formatMoney } from '../components/ProductCard.jsx';
import { countrySymbol, BASE_URL } from '../config.js';
import { whatsappLink, categoryEmoji } from '../config.js';
import { useAuth } from '../App.jsx';
import { useCart, useFavs } from '../store.jsx';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import Reviews from '../components/Reviews.jsx';
import Logo from '../components/Logo.jsx';
import ReviewQuote from '../components/ReviewQuote.jsx';

export default function ProductDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const sellerCode = params.get('code');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { t } = useLang();
  const { addToCart } = useCart();
  const { isFav, toggleFav } = useFavs();
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [shared, setShared] = useState(false);
  const [related, setRelated] = useState([]);

  useEffect(() => {
    setProduct(null);
    setError('');
    setRelated([]);
    setLightboxIndex(0);
    api
      .getProduct(id)
      .then((d) => {
        setProduct(d.product);
        setQty(1);
        try {
          const p = d.product;
          const prev = JSON.parse(localStorage.getItem('mboppi_recent') || '[]');
          const entry = {
            id: p.id,
            name: p.name,
            price: p.price,
            currency: p.currency,
            old_price: p.old_price,
            photos: p.photos,
            image: p.image,
            shop_name: p.shop_name,
            shop_role: p.shop_role,
            shop_id: p.shop_id,
            shop_verified: p.shop_verified,
            shop_country: p.shop_country,
            rating_avg: p.rating_avg,
            review_count: p.review_count,
            quantity: p.quantity,
            category: p.category,
          };
          const updated = [entry, ...(Array.isArray(prev) ? prev : []).filter((x) => Number(x.id) !== Number(p.id))].slice(0, 12);
          localStorage.setItem('mboppi_recent', JSON.stringify(updated));
        } catch {}
        const key = 'mboppi_view_product_' + id;
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, '1');
        } catch {}
        api.trackViews([{ type: 'product', id: Number(id) }]).catch(() => {});
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const refetchProduct = useCallback(() => {
    api
      .getProduct(id)
      .then((d) => setProduct(d.product))
      .catch(() => {});
  }, [id]);

  useRefreshOnFocus(refetchProduct);

  useEffect(() => {
    if (!product || !product.category) return;
    let mounted = true;
    api
      .listProducts({ category: product.category })
      .then((d) => {
        if (!mounted) return;
        setRelated(d.products.filter((p) => Number(p.id) !== Number(product.id)).slice(0, 4));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [product && product.id, product && product.category]);

  // Données structurées schema.org (Rich Results Google : prix, note, stock)
  useEffect(() => {
    if (!product) return;
    const inStock = Number(product.quantity || 0) > 0;
    const fp = product.flash_promo || null;
    const fPrice = fp ? Number(fp.price) : Number(product.price);
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      image: (product.photos && product.photos[0]) || product.image || undefined,
      description: product.description || product.name,
      sku: String(product.id),
      brand: { '@type': 'Brand', name: product.shop_name },
      offers: {
        '@type': 'Offer',
        url: `${BASE_URL}/produit/${product.id}`,
        price: Number(fPrice).toFixed(2),
        priceCurrency: (product.currency || 'XAF').toUpperCase(),
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        priceValidUntil: fp ? String(fp.ends_at).slice(0, 10) : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      },
      ...(Number(product.review_count) > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: String(Number(product.rating_avg || 0).toFixed(1)),
              reviewCount: String(product.review_count),
            },
          }
        : {}),
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify(jsonLd);
    const prev = document.head.querySelector('script[data-ssr]');
    if (prev) prev.remove();
    document.head.appendChild(el);
    return () => el.remove();
  }, [product && product.id, product && product.flash_promo && product.flash_promo.ends_at]);

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
        <Link to="/" className="btn btn-outline">← {t('Retour aux produits')}</Link>
      </main>
    );
  }

  if (!product || Number(product.id) !== Number(id)) {
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
  const symbol = countrySymbol(product?.shop_country);
  const inStock = Number(product.quantity || 0);
  const flash = product.flash_promo || null;
  const displayPrice = flash ? Number(flash.price) : Number(product.price);
  const oldPrice = Number(flash ? Number(product.price) : product.old_price === null || product.old_price === undefined ? null : Number(product.old_price));
  const hasPromo = oldPrice > 0 && oldPrice > displayPrice;

  const removeProduct = async () => {
    if (!window.confirm(t('Retirer « {name} » définitivement ?', { name: product.name }))) return;
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
        description={t('Découvrez « {name} » à {price} {symbol} chez {shop} sur Mboppi.', {
          name: product.name,
          price: formatMoney(flash ? flash.price : product.price),
          symbol,
          shop: product.shop_name,
        })}
      />
      <Link to="/" className="btn btn-outline" style={{ marginBottom: 16 }}>
        ← {t('Retour aux produits')}
      </Link>

      {sellerCode && (
        <div className="seller-cta card">
          <div>
            <strong><Logo className="logo-inline" /> {t('Ce produit vous est proposé par un vendeur Mboppi.')}</strong>
            <p className="hint" style={{ marginTop: 4 }}>
              {t('Code du vendeur : {code} — Confirmez votre achat pour le notifier, lui et la boutique.', { code: sellerCode })}
            </p>
          </div>
          <Link className="btn btn-primary" to={`/acheter/${product.id}?code=${sellerCode}`}>
            ✅ {t('Acheter')}
          </Link>
        </div>
      )}

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
            <span className="offer-photo-count">{t('{n} photos — cliquez pour agrandir', { n: photos.length })}</span>
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
                <img src={photo} alt={`${t('Photo')} ${i + 1}`} />
              </button>
            ))}
          </div>
        )}

        <div className="offer-body">
          <div className="offer-tags">
            {product.category && <span className="badge badge-cat">{categoryEmoji(product.category)} {t(product.category)}</span>}
          </div>
          <h2>{product.name}</h2>
          {product.review_count > 0 && (
            <p className="product-rating">
              <span className="stars stars-16">{'★'.repeat(Math.round(product.rating_avg))}</span>
              <strong>{product.rating_avg} / 5</strong>
              <span className="hint"> ({t('{n} avis', { n: product.review_count })})</span>
            </p>
          )}
          {product.review_count > 0 && <ReviewQuote productId={product.id} count={product.review_count} />}
          <p className="product-shop">
            <span className="shop-name-text">
              {t('Boutique : {shop}', { shop: product.shop_name })}
              {product.shop_verified && <span className="badge badge-verified" title={t('Boutique vérifiée')}>✓ {t('Vérifiée')}</span>}
            </span>
            {product.shop_location ? <span className="shop-loc"> · 📍 {product.shop_location}</span> : null}
          </p>
          {product.description && <p>{product.description}</p>}
          <div className="product-meta">
            {Number(product.sold_month) > 0 && <span className="meta-chip">🔥 {t('{n} vendus ce mois-ci', { n: product.sold_month })}</span>}
            {Number(product.sold) > 0 && <span className="meta-chip">🔥 {t('{n} vendus', { n: product.sold })}</span>}
            {Number(product.pending_count) > 0 && <span className="meta-chip">⏳ {t('{n} en attente', { n: product.pending_count })}</span>}
            {product.warranty && <span className="meta-chip">🛡️ {t('Garantie : {warranty}', { warranty: product.warranty })}</span>}
            <span className="meta-chip">🚚 {deliveryFee > 0 ? t('Livraison {price} {symbol}', { price: formatMoney(deliveryFee), symbol }) : t('Livraison gratuite')}</span>
            <span className="meta-chip">⏱️ {t('Livraison Rapide')}</span>
            <span className="meta-chip">🛡️ {t('Satisfait ou remboursé')}</span>
            {product.contact && <span className="meta-chip">📞 {product.contact}</span>}
          </div>
          <div className="offer-prices">
            {hasPromo && <span className="old-price">{formatMoney(oldPrice)} {symbol}</span>}
            <span className={`promo-price ${flash ? 'price-flash' : ''}`}>{formatMoney(displayPrice)} {symbol}</span>
          </div>
          {flash && (
            <p className="flash-detail-hint">
              ⚡ {t('Offre éclair')} — {t('{n}% de réduction', { n: flash.discount_percent })} · {t('se termine le {date}', { date: new Date(flash.ends_at).toLocaleString() })}
            </p>
          )}
          <p className={`offer-qty ${inStock > 0 ? '' : 'out'}`}>
            {inStock > 0 ? t('Disponibilité : {n} en stock', { n: inStock }) : t('Rupture de stock')}
          </p>

          {inStock > 0 && !isOwner && (
            <div className="buy-row">
              <div className="qty-stepper">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="-">−</button>
                <span>{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(Number(product.quantity) || 99, q + 1))} aria-label="+">+</button>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => {
                  addToCart(product, qty);
                  setAdded(true);
                  setTimeout(() => setAdded(false), 1500);
                }}
              >
                {added ? t('Ajouté au panier ✓') : `🛒 ${t('Ajouter au panier')}`}
              </button>
            </div>
          )}

          <div className="detail-actions">
            <button
              type="button"
              className={`btn btn-outline ${isFav(product.id) ? 'fav-on' : ''}`}
              onClick={() => {
                if (!user) {
                  navigate('/login', { state: { from: location.pathname } });
                  return;
                }
                toggleFav(product.id);
              }}
            >
              {isFav(product.id) ? '❤️ ' + t('Retirer des favoris') : '🤍 ' + t('Ajouter aux favoris')}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={async () => {
                const url = `${BASE_URL}/produit/${product.id}`;
                const text = t('Découvrez « {name} » à {price} {symbol} sur Mboppi.', {
                  name: product.name,
                  price: formatMoney(displayPrice),
                  symbol,
                });
                try {
                  if (navigator.share) {
                    await navigator.share({ title: product.name, text, url });
                  } else {
                    await navigator.clipboard.writeText(url);
                    setShared(true);
                    setTimeout(() => setShared(false), 2000);
                  }
                } catch {
                  /* annulé par l'utilisateur */
                }
              }}
            >
              {shared ? t('Lien copié !') : '🔗 ' + t('Partager')}
            </button>
          </div>

          {isOwner && (
            <button className="btn btn-danger btn-block" onClick={removeProduct} disabled={deleting}>
              {deleting ? t('Retrait…') : t('🗑️ Rétirer ce produit')}
            </button>
          )}
        </div>
      </div>

      <Reviews product={product} />

      {related.length > 0 && (
        <section>
          <h2 className="section-title">{t('✨ Produits similaires')}</h2>
          <div className="grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(false)}>
          <button className="lightbox-close" onClick={() => setLightbox(false)} aria-label={t('Fermer')}>✕</button>
          {photos.length > 1 && (
            <button
              className="lightbox-nav prev"
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + photos.length) % photos.length); }}
              aria-label={t('Photo précédente')}
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
              aria-label={t('Photo suivante')}
            >›</button>
          )}
        </div>
      )}
    </main>
  );
}
