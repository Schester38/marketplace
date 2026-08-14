import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';

function timeAgo(iso, locale) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return locale === 'en' ? `${mins} min ago` : `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return locale === 'en' ? `${hours} h ago` : `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return locale === 'en' ? `${days} days ago` : `il y a ${days} j`;
}

export default function RecentSales() {
  const { t, locale } = useLang();
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let mounted = true;
    api
      .recentSales()
      .then((d) => {
        if (mounted && d.recent && d.recent.length) setItems(d.recent);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const iv = setInterval(() => setIdx((i) => (i + 1) % items.length), 6000);
    return () => clearInterval(iv);
  }, [items.length]);

  if (!items.length) return null;
  const it = items[idx];
  return (
    <div className="recent-sales" role="status">
      <span className="recent-sales-icon" aria-hidden="true">🛍️</span>
      <span className="recent-sales-text">
        {t('{city} — « {product} » commandé chez {shop}', {
          city: it.buyer_city || t('Un client'),
          product: it.product_name,
          shop: it.shop_name,
        })}
      </span>
      <span className="recent-sales-ago">· {timeAgo(it.created_at, locale)}</span>
    </div>
  );
}
