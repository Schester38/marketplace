import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { BASE_URL } from "../config.js";
import { useLang } from "../i18n.jsx";
import Seo from "../components/Seo.jsx";
import FormationFunnelForm from "../components/FormationFunnelForm.jsx";

const URGENCY_KEY = (id) => `mboppi_funnel_deadline_${id}`;

function readDeadline(id, minutes) {
  const fallback = Date.now() + Math.max(1, Number(minutes) || 90) * 60 * 1000;
  try {
    const raw = Number(localStorage.getItem(URGENCY_KEY(id)));
    if (Number.isFinite(raw) && raw > Date.now()) return raw;
    localStorage.setItem(URGENCY_KEY(id), String(fallback));
  } catch {
    // stockage indisponible : le compte à rebours reste local à la page
  }
  return fallback;
}

function pad(n) {
  return String(Math.max(0, n)).padStart(2, "0");
}

function useCountdown(deadline) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  return {
    expired: remaining <= 0,
    hours: Math.floor(remaining / 3600),
    minutes: Math.floor((remaining % 3600) / 60),
    seconds: remaining % 60,
  };
}

function money(value, currency = "XAF") {
  return `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} ${currency}`;
}

function CountdownBoxes({ countdown, compact = false }) {
  const items = [
    { value: countdown.hours, label: "Heures" },
    { value: countdown.minutes, label: "Minutes" },
    { value: countdown.seconds, label: "Secondes" },
  ];
  return (
    <div className={`tw-flex tw-items-center ${compact ? "tw-gap-1.5" : "tw-gap-2"}`}>
      {items.map((item, index) => (
        <div key={item.label} className="tw-flex tw-items-center tw-gap-1.5">
          <div
            className={`tw-flex tw-flex-col tw-items-center tw-rounded-xl tw-border tw-border-white/15 tw-bg-white/10 tw-backdrop-blur ${
              compact ? "tw-px-2.5 tw-py-1.5" : "tw-px-4 tw-py-2.5"
            }`}
          >
            <span
              className={`funnel-expiry-blink tw-font-black tw-tabular-nums tw-leading-none tw-text-rose-400 ${
                compact ? "tw-text-lg" : "tw-text-3xl"
              }`}
            >
              {pad(item.value)}
            </span>
            <span className="tw-mt-1 tw-text-[9px] tw-uppercase tw-tracking-widest tw-text-white/60">
              {item.label}
            </span>
          </div>
          {index < items.length - 1 && (
            <span className={`tw-font-black tw-text-white/50 ${compact ? "tw-text-base" : "tw-text-2xl"}`}>
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="tw-min-h-screen tw-bg-[#050914] tw-px-4 tw-py-16">
      <div className="tw-mx-auto tw-max-w-6xl tw-animate-pulse tw-space-y-6">
        <div className="tw-h-6 tw-w-48 tw-rounded tw-bg-white/10" />
        <div className="tw-h-16 tw-w-full tw-rounded-2xl tw-bg-white/10" />
        <div className="tw-h-72 tw-w-full tw-rounded-3xl tw-bg-white/5" />
      </div>
    </div>
  );
}

export default function FormationFunnel() {
  const { id } = useParams();
  const { t } = useLang();
  const [funnel, setFunnel] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [shareMsg, setShareMsg] = useState("");

  useEffect(() => {
    let alive = true;
    setFunnel(null);
    setError("");
    api
      .funnelGet(id)
      .then((data) => {
        if (alive) setFunnel(data.funnel);
      })
      .catch((err) => {
        if (alive) setError(err.message || t("Page de vente introuvable."));
      });
    return () => {
      alive = false;
    };
  }, [id, t]);

  const deadline = useMemo(
    () => (funnel ? readDeadline(id, funnel.countdown_minutes) : Date.now()),
    [funnel, id]
  );
  const countdown = useCountdown(deadline);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (error) {
    return (
      <div className="tw-flex tw-min-h-screen tw-flex-col tw-items-center tw-justify-center tw-bg-[#050914] tw-px-6 tw-text-center tw-text-white">
        <span className="tw-text-5xl">🔒</span>
        <h1 className="tw-mt-4 tw-text-2xl tw-font-bold">{t("Offre indisponible")}</h1>
        <p className="tw-mt-2 tw-max-w-md tw-text-white/60">{error}</p>
        <Link
          to="/"
          className="tw-mt-6 tw-rounded-xl tw-bg-white tw-px-5 tw-py-2.5 tw-font-semibold tw-text-slate-900"
        >
          {t("Retour à l'accueil")}
        </Link>
      </div>
    );
  }

  if (!funnel) return <Skeleton />;

  const soldOut = funnel.seats_left <= 0;
  const progress = Math.min(
    100,
    Math.round((funnel.seats_taken / Math.max(1, funnel.seats_total)) * 100)
  );
  const oldPrice =
    funnel.old_price && Number(funnel.old_price) > Number(funnel.price) ? funnel.old_price : null;
  const discount = oldPrice
    ? Math.round((1 - Number(funnel.price) / Number(funnel.old_price)) * 100)
    : null;

  const openForm = () => {
    if (soldOut) return;
    setShowForm(true);
  };

  const shareUrl = `${BASE_URL}/f/${funnel.product_id}`;
  const shareOffer = async () => {
    const payload = {
      title: funnel.name,
      text: funnel.headline || t("Découvrez cette formation sur MboppiShop."),
      url: shareUrl,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMsg(t("Lien copié — partagez-le avec un ami."));
    } catch {
      window.prompt(t("Copiez ce lien :"), shareUrl);
      return;
    }
    window.setTimeout(() => setShareMsg(""), 2600);
  };
  const openLightbox = (src, alt) => setLightbox({ src, alt });

  return (
    <div className="tw-min-h-screen tw-bg-[#050914] tw-font-sans tw-text-white">
      <Seo
        title={`${funnel.name} — ${t("Offre limitée")} | MboppiShop`}
        description={funnel.headline || funnel.description || t("Formation en ligne à durée limitée sur MboppiShop.")}
        ogImage={funnel.image}
      />
      {/* Bandeau de confiance */}
      <div className="tw-border-b tw-border-white/10 tw-bg-white/5">
        <div className="tw-mx-auto tw-flex tw-max-w-6xl tw-flex-wrap tw-items-center tw-justify-between tw-gap-2 tw-px-4 tw-py-2.5 tw-text-xs tw-text-white/70">
          <span className="tw-flex tw-items-center tw-gap-2">
            <span className="tw-font-bold tw-text-white">MboppiShop</span>
            <span className="tw-text-white/30">•</span>
            {t("Formation officielle")}
            {funnel.shop?.verified && (
              <span className="tw-rounded-full tw-bg-emerald-400/15 tw-px-2 tw-py-0.5 tw-font-semibold tw-text-emerald-300">
                ✓ {t("Vérifié")}
              </span>
            )}
          </span>
          <span className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
            <span className="tw-flex tw-items-center tw-gap-1.5 tw-rounded-full tw-bg-emerald-400/10 tw-px-2.5 tw-py-1 tw-text-emerald-300">
              🔒 {t("Paiement sécurisé iKeePay")}
            </span>
            <button
              type="button"
              onClick={shareOffer}
              className="tw-flex tw-items-center tw-gap-1.5 tw-rounded-full tw-border tw-border-white/15 tw-bg-white/5 tw-px-2.5 tw-py-1 tw-font-semibold tw-text-white tw-transition hover:tw-bg-white/10"
            >
              🔗 {t("Partager l'offre")}
            </button>
          </span>
        </div>
      </div>

      <main className="tw-mx-auto tw-max-w-6xl tw-px-4 tw-py-8 md:tw-py-12">
        <div className="tw-grid tw-gap-8 lg:tw-grid-cols-[1.15fr_0.85fr] lg:tw-items-start">
          {/* Colonne éditoriale */}
          <div>
            <div className="tw-inline-flex tw-flex-wrap tw-items-center tw-gap-2 tw-rounded-full tw-border tw-border-amber-400/30 tw-bg-amber-400/10 tw-px-3 tw-py-1.5 tw-text-xs tw-font-bold tw-uppercase tw-tracking-wider tw-text-amber-300">
              🔥 {t("Offre flash — places limitées")}
              {!countdown.expired && (
                <span className="tw-hidden tw-items-center tw-gap-1 sm:tw-inline-flex">
                  • {t("se termine dans")}
                  <span className="funnel-expiry-blink tw-font-black tw-tabular-nums tw-text-rose-400">
                    {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
                  </span>
                </span>
              )}
            </div>

            <h1 className="tw-mt-4 tw-text-3xl tw-font-black tw-leading-tight tw-tracking-tight sm:tw-text-4xl md:tw-text-5xl">
              {funnel.name}
            </h1>
            {funnel.headline && (
              <p className="tw-mt-3 tw-text-lg tw-font-medium tw-leading-relaxed tw-text-amber-200/90 md:tw-text-xl">
                {funnel.headline}
              </p>
            )}
            {funnel.description && (
              <p className="tw-mt-4 tw-whitespace-pre-line tw-text-sm tw-leading-relaxed tw-text-white/70 md:tw-text-base">
                {funnel.description}
              </p>
            )}

            {/* Compte à rebours + places */}
            <div className="tw-mt-6 tw-rounded-2xl tw-border tw-border-white/10 tw-bg-gradient-to-br tw-from-white/10 tw-to-white/[0.03] tw-p-4 md:tw-p-5">
              <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-4">
                <div>
                  <p className="tw-text-[11px] tw-font-bold tw-uppercase tw-tracking-widest tw-text-white/50">
                    {countdown.expired ? t("Dernières places disponibles") : t("L'offre expire dans")}
                  </p>
                  <div className="tw-mt-2">
                    <CountdownBoxes countdown={countdown} />
                  </div>
                </div>
                <div className="tw-min-w-[180px] tw-flex-1">
                  <div className="tw-flex tw-items-baseline tw-justify-between tw-text-xs tw-text-white/60">
                    <span>{t("Places occupées")}</span>
                    <span className="tw-font-bold tw-text-amber-300">
                      {funnel.seats_taken}/{funnel.seats_total}
                    </span>
                  </div>
                  <div className="tw-mt-1.5 tw-h-2.5 tw-overflow-hidden tw-rounded-full tw-bg-white/10">
                    <div
                      className="tw-h-full tw-rounded-full tw-bg-gradient-to-r tw-from-amber-400 tw-to-orange-500 tw-transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="tw-mt-2 tw-text-[11px] tw-text-white/45">
                    {soldOut
                      ? t("Toutes les places ont été prises.")
                      : t("Déjà {n} personne(s) ont rejoint cette formation.", { n: funnel.seats_taken })}
                  </p>
                </div>
              </div>
            </div>

            {/* Modules */}
            {funnel.modules.length > 0 && (
              <section className="tw-mt-10">
                <h2 className="tw-flex tw-items-center tw-gap-2 tw-text-xl tw-font-bold md:tw-text-2xl">
                  🎯 {t("Ce que vous allez apprendre")}
                </h2>
                <div className="tw-mt-4 tw-space-y-3">
                  {funnel.modules.map((module, index) => (
                    <div
                      key={`${module.title}-${index}`}
                      className="tw-flex tw-gap-3 tw-rounded-2xl tw-border tw-border-white/10 tw-bg-white/[0.04] tw-p-3.5 md:tw-p-4"
                    >
                      <span className="tw-flex tw-h-9 tw-w-9 tw-shrink-0 tw-items-center tw-justify-center tw-rounded-xl tw-bg-blue-500/15 tw-text-sm tw-font-black tw-text-blue-300">
                        {pad(index + 1)}
                      </span>
                      <div className="tw-min-w-0">
                        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-2">
                          <h3 className="tw-text-sm tw-font-bold tw-text-white md:tw-text-base">
                            {module.title}
                          </h3>
                          {module.duration && (
                            <span className="tw-rounded-full tw-bg-white/10 tw-px-2 tw-py-0.5 tw-text-[10px] tw-font-semibold tw-text-white/60">
                              ⏱ {module.duration}
                            </span>
                          )}
                        </div>
                        {module.subtitle && (
                          <p className="tw-mt-0.5 tw-text-xs tw-font-medium tw-text-blue-200/80">
                            {module.subtitle}
                          </p>
                        )}
                        {module.description && (
                          <p className="tw-mt-1 tw-text-xs tw-leading-relaxed tw-text-white/55 md:tw-text-sm">
                            {module.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Bonus */}
            {funnel.bonuses.length > 0 && (
              <section className="tw-mt-10">
                <h2 className="tw-flex tw-items-center tw-gap-2 tw-text-xl tw-font-bold md:tw-text-2xl">
                  🎁 {t("Bonus offerts")}
                </h2>
                <div className="tw-mt-4 tw-grid tw-gap-4 sm:tw-grid-cols-2">
                  {funnel.bonuses.map((bonus, index) => (
                    <div
                      key={`${bonus.title}-${index}`}
                      className="tw-overflow-hidden tw-rounded-2xl tw-border tw-border-amber-400/20 tw-bg-gradient-to-b tw-from-amber-400/10 tw-to-white/[0.02]"
                    >
                      {bonus.image ? (
                        <button
                          type="button"
                          onClick={() => openLightbox(bonus.image, bonus.title || `Bonus ${index + 1}`)}
                          aria-label={t("Agrandir l'image")}
                          className="tw-block tw-w-full tw-cursor-zoom-in"
                        >
                          <img
                            src={bonus.image}
                            alt={bonus.title || `Bonus ${index + 1}`}
                            loading="lazy"
                            className="tw-h-40 tw-w-full tw-object-cover"
                          />
                        </button>
                      ) : (
                        <div className="tw-flex tw-h-24 tw-items-center tw-justify-center tw-bg-amber-400/10 tw-text-3xl">
                          🎁
                        </div>
                      )}
                      <div className="tw-p-4">
                        <span className="tw-text-[10px] tw-font-black tw-uppercase tw-tracking-widest tw-text-amber-300">
                          {t("Bonus {n}", { n: index + 1 })}
                        </span>
                        <h3 className="tw-mt-1 tw-text-sm tw-font-bold">{bonus.title}</h3>
                        {bonus.description && (
                          <p className="tw-mt-1 tw-text-xs tw-leading-relaxed tw-text-white/60">
                            {bonus.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="tw-mt-10 tw-grid tw-gap-3 sm:tw-grid-cols-3">
              {[
                { icon: "⚡", title: t("Accès immédiat"), text: t("Le groupe privé est accessible après paiement.") },
                { icon: "🔒", title: t("Paiement sécurisé"), text: t("Transaction chiffrée via iKeePay.") },
                { icon: "🧾", title: t("Reçu officiel"), text: t("Un reçu PDF téléchargeable est généré.") },
              ].map((item) => (
                <div
                  key={item.title}
                  className="tw-rounded-2xl tw-border tw-border-white/10 tw-bg-white/[0.03] tw-p-4"
                >
                  <span className="tw-text-2xl">{item.icon}</span>
                  <h3 className="tw-mt-2 tw-text-sm tw-font-bold">{item.title}</h3>
                  <p className="tw-mt-1 tw-text-xs tw-text-white/55">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Carte d'achat */}
          <aside className="lg:tw-sticky lg:tw-top-6">
            <div className="tw-overflow-hidden tw-rounded-3xl tw-border tw-border-white/10 tw-bg-[#0b1220] tw-shadow-2xl tw-shadow-blue-950/40">
              <div className="tw-relative">
                {funnel.image ? (
                  <button
                    type="button"
                    onClick={() => openLightbox(funnel.image, funnel.name)}
                    aria-label={t("Agrandir l'image")}
                    className="tw-block tw-w-full tw-cursor-zoom-in"
                  >
                    <img
                      src={funnel.image}
                      alt={funnel.name}
                      className="tw-h-56 tw-w-full tw-object-cover"
                    />
                  </button>
                ) : (
                  <div className="tw-flex tw-h-56 tw-items-center tw-justify-center tw-bg-gradient-to-br tw-from-blue-700 tw-to-indigo-900 tw-text-6xl">
                    🎓
                  </div>
                )}
                <div className="tw-pointer-events-none tw-absolute tw-inset-0 tw-bg-gradient-to-t tw-from-[#0b1220] tw-via-transparent tw-to-transparent" />
                {discount ? (
                  <span className="tw-pointer-events-none tw-absolute tw-left-3 tw-top-3 tw-rounded-full tw-bg-rose-500 tw-px-3 tw-py-1 tw-text-xs tw-font-black tw-text-white">
                    -{discount}%
                  </span>
                ) : null}
                <span className="tw-pointer-events-none tw-absolute tw-right-3 tw-top-3 tw-rounded-full tw-bg-black/60 tw-px-3 tw-py-1 tw-text-[10px] tw-font-bold tw-uppercase tw-tracking-wider tw-text-amber-300 tw-backdrop-blur">
                  ⏳ {t("Offre limitée")}
                </span>
                {funnel.image && (
                  <span className="tw-pointer-events-none tw-absolute tw-bottom-3 tw-left-3 tw-rounded-full tw-bg-black/60 tw-px-2.5 tw-py-1 tw-text-[10px] tw-font-semibold tw-text-white/80 tw-backdrop-blur">
                    🔍 {t("Cliquez pour agrandir")}
                  </span>
                )}
              </div>

              <div className="tw-p-5">
                <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wider tw-text-white/45">
                  {t("Prix de la formation")}
                </p>
                <div className="tw-mt-1 tw-flex tw-flex-wrap tw-items-end tw-gap-3">
                  <span className="tw-text-4xl tw-font-black tw-tracking-tight tw-text-white">
                    {money(funnel.price, funnel.currency)}
                  </span>
                  {oldPrice && (
                    <span className="tw-pb-1.5 tw-text-base tw-font-semibold tw-text-white/40 tw-line-through">
                      {money(oldPrice, funnel.currency)}
                    </span>
                  )}
                </div>
                <p className="tw-mt-1 tw-text-xs tw-text-emerald-300">
                  ✓ {t("Paiement unique — accès à la formation et aux bonus")}
                </p>

                <div className="tw-mt-4 tw-rounded-xl tw-bg-white/[0.05] tw-p-3">
                  <div className="tw-flex tw-items-center tw-justify-between tw-text-xs tw-text-white/60">
                    <span>{t("Cette offre se termine dans")}</span>
                    <span className="funnel-expiry-blink tw-font-black tw-tabular-nums tw-text-rose-400">
                      {countdown.expired
                        ? "00:00:00"
                        : `${pad(countdown.hours)}:${pad(countdown.minutes)}:${pad(countdown.seconds)}`}
                    </span>
                  </div>
                  <div className="tw-mt-2 tw-h-1.5 tw-overflow-hidden tw-rounded-full tw-bg-white/10">
                    <div
                      className="tw-h-full tw-rounded-full tw-bg-gradient-to-r tw-from-amber-400 tw-to-rose-500"
                      style={{ width: `${Math.max(4, 100 - progress)}%` }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={openForm}
                  disabled={soldOut}
                  className="tw-mt-5 tw-w-full tw-rounded-2xl tw-bg-gradient-to-r tw-from-amber-400 tw-via-orange-500 tw-to-rose-500 tw-px-5 tw-py-4 tw-text-base tw-font-black tw-text-slate-950 tw-shadow-lg tw-shadow-orange-500/25 tw-transition hover:tw-brightness-110 active:tw-scale-[0.99] disabled:tw-cursor-not-allowed disabled:tw-opacity-50"
                >
                  {soldOut ? t("Complet") : `🔒 ${t("Réserver ma place")} — ${money(funnel.price, funnel.currency)}`}
                </button>

                <button
                  type="button"
                  onClick={shareOffer}
                  className="tw-mt-3 tw-w-full tw-rounded-2xl tw-border tw-border-white/15 tw-bg-white/5 tw-px-5 tw-py-3 tw-text-sm tw-font-bold tw-text-white tw-transition hover:tw-bg-white/10 active:tw-scale-[0.99]"
                >
                  🔗 {t("Partager l'offre")}
                </button>

                <div className="tw-mt-3 tw-space-y-1.5 tw-text-center tw-text-[11px] tw-text-white/45">
                  <p>🔐 {t("Paiement sécurisé par iKeePay (Mobile Money, carte)")}</p>
                  <p>🧾 {t("Reçu PDF + accès au groupe privé immédiatement après paiement")}</p>
                </div>

                {funnel.shop?.name && (
                  <div className="tw-mt-4 tw-flex tw-items-center tw-gap-2.5 tw-border-t tw-border-white/10 tw-pt-4">
                    {funnel.shop.avatar ? (
                      <img
                        src={funnel.shop.avatar}
                        alt=""
                        className="tw-h-9 tw-w-9 tw-rounded-full tw-object-cover"
                      />
                    ) : (
                      <span className="tw-flex tw-h-9 tw-w-9 tw-items-center tw-justify-center tw-rounded-full tw-bg-blue-500/20 tw-text-sm tw-font-bold tw-text-blue-300">
                        {String(funnel.shop.name).slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="tw-min-w-0">
                      <p className="tw-truncate tw-text-xs tw-font-bold tw-text-white">
                        {funnel.shop.name}
                      </p>
                      <p className="tw-text-[10px] tw-text-white/45">
                        {funnel.shop.city || t("Formateur MboppiShop")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className="tw-mt-3 tw-text-center tw-text-[11px] tw-text-white/35">
              {t("Des questions ?")}{" "}
              <Link to="/contact" className="tw-text-white/60 tw-underline">
                {t("Contactez-nous")}
              </Link>
            </p>
          </aside>
        </div>

        {/* Rappel final */}
        <div className="tw-mt-12 tw-rounded-3xl tw-border tw-border-amber-400/20 tw-bg-gradient-to-r tw-from-amber-400/10 tw-via-orange-500/5 tw-to-transparent tw-p-6 md:tw-p-8">
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-4">
            <div>
              <h2 className="tw-text-xl tw-font-black md:tw-text-2xl">
                {t("Ne laissez pas passer cette offre")}
              </h2>
              <p className="tw-mt-1 tw-text-sm tw-text-white/60">
                {t("Il ne reste que {n} place(s) à ce prix.", { n: funnel.seats_left })}
              </p>
            </div>
            <button
              type="button"
              onClick={openForm}
              disabled={soldOut}
              className="tw-rounded-2xl tw-bg-white tw-px-6 tw-py-3 tw-text-sm tw-font-bold tw-text-slate-900 disabled:tw-opacity-50"
            >
              {soldOut ? t("Complet") : t("Je réserve ma place")}
            </button>
          </div>
        </div>
      </main>

      <footer className="tw-border-t tw-border-white/10 tw-py-6 tw-text-center tw-text-[11px] tw-text-white/35">
        © {new Date().getFullYear()} MboppiShop — {t("Tous droits réservés.")}
      </footer>

      {shareMsg && (
        <div className="tw-fixed tw-bottom-5 tw-left-1/2 tw-z-[120] tw--translate-x-1/2 tw-rounded-full tw-bg-emerald-500 tw-px-5 tw-py-2.5 tw-text-sm tw-font-bold tw-text-white tw-shadow-xl">
          {shareMsg}
        </div>
      )}

      {lightbox && (
        <div
          className="tw-fixed tw-inset-0 tw-z-[110] tw-flex tw-items-center tw-justify-center tw-bg-black/95 tw-p-3 tw-backdrop-blur-sm md:tw-p-6"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("Aperçu de l'image")}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label={t("Fermer")}
            className="tw-absolute tw-right-4 tw-top-4 tw-z-10 tw-flex tw-h-10 tw-w-10 tw-items-center tw-justify-center tw-rounded-full tw-bg-white/10 tw-text-xl tw-font-bold tw-text-white tw-transition hover:tw-bg-white/20"
          >
            ✕
          </button>
          <img
            src={lightbox.src}
            alt={lightbox.alt || ""}
            onClick={(e) => e.stopPropagation()}
            className="tw-max-h-[88vh] tw-max-w-full tw-rounded-xl tw-object-contain tw-shadow-2xl"
          />
        </div>
      )}

      {showForm && (
        <FormationFunnelForm funnel={funnel} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
