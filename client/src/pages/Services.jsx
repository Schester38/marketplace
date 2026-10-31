import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function Services() {
  const { t } = useLang();
  const features = [
    { icon: "🛠️", title: t("Services professionnels"), desc: t("Une sélection de prestations pour accompagner votre activité.") },
    { icon: "📈", title: t("Croissance digitale"), desc: t("Stratégies, campagnes et accompagnement pour développer votre présence en ligne.") },
    { icon: "🤝", title: t("Conseil & accompagnement"), desc: t("Un accompagnement personnalisé, étape par étape, pour réussir vos projets.") },
  ];
  return (
    <main className="boost-page">
      <Seo title={t("Services — MboppiShop")} description={t("Services professionnels à venir sur MboppiShop.")} />
      <div className="boost-shell">
        <section className="boost-hero boost-fade-up">
          <div className="boost-hero-grid tw-absolute tw-inset-0" aria-hidden="true" />
          <span className="boost-orb boost-orb-a" aria-hidden="true" />
          <span className="boost-orb boost-orb-b" aria-hidden="true" />
          <div className="boost-hero-inner">
            <div className="tw-min-w-0">
              <span className="boost-eyebrow">
                <span className="tw-h-3.5 tw-w-3.5 tw-flex-none">✨</span>
                {t("Services")}
              </span>
              <h1 className="boost-title">
                {t("Des services pensés pour vous faire grandir.")}
              </h1>
              <p className="boost-lead">
                {t("Découvrez bientôt une sélection de services professionnels pour accompagner votre activité et développer votre présence digitale.")}
              </p>
              <div className="tw-mt-6 tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-bg-white/15 tw-px-5 tw-py-3 tw-text-sm tw-font-bold tw-backdrop-blur">
                🚧 {t("Fonctionnalité bientôt disponible")}
              </div>
            </div>
          </div>
        </section>

        <section className="tw-mt-8 tw-grid tw-gap-4 sm:tw-grid-cols-2 lg:tw-grid-cols-3">
          {features.map((f, i) => (
            <div key={i} className="boost-card boost-card-pad tw-transition hover:-tw-translate-y-1">
              <div className="tw-flex tw-h-14 tw-w-14 tw-items-center tw-justify-center tw-rounded-xl tw-bg-gradient-to-br tw-from-blue-500 tw-to-indigo-600 tw-text-2xl tw-shadow-lg">
                {f.icon}
              </div>
              <h3 className="tw-mt-4 tw-text-lg tw-font-bold tw-text-[var(--boost-text)]">{f.title}</h3>
              <p className="tw-mt-2 tw-text-sm tw-text-[var(--boost-muted)]">{f.desc}</p>
              <div className="tw-mt-4 tw-inline-flex tw-items-center tw-gap-1 tw-text-xs tw-font-semibold tw-text-blue-600">
                {t("Bientôt disponible")} →
              </div>
            </div>
          ))}
        </section>

        <div className="tw-mt-10 tw-text-center">
          <Link to="/" className="boost-btn boost-btn-secondary">
            ← {t("Retour à l'accueil")}
          </Link>
        </div>
      </div>
    </main>
  );
}

