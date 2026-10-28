import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import ProductCard from "../components/ProductCard.jsx";

const CATEGORIES = ["Toutes", "Developpement personnel", "Business", "Technologie", "Sante", "Langues", "Design"];

function FormationsPage() {
  const { t } = useLang();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listProducts({ type: "digital" })
      .then((resp) => {
        if (cancelled) return;
        const list = Array.isArray(resp) ? resp : resp?.products || [];
        setProducts(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Impossible de charger les formations.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.name || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Seo title="Formations — MboppiShop" description="Découvrez des formations pratiques en ligne sur MboppiShop." />
      <main className="boost-page">
        <div className="boost-shell">
          <section style={{ padding: "40px 0 20px", textAlign: "center" }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>Apprenez aujourd'hui. Construisez votre avenir.</h1>
            <p style={{ marginTop: 12, fontSize: 16, color: "var(--text-muted,#666)", maxWidth: 720, margin: "12px auto 0" }}>
              Découvrez des formations pratiques en ligne, développez vos compétences et apprenez auprès de formateurs passionnés.
            </p>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                className="boost-input"
                placeholder="Rechercher une formation…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ maxWidth: 360 }}
              />
              <Link to="/devenir-formateur" className="boost-btn boost-btn-secondary">
                Devenir formateur
              </Link>
              <Link to="/mes-formations" className="boost-btn boost-btn-secondary">
                Mes formations
              </Link>
            </div>
          </section>

          <section style={{ marginTop: 24 }}>
            {loading && <p className="hint">Chargement…</p>}
            {error && <p className="error-msg">{error}</p>}
            {!loading && !error && filtered.length === 0 && (
              <p className="hint">Aucune formation disponible pour le moment.</p>
            )}
            <div className="tw-grid tw-gap-4 sm:tw-grid-cols-2 lg:tw-grid-cols-3" style={{ marginTop: 16 }}>
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export default FormationsPage;
