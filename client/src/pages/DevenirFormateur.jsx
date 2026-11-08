import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import {
  IconAward,
  IconBook,
  IconChartBar,
  IconCheck,
  IconGlobe,
  IconShieldCheck,
  IconUsers,
} from "../components/icons.jsx";

export default function DevenirFormateur() {
  const { t } = useLang();
  const { user } = useAuth();
  const isCreator = user && (user.role === "creator" || user.role === "admin");

  const primaryAction = isCreator
    ? { to: "/espace-formateur", label: t("Accéder à mon espace formateur") }
    : user
      ? { to: "/contact", label: t("Parler à l'équipe") }
      : { to: "/register?role=creator", label: t("Créer ma formation") };

  return (
    <>
      <Seo
        title={t("Devenir formateur — MboppiShop")}
        description={t("Partagez vos connaissances, publiez vos formations en ligne et touchez des apprenants à travers l'Afrique.")}
      />
      <main className="formation-page">
        <section className="formations-hero formations-hero-trainer">
          <div className="formations-hero-inner">
            <div className="formations-hero-copy">
              <span className="formations-eyebrow">{t("Espace formateur")}</span>
              <h1>
                {t("Transmettez votre savoir.")} <em>{t("Construisez votre activité.")}</em>
              </h1>
              <p className="formations-hero-sub">
                {t("Partagez vos connaissances, créez des formations de qualité et touchez des apprenants à travers toute l'Afrique depuis MboppiShop.")}
              </p>
              <div className="formations-hero-actions">
                <Link to={primaryAction.to} className="formation-btn formation-btn-primary">
                  {primaryAction.label}
                </Link>
                <Link to="/formations" className="formation-btn formation-btn-ghost">
                  {t("Voir les formations")}
                </Link>
              </div>
              <div className="formations-trainer-note">
                <IconShieldCheck size={16} />
                {t("Adhésion créateur : 2 500 XAF pour 30 jours.")}
              </div>
            </div>

            <div className="formations-hero-visual" aria-hidden="true">
              <div className="formations-hero-glow" />
              <div className="formations-trainer-preview">
                <div className="formations-trainer-preview-head">
                  <span className="formations-trainer-avatar">M</span>
                  <div>
                    <strong>{t("Votre espace formateur")}</strong>
                    <span>{t("Créez, publiez et suivez vos formations")}</span>
                  </div>
                </div>
                <div className="formations-trainer-preview-rows">
                  <span><IconBook size={16} /> {t("Publier une formation")}</span>
                  <span><IconUsers size={16} /> {t("Suivre vos apprenants")}</span>
                  <span><IconChartBar size={16} /> {t("Consulter vos ventes")}</span>
                </div>
              </div>
              <div className="formations-float formations-float-a">
                <IconCheck size={15} />
                {t("Paiement sécurisé")}
              </div>
              <div className="formations-float formations-float-b">
                <IconGlobe size={15} />
                {t("Visible partout en Afrique")}
              </div>
            </div>
          </div>
        </section>

        <div className="formations-shell">
          <section className="formations-section formations-why">
            <div className="formations-section-head">
              <span className="formations-eyebrow">{t("Pourquoi devenir formateur ?")}</span>
              <h2>{t("Votre expertise mérite une audience")}</h2>
              <p>{t("MboppiShop vous donne les outils pour transformer vos connaissances en formations accessibles, vendables et faciles à suivre.")}</p>
            </div>
            <div className="formations-features">
              <article className="formation-feature">
                <span className="formation-feature-icon"><IconGlobe size={20} /></span>
                <h3>{t("Touchez de nouveaux apprenants")}</h3>
                <p>{t("Vos formations sont présentées dans le catalogue MboppiShop et accessibles depuis toute l'Afrique.")}</p>
              </article>
              <article className="formation-feature">
                <span className="formation-feature-icon"><IconAward size={20} /></span>
                <h3>{t("Valorisez votre expertise")}</h3>
                <p>{t("Transformez votre expérience en contenu structuré, avec une page de vente dédiée et des avis vérifiés.")}</p>
              </article>
              <article className="formation-feature">
                <span className="formation-feature-icon"><IconChartBar size={20} /></span>
                <h3>{t("Suivez votre activité")}</h3>
                <p>{t("Retrouvez vos formations, vos ventes et vos gains depuis votre espace formateur.")}</p>
              </article>
              <article className="formation-feature">
                <span className="formation-feature-icon"><IconShieldCheck size={20} /></span>
                <h3>{t("Paiements sécurisés")}</h3>
                <p>{t("Les achats en ligne sont traités via iKeePay, avec un accès sécurisé pour chaque apprenant.")}</p>
              </article>
            </div>
          </section>

          <section className="formation-section">
            <div className="formations-section-head">
              <span className="formations-eyebrow">{t("Comment ça marche ?")}</span>
              <h2>{t("Trois étapes pour publier votre formation")}</h2>
            </div>
            <div className="formations-steps">
              <article>
                <span className="formations-step-number">1</span>
                <h3>{t("Créez votre compte créateur")}</h3>
                <p>{t("Inscrivez-vous, activez votre adhésion et accédez à votre espace formateur.")}</p>
              </article>
              <article>
                <span className="formations-step-number">2</span>
                <h3>{t("Publiez votre formation")}</h3>
                <p>{t("Ajoutez votre support ou votre vidéo, définissez votre prix et présentez votre contenu.")}</p>
              </article>
              <article>
                <span className="formations-step-number">3</span>
                <h3>{t("Vendez et suivez vos résultats")}</h3>
                <p>{t("Partagez votre page de vente, suivez vos apprenants et gérez vos gains depuis votre tableau de bord.")}</p>
              </article>
            </div>
          </section>

          <section className="formation-section formation-trainer-requirements">
            <div>
              <span className="formations-eyebrow">{t("Ce qu'il vous faut")}</span>
              <h2>{t("Prêt à transmettre votre savoir ?")}</h2>
              <p>{t("Vous n'avez pas besoin d'un studio professionnel. Une expertise claire, un contenu structuré et l'envie de partager suffisent pour commencer.")}</p>
            </div>
            <ul className="formation-requirements-list">
              <li><IconCheck size={16} />{t("Un support numérique (PDF, fichier ou vidéo protégée)")}</li>
              <li><IconCheck size={16} />{t("Une description claire de votre formation")}</li>
              <li><IconCheck size={16} />{t("Un prix adapté à votre audience")}</li>
              <li><IconCheck size={16} />{t("Le souhait d'accompagner des apprenants")}</li>
            </ul>
          </section>

          <section className="formations-cta-band">
            <div>
              <span className="formations-cta-eyebrow">{t("Prêt à commencer ?")}</span>
              <h2>{t("Publiez votre première formation sur MboppiShop")}</h2>
              <p>{t("Rejoignez les formateurs qui partagent leurs connaissances et développent leur activité en ligne.")}</p>
            </div>
            <div className="formations-cta-actions">
              <Link to={primaryAction.to} className="formation-btn formation-btn-light">
                {primaryAction.label}
              </Link>
              <Link to="/formations" className="formation-btn formation-btn-outline-light">
                {t("Voir les formations")}
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
