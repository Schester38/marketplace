import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from './ProductCard.jsx';
import { countrySymbol } from '../config.js';
import { useLang } from '../i18n.jsx';

export function formatFlashTime(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

export function FlashCountdown({ endsAt, render }) {
  const now = useNow();
  const remains = new Date(endsAt).getTime() - now;
  const ended = remains <= 0;
  if (render) return render({ remains: Math.max(0, remains), ended });
  return <span className="flash-countdown">⏰ {formatFlashTime(remains)}</span>;
}

export default function FlashPromoCard({ promo, onDelete, showShop = true }) {
  const { t } = useLang();
  const symbol = countrySymbol(promo.shop_country);
  const image = promo.image;
  return (
    <div className="card product-card flash-promo-card">
      <Link to={`/produit/${promo.product_id}`} className="product-link" aria-label={promo.product_name}>
        <div className="product-thumb">
          {image ? <img src={image} alt={promo.product_name} loading="lazy" decoding="async" /> : <span>⚡</span>}
        </div>
      </Link>
      <span className="badge badge-flash">⚡ -{promo.discount_percent || 0}%</span>
      {onDelete && (
        <button type="button" className="btn btn-small btn-danger flash-delete" onClick={() => onDelete(promo)}>
          {t('Annuler')}
        </button>
      )}
      <Link to={`/produit/${promo.product_id}`} className="product-body">
        <h3>{promo.product_name}</h3>
        {showShop && promo.shop_name && <p className="card-shop">{promo.shop_name}</p>}
        <FlashCountdown
          endsAt={promo.ends_at}
          render={({ remains, ended }) =>
            ended ? (
              <span className="flash-countdown ended">⏰ {t('Terminée')}</span>
            ) : (
              <span className="flash-countdown">⏰ {formatFlashTime(remains)}</span>
            )
          }
        />
        <div className="price-box">
          <span className="price-line">
            <span className="old-price">{formatMoney(promo.price)} {symbol}</span>
            <span className="price price-flash">{formatMoney(promo.promo_price)} {symbol}</span>
          </span>
        </div>
      </Link>
    </div>
  );
}