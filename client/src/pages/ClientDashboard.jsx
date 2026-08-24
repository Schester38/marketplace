import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../App.jsx";
import { countrySymbol } from "../config.js";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";
import { formatMoney } from "../components/ProductCard.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import CopyCode from "../components/CopyCode.jsx";

const PURCHASE_STATUS = {
  pending: { key: "En attente", cls: "badge-pending" },
  bought: { key: "Acheté", cls: "badge-bought" },
  confirmed: { key: "Confirmée", cls: "badge-confirmed" },
  delivered: { key: "Livré", cls: "badge-bought" },
  cancelled: { key: "Annulée", cls: "badge-cancelled" },
};

function purchasePhoto(p) {
  if (Array.isArray(p.photos)) return p.photos[0] || "";
  try {
    return JSON.parse(p.photos || "[]")[0] || "";
  } catch {
    return "";
  }
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const { t, locale } = useLang();
  const [purchases, setPurchases] = useState(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  const load = useCallback(() => {
    api
      .purchasesMy()
      .then((pd) => {
        if (!mounted.current) return;
        setPurchases(pd.purchases);
      })
      .catch((e) => mounted.current && setError(e.message));
  }, []);

  useEffect(() => {
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useRefreshOnFocus(load);

  const cancelPurchase = async (p) => {
    if (
      !window.confirm(
        t("Annuler cette commande « {name} » ? Cette action est définitive.", {
          name: p.product_name,
        })
      )
    )
      return;
    setError("");
    try {
      await api.cancelSale(p.id, p.confirm_code || p.buyer_code || "");
      setPurchases((prev) => (prev ? prev.filter((x) => x.id !== p.id) : prev));
    } catch (err) {
      setError(err.message);
    }
  };

  const activePurchases = (purchases || []).filter((p) => p.status !== "delivered");
  const deliveredPurchases = (purchases || []).filter((p) => p.status === "delivered");

  const [showGreeting, setShowGreeting] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowGreeting(false), 10050);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="container">
      <Seo
        title={t("Mon espace client") + " — Mboppi"}
        description={t("Découvrez les produits et offres des boutiques.")}
        noindex
      />
      <section className="dash-header client-greeting">
        <div>
          <h1>{t("Mon espace client")}</h1>
          {showGreeting && (
            <p className="welcome-flash">
              {t("Bienvenue {name} !", { name: user.name })}{" "}
              {t("Découvrez les produits et offres des boutiques.")}
            </p>
          )}
        </div>
      </section>

      <section className="steps">
        <Link to="/vitrine-offre" className="step">
          <span className="step-icon">⚡</span>
          <h3>{t("Les offres du moment")}</h3>
          <p>{t("Découvrez les promotions en cours avec les meilleures réductions.")}</p>
        </Link>
        <Link to="/" className="step">
          <span className="step-icon">🏪</span>
          <h3>{t("Produits des boutiques")}</h3>
          <p>{t("Parcourez les produits disponibles chez les boutiques partenaires.")}</p>
        </Link>
        <Link to="/panier" className="step">
          <span className="step-icon">🛒</span>
          <h3>{t("Mon panier")}</h3>
          <p>{t("Finalisez vos commandes en quelques clics.")}</p>
        </Link>
        <Link to="/favoris" className="step">
          <span className="step-icon">❤️</span>
          <h3>{t("Mes favoris")}</h3>
          <p>{t("Retrouvez les produits que vous avez aimés.")}</p>
        </Link>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 className="section-title">{t("📦 Mes commandes")}</h2>
        {error && <p className="error">{error}</p>}
        {purchases === null ? (
          <div className="card page-center">
            <div className="skeleton-block" style={{ height: 80 }}></div>
          </div>
        ) : activePurchases.length === 0 ? (
          <div className="card page-center">
            <p className="empty">{t("Aucune commande pour le moment.")}</p>
            <Link to="/" className="btn btn-primary">
              {t("Parcourir les produits")}
            </Link>
          </div>
        ) : (
          <div className="order-list">
            {activePurchases.map((p) => {
              const st = PURCHASE_STATUS[p.status] || PURCHASE_STATUS.pending;
              return (
                <div className="card order-card" key={p.id}>
                  <div className="order-head">
                    <strong>
                      {p.product_name} ×{p.quantity}
                    </strong>
                    <span className={`badge ${st.cls}`}>{t(st.key)}</span>
                  </div>
                  <p className="order-date">
                    {new Date(p.created_at).toLocaleDateString(locale, { dateStyle: "medium" })}
                    {" — "}
                    {t("Boutique : {shop}", { shop: p.shop_name })}
                    {p.seller_name && p.seller_name !== "—"
                      ? ` · ${t("Vendeur : {seller}", { seller: p.seller_name })}`
                      : ""}
                  </p>
                  <div className="order-total">
                    <span className="label">{t("Total")}</span>
                    <strong>
                      {formatMoney(p.total_price)} {countrySymbol(p.shop_country)}
                    </strong>
                  </div>
                  {p.confirm_code && (
                    <div className="buyer-code-box" style={{ margin: "8px 0" }}>
                      <span className="buyer-code-label">{t("Code de confirmation")} :</span>
                      <span className="buyer-code-value">{p.confirm_code}</span>
                      <CopyCode code={p.confirm_code} />
                    </div>
                  )}
                  {p.confirm_code && (
                    <Link
                      className="btn btn-outline btn-small"
                      to={`/suivi/${p.id}?code=${encodeURIComponent(p.confirm_code)}`}
                    >
                      📦 {t("Suivre ma commande")}
                    </Link>
                  )}
                  {p.status !== "delivered" && p.status !== "cancelled" && (
                    <button className="btn btn-danger btn-small" onClick={() => cancelPurchase(p)}>
                      🗙 {t("Annuler")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 className="section-title">
          <Logo className="logo-inline" /> {t("Mes achats")}
        </h2>
        {purchases === null ? (
          <div className="card page-center">
            <div className="skeleton-block" style={{ height: 80 }}></div>
          </div>
        ) : deliveredPurchases.length === 0 ? (
          <div className="card page-center">
            <p className="empty">{t("Aucun achat pour le moment.")}</p>
            <Link to="/" className="btn btn-primary">
              {t("Découvrir les produits")}
            </Link>
          </div>
        ) : (
          <div className="order-list">
            {deliveredPurchases.map((p) => (
              <div className="card order-card" key={p.id}>
                <div className="order-head">
                  <strong>
                    {p.product_name} ×{p.quantity}
                  </strong>
                  <span className="badge badge-bought">{t("Livré")}</span>
                </div>
                <p className="order-date">
                  {p.delivered_at
                    ? new Date(p.delivered_at).toLocaleDateString(locale, { dateStyle: "medium" })
                    : new Date(p.created_at).toLocaleDateString(locale, { dateStyle: "medium" })}
                  {" — "}
                  {t("Boutique : {shop}", { shop: p.shop_name })}
                  {p.seller_name && p.seller_name !== "—"
                    ? ` · ${t("Vendeur : {seller}", { seller: p.seller_name })}`
                    : ""}
                </p>
                <div className="order-items">
                  <div className="order-item">
                    {purchasePhoto(p) ? (
                      <img src={purchasePhoto(p)} alt={p.product_name} loading="lazy" />
                    ) : (
                      <span className="order-item-thumb">📦</span>
                    )}
                    <span className="order-item-name">{p.shop_name}</span>
                    <strong>
                      {formatMoney(p.purchase_price != null ? p.purchase_price : p.total_price)}{" "}
                      {countrySymbol(p.shop_country)}
                    </strong>
                  </div>
                </div>
                <div className="order-total">
                  <span className="label">{t("Prix payé")}</span>
                  <strong>
                    {formatMoney(p.purchase_price != null ? p.purchase_price : p.total_price)}{" "}
                    {countrySymbol(p.shop_country)}
                  </strong>
                </div>
                {p.confirm_code && (
                  <div className="buyer-code-box" style={{ margin: "8px 0" }}>
                    <span className="buyer-code-label">{t("Code de confirmation")} :</span>
                    <span className="buyer-code-value">{p.confirm_code}</span>
                    <CopyCode code={p.confirm_code} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>
          {t("Mon compte")}
        </h2>
        <div className="info-row">
          <span className="label">{t("Nom")}</span>
          <strong>{user.name}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t("Email")}</span>
          <strong>{user.email}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t("Rôle")}</span>
          <strong>{t("Client")}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t("Inscrit le")}</span>
          <strong>{new Date(user.created_at).toLocaleDateString(locale)}</strong>
        </div>
      </section>
    </main>
  );
}
