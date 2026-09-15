import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

/**
 * Preuve sociale : bandeau de compteurs publics « Mboppi en chiffres ».
 * Alimenté par GET /api/metrics/public (cache 5 min côté serveur).
 * Affiche uniquement quand les données sont chargées (jamais de blocage).
 */
export default function SocialProof() {
  const { t } = useLang();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let ok = true;
    api
      .publicStats()
      .then((d) => ok && setStats(d))
      .catch(() => {});
    return () => {
      ok = false;
    };
  }, []);

  if (!stats) return null;
  return (
    <section className="card social-proof" aria-label={t("Boutiques actives")}>
      <div className="stats-row">
        <div>
          <span className="label">🏪 {t("Boutiques actives")}</span>
          <strong>{stats.boutiques}</strong>
        </div>
        <div>
          <span className="label">🧑🏾‍💼 {t("Vendeurs & créateurs")}</span>
          <strong>{stats.vendeurs}</strong>
        </div>
        <div>
          <span className="label">🛵 {t("Livreurs")}</span>
          <strong>{stats.livreurs}</strong>
        </div>
        <div>
          <span className="label">📦 {t("Commandes livrées")}</span>
          <strong>{stats.commandes_livrees}</strong>
        </div>
        <div>
          <span className="label">🛍️ {t("Produits en stock")}</span>
          <strong>{stats.produits}</strong>
        </div>
      </div>
    </section>
  );
}