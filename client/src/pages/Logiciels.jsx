import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function Logiciels() {
  const { t } = useLang();
  const features = [
    { icon: "💻", title: t("Outils & applications"), desc: t("Des logiciels et applications pour simplifier votre quotidien professionnel.") },
    { icon: "⚡", title: t("Automatisation"), desc: t("Automatisez vos tâches répétitives et gagnez du temps.") },
    { icon: "🔒", title: t("Sécurité & données"), desc: t("Protégez vos données et vos transactions en toute confiance.") },
  ];
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <Seo title={t("Logiciels — MboppiShop")} description={t("Logiciels et applications à venir sur MboppiShop.")} />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 px-6 py-14 text-white shadow-2xl sm:px-12 sm:py-20">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-emerald-100 backdrop-blur">
              💻 {t("Logiciels")}
            </span>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t("Des logiciels pour booster votre productivité.")}
            </h1>
            <p className="mt-5 text-lg text-emerald-100 sm:text-xl">
              {t("Découvrez bientôt des applications et outils numériques pour faciliter votre travail et votre quotidien.")}
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
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-2xl shadow-lg">
                {f.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{f.desc}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
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
