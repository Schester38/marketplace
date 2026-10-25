import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";

export default function MboppiBoost() {
  const { t } = useLang();
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [catsResp, svcsResp] = await Promise.all([
        api.get("/smm/categories"),
        api.get("/smm/services"),
      ]);
      setCategories(catsResp.data?.categories || []);
      setServices(svcsResp.data?.services || []);
    } catch (err) {
      console.error("[MboppiBoost] Erreur récupération données :", err.message);
    } finally {
      setLoading(false);
    }
  }

  const DEFAULT_CATEGORIES = [
    { id: 1, name: "Développement de l'audience", slug: "audience", description: "Accroître votre visibilité numérique et développer votre communauté.", icon: "📈", sort_order: 1, is_active: true },
    { id: 2, name: "Création de contenus", slug: "contenus", description: "Contenus attractifs pour communiquer et promouvoir votre activité.", icon: "🎨", sort_order: 2, is_active: true },
    { id: 3, name: "Gestion des réseaux sociaux", slug: "reseaux-sociaux", description: "Animer votre communauté et développer une présence professionnelle.", icon: "📱", sort_order: 3, is_active: true },
    { id: 4, name: "Publicité digitale", slug: "publicite", description: "Préparer et optimiser vos campagnes publicitaires.", icon: "💰", sort_order: 4, is_active: true },
  ];

  const DEFAULT_SERVICES = [
    { id: 1, category_id: 1, name: "Conseil en stratégie de croissance", short_description: "Accompagnement pour définir votre stratégie de croissance numérique.", price: 0, currency: "XAF", billing_unit: "service", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 30, features: ["Conseil en stratégie de croissance.", "Optimisation des profils sociaux.", "Analyse de l'audience.", "Accompagnement dans le développement d'une communauté."] },
    { id: 2, category_id: 1, name: "Optimisation des profils sociaux", short_description: "Refonte et optimisation de vos profils sur les réseaux sociaux.", price: 0, currency: "XAF", billing_unit: "service", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 15, features: ["Optimisation des profils sociaux."] },
    { id: 3, category_id: 1, name: "Analyse de l'audience", short_description: "Analyse de votre audience actuelle et recommandations de ciblage.", price: 0, currency: "XAF", billing_unit: "service", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 7, features: ["Analyse de l'audience."] },
    { id: 4, category_id: 2, name: "Création d'affiches publicitaires", short_description: "Conception de visuels publicitaires pour vos campagnes.", price: 0, currency: "XAF", billing_unit: "article", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 5, features: ["Création d'affiches publicitaires."] },
    { id: 5, category_id: 2, name: "Création de vidéos courtes", short_description: "Production de vidéos courtes (Reels, TikTok, Shorts) pour vos réseaux.", price: 0, currency: "XAF", billing_unit: "article", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 7, features: ["Création de vidéos courtes."] },
    { id: 6, category_id: 2, name: "Motion design", short_description: "Animations graphiques et motion design pour vos contenus.", price: 0, currency: "XAF", billing_unit: "article", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 10, features: ["Motion design."] },
    { id: 7, category_id: 3, name: "Gestion de pages professionnelles", short_description: "Gestion complète de vos pages professionnelles sur les réseaux sociaux.", price: 0, currency: "XAF", billing_unit: "mois", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 30, features: ["Gestion de pages professionnelles."] },
    { id: 8, category_id: 3, name: "Planification des publications", short_description: "Calendrier éditorial et planification de vos publications.", price: 0, currency: "XAF", billing_unit: "service", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 5, features: ["Planification des publications."] },
    { id: 9, category_id: 3, name: "Modération des commentaires", short_description: "Modération et animation de votre communauté (commentaires, messages).", price: 0, currency: "XAF", billing_unit: "mois", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 30, features: ["Modération des commentaires."] },
    { id: 10, category_id: 4, name: "Conception de publicités", short_description: "Conception graphique de vos publicités digitales.", price: 0, currency: "XAF", billing_unit: "article", status: "active", is_automated: false, is_consulting: false, is_campaign: false, delivery_days: 5, features: ["Conception de publicités."] },
    { id: 11, category_id: 4, name: "Préparation de campagnes Meta Ads", short_description: "Préparation et configuration de vos campagnes publicitaires Meta.", price: 0, currency: "XAF", billing_unit: "campagne", status: "active", is_automated: false, is_consulting: false, is_campaign: true, delivery_days: 7, features: ["Préparation de campagnes Meta Ads."] },
    { id: 12, category_id: 4, name: "Préparation de campagnes TikTok Ads", short_description: "Préparation et configuration de vos campagnes publicitaires TikTok.", price: 0, currency: "XAF", billing_unit: "campagne", status: "active", is_automated: false, is_consulting: false, is_campaign: true, delivery_days: 7, features: ["Préparation de campagnes TikTok Ads."] },
  ];

  const finalCategories = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  const finalServices = services.length > 0 ? services : DEFAULT_SERVICES;

  const servicesByCategory = finalCategories.map((cat) => ({
    ...cat,
    services: finalServices.filter((s) => s.category_id === cat.id),
  }));

  return (
    <main className="container">
      <Seo
        title="MboppiBoost — Services de marketing digital et réseaux sociaux"
        description="Découvrez MboppiBoost sur MboppiShop : création de contenus, gestion des réseaux sociaux, visibilité numérique et publicité digitale."
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">⚡ MboppiBoost</span>
        <h1>MboppiBoost</h1>
        <p>Votre croissance numérique commence ici.</p>
        <p>
          Développez votre présence en ligne grâce à des services numériques adaptés à vos objectifs. Découvrez des solutions pour améliorer votre visibilité, créer des contenus attractifs, gérer vos réseaux sociaux et promouvoir votre activité.
        </p>
        <div className="hero-actions">
          {loading ? (
            <span className="btn btn-primary" style={{ opacity: 0.6 }}>
              Chargement…
            </span>
          ) : (
            <>
              <Link to="/mboppi-boost/mes-commandes" className="btn btn-primary">
                {t("Mes commandes")}
              </Link>
              <Link to="/contact" className="btn btn-outline">
                {t("Demander des informations")}
              </Link>
            </>
          )}
        </div>
      </section>

      {!loading && servicesByCategory.length > 0 ? (
        <>
          <section id="services" className="section">
            <div className="section-head">
              <h2>{t("Nos services")}</h2>
              <p>{t("Des solutions pour développer votre activité sur le numérique.")}</p>
            </div>
            {servicesByCategory.map((cat) => (
              <div key={cat.id} className="service-category">
                <h3>
                  {cat.icon} {cat.name}
                </h3>
                <p>{cat.description}</p>
                <div className="services-grid">
                  {cat.services.map((s) => (
                    <article key={s.id} className="card service-card">
                      <div className="service-icon">
                        {s.is_campaign ? "💰" : s.is_consulting ? "🤝" : s.is_automated ? "🤖" : "📋"}
                      </div>
                      <h3>{s.name}</h3>
                      <p>{s.short_description || s.description}</p>
                      {s.delivery_days && (
                        <p className="service-meta">
                          {t("Délai indicatif")} : {s.delivery_days} {t("jours")}
                        </p>
                      )}
                      {s.price > 0 ? (
                        <p className="service-price">
                          {s.price} {s.currency} / {s.billing_unit}
                        </p>
                      ) : (
                        <p className="service-price">{t("Tarif à définir")}</p>
                      )}
                      <ul className="service-list">
                        {s.features?.slice(0, 4).map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                      <Link
                        to={`/mboppi-boost/commander/${s.id}`}
                        className="btn btn-outline"
                      >
                        {t("Commander")}
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="section advantages">
            <div className="section-head">
              <h2>{t("Pourquoi MboppiBoost ?")}</h2>
              <p>{t("Des services conçus pour les entrepreneurs et les entreprises.")}</p>
            </div>
            <div className="advantages-grid">
              <div className="advantage-card">
                <h3>{t("Services adaptés")}</h3>
                <p>{t("Des solutions pensées pour les entrepreneurs et les entreprises de toutes tailles.")}</p>
              </div>
              <div className="advantage-card">
                <h3>{t("Interface simple")}</h3>
                <p>{t("Une navigation claire et des catégories bien organisées.")}</p>
              </div>
              <div className="advantage-card">
                <h3>{t("Accompagnement")}</h3>
                <p>{t("Un suivi selon vos besoins, à votre rythme.")}</p>
              </div>
              <div className="advantage-card">
                <h3>{t("Évolution progressive")}</h3>
                <p>{t("De nouveaux services s'ajouteront selon vos retours et la demande.")}</p>
              </div>
            </div>
          </section>

          <section className="section cta-section">
            <div className="cta-card">
              <h2>{t("Prêt à développer votre présence en ligne ?")}</h2>
              <p>{t("Découvrez les solutions MboppiBoost et choisissez les services adaptés à vos objectifs.")}</p>
              <Link to="#services" className="btn btn-primary">
                {t("Explorer MboppiBoost")}
              </Link>
            </div>
          </section>
        </>
      ) : loading ? null : (
        <section className="section">
          <div className="card">
            <p>{error || t("Aucun service disponible pour le moment.")}</p>
            <Link to="/contact" className="btn btn-outline">
              {t("Demander des informations")}
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}