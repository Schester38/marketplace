import React, { useEffect, useState } from "react";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function OfflinePage() {
  const { t } = useLang();
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <main className="tw-min-h-screen tw-flex tw-items-center tw-justify-center tw-px-6 tw-bg-gradient-to-br tw-from-slate-950 tw-via-indigo-950 tw-to-slate-900 tw-text-slate-100 tw-relative tw-overflow-hidden">
      <div className="tw-absolute tw-inset-0 tw-pointer-events-none" aria-hidden="true">
        <div className="tw-absolute tw-top-1/4 tw-left-1/4 tw-w-96 tw-h-96 tw-bg-sky-500/20 tw-rounded-full tw-blur-3xl" />
        <div className="tw-absolute tw-bottom-1/4 tw-right-1/4 tw-w-96 tw-h-96 tw-bg-indigo-500/20 tw-rounded-full tw-blur-3xl" />
      </div>
      <Seo
        title={t("Pas de connexion internet") + " — MboppiShop"}
        description={t("Pas de connexion internet")}
        noindex
      />
      <div className="tw-relative tw-z-10 tw-max-w-md tw-w-full tw-text-center">
        <div className="tw-mb-6 tw-inline-flex tw-items-center tw-justify-center tw-w-28 tw-h-28 tw-rounded-full tw-bg-white/5 tw-backdrop-blur tw-border tw-border-white/10 tw-shadow-2xl">
          <span className="tw-text-6xl tw-drop-shadow-lg">📡</span>
        </div>
        <h1 className="tw-text-4xl tw-font-extrabold tw-tracking-tight tw-mb-4 tw-bg-gradient-to-r tw-from-white tw-to-sky-200 tw-bg-clip-text tw-text-transparent">
          {t("Pas de connexion internet")}
        </h1>
        <p className="tw-text-slate-300 tw-text-lg tw-leading-relaxed tw-mb-8">
          {t("Vous êtes actuellement hors ligne. Vérifiez votre connexion puis réessayez.")}
        </p>
        <button
          type="button"
          className="tw-inline-flex tw-items-center tw-justify-center tw-gap-3 tw-px-10 tw-py-4 tw-rounded-full tw-bg-gradient-to-r tw-from-sky-500 tw-to-indigo-500 hover:tw-from-sky-400 hover:tw-to-indigo-400 tw-text-white tw-font-bold tw-text-lg tw-transition-all tw-duration-300 tw-shadow-2xl tw-shadow-sky-500/40 hover:tw-shadow-sky-400/60 hover:tw-scale-105 tw-border tw-border-white/20"
          onClick={() => window.location.reload()}
        >
          🔄 {t("Réessayer")}
        </button>
        <div className="tw-mt-10 tw-pt-8 tw-border-t tw-border-white/10">
          <p className="tw-text-slate-500 tw-text-sm tw-tracking-wide">
            MboppiShop — votre marché en ligne
          </p>
        </div>
      </div>
    </main>
  );
}
