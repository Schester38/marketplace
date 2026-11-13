// Espace FREELANCE — prospection publicitaire Yaoundé & Douala.
// Page dédiée ouverte depuis « 🎨 Mon espace créateur », réservée au compte
// bestrong9124@gmail.com (garde dans App.jsx). Les données (blocs 1 à 5) se
// trouvent dans client/src/freelanceData.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { SECTORS, COMPANIES, SCRIPTS_DATA } from "../freelanceData.js";

const EMPTY_PERSONALIZATION = { name: "", agency: "", phone: "", email: "" };
const PAGE_SIZE = 10;

const ICONS = {
  search: "M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z",
  phone:
    "M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.12 4.2 2 2 0 014.11 2h3a2 2 0 012 1.72c.12.9.33 1.78.62 2.62a2 2 0 01-.45 2.11L8 9.73a16 16 0 006 6l1.28-1.28a2 2 0 012.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0122 16.92z",
  chat:
    "M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z",
  doc: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  print:
    "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  arrow: "M5 12h14M13 6l6 6-6 6",
};

const FEATURES = [
  {
    icon: "search",
    title: "Annuaire vérifié",
    text: "1000 entreprises ciblées à Yaoundé et Douala, classées en 8 secteurs d'activité.",
  },
  {
    icon: "phone",
    title: "Contacts directs",
    text: "WhatsApp, SMS, fixe et e-mail : un clic suffit pour joindre le bon décideur.",
  },
  {
    icon: "chat",
    title: "Scripts prêts à l'emploi",
    text: "Des messages de prospection adaptés à chaque secteur, avec les relances.",
  },
  {
    icon: "print",
    title: "Mode terrain",
    text: "Imprimez ou exportez votre liste et vos scripts en PDF pour prospecter hors ligne.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Ciblez",
    text: "Filtrez par ville, secteur, canal ou mot-clé : nom, quartier, téléphone, activité.",
  },
  {
    n: "02",
    title: "Contactez",
    text: "Ouvrez WhatsApp ou l'e-mail du prospect en un clic, sans copier-coller.",
  },
  {
    n: "03",
    title: "Convertissez",
    text: "Envoyez le script du secteur, personnalisé à votre nom et à votre offre.",
  },
];

function firstWaLink(mobileStr) {
  if (!mobileStr) return "";
  const first = String(mobileStr).split("/")[0].replace(/\D/g, "");
  return first.length >= 9 ? "https://wa.me/" + first : "";
}

function firstEmail(emailStr) {
  if (!emailStr) return "";
  return String(emailStr).split("/")[0].trim();
}

function personalize(text, info) {
  let out = text;
  if (info.name) out = out.replace(/\[Votre Prénom\]/g, info.name);
  if (info.agency) out = out.replace(/\[Nom de votre Structure\]/g, info.agency);
  if (info.phone) out = out.replace(/\[Votre Numéro\]/g, info.phone);
  if (info.email) out = out.replace(/\[Votre E-mail\]/g, info.email);
  return out;
}

function percent(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function Icon({ path, className = "tw-h-5 tw-w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const inputClass =
  "tw-w-full tw-rounded-xl tw-border tw-border-fr-border tw-bg-fr-surface tw-px-3.5 tw-py-2.5 tw-text-sm tw-text-fr-text tw-outline-none tw-transition focus:tw-border-fr-primary focus:tw-ring-2 focus:tw-ring-fr-primary";
const primaryBtnClass =
  "tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-bg-fr-primary tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-fr-on-primary tw-shadow-sm tw-transition hover:tw-bg-fr-primary-dark focus:tw-outline-none focus:tw-ring-2 focus:tw-ring-fr-primary";
const chipClass =
  "tw-rounded-full tw-border tw-border-fr-border tw-bg-fr-soft tw-px-3.5 tw-py-2 tw-text-xs tw-font-semibold tw-text-fr-text tw-transition hover:tw-border-fr-primary hover:tw-text-fr-primary";

export default function Freelance() {
  const [tab, setTab] = useState("directory");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [sector, setSector] = useState("");
  const [channel, setChannel] = useState("");
  const [page, setPage] = useState(1);
  const [info, setInfo] = useState(EMPTY_PERSONALIZATION);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  const copyText = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      showToast("Copié dans le presse-papiers !");
    } catch {
      showToast("Impossible de copier automatiquement.");
    }
  };

  const stats = useMemo(
    () => ({
      total: COMPANIES.length,
      yaounde: COMPANIES.filter((c) => c[0] === "Yaoundé").length,
      douala: COMPANIES.filter((c) => c[0] === "Douala").length,
      whatsapp: COMPANIES.filter((c) => String(c[5] || "").trim() !== "").length,
    }),
    []
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return COMPANIES.filter((c) => {
      if (city && c[0] !== city) return false;
      if (sector && String(c[1]) !== sector) return false;
      if (channel === "mobile" && !String(c[5] || "").trim()) return false;
      if (channel === "fixe" && String(c[5] || "").trim()) return false;
      if (q) {
        const hay = [c[0], SECTORS[c[1]], c[2], c[3], c[4], c[5], c[6], c[7]]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, city, sector, channel]);

  // La liste ne s'affiche qu'après une recherche ciblée (texte ou filtre),
  // 10 résultats maximum à la fois.
  const hasQuery = Boolean(search.trim() || city || sector || channel);
  const visible = hasQuery ? filtered.slice(0, page * PAGE_SIZE) : [];
  const activeFilters =
    [city, sector, channel].filter(Boolean).length + (search.trim() ? 1 : 0);

  useEffect(() => {
    setPage(1);
  }, [search, city, sector, channel]);

  const scrollToWorkspace = () => {
    document.getElementById("annuaire")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goDirectory = () => {
    setTab("directory");
    scrollToWorkspace();
  };

  const goScripts = () => {
    setTab("scripts");
    scrollToWorkspace();
  };

  const clearFilters = () => {
    setSearch("");
    setCity("");
    setSector("");
    setChannel("");
  };

  const statCards = [
    {
      label: "Entreprises chargées",
      value: stats.total,
      sub: "Base Yaoundé + Douala",
      progress: 100,
    },
    {
      label: "Yaoundé",
      value: stats.yaounde,
      sub: "Objectif : 400",
      progress: percent(stats.yaounde, 400),
    },
    {
      label: "Douala",
      value: stats.douala,
      sub: "Objectif : 600",
      progress: percent(stats.douala, 600),
    },
    {
      label: "WhatsApp / SMS (6xx)",
      value: stats.whatsapp,
      sub: "Contacts mobiles",
      progress: percent(stats.whatsapp, stats.total),
    },
  ];

  return (
    <main className="freelance-page tw-min-h-screen tw-bg-fr-bg tw-font-sans tw-text-fr-text">
      <Seo
        title="Espace Freelance — Prospection B2B Yaoundé & Douala | MboppiShop"
        description="Annuaire de 1000 entreprises, contacts WhatsApp/e-mail directs et scripts de prospection prêts à l'emploi."
        noindex
      />

      {/* HERO */}
      <section className="fr-no-print tw-relative tw-overflow-hidden tw-bg-[#07101f] tw-text-white">
        <div className="tw-pointer-events-none tw-absolute -tw-left-24 -tw-top-24 tw-h-72 tw-w-72 tw-rounded-full tw-bg-sky-500/20 tw-blur-3xl" />
        <div className="tw-pointer-events-none tw-absolute -tw-right-16 tw-top-10 tw-h-80 tw-w-80 tw-rounded-full tw-bg-blue-600/20 tw-blur-3xl" />
        <div className="tw-relative tw-mx-auto tw-max-w-[1380px] tw-px-5 tw-py-8 sm:tw-px-8 sm:tw-py-12 lg:tw-py-16">
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
            <Link
              to="/creator"
              className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-border tw-border-white/15 tw-bg-white/5 tw-px-3.5 tw-py-2 tw-text-xs tw-font-semibold tw-text-slate-200 tw-transition hover:tw-bg-white/10"
            >
              <span aria-hidden="true">←</span> Mon espace créateur
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-border tw-border-white/15 tw-bg-white/5 tw-px-3.5 tw-py-2 tw-text-xs tw-font-semibold tw-text-slate-200 tw-transition hover:tw-bg-white/10"
            >
              <Icon path={ICONS.print} className="tw-h-4 tw-w-4" /> Imprimer / PDF
            </button>
          </div>

          <div className="tw-mt-8 tw-grid tw-gap-8 lg:tw-grid-cols-[1.4fr_1fr] lg:tw-items-center">
            <div>
              <span className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-full tw-border tw-border-sky-400/30 tw-bg-sky-400/10 tw-px-3 tw-py-1 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.14em] tw-text-sky-300">
                Espace prospection · Yaoundé &amp; Douala
              </span>
              <h1 className="tw-mt-4 tw-max-w-2xl tw-text-3xl tw-font-extrabold tw-leading-tight tw-tracking-tight sm:tw-text-4xl lg:tw-text-5xl">
                Prospectez les bonnes entreprises, avec le bon message.
              </h1>
              <p className="tw-mt-4 tw-max-w-xl tw-text-sm tw-leading-relaxed tw-text-slate-300 sm:tw-text-base">
                Un annuaire de 1000 entreprises, des contacts directs et des scripts de conversion
                prêts à l&apos;emploi — réunis dans un seul espace de travail.
              </p>
              <div className="tw-mt-6 tw-flex tw-flex-wrap tw-gap-3">
                <button
                  type="button"
                  onClick={goDirectory}
                  className="tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-bg-white tw-px-5 tw-py-3 tw-text-sm tw-font-bold tw-text-[#0b2545] tw-shadow-lg tw-transition hover:tw-bg-slate-100"
                >
                  Démarrer la prospection
                  <Icon path={ICONS.arrow} className="tw-h-4 tw-w-4" />
                </button>
                <button
                  type="button"
                  onClick={goScripts}
                  className="tw-inline-flex tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-border tw-border-white/20 tw-bg-white/5 tw-px-5 tw-py-3 tw-text-sm tw-font-semibold tw-text-white tw-transition hover:tw-bg-white/10"
                >
                  Découvrir les scripts
                </button>
              </div>
              <div className="tw-mt-7 tw-flex tw-flex-wrap tw-gap-x-6 tw-gap-y-2 tw-text-xs tw-text-slate-400">
                <span>
                  <strong className="tw-text-white">{stats.total}</strong> entreprises
                </span>
                <span>
                  <strong className="tw-text-white">{Object.keys(SECTORS).length}</strong> secteurs
                  d&apos;activité
                </span>
                <span>
                  <strong className="tw-text-white">2</strong> villes couvertes
                </span>
              </div>
            </div>

            <div className="tw-hidden lg:tw-block">
              <div className="tw-rounded-3xl tw-border tw-border-white/10 tw-bg-white/[0.04] tw-p-5">
                <p className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.14em] tw-text-slate-400">
                  Aperçu de l&apos;annuaire
                </p>
                <div className="tw-mt-4 tw-space-y-2.5">
                  {COMPANIES.slice(0, 3).map((c) => (
                    <div
                      key={`${c[2]}-${c[4]}`}
                      className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-rounded-xl tw-border tw-border-white/10 tw-bg-white/5 tw-px-3 tw-py-2.5"
                    >
                      <div className="tw-min-w-0">
                        <p className="tw-truncate tw-text-sm tw-font-semibold tw-text-white">
                          {c[2]}
                        </p>
                        <p className="tw-truncate tw-text-[11px] tw-text-slate-400">{c[4]}</p>
                      </div>
                      <span className="tw-shrink-0 tw-rounded-full tw-bg-sky-400/15 tw-px-2.5 tw-py-1 tw-text-[10px] tw-font-bold tw-text-sky-300">
                        {c[0]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="tw-mt-4 tw-flex tw-items-center tw-justify-between tw-rounded-xl tw-bg-white/5 tw-px-3 tw-py-2.5">
                  <span className="tw-text-xs tw-text-slate-400">Contacts exploitables</span>
                  <span className="tw-text-sm tw-font-bold tw-text-emerald-300">
                    {stats.whatsapp}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CE QUE PROPOSE L'INTERFACE */}
      <section className="fr-no-print tw-mx-auto tw-max-w-[1380px] tw-px-5 tw-pt-10 sm:tw-px-8">
        <div className="tw-max-w-2xl">
          <p className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-[0.14em] tw-text-fr-primary">
            Ce que vous trouverez ici
          </p>
          <h2 className="tw-mt-2 tw-text-2xl tw-font-bold sm:tw-text-3xl">
            Un espace pensé pour convertir, pas seulement pour lister.
          </h2>
          <p className="tw-mt-2 tw-text-sm tw-text-fr-muted">
            Tout est organisé pour vous faire gagner du temps : de la recherche de la cible
            jusqu&apos;au message à envoyer.
          </p>
        </div>
        <div className="tw-mt-6 tw-grid tw-gap-3 sm:tw-grid-cols-2 xl:tw-grid-cols-4">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="tw-rounded-2xl tw-border tw-border-fr-border tw-bg-fr-surface tw-p-4 tw-shadow-sm"
            >
              <div className="tw-flex tw-h-10 tw-w-10 tw-items-center tw-justify-center tw-rounded-xl tw-bg-fr-soft-2 tw-text-fr-primary">
                <Icon path={ICONS[feature.icon]} />
              </div>
              <h3 className="tw-mt-3 tw-text-sm tw-font-bold">{feature.title}</h3>
              <p className="tw-mt-1 tw-text-xs tw-leading-relaxed tw-text-fr-muted">
                {feature.text}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="fr-no-print tw-mx-auto tw-mt-8 tw-max-w-[1380px] tw-px-5 sm:tw-px-8">
        <div className="tw-rounded-2xl tw-border tw-border-fr-border tw-bg-fr-surface tw-p-4 tw-shadow-sm sm:tw-p-5">
          <div className="tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-2">
            <h2 className="tw-text-lg tw-font-bold">Comment ça marche</h2>
            <p className="tw-text-xs tw-text-fr-muted">Trois étapes, un seul objectif : décrocher un rendez-vous.</p>
          </div>
          <div className="tw-mt-4 tw-grid tw-gap-3 md:tw-grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="tw-rounded-xl tw-border tw-border-fr-border tw-bg-fr-soft tw-p-4"
              >
                <span className="tw-inline-flex tw-h-8 tw-w-8 tw-items-center tw-justify-center tw-rounded-lg tw-bg-fr-primary tw-text-xs tw-font-bold tw-text-fr-on-primary">
                  {step.n}
                </span>
                <h3 className="tw-mt-2.5 tw-text-sm tw-font-bold">{step.title}</h3>
                <p className="tw-mt-1 tw-text-xs tw-leading-relaxed tw-text-fr-muted">
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATISTIQUES */}
      <section className="fr-no-print tw-mx-auto tw-mt-4 tw-max-w-[1380px] tw-px-5 sm:tw-px-8">
        <div className="tw-grid tw-grid-cols-2 tw-gap-3 lg:tw-grid-cols-4">
          {statCards.map((card) => (
            <article
              key={card.label}
              className="tw-rounded-2xl tw-border tw-border-fr-border tw-bg-fr-surface tw-p-3.5 tw-shadow-sm sm:tw-p-5"
            >
              <p className="tw-text-[10px] tw-font-bold tw-uppercase tw-tracking-[0.12em] tw-text-fr-muted sm:tw-text-[11px]">
                {card.label}
              </p>
              <p className="tw-mt-1 tw-text-xl tw-font-extrabold tw-text-fr-primary sm:tw-text-2xl">
                {card.value}
              </p>
              <p className="tw-mt-0.5 tw-text-[10px] tw-font-medium tw-text-fr-muted sm:tw-text-xs">
                {card.sub}
              </p>
              <div className="tw-mt-3 tw-h-1.5 tw-w-full tw-overflow-hidden tw-rounded-full tw-bg-fr-soft-2">
                <div
                  className="tw-h-full tw-rounded-full tw-bg-fr-primary"
                  style={{ width: `${card.progress}%` }}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ESPACE DE TRAVAIL */}
      <section
        id="annuaire"
        className="tw-mx-auto tw-mt-8 tw-max-w-[1380px] tw-scroll-mt-4 tw-px-5 sm:tw-px-8"
      >
        <div className="fr-no-print tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-3">
          <div className="tw-inline-flex tw-flex-wrap tw-rounded-2xl tw-border tw-border-fr-border tw-bg-fr-surface tw-p-1 tw-shadow-sm">
            <button
              type="button"
              className={`tw-rounded-xl tw-px-4 tw-py-2 tw-text-sm tw-font-semibold tw-transition ${
                tab === "directory"
                  ? "tw-bg-fr-primary tw-text-fr-on-primary tw-shadow-sm"
                  : "tw-text-fr-muted hover:tw-text-fr-text"
              }`}
              onClick={() => setTab("directory")}
            >
              Annuaire des entreprises
            </button>
            <button
              type="button"
              className={`tw-rounded-xl tw-px-4 tw-py-2 tw-text-sm tw-font-semibold tw-transition ${
                tab === "scripts"
                  ? "tw-bg-fr-primary tw-text-fr-on-primary tw-shadow-sm"
                  : "tw-text-fr-muted hover:tw-text-fr-text"
              }`}
              onClick={() => setTab("scripts")}
            >
              Scripts &amp; relances
            </button>
          </div>
          <p className="tw-text-xs tw-text-fr-muted">
            {tab === "directory"
              ? hasQuery
                ? `${filtered.length} résultat(s)`
                : `${stats.total} entreprises disponibles`
              : `${SCRIPTS_DATA.length} secteurs couverts`}
          </p>
        </div>

        {/* ANNUAIRE */}
        <div className={tab === "directory" ? "tw-mt-4" : "tw-hidden"}>
          <div className="fr-no-print tw-rounded-2xl tw-border tw-border-fr-border tw-bg-fr-surface tw-p-4 tw-shadow-sm sm:tw-p-5">
            <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
              <div className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-font-bold">
                <Icon path={ICONS.filter} className="tw-h-4 tw-w-4 tw-text-fr-primary" />
                Filtres de recherche
              </div>
              {hasQuery ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="tw-text-xs tw-font-semibold tw-text-fr-primary hover:tw-underline"
                >
                  Réinitialiser ({activeFilters})
                </button>
              ) : (
                <span className="tw-text-xs tw-text-fr-muted">
                  Choisissez au moins un critère
                </span>
              )}
            </div>
            <div className="tw-mt-3 tw-grid tw-gap-3 md:tw-grid-cols-2 xl:tw-grid-cols-[2fr_1fr_1.6fr_1fr]">
              <input
                className={inputClass}
                type="text"
                placeholder="Nom, quartier, téléphone, e-mail, activité..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className={inputClass}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">Toutes les villes</option>
                <option value="Yaoundé">Yaoundé</option>
                <option value="Douala">Douala</option>
              </select>
              <select
                className={inputClass}
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              >
                <option value="">Tous les secteurs (1 à 8)</option>
                {Object.entries(SECTORS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                className={inputClass}
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">Tous les canaux</option>
                <option value="mobile">Avec WhatsApp / SMS (6xx)</option>
                <option value="fixe">Fixe uniquement (Appel)</option>
              </select>
            </div>
          </div>

          {!hasQuery ? (
            <div className="tw-mt-4 tw-rounded-2xl tw-border tw-border-dashed tw-border-fr-border tw-bg-fr-surface tw-px-5 tw-py-10 tw-text-center tw-shadow-sm">
              <div className="tw-mx-auto tw-flex tw-h-14 tw-w-14 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-fr-soft-2 tw-text-fr-primary">
                <Icon path={ICONS.search} className="tw-h-6 tw-w-6" />
              </div>
              <h3 className="tw-mt-4 tw-text-lg tw-font-bold">Lancez une recherche ciblée</h3>
              <p className="tw-mx-auto tw-mt-1 tw-max-w-md tw-text-sm tw-leading-relaxed tw-text-fr-muted">
                Saisissez un nom, un quartier ou un numéro, ou utilisez un raccourci ci-dessous.
                Les résultats s&apos;affichent par 10 pour garder la page légère.
              </p>
              <div className="tw-mt-5 tw-flex tw-flex-wrap tw-justify-center tw-gap-2">
                <button type="button" className={chipClass} onClick={() => setCity("Yaoundé")}>
                  Yaoundé
                </button>
                <button type="button" className={chipClass} onClick={() => setCity("Douala")}>
                  Douala
                </button>
                <button type="button" className={chipClass} onClick={() => setSector("7")}>
                  Secteur 7 — Tech &amp; BTP
                </button>
                <button type="button" className={chipClass} onClick={() => setChannel("mobile")}>
                  Avec WhatsApp / SMS
                </button>
              </div>
            </div>
          ) : (
            <div className="fr-print-card tw-mt-4 tw-overflow-hidden tw-rounded-2xl tw-border tw-border-fr-border tw-bg-fr-surface tw-shadow-sm">
              <div className="fr-no-print tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-4 tw-py-3">
                <p className="tw-text-xs tw-font-semibold tw-text-fr-text">
                  {visible.length} affichée(s) sur {filtered.length} résultat(s)
                </p>
                <p className="tw-text-xs tw-text-fr-muted">10 résultats maximum par affichage</p>
              </div>
              {filtered.length === 0 ? (
                <div className="tw-px-5 tw-py-10 tw-text-center tw-text-sm tw-text-fr-muted">
                  Aucune entreprise trouvée (vérifiez vos filtres).
                </div>
              ) : (
                <>
                  <div className="tw-overflow-x-auto">
                    <table className="tw-w-full tw-border-collapse tw-text-left tw-text-sm">
                      <thead>
                        <tr>
                          <th className="tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            #
                          </th>
                          <th className="tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            Ville
                          </th>
                          <th className="tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            Secteur
                          </th>
                          <th className="tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            Entreprise &amp; offre
                          </th>
                          <th className="tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            Localisation
                          </th>
                          <th className="tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            WhatsApp / SMS (6xx)
                          </th>
                          <th className="tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            Fixe
                          </th>
                          <th className="tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            E-mail
                          </th>
                          <th className="fr-no-print tw-whitespace-nowrap tw-border-b tw-border-fr-border tw-bg-fr-soft tw-px-3 tw-py-3 tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((c, idx) => {
                          const waUrl = firstWaLink(c[5]);
                          const mail = firstEmail(c[7]);
                          return (
                            <tr
                              key={`${c[2]}-${c[4]}-${idx}`}
                              className="tw-transition hover:tw-bg-fr-soft"
                            >
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top tw-text-fr-muted">
                                {idx + 1}
                              </td>
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top">
                                <span
                                  className={`tw-inline-block tw-whitespace-nowrap tw-rounded-full tw-px-2.5 tw-py-1 tw-text-[11px] tw-font-semibold ${
                                    c[0] === "Yaoundé"
                                      ? "tw-bg-sky-500/15 tw-text-sky-600"
                                      : "tw-bg-emerald-500/15 tw-text-emerald-600"
                                  }`}
                                >
                                  {c[0]}
                                </span>
                              </td>
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top">
                                <span className="tw-inline-block tw-whitespace-nowrap tw-rounded-full tw-bg-fr-soft-2 tw-px-2.5 tw-py-1 tw-text-[11px] tw-font-semibold tw-text-fr-text">
                                  S{c[1]}
                                </span>
                              </td>
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top">
                                <strong className="tw-font-semibold">{c[2]}</strong>
                                <br />
                                <span className="tw-text-xs tw-text-fr-muted">{c[3]}</span>
                              </td>
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top tw-text-xs">
                                {c[4]}
                              </td>
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top tw-text-xs">
                                {c[5] ? c[5] : <span className="tw-text-fr-muted">—</span>}
                              </td>
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top tw-text-xs">
                                {c[6] ? c[6] : <span className="tw-text-fr-muted">—</span>}
                              </td>
                              <td className="tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top tw-text-xs">
                                {c[7] ? c[7] : <span className="tw-text-fr-muted">—</span>}
                              </td>
                              <td className="fr-no-print tw-border-b tw-border-fr-border tw-px-3 tw-py-3 tw-align-top">
                                <div className="tw-flex tw-flex-wrap tw-gap-1.5">
                                  {waUrl ? (
                                    <a
                                      className="tw-inline-flex tw-items-center tw-rounded-lg tw-bg-emerald-500/15 tw-px-2.5 tw-py-1.5 tw-text-[11px] tw-font-semibold tw-text-emerald-600 tw-transition hover:tw-bg-emerald-500/25"
                                      href={waUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      WhatsApp
                                    </a>
                                  ) : null}
                                  {mail ? (
                                    <a
                                      className="tw-inline-flex tw-items-center tw-rounded-lg tw-bg-sky-500/15 tw-px-2.5 tw-py-1.5 tw-text-[11px] tw-font-semibold tw-text-sky-600 tw-transition hover:tw-bg-sky-500/25"
                                      href={`mailto:${mail}`}
                                    >
                                      E-mail
                                    </a>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {visible.length < filtered.length ? (
                    <div className="fr-no-print tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-3 tw-border-t tw-border-fr-border tw-p-4">
                      <button
                        type="button"
                        className={primaryBtnClass}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Afficher les {Math.min(PAGE_SIZE, filtered.length - visible.length)}{" "}
                        suivantes
                      </button>
                      <span className="tw-text-xs tw-text-fr-muted">
                        {filtered.length - visible.length} résultat(s) restant(s)
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>

        {/* SCRIPTS */}
        <div className={tab === "scripts" ? "tw-mt-4" : "tw-hidden"}>
          <div className="fr-no-print tw-rounded-2xl tw-border tw-border-fr-border tw-bg-fr-surface tw-p-4 tw-shadow-sm sm:tw-p-5">
            <h2 className="tw-text-base tw-font-bold">
              Personnalisez tous vos scripts en une fois
            </h2>
            <p className="tw-mt-1 tw-text-xs tw-text-fr-muted">
              Vos informations sont injectées automatiquement dans chaque message (WhatsApp, SMS,
              e-mail).
            </p>
            <div className="tw-mt-4 tw-grid tw-gap-3 sm:tw-grid-cols-2 xl:tw-grid-cols-4">
              <input
                className={inputClass}
                type="text"
                placeholder="Votre prénom / nom (ex : Marc K.)"
                value={info.name}
                onChange={(e) => setInfo((v) => ({ ...v, name: e.target.value }))}
              />
              <input
                className={inputClass}
                type="text"
                placeholder="Nom de votre structure"
                value={info.agency}
                onChange={(e) => setInfo((v) => ({ ...v, agency: e.target.value }))}
              />
              <input
                className={inputClass}
                type="text"
                placeholder="Votre numéro / WhatsApp"
                value={info.phone}
                onChange={(e) => setInfo((v) => ({ ...v, phone: e.target.value }))}
              />
              <input
                className={inputClass}
                type="text"
                placeholder="Votre e-mail"
                value={info.email}
                onChange={(e) => setInfo((v) => ({ ...v, email: e.target.value }))}
              />
            </div>
          </div>

          <div className="tw-mt-4 tw-space-y-4">
            {SCRIPTS_DATA.map((script) => (
              <article
                key={script.title}
                className="fr-print-card tw-rounded-2xl tw-border tw-border-fr-border tw-bg-fr-surface tw-p-4 tw-shadow-sm sm:tw-p-5"
              >
                <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-2">
                  <div>
                    <h2 className="tw-text-base tw-font-bold sm:tw-text-lg">{script.title}</h2>
                    <p className="tw-mt-0.5 tw-text-xs tw-text-fr-muted">{script.trigger}</p>
                  </div>
                  <span className="tw-rounded-full tw-bg-fr-soft-2 tw-px-2.5 tw-py-1 tw-text-[10px] tw-font-bold tw-uppercase tw-tracking-wide tw-text-fr-muted">
                    Prêt à l&apos;emploi
                  </span>
                </div>
                <div className="tw-mt-4 tw-grid tw-gap-3 lg:tw-grid-cols-3">
                  {[
                    ["WhatsApp", "whatsapp"],
                    ["SMS / Appel", "sms"],
                    ["E-mail", "email"],
                  ].map(([label, key]) => (
                    <div
                      key={key}
                      className="tw-rounded-xl tw-border tw-border-fr-border tw-bg-fr-soft tw-p-3"
                    >
                      <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
                        <span className="tw-text-xs tw-font-bold tw-text-fr-text">{label}</span>
                        <button
                          type="button"
                          className="fr-no-print tw-rounded-lg tw-border tw-border-fr-border tw-bg-fr-surface tw-px-2.5 tw-py-1.5 tw-text-[11px] tw-font-semibold tw-text-fr-text tw-transition hover:tw-border-fr-primary hover:tw-text-fr-primary"
                          onClick={() => copyText(personalize(script[key], info))}
                        >
                          Copier
                        </button>
                      </div>
                      <p className="tw-mt-2 tw-whitespace-pre-wrap tw-text-xs tw-leading-relaxed tw-text-fr-text">
                        {personalize(script[key], info)}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div
        className={`tw-fixed tw-bottom-6 tw-left-1/2 tw-z-[999] -tw-translate-x-1/2 tw-rounded-full tw-bg-slate-900 tw-px-5 tw-py-3 tw-text-sm tw-font-semibold tw-text-white tw-shadow-xl tw-transition-all tw-duration-300 ${
          toast ? "tw-translate-y-0 tw-opacity-100" : "tw-pointer-events-none tw-translate-y-3 tw-opacity-0"
        }`}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </main>
  );
}
