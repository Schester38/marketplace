import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import Seo from '../components/Seo.jsx';
import RecentSales from '../components/RecentSales.jsx';
import Logo from '../components/Logo.jsx';
import { useLang } from '../i18n.jsx';
import { PRODUCT_CATEGORIES } from '../config.js';
import { useRefreshOnFocus } from '../useRefreshOnFocus.js';
import { useAuth } from '../App.jsx';

function mergeUnique(prev, next) {
  if (!prev.length) return next;
  const seen = new Set(prev.map((p) => p.id));
  return [...prev, ...next.filter((p) => !seen.has(p.id))];
}

export default function Home() {
  const { t } = useLang();
  const { user } = useAuth();
  const mounted = useRef(true);
  const hasLoaded = useRef(false);
  const hasData = useRef(false);
  const retryRef = useRef(0);
  const [products, setProducts] = useState(() => {
    try {
      const cached = sessionStorage.getItem('mboppi_products');
      const arr = cached ? JSON.parse(cached) : null;
      if (Array.isArray(arr) && arr.length) {
        hasLoaded.current = true;
        hasData.current = true;
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
  const [sort, setSort] = useState('popular');
  const [scope, setScope] = useState('product');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [mode, setMode] = useState('products');
  const [cityInput, setCityInput] = useState('');
  const [city, setCity] = useState('');
  const [shops, setShops] = useState([]);
  const [cityProducts, setCityProducts] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [shopsError, setShopsError] = useState('');
  const PER_PAGE = 24;
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const appendRef = useRef(false);
  const produitsRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 150);
    return () => clearTimeout(id);
  }, [search]);

const loadProducts = useCallback(
    (silent, append) => {
      if (!silent && !hasLoaded.current) setLoading(true);
      api
        .listProducts({
          search: debouncedSearch,
          category,
          sort,
          scope,
          min_price: minPrice === '' ? undefined : minPrice,
          max_price: maxPrice === '' ? undefined : maxPrice,
          limit: PER_PAGE,
          offset,
        })
        .then((d) => {
          if (mounted.current) {
            hasLoaded.current = true;
            const next = d.products || [];
            const unfiltered = !debouncedSearch && !category && !minPrice && !maxPrice && scope === 'product';
            if (next.length === 0 && hasData.current && unfiltered) {
              setError('');
            } else {
              setHasMore(Boolean(d.hasMore));
              setProducts((prev) => (append ? mergeUnique(prev, next) : next));
              hasData.current = d.total != null ? d.total > 0 : next.length > 0;
              if (next.length > 0) retryRef.current = 0;
              setError('');
            }
            if (unfiltered && sort === 'recent' && !append) {
              try {
                sessionStorage.setItem('mboppi_products', JSON.stringify(next));
              } catch {
                /* stockage indisponible : on ignore */
              }
            }
          }
        })
        .catch((e) => mounted.current && setError(e.message))
        .finally(() => {
          if (mounted.current) {
            setLoading(false);
            setLoadingMore(false);
            if (
              hasLoaded.current &&
              !debouncedSearch &&
              !category &&
              !minPrice &&
              !maxPrice &&
              scope === 'product' &&
              retryRef.current < 2
            ) {
              retryRef.current += 1;
              setTimeout(() => loadProducts(true), 900);
            }
          }
        });
    },
    [user, debouncedSearch, category, sort, scope, minPrice, maxPrice, offset]

  );

  useEffect(() => {
    mounted.current = true;
    loadProducts(false, appendRef.current);
    appendRef.current = false;
    return () => {
      mounted.current = false;
    };
  }, [loadProducts]);

  useRefreshOnFocus(() => loadProducts(true));

  useEffect(() => {
    if (mode !== 'city') return;
    const id = setTimeout(() => setCity(cityInput.trim()), 500);
    return () => clearTimeout(id);
  }, [cityInput, mode]);

  useEffect(() => {
    if (mode !== 'city' || !city) return;
    let ok = true;
    setShopsLoading(true);
    setShopsError('');
    Promise.all([api.listShops({ city }), api.listProducts({ city })])
      .then(([shopsRes, productsRes]) => {
        if (ok) {
          setShops(shopsRes.shops || []);
          setCityProducts(productsRes.products || []);
        }
      })
      .catch((e) => ok && setShopsError(e.message))
      .finally(() => ok && setShopsLoading(false));
    return () => {
      ok = false;
    };
  }, [mode, city]);

  const goToProducts = () => {
    produitsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitSearch = (e) => {
    e.preventDefault();
    goToProducts();
  };

  const loadMore = () => {
    appendRef.current = true;
    setLoadingMore(true);
    setOffset((o) => o + PER_PAGE);
  };

  const changeFilter = (setter) => (e) => {
    setter(e.target.value);
    setOffset(0);
  };

  return (
    <main className="container">
      <Seo
        title="Mboppi — Boutiques, vendeurs et offres du moment"
        description="Le marché de votre quartier en ligne : produits des boutiques, créations des créateurs, vente avec commissions, commande avec livraison."
      />

      <RecentSales />

      {!user && (
        <>
      <section className="hero vitrine-hero">
        <div className="hero-floats" aria-hidden="true">
          <span className="logo-float"><Logo className="hero-float-logo" /></span>
          <span>💸</span>
          <span>🛒</span>
          <span>✨</span>
          <span>💰</span>
          <span>🎊</span>
        </div>
        <span className="hero-badge"><Logo className="logo-inline" /> {t('BIENVENUE SUR MBOPPI')}</span>
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
            <div className="step-icon"><Logo className="logo-inline" /></div>
            <div className="step-num">4</div>
            <h3>{t('Client')}</h3>
            <p>{t('Commandez en un clic et recevez chez vous avec un livreur.')}</p>
          </div>
          <div className="step">
            <div className="step-icon">🛵</div>
            <div className="step-num">5</div>
            <h3>{t('Livreur')}</h3>
            <p>{t('Livrez les articles commandés et confirmez l\'achat.')}</p>
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

      <section ref={produitsRef} aria-label={t('Produits')} style={{ scrollMarginTop: 80 }}>
          <div className="section-head">
            <h2 className="section-title"><Logo className="logo-inline" /> {t('Produits et créations')}</h2>
            {category || minPrice || maxPrice ? (
              <button
                type="button"
                className="section-link"
                onClick={() => {
                  setCategory('');
                  setMinPrice('');
                  setMaxPrice('');
                }}
              >
                ✕ {t('Réinitialiser les filtres')}
              </button>
            ) : null}
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
          <div className="view-switch">
            <button
              type="button"
              className={`btn ${mode === 'products' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setMode('products')}
            >
              <Logo className="logo-inline" /> {t('Voir tous les produits')}
            </button>
            <button
              type="button"
              className={`btn ${mode === 'city' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setMode('city')}
            >
              📍 {t('Voir par ville')}
            </button>
          </div>
          <div className="toolbar">
            <select
              className="input filter-select"
              value={category}
              onChange={changeFilter(setCategory)}
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
              onChange={changeFilter(setSort)}
              aria-label={t('Trier')}
            >
              <option value="recent">{t('Plus récents')}</option>
              <option value="popular">{t('🔥 Plus populaires')}</option>
              <option value="rating">{t('⭐ Mieux notés')}</option>
              <option value="price_asc">{t('Prix croissant')}</option>
              <option value="price_desc">{t('Prix décroissant')}</option>
            </select>
            <input
              className="input filter-price"
              type="number"
              min="0"
              placeholder={t('Prix min')}
              aria-label={t('Prix minimum')}
              value={minPrice}
              onChange={changeFilter(setMinPrice)}
            />
            <input
              className="input filter-price"
              type="number"
              min="0"
              placeholder={t('Prix max')}
              aria-label={t('Prix maximum')}
              value={maxPrice}
              onChange={changeFilter(setMaxPrice)}
            />
            <select
              className="input filter-select"
              value={scope}
              onChange={changeFilter(setScope)}
              aria-label={t('Type de recherche')}
            >
              <option value="product">{t('Rechercher un produit')}</option>
              <option value="shop">{t('Rechercher une boutique')}</option>
              <option value="creation">{t('Rechercher une création')}</option>
            </select>
          </div>
          {error && mode === 'products' && <p className="error" role="alert">{error}</p>}
          {mode === 'city' ? (
            <div className="city-shops">
              <form
                className="city-search"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  setCity(cityInput.trim());
                }}
              >
                <input
                  type="search"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder={t('Saisir une ville (ex : Yaoundé)…')}
                  aria-label={t('Saisir une ville')}
                />
                <button type="submit" className="btn btn-primary">{t('Rechercher')}</button>
              </form>
              {city ? (
                shopsLoading ? (
                  <p className="muted">{t('Chargement…')}</p>
                ) : shopsError ? (
                  <p className="error" role="alert">{shopsError}</p>
                ) : shops.length === 0 && cityProducts.length === 0 ? (
                  <p className="empty">{t('Aucune boutique ni produit dans cette ville pour le moment.')}</p>
                ) : (
                  <>
                    {shops.length > 0 && (
                      <section aria-label={t('Boutiques et créateurs')}>
                        <h3 className="section-title">🏪 {t('Boutiques et créateurs')}</h3>
                        <div className="grid shops-grid">
                          {shops.map((s) => (
                            <Link key={s.id} to={s.role === 'creator' ? `/createur/${s.id}` : `/boutique/${s.id}`} className="card shop-card">
                              <div className="shop-thumb">
                                {s.sample_image ? (
                                  <img src={s.sample_image} alt={s.name} loading="lazy" decoding="async" />
                                ) : (
                                  <span>{s.role === 'creator' ? '🎨' : '🏪'}</span>
                                )}
                              </div>
                              <div className="shop-body">
                                <h3>
                                  {s.name}
                                  {s.verified && <span className="badge">✓ {t('Boutique vérifiée')}</span>}
                                </h3>
                                <p>📍 {[s.city, s.location].filter(Boolean).join(', ') || t('Ville non renseignée')}</p>
                                <p className="muted">{t('{n} produits', { n: s.product_count || 0 })}</p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}
                    {cityProducts.length > 0 && (
                      <section aria-label={t('Produits')}>
                        <h3 className="section-title"><Logo className="logo-inline" /> {t('Produits')}</h3>
                        <div className="grid">
                          {cityProducts.map((p) => (
                            <ProductCard key={p.id} product={p} />
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )
              ) : (
                <p className="muted">{t('Saisissez une ville pour voir ses boutiques, ses créateurs et ses produits.')}</p>
              )}
            </div>
          ) : loading && !hasLoaded.current ? (
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
            <>
              <div className="grid">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {hasMore && (
                <div className="load-more-wrap">
                  <button className="btn btn-outline" disabled={loadingMore} onClick={loadMore}>
                    {loadingMore ? '…' : `⬇️ ${t('Voir plus de produits')}`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
    </main>
  );
}
