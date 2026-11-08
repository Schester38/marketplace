import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import FormationCard from "../components/FormationCard.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { firstPhoto } from "../share.js";
import { formatMoney } from "../components/ProductCard.jsx";
import {
  IconBook,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconDownload,
  IconSearch,
  IconShieldCheck,
  IconStarFilled,
  IconUsers,
} from "../components/icons.jsx";

function FormationsPage() {
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("popular");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listProducts({ type: "digital" })
      .then((resp) => {
        if (cancelled) return;
        const list = Array.isArray(resp) ? resp : resp?.products || [];
        setProducts(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || t("Impossible de charger les formations."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, t]);

  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const name = product.category || "Digital";
      map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const learners = useMemo(
    () => products.reduce((sum, product) => sum + Number(product.sold || 0), 0),
    [products]
  );

  const rated = useMemo(
    () => products.filter((product) => Number(product.review_count || 0) > 0),
    [products]
  );

  const averageRating = useMemo(() => {
    if (!rated.length) return 0;
    const total = rated.reduce((sum, product) => sum + Number(product.rating_avg || 0), 0);
    return total / rated.length;
  }, [rated]);

  const featured = useMemo(() => {
    const sorted = [...products].sort((a, b) => Number(b.sold || 0) - Number(a.sold || 0));
    return sorted.find((product) => firstPhoto(product)) || sorted[0] || null;
  }, [products]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = products.filter((product) => {
      if (category !== "all" && (product.category || "Digital") !== category) return false;
      if (!needle) return true;
      return [product.name, product.description, product.category, product.shop_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });

    list = [...list].sort((a, b) => {
      if (sort === "recent") return Number(b.id) - Number(a.id);
      if (sort === "price_asc") return Number(a.price || 0) - Number(b.price || 0);
      if (sort === "price_desc") return Number(b.price || 0) - Number(a.price || 0);
      return Number(b.sold || 0) - Number(a.sold || 0) || Number(b.id) - Number(a.id);
    });
    return list;
  }, [products, query, category, sort]);

  const resetFilters = () => {
    setQuery("");
    setCategory("all");
    setSort("popular");
  };

  const featuredPhoto = featured ? firstPhoto(featured) : null;

  return (
    <>
      <Seo
        title={t("Formations — MboppiShop")}
        description={t("Découvrez des formations pratiques en ligne sur MboppiShop.")}
      />
      <main className="formation-page">
        <section className="formations-hero">
          <div className="formations-hero-inner">
            <div className="formations-hero-copy">
              <span className="formations-eyebrow">{t("MboppiShop Formations")}</span>
              <h1>
                {t("Montez en compétences,")} <em>{t("à votre rythme.")}</em>
              </h1>
              <p className="formations-hero-sub">
                {t("Des formations pratiques, conçues pour être appliquées immédiatement. Apprenez auprès de formateurs passionnés, sur mobile comme sur ordinateur.")}
              </p>

              <form
                className="formations-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <IconSearch size={18} />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("Rechercher une formation…")}
                  aria-label={t("Rechercher une formation…")}
                />
                <button type="submit" className="formation-btn formation-btn-primary">
                  {t("Rechercher")}
                </button>
              </form>

              <div className="formations-hero-actions">
                <a href="#catalogue" className="formation-btn formation-btn-primary">
                  {t("Explorer les formations")}
                </a>
                <Link to="/mes-formations" className="formation-btn formation-btn-ghost">
                  {t("Mes formations")}
                </Link>
                <Link to="/devenir-formateur" className="formations-hero-link">
                  {t("Devenir formateur")}
                  <IconChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
                </Link>
              </div>

              <div className="formations-stats">
                <div>
                  <strong>{loading ? "—" : products.length}</strong>
                  <span>{t("formations")}</span>
                </div>
                <div>
                  <strong>{loading ? "—" : categories.length}</strong>
                  <span>{t("Catégories")}</span>
                </div>
                <div>
                  {averageRating > 0 ? (
                    <>
                      <strong>
                        <IconStarFilled size={16} /> {averageRating.toFixed(1)}
                      </strong>
                      <span>{t("note moyenne")}</span>
                    </>
                  ) : (
                    <>
                      <strong>{learners > 0 ? learners : "24/7"}</strong>
                      <span>{learners > 0 ? t("apprenants") : t("accès en ligne")}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="formations-hero-visual" aria-hidden="true">
              <div className="formations-hero-glow" />
              <div className="formations-hero-preview">
                <div className="formations-hero-preview-media">
                  {featuredPhoto ? (
                    <img src={featuredPhoto} alt="" />
                  ) : (
                    <span className="formations-hero-preview-fallback">
                      <IconBook size={46} />
                    </span>
                  )}
                  <span className="formations-hero-preview-cat">
                    {featured?.category === "Digital" ? t("Digital") : featured?.category || t("Formation")}
                  </span>
                </div>
                <div className="formations-hero-preview-body">
                  <span className="formations-hero-preview-label">{t("Formation à la une")}</span>
                  <strong>{featured?.name || t("Apprenez à votre rythme")}</strong>
                  {featured && (
                    <span className="formations-hero-preview-meta">
                      {formatMoney(featured.flash_promo ? featured.flash_promo.price : featured.price)}{" "}
                      {featured.currency || "XAF"}
                    </span>
                  )}
                </div>
              </div>
              <div className="formations-float formations-float-a">
                <IconCheck size={15} />
                {t("Accès immédiat")}
              </div>
              <div className="formations-float formations-float-b">
                <IconShieldCheck size={15} />
                {t("Paiement sécurisé")}
              </div>
            </div>
          </div>
        </section>

        <div className="formations-shell">
          <section className="formations-section formations-why">
            <div className="formations-section-head">
              <span className="formations-eyebrow">{t("Pourquoi MboppiShop ?")}</span>
              <h2>{t("Apprendre avec des contenus pensés pour agir")}</h2>
              <p>{t("Des formats simples, un accès immédiat et des formateurs sélectionnés pour la qualité de leur expertise.")}</p>
            </div>
            <div className="formations-features">
              <article className="formation-feature">
                <span className="formation-feature-icon"><IconDownload size={20} /></span>
                <h3>{t("Accès immédiat")}</h3>
                <p>{t("Téléchargez votre support ou accédez à votre vidéo dès la confirmation du paiement.")}</p>
              </article>
              <article className="formation-feature">
                <span className="formation-feature-icon"><IconClock size={20} /></span>
                <h3>{t("À votre rythme")}</h3>
                <p>{t("Suivez votre formation quand vous voulez, depuis votre téléphone ou votre ordinateur.")}</p>
              </article>
              <article className="formation-feature">
                <span className="formation-feature-icon"><IconShieldCheck size={20} /></span>
                <h3>{t("Paiement sécurisé")}</h3>
                <p>{t("Réglez en ligne via Mobile Money ou carte bancaire sur une page de paiement chiffrée.")}</p>
              </article>
              <article className="formation-feature">
                <span className="formation-feature-icon"><IconUsers size={20} /></span>
                <h3>{t("Formateurs vérifiés")}</h3>
                <p>{t("Des créateurs et formateurs identifiés, avec leurs contenus et leurs avis.")}</p>
              </article>
            </div>
          </section>

          <section id="catalogue" className="formations-section formations-catalogue">
            <div className="formations-catalogue-head">
              <div>
                <span className="formations-eyebrow">{t("Catalogue")}</span>
                <h2>{t("Toutes les formations")}</h2>
              </div>
              <div className="formations-sort">
                <label htmlFor="formations-sort">{t("Trier par")}</label>
                <select
                  id="formations-sort"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="popular">{t("Plus populaires")}</option>
                  <option value="recent">{t("Nouveautés")}</option>
                  <option value="price_asc">{t("Prix croissant")}</option>
                  <option value="price_desc">{t("Prix décroissant")}</option>
                </select>
              </div>
            </div>

            <div className="formations-chips" role="tablist" aria-label={t("Catégories")}>
              <button
                type="button"
                className={`formation-chip ${category === "all" ? "active" : ""}`}
                onClick={() => setCategory("all")}
              >
                {t("Toutes")}
                <span>{products.length}</span>
              </button>
              {categories.map(([name, count]) => (
                <button
                  key={name}
                  type="button"
                  className={`formation-chip ${category === name ? "active" : ""}`}
                  onClick={() => setCategory(name)}
                >
                  {name === "Digital" ? t("Digital") : name}
                  <span>{count}</span>
                </button>
              ))}
            </div>

            {!loading && !error && (
              <p className="formations-result-count">
                {filtered.length === 1
                  ? t("{n} formation trouvée", { n: filtered.length })
                  : t("{n} formations trouvées", { n: filtered.length })}
              </p>
            )}

            {loading && (
              <div className="formations-grid" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="formation-card formation-card-skeleton">
                    <div className="formation-skeleton-media" />
                    <div className="formation-card-body">
                      <div className="formation-skeleton-line short" />
                      <div className="formation-skeleton-line" />
                      <div className="formation-skeleton-line" />
                      <div className="formation-skeleton-line short" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="formations-empty">
                <p className="error-msg">{error}</p>
                <button type="button" className="formation-btn formation-btn-ghost" onClick={() => setReload((value) => value + 1)}>
                  {t("Réessayer")}
                </button>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="formations-empty">
                <span className="formations-empty-icon"><IconSearch size={28} /></span>
                <h3>{t("Aucune formation ne correspond à votre recherche.")}</h3>
                <p>{t("Essayez un autre mot-clé ou affichez toutes les catégories.")}</p>
                <button type="button" className="formation-btn formation-btn-primary" onClick={resetFilters}>
                  {t("Réinitialiser les filtres")}
                </button>
              </div>
            )}

            {!loading && !error && filtered.length > 0 && (
              <div className="formations-grid">
                {filtered.map((product) => (
                  <FormationCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </section>

          <section className="formations-cta-band">
            <div>
              <span className="formations-cta-eyebrow">{t("Transmettez votre savoir")}</span>
              <h2>{t("Vous êtes formateur ou créateur ?")}</h2>
              <p>{t("Publiez votre formation sur MboppiShop, touchez de nouveaux apprenants et développez votre activité.")}</p>
            </div>
            <div className="formations-cta-actions">
              <Link to="/devenir-formateur" className="formation-btn formation-btn-light">
                {t("Devenir formateur")}
              </Link>
              <Link to="/register?role=creator" className="formation-btn formation-btn-outline-light">
                {t("Créer ma formation")}
              </Link>
            </div>
          </section>

          <section className="formations-section">
            <div className="formations-section-head">
              <span className="formations-eyebrow">{t("Questions fréquentes")}</span>
              <h2>{t("Tout ce qu'il faut savoir avant de commencer")}</h2>
            </div>
            <div className="formation-faq">
              <details>
                <summary>{t("Comment accéder à ma formation après l'achat ?")}</summary>
                <p>{t("Votre formation apparaît dans « Mes formations ». Vous pouvez y télécharger votre support ou regarder votre vidéo protégée depuis votre espace.")}</p>
              </details>
              <details>
                <summary>{t("Puis-je suivre une formation depuis mon téléphone ?")}</summary>
                <p>{t("Oui. Les contenus sont consultables sur téléphone, tablette et ordinateur, selon le format choisi par le formateur.")}</p>
              </details>
              <details>
                <summary>{t("Quels moyens de paiement sont acceptés ?")}</summary>
                <p>{t("Le paiement en ligne est sécurisé et adapté aux moyens disponibles dans votre pays (Mobile Money, carte bancaire).")}</p>
              </details>
              <details>
                <summary>{t("Puis-je devenir formateur sur MboppiShop ?")}</summary>
                <p>{t("Oui. Créez un compte créateur, publiez votre formation et suivez vos ventes depuis votre espace formateur.")}</p>
              </details>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export default FormationsPage;
