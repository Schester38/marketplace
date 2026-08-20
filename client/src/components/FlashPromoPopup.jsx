import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { formatMoney } from './ProductCard.jsx';
import { countrySymbol } from '../config.js';
import { FlashCountdown, formatFlashTime } from './FlashPromo.jsx';

const ALLOWED_PATHS = ['/', '/shop', '/seller', '/client', '/creator', '/livreur'];
const MAX_DISPLAY = 4;
const ROTATE_MS = 6000;
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
  const [spin, setSpin] = useState(0);
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
          setIndex((i) => Math.min(i, Math.max(0, list.length - 1)));
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

  useEffect(() => {
    if (promos.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % promos.length);
      setSpin((s) => s + 1);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [promos.length]);

  const shown = useMemo(
    () => promos.filter((p) => new Date(p.ends_at).getTime() > now),
    [promos, now]
  );

  if (!allowed || !visible || shown.length === 0) return null;
  const promo = shown[Math.min(index, shown.length - 1)];
  if (!promo) return null;
  const symbol = countrySymbol(promo.shop_country);

  const close = () => {
    setVisible(false);
    markDismissed(promo.id);
  };

  return (
    <div className="flash-popup" key={spin} role="dialog" aria-label={t('Offre du jour')}>
      <button type="button" className="flash-popup-close" aria-label={t('Fermer')} onClick={close}>✕</button>
      <span className="flash-popup-badge">⚡ {t('OFFRE DU JOUR')}</span>
      <Link to={`/produit/${promo.product_id}`} className="flash-popup-body">
        {promo.image && <img src={promo.image} alt={promo.product_name} loading="lazy" decoding="async" />}
        <div className="flash-popup-info">
          <h3>{promo.product_name}</h3>
          <p className="flash-popup-shop">{promo.shop_name}</p>
          <p className="flash-popup-price">
            <span className="old-price">{formatMoney(promo.price)} {symbol}</span>
            <span className="price price-flash">{formatMoney(promo.promo_price)} {symbol}</span>
            <span className="badge badge-flash">-{promo.discount_percent || 0}%</span>
          </p>
          <FlashCountdown
            endsAt={promo.ends_at}
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
      {shown.length > 1 && (
        <div className="flash-popup-dots">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`dot${p.id === promo.id ? ' active' : ''}`}
              onClick={() => setIndex(shown.findIndex((x) => x.id === p.id))}
              aria-label={t("Voir l'offre")}
            />
          ))}
        </div>
      )}
    </div>
  );
}