import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { waLink } from "../config.js";
import { IconWhatsApp } from "../components/icons.jsx";

export default function Creators() {
  const { t } = useLang();
  const [creators, setCreators] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .listShops({ role: "creator" })
      .then((d) => {
        setCreators(d.shops);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOnFocus(load);

  return (
    <main className="container">
      <Seo
        title={t("Créateurs de Mboppi")}
        description={t("Découvrez les créateurs de Mboppi et leurs créations artisanales.")}
      />
      <h2 className="section-title">🎨 {t("Les créateurs")}</h2>
      {error ? (
        <p className="error">{error}</p>
      ) : creators === null ? (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 140 }}></div>
        </div>
      ) : creators.length === 0 ? (
        <div className="card page-center">
          <p className="empty">{t("Aucun créateur pour le moment.")}</p>
        </div>
      ) : (
        <div className="grid">
          {creators.map((c) => (
            <div key={c.id} className="card creator-card">
              <Link to={`/createur/${c.id}`} className="creator-card-main underlink">
                <div className="shop-item-head">
                  {c.avatar ? (
                    <img
                      src={c.avatar}
                      alt={c.name}
                      className="shop-avatar creator-avatar"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="shop-avatar creator-avatar creator-avatar-fallback">
                      {String(c.name || "?").trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <h3 className="md">
                      {c.name}
                      {c.verified && (
                        <span className="badge badge-verified" title={t("Compte vérifié")}>
                          ✓
                        </span>
                      )}
                    </h3>
                    <p className="hint">
                      {c.location && <span>📍 {c.location}</span>}
                      {c.location && c.city ? " · " : ""}
                      {c.city && <span>{c.city}</span>}
                      {!c.location && !c.city && c.country && <span>🌍 {c.country}</span>}
                    </p>
                    <p className="hint">
                      {Number(c.product_count || 0) === 0
                        ? t("Aucune création pour le moment.")
                        : t("{n} créations en ligne", { n: c.product_count || 0 })}
                    </p>
                  </div>
                </div>
              </Link>
              {c.phone && (
                <div className="creator-contact">
                  <a
                    href={`tel:${c.phone}`}
                    className="meta-chip"
                    title={t("Appeler le créateur")}
                  >
                    📞 {c.phone}
                  </a>
                  <a
                    href={waLink(
                      c.phone,
                      t("Bonjour {name}, je vous contacte depuis Mboppi au sujet de vos créations.", {
                        name: c.name,
                      })
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="meta-chip"
                  >
                    <IconWhatsApp size={14} /> WhatsApp
                  </a>
                </div>
              )}
              <Link to={`/createur/${c.id}`} className="btn btn-outline btn-block shop-item-cta">
                {t("Voir ses créations")}
              </Link>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
