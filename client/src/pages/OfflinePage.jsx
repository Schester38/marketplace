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
    <main className="tw-min-h-screen tw-flex tw-items-center tw-justify-center tw-px-6 tw-bg-slate-900 tw-text-slate-100">
      <Seo
        title={t("Pas de connexion internet") + " — MboppiShop"}
        description={t("Pas de connexion internet")}
        noindex
      />
      <div className="tw-max-w-md tw-w-full tw-text-center">
        <span className="tw-text-6xl tw-mb-4">📡</span>
        <h1>{t("Pas de connexion internet")}</h1>
        <p className="tw-text-slate-400 tw-mb-6">
          {t("Vous êtes actuellement hors ligne. Vérifiez votre connexion puis réessayez.")}
        </p>
        <div className="tw-mt-2">
          <button
            type="button"
            className="tw-inline-flex tw-items-center tw-gap-2 tw-px-6 tw-py-3 tw-rounded-full tw-bg-sky-500 hover:tw-bg-sky-400 tw-text-white tw-font-semibold tw-transition tw-shadow-lg tw-shadow-sky-500/30"
            onClick={() => window.location.reload()}
          >
            🔄 {t("Réessayer")}
          </button>
        </div>
      </div>
    </main>
  );
}
