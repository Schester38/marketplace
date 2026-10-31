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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <Seo title={t("Services — MboppiShop")} description={t("Services professionnels à venir sur MboppiShop.")} />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 px-6 py-14 text-white shadow-2xl sm:px-12 sm:py-20">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-blue-100 backdrop-blur">
              ✨ {t("Services")}
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t("Des services pensés pour vous faire grandir.")}
            </h1>
            <p className="mt-5 text-lg text-blue-100 sm:text-xl">
              {t("Découvrez bientôt une sélection de services professionnels pour accompagner votre activité et développer votre présence digitale.")}
            </p>
            <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-bold backdrop-blur">
              🚧 {t("Fonctionnalité bientôt disponible")}
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={i}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl shadow-lg">
                {f.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{f.desc}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                {t("Bientôt disponible")} →
              </div>
            </div>
          ))}
        </section>

        <div className="mt-12 text-center">
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
            ← {t("Retour à l'accueil")}
          </Link>
        </div>
      </div>
    </main>
  );
}
