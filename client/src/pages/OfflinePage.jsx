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
    <main className="container">
      <Seo
        title={t("Pas de connexion internet") + " — Mboppi"}
        description={t("Pas de connexion internet")}
        noindex
      />
      <div className="card page-center">
        <span className="notfound-icon">📡</span>
        <h1>{t("Pas de connexion internet")}</h1>
        <p className="hint">
          {t("Vous êtes actuellement hors ligne. Vérifiez votre connexion puis réessayez.")}
        </p>
        <div className="notfound-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            🔄 {t("Réessayer")}
          </button>
        </div>
      </div>
    </main>
  );
}
