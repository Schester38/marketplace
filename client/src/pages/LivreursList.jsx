import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { waLink } from "../config.js";

export default function LivreursList() {
  const { t } = useLang();
  const [city, setCity] = useState("");
  const [quartier, setQuartier] = useState("");
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState({ cities: [], quartiers: [] });

  const loadOptions = useCallback(async () => {
    try {
      const d = await api.livreurOptions();
      setOptions({ cities: d.cities || [], quartiers: d.quartiers || [] });
    } catch (err) {
      // suggestions non bloquantes
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const runSearch = useCallback(async (cityV, quartierV) => {
    setError("");
    setLoading(true);
    try {
      const d = await api.listLivreurs({ city: cityV.trim(), quartier: quartierV.trim() });
      setList(d.livreurs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch("", "");
  }, [runSearch]);

  const submit = (e) => {
    if (e) e.preventDefault();
    runSearch(city, quartier);
  };

  return (
    <main className="container">
      <Seo
        title={t("Contacter un livreur") + " — Mboppi"}
        description={t(
          "Trouvez les livreurs Mboppi disponibles pour vos livraisons et contactez-les directement."
        )}
        noindex
      />
      <section className="dash-header">
        <div>
          <h1>🛵 {t("Contacter un livreur")}</h1>
          <p>
            {t(
              "Trouvez les livreurs Mboppi disponibles pour vos livraisons et contactez-les directement."
            )}
          </p>
        </div>
      </section>

      <div className="card form-card">
        <form onSubmit={submit}>
          <div className="search-bar">
            <label className="field" style={{ marginTop: 0 }}>
              <span>{t("Ville")}</span>
              <input
                className="input"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("Ex : Douala, Yaoundé…")}
                list="rider-cities"
              />
              <datalist id="rider-cities">
                {options.cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="field" style={{ marginTop: 0 }}>
              <span>{t("Quartier")}</span>
              <input
                className="input"
                type="text"
                value={quartier}
                onChange={(e) => setQuartier(e.target.value)}
                placeholder={t("Ex : Bonamoussadi, Mvog-Mbi…")}
                list="rider-quartiers"
              />
              <datalist id="rider-quartiers">
                {options.quartiers.map((q) => (
                  <option key={q} value={q} />
                ))}
              </datalist>
            </label>
            <button
              className="btn btn-primary"
              style={{ alignSelf: "flex-end" }}
              disabled={loading}
            >
              {loading ? t("Chargement…") : t("Rechercher")}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {t("Laissez les champs vides pour afficher tous les livreurs disponibles.")}
          </p>
        </form>
      </div>

      {error && <p className="error">{error}</p>}

      {list === null && !loading && (
        <div className="card page-center">
          <p className="hint">{t("Recherchez par ville et quartier pour trouver des livreurs.")}</p>
        </div>
      )}

      {loading && list === null && (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 120 }}></div>
        </div>
      )}

      {list !== null && !loading && list.length === 0 && (
        <div className="card page-center">
          <p style={{ fontSize: 34, marginBottom: 4 }}>🛵</p>
          <h3>{t("Aucun livreur trouvé pour ces critères.")}</h3>
          <p className="hint">{t("Essayez une autre ville ou un autre quartier.")}</p>
        </div>
      )}

      {list !== null && list.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>🛵 {t("Livreurs disponibles")}</h2>
            <p>{t("{n} livreur(s) trouvé(s).", { n: list.length })}</p>
          </div>
          <div className="rider-grid">
            {list.map((r) => (
              <div className="card rider-card" key={r.id}>
                <span className="shop-avatar">🛵</span>
                <div className="rider-main">
                  <h3>
                    {r.name}
                    {r.verified && (
                      <span className="badge badge-verified" title={t("Livreur vérifié")}>
                        ✓ {t("Vérifié")}
                      </span>
                    )}
                  </h3>
                  <p className="hint">
                    {r.city && <span>📍 {r.city}</span>}
                    {r.quartier && (
                      <span>
                        {r.city ? " · " : ""}
                        {r.quartier}
                      </span>
                    )}
                    {r.location && (
                      <span>
                        {r.city || r.quartier ? " · " : ""}
                        {r.location}
                      </span>
                    )}
                    {r.country && <span> · {r.country}</span>}
                  </p>
                  {r.phone && <p className="rider-phone">📞 {r.phone}</p>}
                </div>
                {r.phone && (
                  <div className="rider-actions">
                    <a
                      className="btn btn-outline btn-sm"
                      href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}
                    >
                      📞 {t("Appeler")}
                    </a>
                    <a
                      className="btn btn-whatsapp btn-sm"
                      href={waLink(
                        r.phone,
                        t("Bonjour {name}, je vous contacte depuis Mboppi.", { name: r.name })
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      💬 {t("WhatsApp")}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
