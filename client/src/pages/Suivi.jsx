import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";
import { waLink, BASE_URL, countrySymbol } from "../config.js";
import { formatMoney } from "../components/ProductCard.jsx";
import CopyCode from "../components/CopyCode.jsx";

export default function Suivi() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const urlCode = (params.get("code") || "").trim().toUpperCase();
  const { t, locale } = useLang();
  const [code, setCode] = useState(urlCode);
  const [sale, setSale] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id || !urlCode) return;
    setCode(urlCode);
    setError("");
    setLoading(true);
    api
      .trackSale(id, urlCode)
      .then((d) => {
        setSale(d.sale || null);
        if (!d.sale) setError(t("Aucune commande trouvée avec ce code."));
      })
      .catch((err) => {
        setSale(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id, urlCode, t]);

  const refreshSale = () => {
    if (!sale || !id || !code.trim()) return;
    api
      .trackSale(id, code.trim())
      .then((d) => d.sale && setSale(d.sale))
      .catch(() => {});
  };

  useRefreshOnFocus(refreshSale);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const d = await api.trackSale(id, code.trim());
      setSale(d.sale);
    } catch (err) {
      setSale(null);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const symbol = sale ? countrySymbol(sale.shop_country) : "";

  const step = sale
    ? sale.status === "cancelled"
      ? -1
      : sale.status === "delivered"
        ? 2
        : sale.shop_confirmed_at || sale.status === "confirmed" || sale.status === "bought"
          ? 1
          : 0
    : -2;
  const cancellable = sale && sale.status !== "delivered" && sale.status !== "cancelled";

  const cancelOrder = async () => {
    if (!window.confirm(t("Annuler cette commande ? Cette action est définitive."))) return;
    setError("");
    setLoading(true);
    try {
      await api.cancelSale(id, code.trim());
      setSale((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const labels = sale
    ? [
        { key: "Commande enregistrée", date: sale.created_at },
        { key: "Commande confirmée", date: sale.shop_confirmed_at || null },
        { key: "Commande livrée", date: sale.delivered_at },
      ]
    : [];

  return (
    <main className="container narrow">
      <Seo
        title={t("Suivi de commande") + " — Mboppi"}
        description={t("Suivez l'état de votre commande Mboppi en temps réel.")}
        noindex
      />
      <Link to="/" className="btn btn-outline" style={{ marginBottom: 16 }}>
        ← {t("Retour à l'accueil")}
      </Link>
      <div className="card suivi-card">
        <h2>📦 {t("Suivi de commande")}</h2>
        <p className="hint">
          {t("Entrez votre code de confirmation (reçu avec votre commande) pour suivre son état.")}
        </p>
        <form onSubmit={submit} className="suivi-form">
          <input
            className="input"
            placeholder={t("Code de confirmation")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
          />
          <button className="btn btn-primary" disabled={loading || !code.trim()}>
            {loading ? t("Chargement…") : t("Suivre ma commande")}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {sale && (
          <div className="suivi-result">
            <div className="suivi-head">
              <strong>
                {sale.product_name} ×{sale.quantity}
              </strong>
              <span>
                {formatMoney(sale.total_price)} {symbol}
              </span>
            </div>
            <p className="hint">
              {t("Boutique : {shop}", { shop: sale.shop_name })}
              {sale.shop_location ? ` · ${sale.shop_location}` : ""}
            </p>
            <p className="hint">{t("Vendeur : {seller}", { seller: sale.seller_name || "—" })}</p>

            {sale.confirm_code && (
              <div className="buyer-code-box" style={{ margin: "10px 0" }}>
                <span className="buyer-code-label">{t("Votre code de confirmation")} :</span>
                <span className="buyer-code-value">{sale.confirm_code}</span>
                <CopyCode code={sale.confirm_code} />
                {step === 0 && (
                  <p className="hint" style={{ marginTop: 6 }}>
                    {t(
                      "Communiquez ce code au livreur lors de la remise pour valider la livraison."
                    )}
                  </p>
                )}
              </div>
            )}

            {step === -1 ? (
              <p className="error">{t("Cette commande a été annulée.")}</p>
            ) : (
              <ol className="suivi-timeline">
                {labels.map((l, i) => {
                  const reached = i <= step;
                  return (
                    <li key={l.key} className={`suivi-step ${reached ? "done" : ""}`}>
                      <span className="suivi-dot">{reached ? "✓" : i + 1}</span>
                      <div>
                        <strong>{t(l.key)}</strong>
                        {i === 0 && l.date && (
                          <span className="hint">
                            {new Date(l.date).toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                        {i === 1 && sale.shop_confirmed_at && (
                          <span className="hint">
                            {new Date(sale.shop_confirmed_at).toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                        {i === 2 && sale.delivered_at && (
                          <span className="hint">
                            {new Date(sale.delivered_at).toLocaleString(locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="suivi-actions">
              {sale.seller_phone && (
                <a
                  className="btn btn-primary"
                  href={waLink(
                    sale.seller_phone,
                    t(
                      "Bonjour {seller}, je suis {buyer}, je vous contacte à propos de ma commande « {product} » sur Mboppi.",
                      {
                        seller: sale.seller_name,
                        buyer: sale.buyer_name || t("un client"),
                        product: sale.product_name,
                      }
                    )
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  💬 {t("Contacter le vendeur")}
                </a>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  const url = `${BASE_URL}/suivi/${sale.id}?code=${sale.confirm_code || sale.buyer_code || ""}`;
                  const text = t("Suivez ma commande « {product} » sur Mboppi : {url}", {
                    product: sale.product_name,
                    url,
                  });
                  try {
                    if (navigator.share) {
                      await navigator.share({ title: t("Suivi de commande"), text, url });
                    } else {
                      await navigator.clipboard.writeText(url);
                    }
                  } catch {
                    /* annulé */
                  }
                }}
              >
                🔗 {t("Partager le suivi")}
              </button>
              {cancellable && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={loading}
                  onClick={cancelOrder}
                >
                  🗙 {t("Annuler la commande")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
