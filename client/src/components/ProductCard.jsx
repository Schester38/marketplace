import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { countrySymbol, waLink } from '../config.js';
import { useAuth } from '../App.jsx';
import { useLang } from '../i18n.jsx';
import { useCart, useFavs } from '../store.jsx';
import {
  IconHeart, IconHeartFilled, IconWhatsApp, IconPackage,
  IconClock, IconFire, IconCart, IconStar, IconStarFilled, IconShieldCheck, IconCheck
} from './icons.jsx';

export function formatMoney(n) {
  return new Intl.NumberFormat('fr-FR').format(Number(n || 0));
}

function Stars({ value, size = 14 }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  const full = Math.round(v);
  return (
    <span className="stars-inline" style={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
      {[0, 1, 2, 3, 4].map((i) => (
        i < full
          ? <IconStarFilled key={i} size={size} style={{ color: '#f59e0b' }} />
          : <IconStar key={i} size={size} style={{ color: '#d1d5db' }} />
      ))}
    </span>
  );
}

export default function ProductCard({ product, action, onAction, secondaryAction, onSecondaryAction, showCommission, badge, extraAction }) {
  const { t } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart } = useCart();
  const { isFav, toggleFav } = useFavs();
  const [added, setAdded] = useState(false);
  const photo = (product.photos && product.photos[0]) || product.image;
  const qty = Number(product.quantity || 0);
  const symbol = countrySymbol(product?.shop_country);
  const fav = isFav(product.id);
  const sold = Number(product.sold || 0);
  const pendingCount = Number(product.pending_count || 0);
  const flash = product.flash_promo || null;
  const commission = Number(flash ? flash.commission : product.commission || 0);
  const flashOld = flash ? Number(product.price) : null;
  const oldPrice = Number(flashOld ?? (product.old_price === null || product.old_price === undefined ? null : product.old_price));
  const displayPrice = flash ? Number(flash.price) : Number(product.price);
  const hasPromo = oldPrice > 0 && oldPrice > displayPrice;
  const promoPct = hasPromo ? Math.round((1 - displayPrice / oldPrice) * 100) : 0;

  const add = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product, 1);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="card product-card">
      <Link to={`/produit/${product.id}`} className="product-link" aria-label={product.name}>
        <div className="product-thumb">
          {photo ? (
            <img src={photo} alt={product.name} loading="lazy" decoding="async" />
          ) : (
            <span className="product-thumb-fallback"><IconPackage size={40} /></span>
          )}
        </div>
      </Link>
      <button
        type="button"
        className={`fav-btn ${fav ? 'active' : ''}`}
        aria-label={fav ? t('Retirer des favoris') : t('Ajouter aux favoris')}
        title={fav ? t('Retirer des favoris') : t('Ajouter aux favoris')}
        onClick={() => {
          if (!user) {
            navigate('/login', { state: { from: location.pathname } });
            return;
          }
          toggleFav(product.id);
        }}
      >
        {fav ? <IconHeartFilled size={18} /> : <IconHeart size={18} />}
      </button>
      <a
        className="share-btn"
        href={waLink('', `${product.name} — ${displayPrice} ${symbol} sur Mboppi → https://${window.location.host}/produit/${product.id}`)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('Partager')}
        title={t('Partager')}
        onClick={(e) => e.stopPropagation()}
      >
        <IconWhatsApp size={18} />
      </a>
      {flash && <span className="badge badge-promo">-{flash.discount_percent}%</span>}
      {hasPromo && !flash && <span className="badge badge-promo">-{promoPct}%</span>}
      {pendingCount > 0 && <span className="badge badge-pending"><IconClock size={12} /> {pendingCount} {t('en attente')}</span>}
      {sold > 0 && <span className="badge badge-sold"><IconFire size={12} /> {sold} {t('vendus')}</span>}
      {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
      <Link to={`/produit/${product.id}`} className="product-body">
        <h3>{product.name}</h3>
        {product.review_count > 0 && (
          <p className="card-rating">
            <Stars value={product.rating_avg} size={13} />
            <span className="rating-count">
              {Number(product.rating_avg).toFixed(1)} ({product.review_count})
            </span>
          </p>
        )}
        {product.shop_name && (
          <p className="card-shop">
            <Link
              to={product.shop_role === 'creator' ? `/createur/${product.shop_id}` : `/boutique/${product.shop_id}`}
              onClick={(e) => e.stopPropagation()}
            >
              {product.shop_name} {product.shop_verified && <IconShieldCheck size={12} style={{ color: '#2563eb', verticalAlign: '-2px', display: 'inline-block' }} title={t('Boutique vérifiée')} />}
            </Link>
          </p>
        )}
        <div className="price-box">
          <span className="price-line">
            {hasPromo && <span className="old-price">{formatMoney(oldPrice)} {symbol}</span>}
            <span className={`price ${flash ? 'price-flash' : ''}`}>{formatMoney(displayPrice)} {symbol}</span>
          </span>
          {showCommission && (
            <span className="commission">+{formatMoney(commission)} {symbol}</span>
          )}
        </div>
        <p className={`stock-line ${qty > 0 ? '' : 'out'}`}>
          {qty > 0 ? t('En stock : {n}', { n: qty }) : t('Rupture de stock')}
        </p>
      </Link>
      <div className="card-actions">
        {action ? (
          <>
            <button className="btn btn-primary btn-block" onClick={() => onAction(product)}>{t(action)}</button>
            {secondaryAction && (
              <button className="btn btn-danger btn-block" onClick={() => onSecondaryAction(product)}>{t(secondaryAction)}</button>
            )}
            {extraAction && (
              <button className="btn btn-outline btn-block" onClick={() => extraAction.onClick(product)}>{extraAction.label}</button>
            )}
          </>
        ) : (
          <button
            className={`btn btn-block ${qty > 0 ? 'btn-cart' : ''} ${added ? 'bump' : ''}`}
            disabled={qty <= 0}
            onClick={add}
          >
            {added
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconCheck size={14} />{t('Ajouté au panier')}</span>
              : qty > 0
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconCart size={14} />{t('Ajouter au panier')}</span>
                : t('Rupture de stock')}
          </button>
        )}
      </div>
    </div>
  );
}
