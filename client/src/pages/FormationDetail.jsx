import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import ProductCard, { formatMoney } from "../components/ProductCard.jsx";

function FormationDetail() {
  const { id } = useParams();
  const { t } = useLang();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getProduct(id)
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Formation introuvable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="boost-page">
        <div className="boost-shell">
          <p className="hint">Chargement…</p>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="boost-page">
        <div className="boost-shell">
          <p className="error-msg">{error || "Formation introuvable."}</p>
          <Link to="/formations" className="boost-btn boost-btn-secondary" style={{ marginTop: 12 }}>
            Retour aux formations
          </Link>
        </div>
      </main>
    );
  }

  const img = product.image || product.photos?.[0] || product.cover;

  return (
    <>
      <Seo title={`${product.name} — MboppiShop`} description={product.description || "Formation en ligne sur MboppiShop."} />
      <main className="boost-page">
        <div className="boost-shell">
          <Link to="/formations" className="boost-back" style={{ display: "inline-block", marginBottom: 16 }}>
            ← Retour aux formations
          </Link>

          <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {/* Image */}
            <div>
              {img && (
                <img
                  src={img}
                  alt={product.name}
                  style={{ width: "100%", borderRadius: 12, objectFit: "cover", maxHeight: 400 }}
                />
              )}
            </div>

            {/* Infos */}
            <div>
              <span className="formations-hero-badge">🎓 Formation</span>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: "8px 0 0", lineHeight: 1.2 }}>
                {product.name}
              </h1>
              {product.category && (
                <p style={{ marginTop: 8, color: "var(--text-muted,#666)", fontSize: 14 }}>
                  Catégorie : {product.category}
                </p>
              )}
              <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6 }}>
                {product.description || "Aucune description disponible."}
              </p>

              <div style={{ marginTop: 24, padding: 20, border: "1px solid var(--border,#eee)", borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>
                      {formatMoney ? formatMoney(product.price, product.currency) : `${product.price} ${product.currency}`}
                    </div>
                    <p className="hint" style={{ margin: "4px 0 0" }}>Accès immédiat après paiement</p>
                  </div>
                  <Link to={`/produit/${product.id}`} className="boost-btn boost-btn-primary">
                    Acheter la formation
                  </Link>
                </div>
              </div>

              {product.is_digital && (
                <div style={{ marginTop: 16, padding: 16, background: "var(--soft,#f5f5f5)", borderRadius: 8 }}>
                  <p style={{ margin: 0, fontSize: 14 }}>
                    📁 <strong>Formation digitale</strong> — accès sécurisé après paiement. Téléchargement ou lecture en ligne selon le format.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Programme */}
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Programme de la formation</h2>
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              {["Introduction et présentation", "Module 1 : Les fondamentaux", "Module 2 : Mise en pratique", "Module 3 : Cas réels", "Conclusion et ressources"].map((m, i) => (
                <div key={i} style={{ padding: 14, border: "1px solid var(--border,#eee)", borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--primary,#0ea5e9)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 15 }}>{m}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Avis */}
          <section style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Avis des apprenants</h2>
            <p className="hint" style={{ marginTop: 12 }}>Les avis seront disponibles prochainement.</p>
          </section>
        </div>
      </main>
    </>
  );
}

export default FormationDetail;
