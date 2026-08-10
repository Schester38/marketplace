import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';
import { PRODUCT_CATEGORIES } from '../config.js';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import { useAuth } from '../App.jsx';

export default function Home() {
  const { t } = useLang();
  const { user } = useAuth();
  const mounted = useRef(true);
  const hasLoaded = useRef(false);
  const [products, setProducts] = useState(() => {
    try {
      const cached = sessionStorage.getItem('mboppi_products');
      const arr = cached ? JSON.parse(cached) : null;
      if (Array.isArray(arr) && arr.length) {
        hasLoaded.current = true;
        return arr;
      }
    } catch {
      /* cache invalide : on ignore */
    }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('recent');
  const [scope, setScope] = useState('product');
  const produitsRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 150);
    return () => clearTimeout(id);
  }, [search]);

  const loadProducts = useCallback(
    (silent) => {
      if (!user) {
        setProducts([]);
        setLoading(false);
        return;
      }
      if (!silent && !hasLoaded.current) setLoading(true);
      api
        .listProducts({ search: debouncedSearch, category, sort, scope })
        .then((d) => {
          if (mounted.current) {
            hasLoaded.current = true;
            setProducts(d.products);
            setError('');
            if (!debouncedSearch && !category && sort === 'recent' && scope === 'product') {
              try {
                sessionStorage.setItem('mboppi_products', JSON.stringify(d.products));
              } catch {
                /* stockage indisponible : on ignore */
              }
            }
          }
        })
        .catch((e) => mounted.current && setError(e.message))
        .finally(() => mounted.current && setLoading(false));
    },
    [user, debouncedSearch, category, sort, scope]
  );

  useEffect(() => {
    mounted.current = true;
    loadProducts();
    return () => {
      mounted.current = false;
    };
  }, [loadProducts]);

  useRefreshOnFocus(() => loadProducts(true));

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
        description="Le marché de votre quartier en ligne : produits des boutiques, créations des créateurs, vente avec commissions, commande avec livraison."
      />

      {!user && (
        <>
      <section className="hero vitrine-hero">
        <div className="hero-floats" aria-hidden="true">
          <span>🛍️</span>
          <span>💸</span>
          <span>🛒</span>
          <span>✨</span>
          <span>💰</span>
          <span>🎊</span>
        </div>
        <span className="hero-badge">🛍️ {t('BIENVENUE SUR MBOPPI')}</span>
        <h1>{t('Mboppi, le marché de votre quartier, en ligne')}</h1>
        <p>
          {t("Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans prix écrasant et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les créateurs exposent leurs talents, juste avec un téléphone et une connexion internet, les vendeurs vendent et gagnent des commissions, et les clients trouvent tout au même endroit avec satisfaction, sans se déplacer.")}
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn btn-primary btn-xl">{t('Créer un compte gratuit')}</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t('Comment ça marche ?')}</h2>
          <p>{t('Un rôle pour chacun, une plateforme pour tous.')}</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-icon">🏪</div>
            <div className="step-num">1</div>
            <h3>{t('Boutique')}</h3>
            <p>{t('Publiez vos produits et recevez les commandes.')}</p>
          </div>
          <div className="step">
            <div className="step-icon">🎨</div>
            <div className="step-num">2</div>
            <h3>{t('Créateur')}</h3>
            <p>{t('Exposez vos créations et touchez un public plus large.')}</p>
          </div>
          <div className="step">
            <div className="step-icon">🛒</div>
            <div className="step-num">3</div>
            <h3>{t('Vendeur')}</h3>
            <p>{t('Vendez en ligne et gagnez une commission sur chaque vente.')}</p>
          </div>
          <div className="step">
            <div className="step-icon">🛍️</div>
            <div className="step-num">4</div>
            <h3>{t('Client')}</h3>
            <p>{t('Commandez en un clic et recevez chez vous avec un livreur.')}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t('Nos valeurs')}</h2>
          <p>{t('Ce qui nous pousse chaque jour.')}</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-icon">🤝</div>
            <h3>{t('La confiance')}</h3>
            <p>{t('Des commandes simples, des contacts directs avec les vendeurs.')}</p>
          </div>
          <div className="step">
            <div className="step-icon">📱</div>
            <h3>{t('La proximité')}</h3>
            <p>{t('Commander avec son téléphone, sans carte bancaire ni frais cachés.')}</p>
          </div>
          <div className="step">
            <div className="step-icon">⚡</div>
            <h3>{t('La rapidité')}</h3>
            <p>{t('Une plateforme légère, qui s\'affiche vite, même en 3G.')}</p>
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <h2>{t("Prêt à rejoindre l'aventure ?")}</h2>
        <p>{t("Créez votre compte gratuitement en moins d'une minute.")}</p>
        <Link to="/register" className="btn btn-primary btn-xl">{t('Créer mon compte')}</Link>
      </section>
        </>
      )}

      {user && (
        <section ref={produitsRef} aria-label={t('Produits')} style={{ scrollMarginTop: 80 }}>
          <div className="section-head">
            <h2 className="section-title">🛍️ {t('Produits et créations')}</h2>
            {category && (
              <button type="button" className="section-link" onClick={() => setCategory('')}>
                ✕ {t('Réinitialiser les filtres')}
              </button>
            )}
          </div>
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
            <select
              className="input filter-select"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              aria-label={t('Type de recherche')}
            >
              <option value="product">{t('Rechercher un produit')}</option>
              <option value="shop">{t('Rechercher une boutique')}</option>
              <option value="creation">{t('Rechercher une création')}</option>
            </select>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          {loading && !hasLoaded.current ? (
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
      )}
    </main>
  );
}
