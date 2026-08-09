import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { useAuth } from '../App.jsx';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';
import { PRODUCT_CATEGORIES } from '../config.js';

export default function Home() {
  const { user } = useAuth();
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('recent');

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
        <span className="hero-badge">{t('🛍️ Bienvenue chez Mboppi')}</span>
        <h1>{t('Le marché du quartier, en un clic')}</h1>
        <p>
          {t('Découvrez les offres du moment, commandez les produits des boutiques partenaires, ou devenez vendeur et gagnez une commission sur chaque vente.')}
        </p>
        <div className="hero-stats">
          <div className="stat">
            <strong>{products.length}</strong>
            <span>{t('Produits en boutique')}</span>
          </div>
          <div className="stat">
            <strong>{shopsCount}</strong>
            <span>{t('Boutiques partenaires')}</span>
          </div>
        </div>
        <div className="hero-actions" style={{ marginTop: 24 }}>
          {user ? (
            <Link to={user.role === 'shop' ? '/shop' : '/seller'} className="btn btn-primary">
              {t('Accéder à mon espace')}
            </Link>
          ) : (
            <Link to="/register" className="btn btn-primary">{t('Créer un compte gratuit')}</Link>
          )}
        </div>
      </section>

      <section className="steps">
        <div className="step">
          <span className="step-num">1</span>
          <span className="step-icon">🏪</span>
          <h3>{t('Les boutiques publient')}</h3>
          <p>{t('Elles mettent en ligne leurs produits et fixent la commission de vente.')}</p>
        </div>
        <div className="step">
          <span className="step-num">2</span>
          <span className="step-icon">🛒</span>
          <h3>{t('Les vendeurs vendent')}</h3>
          <p>{t('Ils enregistrent les ventes et trouvent les clients, au quartier ou en ligne.')}</p>
        </div>
        <div className="step">
          <span className="step-num">3</span>
          <span className="step-icon">💰</span>
          <h3>{t('Chacun y gagne')}</h3>
          <p>{t('La boutique écoule ses produits, le vendeur encaisse sa commission à chaque vente.')}</p>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <section>
        <div className="section-head">
          <h2 className="section-title">{t('🏪 Produits des boutiques')}</h2>
        </div>
        <div className="toolbar">
          <input
            className="input search"
            placeholder={t('🔍 Rechercher un produit…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('Toutes les catégories')}</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(c)}</option>
            ))}
          </select>
          <select className="input filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">{t('Plus récents')}</option>
            <option value="popular">{t('🔥 Plus populaires')}</option>
            <option value="price_asc">{t('Prix croissant')}</option>
            <option value="price_desc">{t('Prix décroissant')}</option>
          </select>
        </div>
        {loading ? (
          <div className="grid">
            {[1, 2, 3].map((i) => <div key={i} className="card offer-card skeleton"><div className="skeleton-block skeleton-photo"></div></div>)}
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
