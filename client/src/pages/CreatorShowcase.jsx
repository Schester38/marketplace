import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import ProductCard from "../components/ProductCard.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { waLink } from "../config.js";

export default function CreatorShowcase() {
  const { id } = useParams();
  const { t } = useLang();
  const [creator, setCreator] = useState(null);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .shop(id)
      .then((d) => {
        setCreator(d.shop);
        setProducts(d.products);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOnFocus(load);

  if (error) {
    return (
      <main className="container narrow">
        <p className="error">{error}</p>
        <Link to="/createurs" className="btn btn-outline">
          ← {t("Créateurs")}
        </Link>
      </main>
    );
  }

  if (!creator) {
    return (
      <main className="container narrow">
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 140 }}></div>
        </div>
      </main>
    );
  }

  const phone = creator.phone;

  return (
    <main className="container">
      <Seo
        title={`${creator.name} — ${t("Créations sur Mboppi")}`}
        description={`${creator.name}${creator.location ? " — " + creator.location : ""} | ${t("Vitrine de créations sur Mboppi.")}`}
      />
      <Link to="/createurs" className="btn btn-outline" style={{ marginBottom: 16 }}>
        ← {t("Créateurs")}
      </Link>

      <div className="card shop-header-card">
        <div className="shop-header">
          <span className="shop-avatar creator-avatar">🎨</span>
          <div>
            <h2>
              {creator.name}
              {creator.verified && (
                <span className="badge badge-verified" title={t("Boutique vérifiée")}>
                  ✓ {t("Vérifiée")}
                </span>
              )}
            </h2>
            <p className="hint">
              {creator.location && <span>📍 {creator.location}</span>}
              {creator.location && creator.country ? " · " : ""}
              {creator.country && <span>{creator.country}</span>}
            </p>
          </div>
          {phone && (
            <a
              className="btn btn-primary shop-wa"
              href={waLink(
                phone,
                t("Bonjour {shop}, je vous contacte depuis Mboppi.", { shop: creator.name })
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              💬 {t("Contacter sur WhatsApp")}
            </a>
          )}
        </div>
      </div>

      <h2 className="section-title">🎨 {t("Créations de {name}", { name: creator.name })}</h2>
      {products === null ? (
        <div className="card page-center">
          <div className="skeleton-block" style={{ height: 120 }}></div>
        </div>
      ) : products.length === 0 ? (
        <div className="card page-center">
          <p className="empty">{t("Aucun produit pour le moment.")}</p>
        </div>
      ) : (
        <div className="grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
