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
    <main className="boost-page">
      <Seo
        title={t("Pas de connexion internet") + " — MboppiShop"}
        description={t("Pas de connexion internet")}
        noindex
      />
      <div className="boost-shell tw-flex tw-min-h-screen tw-items-center tw-justify-center">
        <section className="boost-card boost-card-pad tw-w-full tw-max-w-md tw-text-center">
          <p className="boost-kicker">MboppiShop</p>
          <div className="tw-mx-auto tw-mb-4 tw-flex tw-h-16 tw-w-16 tw-items-center tw-justify-center tw-rounded-2xl tw-bg-gradient-to-br tw-from-blue-600 tw-to-indigo-600 tw-text-3xl tw-shadow-lg tw-shadow-blue-900/30">
            📡
          </div>
          <h1 className="boost-card-title tw-text-2xl">{t("Pas de connexion internet")}</h1>
          <p className="boost-hint tw-mt-3 tw-text-base">
            {t("Vous êtes actuellement hors ligne. Vérifiez votre connexion puis réessayez.")}
          </p>
          <div className="tw-mt-6">
            <button
              type="button"
              className="boost-btn boost-btn-primary boost-btn-block"
              onClick={() => window.location.reload()}
            >
              🔄 {t("Réessayer")}
            </button>
          </div>
          <div className="tw-mt-6 tw-border-t tw-pt-4" style={{ borderColor: "var(--boost-border)" }}>
            <p className="tw-text-xs tw-tracking-wide" style={{ color: "var(--boost-muted)" }}>
              MboppiShop — votre marché en ligne
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
