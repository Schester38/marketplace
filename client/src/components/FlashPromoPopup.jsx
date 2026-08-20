import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { formatMoney } from './ProductCard.jsx';
import { countrySymbol } from '../config.js';
import { FlashCountdown, formatFlashTime } from './FlashPromo.jsx';

const ALLOWED_PATHS = ['/', '/shop', '/seller', '/client', '/creator', '/livreur'];
const MAX_DISPLAY = 4;
const ROTATE_MS = 5000;
const REFRESH_MS = 30000;

function isDismissed(id) {
  try {
    const map = JSON.parse(localStorage.getItem('mboppi_flash_dismissed') || '{}');
    return map[id] === new Date().toDateString();
  } catch {
    return false;
  }
}

function markDismissed(id) {
  try {
    const map = JSON.parse(localStorage.getItem('mboppi_flash_dismissed') || '{}');
    map[id] = new Date().toDateString();
    localStorage.setItem('mboppi_flash_dismissed', JSON.stringify(map));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export default function FlashPromoPopup() {
  const { t } = useLang();
  const location = useLocation();
  const [promos, setPromos] = useState([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const allowed = ALLOWED_PATHS.includes(location.pathname);

  useEffect(() => {
    if (!allowed) return;
    let ok = true;
    const load = () => {
      api
        .flashPromotions()
        .then((d) => {
          if (!ok) return;
          const list = (d.promotions || [])
            .filter((p) => !isDismissed(p.id))
            .slice(0, MAX_DISPLAY);
          setPromos(list);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      ok = false;
      clearInterval(id);
    };
  }, [allowed]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const shown = useMemo(
    () => promos.filter((p) => new Date(p.ends_at).getTime() > now),
    [promos, now]
  );

  useEffect(() => {
    if (shown.length > 1) setIndex(0);
  }, [shown.length]);

  useEffect(() => {
    if (shown.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % shown.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [shown.length]);

  if (!allowed || !visible || shown.length === 0) return null;

  const active = shown[Math.min(index, shown.length - 1)];
  if (!active) return null;

  const close = () => {
    setVisible(false);
    shown.forEach((p) => markDismissed(p.id));
  };

  return (
    <div className="flash-popup-stack" role="dialog" aria-label={t('Promotions du jour')}>
      {shown.map((p, i) => {
        const depth = (i - Math.min(index, shown.length - 1) + shown.length) % shown.length;
        const symbol = countrySymbol(p.shop_country);
        return (
          <div
            key={p.id}
            className={`flash-popup${depth === 0 ? ' flash-popup-active' : ''}`}
            style={{ zIndex: 1000 + (shown.length - depth) }}
            aria-hidden={depth > 0}
            tabIndex={depth > 0 ? -1 : undefined}
          >
            {depth === 0 && (
              <button type="button" className="flash-popup-close" aria-label={t('Fermer')} onClick={close}>✕</button>
            )}
            <span className="flash-popup-title">⚡ {t('PROMOTION DU JOUR')}</span>
            <Link to={`/produit/${p.product_id}`} className="flash-popup-body" tabIndex={depth > 0 ? -1 : undefined}>
              {p.image && <img src={p.image} alt={p.product_name} loading="lazy" decoding="async" />}
              <div className="flash-popup-info">
                <h3>{p.product_name}</h3>
                <p className="flash-popup-shop">{p.shop_name}</p>
                <p className="flash-popup-price">
                  <span className="old-price">{formatMoney(p.price)} {symbol}</span>
                  <span className="price price-flash">{formatMoney(p.promo_price)} {symbol}</span>
                  <span className="badge badge-flash">-{p.discount_percent || 0}%</span>
                </p>
                <FlashCountdown
                  endsAt={p.ends_at}
                  render={({ remains, ended }) =>
                    ended ? (
                      <span className="flash-countdown ended">⏰ {t('Terminée')}</span>
                    ) : (
                      <span className="flash-countdown flash-countdown-big">⏰ {formatFlashTime(remains)}</span>
                    )
                  }
                />
                <span className="flash-popup-cta">{t("Voir l'offre")} →</span>
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}