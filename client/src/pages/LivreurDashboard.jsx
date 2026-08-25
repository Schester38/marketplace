import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Seo from "../components/Seo.jsx";
import PwaInstallButton from "../components/PwaInstallButton.jsx";
import { formatMoney } from "../components/ProductCard.jsx";
import { downloadInvoice } from "../components/Invoice.jsx";
import { countrySymbol } from "../config.js";
import { useLang } from "../i18n.jsx";
import { useRefreshOnFocus } from "../useRefreshOnFocus.js";

const CODE_KEY = "livreur_shop_code";

export default function LivreurDashboard() {
  const { t } = useLang();
  const [codeInput, setCodeInput] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    setCode(localStorage.getItem(CODE_KEY) || "");
  }, []);
  const [shopName, setShopName] = useState(null);
  const [pending, setPending] = useState([]);
  const [delivered, setDelivered] = useState([]);
  const [loading, setLoading] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deliverForm, setDeliverForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (silent) => {
      if (!code) {
        setPending([]);
        setDelivered([]);
        setShopName(null);
        return;
      }
      if (!silent) setLoading(true);
      setCodeError("");
      try {
        const d = await api.livreurSales(code);
        setPending(d.pending);
        setDelivered(d.delivered);
        setShopName(d.shop_name);
        setCodeError("");
      } catch (e) {
        if (e.message && /code boutique invalide/i.test(e.message)) {
          localStorage.removeItem(CODE_KEY);
          setCode("");
          setCodeInput("");
          setCodeError(t("Code boutique invalide. Vérifiez le code auprès de la boutique."));
        } else {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    },
    [code, t]
  );

  useEffect(() => {
    load(true);
  }, [code, load]);

  useRefreshOnFocus(() => load(true));

  const enterCode = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const clean = codeInput.trim().toUpperCase();
    if (!clean) {
      setCodeError(t("Entrez le code de la boutique."));
      return;
    }
    localStorage.setItem(CODE_KEY, clean);
    setCode(clean);
  };

  const changeCode = () => {
    localStorage.removeItem(CODE_KEY);
    setCode("");
    setCodeInput("");
    setPending([]);
    setDelivered([]);
    setShopName(null);
  };

  const openDeliver = (s) => {
    setDeliverForm({
      sale: s,
      delivery_fee: "",
      payment_method: s.payment_method === "mobile" ? "mobile" : "espece",
      client_code: "",
    });
  };

  const removeDelivered = async (s) => {
    if (!window.confirm(t("Supprimer cette livraison « {name} » ?", { name: s.product_name })))
      return;
    setError("");
    setSuccess("");
    try {
      await api.deleteDeliveredSale(s.id);
      setDelivered((prev) => prev.filter((x) => x.id !== s.id));
      setSuccess(t("Livraison supprimée."));
    } catch (err) {
      setError(err.message);
    }
  };

  const submitDeliver = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const d = await api.deliverSale(deliverForm.sale.id, {
        delivery_fee: Number(deliverForm.delivery_fee || 0),
        payment_method: deliverForm.payment_method,
        client_code: (deliverForm.client_code || "").trim().toUpperCase(),
        shop_code: code,
      });
      setPending((prev) => prev.filter((s) => s.id !== d.sale.id));
      setDelivered((prev) => [d.sale, ...prev]);
      setSuccess(t("Achat confirmé ! La facture a été téléchargée."));
      downloadInvoice(d.sale, t, countrySymbol(d.sale.shop_country));
      setDeliverForm(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const symbol = (s) => countrySymbol(s.shop_country);

  return (
    <main className="container">
      <Seo
        title={t("Livraison") + " — Mboppi"}
        description={t("Livrez les articles commandés et confirmez l'achat.")}
        noindex
      />
      <section className="dash-header">
        <div>
          <h1>🛵 {t("Livraison")}</h1>
          <p>
            {t(
              "Saisissez le code de votre boutique pour voir ses livraisons (en attente et effectuées)."
            )}
          </p>
        </div>
        <PwaInstallButton />
      </section>

      {!code ? (
        <section className="card form-card" style={{ maxWidth: 480, margin: "24px auto" }}>
          <h2>🔑 {t("Code de la boutique")}</h2>
          <p className="hint">
            {t(
              "La boutique vous a remis un code. En le saisissant, vous ne verrez que ses livraisons, pas celles des autres boutiques."
            )}
          </p>
          <form onSubmit={enterCode}>
            <label>{t("Code boutique")}</label>
            <input
              className="input"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="ex : A1B2C3D"
              maxLength={10}
              required
            />
            {codeError && <p className="error">{codeError}</p>}
            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }}>
              👀 {t("Voir mes livraisons")}
            </button>
          </form>
        </section>
      ) : (
        <>
          {shopName && (
            <section className="card stats">
              <div className="row2" style={{ alignItems: "center" }}>
                <div>
                  <span className="label">{t("Boutique associée")}</span>
                  <strong>
                    🏪 {shopName} — <code className="seller-code-inline">{code}</code>
                  </strong>
                </div>
                <button className="btn btn-outline btn-sm" onClick={changeCode}>
                  {t("Changer de code")}
                </button>
              </div>
            </section>
          )}

          {success && <p className="success">{success}</p>}
          {error && <p className="error">{error}</p>}
          {codeError && <p className="error">{codeError}</p>}

          <section className="card stats">
            <h2>📦 {t("Articles en attente de vente")}</h2>
            {loading ? (
              <div className="skeleton-block" style={{ height: 120 }}></div>
            ) : pending.length === 0 ? (
              <p className="empty">{t("Aucun article en attente pour cette boutique.")}</p>
            ) : (
              <div className="livreur-list">
                {pending.map((s) => (
                  <div className="livreur-item" key={s.id}>
                    <div className="livreur-item-info">
                      <div className="livreur-item-top">
                        <strong>{s.product_name}</strong>
                        <span className={`badge badge-pending`}>{t("En attente de vente")}</span>
                      </div>
                      <p className="hint">
                        {formatMoney(s.total_price)} {symbol(s)}
                        {s.seller_name
                          ? ` · ${t("Vendeur : {seller}", { seller: s.seller_name })}`
                          : ""}
                      </p>
                      <p className="livreur-client">
                        🧑 {s.buyer_name || "—"}
                        {s.buyer_phone ? ` · 📞 ${s.buyer_phone}` : ""}
                      </p>
                      {s.buyer_city || s.buyer_address ? (
                        <p className="hint">
                          📍 {[s.buyer_city, s.buyer_address].filter(Boolean).join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <button className="btn btn-primary" onClick={() => openDeliver(s)}>
                      🛵 {t("Livrer")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card stats">
            <h2>✅ {t("Mes livraisons effectuées")}</h2>
            {delivered.length === 0 ? (
              <p className="empty">{t("Aucune livraison effectuée pour cette boutique.")}</p>
            ) : (
              <div className="livreur-list">
                {delivered.map((s) => (
                  <div className="livreur-item" key={s.id}>
                    <div className="livreur-item-info">
                      <div className="livreur-item-top">
                        <strong>{s.product_name}</strong>
                        <span className={`badge badge-bought`}>{t("Acheté")}</span>
                      </div>
                      <p className="hint">
                        {formatMoney(Number(s.total_price || 0) + Number(s.delivery_fee || 0))}{" "}
                        {symbol(s)}
                        {s.delivered_at
                          ? ` · ${t("Livré le {date}", { date: new Date(s.delivered_at).toLocaleDateString() })}`
                          : ""}
                      </p>
                      <p className="livreur-client">
                        🧑 {s.buyer_name || "—"}
                        {s.buyer_phone ? ` · 📞 ${s.buyer_phone}` : ""}
                      </p>
                    </div>
                    <div className="row2">
                      <button
                        className="btn btn-outline"
                        onClick={() => downloadInvoice(s, t, symbol(s))}
                      >
                        🧾 {t("Facture")}
                      </button>
                      <button className="btn btn-danger" onClick={() => removeDelivered(s)}>
                        🗑️ {t("Supprimer")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {deliverForm && (
        <div className="modal-overlay" onClick={() => setDeliverForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🛵 {t("Livrer : {name}", { name: deliverForm.sale.product_name })}</h3>
              <button className="drawer-close" onClick={() => setDeliverForm(null)}>
                ✕
              </button>
            </div>
            <div className="deliver-recap">
              <p>
                <strong>{t("Propriétaire")} :</strong> {deliverForm.sale.shop_name || "—"}
              </p>
              <p>
                <strong>{t("Vendeur")} :</strong> {deliverForm.sale.seller_name || "—"} (
                {deliverForm.sale.seller_code || "—"})
              </p>
              <p>
                <strong>{t("Client")} :</strong> {deliverForm.sale.buyer_name || "—"}
                {deliverForm.sale.buyer_phone ? ` · ${deliverForm.sale.buyer_phone}` : ""}
              </p>
              {deliverForm.sale.buyer_city || deliverForm.sale.buyer_address ? (
                <p>
                  <strong>{t("Adresse")} :</strong>{" "}
                  {[deliverForm.sale.buyer_city, deliverForm.sale.buyer_address]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
              <p>
                <strong>{t("Montant article")} :</strong>{" "}
                {formatMoney(deliverForm.sale.total_price)} {symbol(deliverForm.sale)}
              </p>
            </div>
            <form onSubmit={submitDeliver}>
              <label>
                {t("Frais de livraison ({symbol}) *", { symbol: symbol(deliverForm.sale) })}
              </label>
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                required
                value={deliverForm.delivery_fee}
                onChange={(e) => setDeliverForm({ ...deliverForm, delivery_fee: e.target.value })}
              />
              <label style={{ marginTop: 12 }}>{t("Code de confirmation du client *")}</label>
              <input
                className="input code-input"
                required
                maxLength="6"
                value={deliverForm.client_code || ""}
                onChange={(e) =>
                  setDeliverForm({ ...deliverForm, client_code: e.target.value.toUpperCase() })
                }
                placeholder="ABC234"
              />
              <p className="hint">
                {t(
                  "Demandez ce code au client. Il l'a reçu à la commande et sur le suivi de commande."
                )}
              </p>
              <label style={{ marginTop: 12 }}>{t("Paiement *")}</label>
              <div className="row2">
                <label
                  className={`payment-option ${deliverForm.payment_method === "espece" ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="espece"
                    checked={deliverForm.payment_method === "espece"}
                    onChange={(e) =>
                      setDeliverForm({ ...deliverForm, payment_method: e.target.value })
                    }
                  />
                  <span>💵 {t("En Espèce")}</span>
                </label>
                <label
                  className={`payment-option ${deliverForm.payment_method === "mobile" ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="mobile"
                    checked={deliverForm.payment_method === "mobile"}
                    onChange={(e) =>
                      setDeliverForm({ ...deliverForm, payment_method: e.target.value })
                    }
                  />
                  <span>📱 {t("Par Mobile")}</span>
                </label>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                {t(
                  "Les paiements en ligne sont traités via Ikeepay. Les frais de traitement (environ 6%) sont déduits par Ikeepay sur chaque transaction."
                )}
              </p>
              <div className="row2" style={{ marginTop: 14 }}>
                <button className="btn btn-primary" disabled={submitting}>
                  {submitting ? "…" : `✅ ${t("Confirmer l'Achat")}`}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setDeliverForm(null)}
                >
                  {t("Annuler")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
