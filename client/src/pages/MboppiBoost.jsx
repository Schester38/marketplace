import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function MboppiBoost() {
  const { t } = useLang();
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
          <Link to="#services" className="btn btn-primary">
            Découvrir nos services
          </Link>
          <Link to="/contact" className="btn btn-outline">
            Demander des informations
          </Link>
        </div>
      </section>

      <section id="services" className="section">
        <div className="section-head">
          <h2>{t("Nos services")}</h2>
          <p>{t("Des solutions pour développer votre activité sur le numérique.")}</p>
        </div>
        <div className="services-grid">
          <article className="card service-card">
            <div className="service-icon">📈</div>
            <h3>{t("Développement de l'audience")}</h3>
            <p>
              {t(
                "Des solutions pour accroître la visibilité de votre présence numérique, développer votre communauté et mieux faire connaître votre activité."
              )}
            </p>
            <ul className="service-list">
              <li>{t("Conseil en stratégie de croissance.")}</li>
              <li>{t("Optimisation des profils sociaux.")}</li>
              <li>{t("Analyse de l'audience.")}</li>
              <li>{t("Accompagnement dans le développement d'une communauté.")}</li>
              <li>{t("Services de visibilité dont la disponibilité sera confirmée ultérieurement.")}</li>
            </ul>
            <Link to="#audience" className="btn btn-outline">
              {t("Explorer les services")}
            </Link>
          </article>

          <article className="card service-card">
            <div className="service-icon">🎨</div>
            <h3>{t("Création de contenus")}</h3>
            <p>
              {t(
                "Créez des contenus attractifs pour communiquer efficacement, présenter vos produits et promouvoir votre activité sur les réseaux sociaux."
              )}
            </p>
            <ul className="service-list">
              <li>{t("Création d'affiches publicitaires.")}</li>
              <li>{t("Création de vidéos courtes.")}</li>
              <li>{t("Motion design.")}</li>
              <li>{t("Visuels pour les réseaux sociaux.")}</li>
              <li>{t("Calendriers éditoriaux.")}</li>
              <li>{t("Adaptation des contenus aux différentes plateformes.")}</li>
            </ul>
            <Link to="#contenus" className="btn btn-outline">
              {t("Découvrir les solutions")}
            </Link>
          </article>

          <article className="card service-card">
            <div className="service-icon">📱</div>
            <h3>{t("Gestion des réseaux sociaux")}</h3>
            <p>
              {t(
                "Organisez vos publications, animez votre communauté et développez une présence professionnelle sur les réseaux sociaux."
              )}
            </p>
            <ul className="service-list">
              <li>{t("Gestion de pages professionnelles.")}</li>
              <li>{t("Planification des publications.")}</li>
              <li>{t("Calendriers de contenu.")}</li>
              <li>{t("Modération des commentaires.")}</li>
              <li>{t("Assistance à la gestion des messages.")}</li>
              <li>{t("Rapports de performances.")}</li>
            </ul>
            <Link to="#reseaux" className="btn btn-outline">
              {t("Découvrir les solutions")}
            </Link>
          </article>

          <article className="card service-card">
            <div className="service-icon">💰</div>
            <h3>{t("Publicité digitale")}</h3>
            <p>
              {t(
                "Préparez et optimisez vos campagnes pour faire connaître vos produits, vos services et votre marque auprès de votre public cible."
              )}
            </p>
            <ul className="service-list">
              <li>{t("Conception de publicités.")}</li>
              <li>{t("Préparation de campagnes Meta Ads.")}</li>
              <li>{t("Préparation de campagnes TikTok Ads.")}</li>
              <li>{t("Accompagnement dans le ciblage.")}</li>
              <li>{t("Suivi des performances.")}</li>
              <li>{t("Analyse des résultats.")}</li>
            </ul>
            <Link to="#publicite" className="btn btn-outline">
              {t("Découvrir les solutions")}
            </Link>
          </article>
        </div>
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
    </main>
  );
}