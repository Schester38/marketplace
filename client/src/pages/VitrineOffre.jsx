import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import OfferCard from '../components/OfferCard.jsx';
import { formatMoney } from '../components/ProductCard.jsx';
import { offerDiscount, categoryEmoji, currencySymbol } from '../config.js';
import Seo from '../components/Seo.jsx';
import Logo from '../components/Logo.jsx';
import { useLang } from '../i18n.jsx';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';

function SkeletonCard() {
  return (
    <div className="card offer-card skeleton">
      <div className="skeleton-block skeleton-photo"></div>
      <div className="offer-body">
        <div className="skeleton-block" style={{ height: 18, width: '70%' }}></div>
        <div className="skeleton-block" style={{ height: 12, width: '90%' }}></div>
        <div className="skeleton-block" style={{ height: 34, width: '100%' }}></div>
        <div className="skeleton-block" style={{ height: 34, width: '100%' }}></div>
      </div>
    </div>
  );
}

export default function VitrineOffre() {
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('discount');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);

  const load = useCallback((silent) => {
    if (!silent) setLoading(true);
    Promise.all([api.listProducts(), api.listOffers()])
      .then(([p, o]) => {
        if (!mounted.current) return;
        setProducts(p.products);
        setOffers(o.offers);
      })
      .catch((e) => mounted.current && setError(e.message))
      .finally(() => mounted.current && setLoading(false));
  }, []);

  useEffect(() => {
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useRefreshOnFocus(() => load(true));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const categories = useMemo(
    () => [...new Set(offers.map((o) => o.category).filter(Boolean))],
    [offers]
  );

  const totalSavings = useMemo(
    () =>
      offers.reduce(
        (sum, o) => sum + Math.max(0, Math.round(o.original_price - o.promo_price)),
        0
      ),
    [offers]
  );

  const offerSymbol = useMemo(() => currencySymbol(offers[0]?.currency || 'XAF'), [offers]);

  const topOffers = useMemo(
    () => [...offers].sort((a, b) => offerDiscount(b) - offerDiscount(a)).slice(0, 5),
    [offers]
  );

  const filtered = useMemo(() => {
    let list = offers;
    if (category !== 'all') list = list.filter((o) => o.category === category);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((o) =>
        `${o.name} ${o.description || ''} ${o.category || ''}`.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === 'discount') sorted.sort((a, b) => offerDiscount(b) - offerDiscount(a));
    else if (sort === 'price') sorted.sort((a, b) => a.promo_price - b.promo_price);
    else sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return sorted;
  }, [offers, category, query, sort]);

  const toMidnight = useMemo(() => {
    const end = new Date();
    end.setHours(24, 0, 0, 0);
    const ms = Math.max(0, end - now);
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }, [now]);

  const resetFilters = () => {
    setCategory('all');
    setSort('discount');
    setQuery('');
  };

  return (
    <main className="container">
      <Seo
        title={t("Vitrine d'offre") + ' — Mboppi'}
        description={t('Découvrez les meilleures offres du moment.')}
      />
      <section className="hero vitrine-hero">
        <div className="hero-floats" aria-hidden="true">
          <span className="logo-float"><Logo className="hero-float-logo" /></span>
          <span>⚡</span>
          <span>💥</span>
          <span>✨</span>
          <span>🛒</span>
          <span>🎉</span>
        </div>
        <span className="hero-badge">{t('⚡ Promotions en cours')}</span>
        <h1>{t('🔥 Les offres du moment')}</h1>
        <p>
          {t('Les meilleures promotions de Verone et des boutiques partenaires : prix cassés, économies garanties, commande directe par téléphone ou WhatsApp.')}
        </p>
        <div className="hero-stats">
          <div className="stat">
            <strong>{offers.length}</strong>
            <span>{t('Offres actives')}</span>
          </div>
          <div className="stat">
            <strong>{formatMoney(totalSavings)} {offerSymbol}</strong>
            <span>{t('Économies cumulées')}</span>
          </div>
          <div className="stat">
            <strong>{categories.length}</strong>
            <span>{t('Catégories')}</span>
          </div>
        </div>
        <div className="hero-countdown">
          {t('⏰ Les offres se renouvellent dans {time}', { time: toMidnight })}
        </div>
      </section>

      {topOffers.length > 0 && (
        <div className="ticker" aria-hidden="true">
          <div className="ticker-track">
            {[...topOffers, ...topOffers].map((o, i) => (
              <span key={i} className="ticker-item">
                🔥 {o.name} {offerDiscount(o) > 0 ? `− ${offerDiscount(o)}%` : ''} —{' '}
                <b>{formatMoney(o.promo_price)} {offerSymbol}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <section>
        <h2 className="section-title">{t('Offres promotionnelles')}</h2>

        <div className="toolbar">
          <input
            className="input search"
            placeholder={t('🔍 Rechercher une offre…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="chips">
            <button
              className={`chip ${category === 'all' ? 'active' : ''}`}
              onClick={() => setCategory('all')}
            >
              {t('✨ Toutes ({n})', { n: offers.length })}
            </button>
            {categories.map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? 'active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {categoryEmoji(c)} {t(c)}
              </button>
            ))}
          </div>
          <div className="sort-row">
            <button
              className={`sort-btn ${sort === 'discount' ? 'active' : ''}`}
              onClick={() => setSort('discount')}
            >
              {t('🔥 Meilleures réductions')}
            </button>
            <button
              className={`sort-btn ${sort === 'price' ? 'active' : ''}`}
              onClick={() => setSort('price')}
            >
              {t('💰 Moins cher')}
            </button>
            <button
              className={`sort-btn ${sort === 'latest' ? 'active' : ''}`}
              onClick={() => setSort('latest')}
            >
              {t('✨ Dernières arrivées')}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card page-center">
            <div className="verone-placeholder">🔍</div>
            <p className="empty" style={{ padding: '8px 0 16px' }}>
              {offers.length === 0
                ? t('Aucune offre pour le moment. Revenez très vite, ça va chauffer ! 🔥')
                : t('Aucune offre ne correspond à votre recherche.')}
            </p>
            {offers.length > 0 && (
              <button className="btn btn-outline" onClick={resetFilters}>
                {t('Réinitialiser les filtres')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid">
            {filtered.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title">{t('🏪 Produits des boutiques')}</h2>
        {loading ? (
          <div className="grid">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <p className="empty">{t('Aucun produit disponible pour le moment.')}</p>
        ) : (
          <div className="grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
