import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';
import { PRODUCT_CATEGORIES } from '../config.js';

export default function Home() {
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('recent');
  const produitsRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api
      .listProducts({ search, category, sort })
      .then((d) => {
        if (!mounted) return;
        setProducts(d.products);
      })
      .catch((e) => mounted && setError(e.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [search, category, sort]);

  const shopsCount = new Set(products.map((p) => p.shop_id)).size;

  const goToProducts = () => {
    produitsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitSearch = (e) => {
    e.preventDefault();
    goToProducts();
  };

  return (
    <main className="container">
      <Seo
        title="Mboppi — Boutiques, vendeurs et offres du moment"
        description="Le marché de votre quartier en ligne : produits des boutiques partenaires, vente avec commissions, commande par WhatsApp."
      />

      <section className="hero vitrine-hero">
        <div className="hero-floats" aria-hidden="true">
          <span>🛍️</span>
          <span>💸</span>
          <span>🛒</span>
          <span>✨</span>
          <span>💰</span>
          <span>🎊</span>
        </div>
        <span className="hero-badge">🛍️ {t('Bienvenue chez Mboppi')}</span>
        <h1>{t('Le marché du quartier, en un clic')}</h1>
        <p>{t('Découvrez les boutiques du quartier, les meilleures offres et commandez facilement sur WhatsApp.')}</p>

        <form className="hero-search" onSubmit={submitSearch} role="search">
          <span className="emoji" aria-hidden="true">🔍</span>
          <input
            type="search"
            placeholder={t('Rechercher un produit, une boutique…')}
            aria-label={t('Rechercher un produit, une boutique…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">{t('Rechercher')}</button>
        </form>

        <div className="hero-stats">
          <div className="stat">
            <strong>{products.length}</strong>
            <span>{t('produits en ligne')}</span>
          </div>
          <div className="stat">
            <strong>{shopsCount}</strong>
            <span>{t('boutiques partenaires')}</span>
          </div>
        </div>
      </section>

      <section ref={produitsRef} aria-label={t('Produits')} style={{ scrollMarginTop: 80 }}>
        <div className="section-head">
          <h2 className="section-title">🛍️ {t('Produits')}</h2>
          {category && (
            <button type="button" className="section-link" onClick={() => setCategory('')}>
              ✕ {t('Réinitialiser les filtres')}
            </button>
          )}
        </div>
        <div className="toolbar">
          <select
            className="input filter-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label={t('Filtrer par catégorie')}
          >
            <option value="">{t('Toutes les catégories')}</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(c)}</option>
            ))}
          </select>
          <select
            className="input filter-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label={t('Trier')}
          >
            <option value="recent">{t('Plus récents')}</option>
            <option value="popular">{t('🔥 Plus populaires')}</option>
            <option value="price_asc">{t('Prix croissant')}</option>
            <option value="price_desc">{t('Prix décroissant')}</option>
          </select>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {loading ? (
          <div className="grid">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card product-card skeleton" aria-hidden="true">
                <div className="skeleton-block skeleton-photo"></div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="card page-center">
            <p className="empty">
              {category
                ? t('Aucun produit dans cette catégorie.')
                : search
                  ? t('Aucun résultat pour votre recherche.')
                  : t('Aucun produit disponible.')}
            </p>
          </div>
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
