import { useState, useEffect } from "react";
import { useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { saveLocalBoostOrder } from "../boostOrders.js";
import { BASE_URL } from "../config.js";

const formatAmount = (value) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(value) || 0);

const formatUsd = (value) =>
  `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;

function convertToUsd(amount, currency, rates) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  const code = String(currency || "").toUpperCase();
  const rate = code === "USD" ? 1 : Number(rates?.[code]);
  if (!(rate > 0)) return null;
  return Math.round((value / rate) * 100) / 100;
}

function BoostPage({ children }) {
  return (
    <main className="boost-page">
      <div className="boost-shell">{children}</div>
    </main>
  );
}

export default function MboppiBoostOrder() {
  const { t } = useLang();
  const { user } = useAuth();
  const { serviceId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientInfo, setClientInfo] = useState({
    name: user?.name || "",
    phone: searchParams.get("phone") || user?.phone || "",
    email: searchParams.get("email") || user?.email || "",
    profile_url: searchParams.get("target") || "",
    objectif: searchParams.get("details") || "",
  });
  const [quantity, setQuantity] = useState(1);
  const [orderCreated, setOrderCreated] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);

  useEffect(() => {
    if (!serviceId) return;
    fetchService();
  }, [serviceId]);

  useEffect(() => {
    if (!user) return;
    setClientInfo((prev) => ({
      ...prev,
      name: prev.name || user.name || "",
      phone: prev.phone || user.phone || "",
      email: prev.email || user.email || "",
    }));
  }, [user]);

  useEffect(() => {
    if (!user) {
      setWallet(null);
      return undefined;
    }
    let cancelled = false;
    setWalletLoading(true);
    api
      .smmWallet()
      .then((resp) => {
        if (!cancelled) setWallet(resp);
      })
      .catch(() => {
        if (!cancelled) setWallet(null);
      })
      .finally(() => {
        if (!cancelled) setWalletLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function fetchService() {
    try {
      const resp = await api.smmService(serviceId);
      const serviceData = resp.service;
      if (!serviceData) throw new Error("Service introuvable");
      setService(serviceData);
      const providerMin = Number(serviceData.limits?.min);
      const minimumTotalQty = Number(serviceData.min_total_quantity);
      const min = Math.max(
        Number.isFinite(providerMin) && providerMin > 0 ? providerMin : 1,
        Number.isFinite(minimumTotalQty) && minimumTotalQty > 0 ? minimumTotalQty : 1
      );
      const max = Number(serviceData.limits?.max);
      const requested = Number(searchParams.get("quantity"));
      const initial = Number.isFinite(requested) && requested >= min ? requested : min;
      setQuantity(Number.isFinite(max) && max > 0 ? Math.min(initial, max) : initial);
    } catch (err) {
      setError(err.message || `Service #${serviceId} introuvable. Veuillez revenir au catalogue.`);
    } finally {
      setLoading(false);
    }
  }

  function handleInfoChange(key, value) {
    setClientInfo((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) {
      setError("Connectez-vous pour commander avec votre portefeuille Boost.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const idempotencyKey = `smm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const resp = await api.smmCreateOrder({
        service_id: Number(serviceId),
        quantity: Number(quantity),
        client_info: clientInfo,
        payment_method: "wallet",
        idempotency_key: idempotencyKey,
      });
      if (resp?.ok && resp?.paid) {
        setOrderCreated(resp);
        saveLocalBoostOrder({
          id: resp.order_id,
          token: resp.public_token,
          service_name: service?.name,
          total: resp.total,
          currency: resp.currency,
          created_at: new Date().toISOString(),
        });
      } else {
        setError(resp?.message || "Le paiement n'a pas été confirmé. Veuillez réessayer.");
      }
    } catch (err) {
      if (err?.code === "INSUFFICIENT_BOOST_FUNDS" || err?.status === 402) {
        setError(
          "Votre solde Boost est insuffisant. Rechargez votre portefeuille avant de commander."
        );
      } else if (err?.code === "AUTH_REQUIRED" || err?.status === 401) {
        setError("Votre session a expiré. Reconnectez-vous pour commander.");
      } else {
        setError(err.message || "Erreur lors de la création de la commande.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <BoostPage>
        <Seo title="Chargement… — MboppiBoost" />
        <div className="boost-card boost-card-pad boost-order-state">
          <span className="boost-skeleton tw-h-5 tw-w-48" />
          <p className="boost-muted tw-mt-4">{t("Chargement…")}</p>
        </div>
      </BoostPage>
    );
  }

  if (!service) {
    return (
      <BoostPage>
        <Seo title="Service introuvable — MboppiBoost" />
        <div className="boost-card boost-card-pad boost-order-state">
          <span className="boost-empty-icon">🔎</span>
          <h1 className="boost-section-title">{t("Service introuvable")}</h1>
          <p className="boost-section-lead">{error || "Ce service n'existe pas."}</p>
          <Link to="/mboppi-boost" className="boost-btn boost-btn-primary">
            {t("Retour aux services")}
          </Link>
        </div>
      </BoostPage>
    );
  }

  const billingUnit = Number(service.billing_unit) > 0 ? Number(service.billing_unit) : 1000;
  const unitPrice = Number(service.price || 0);
  const total = Math.round(((unitPrice * Number(quantity)) / billingUnit) * 100) / 100;
  const minQty = 1;
  const maxQty = Infinity;
  const minimumTotal = Math.round(((unitPrice * minQty) / billingUnit) * 100) / 100;
  const walletBalance = Number(wallet?.wallet?.balance_usd) || 0;
  const walletEstimate = convertToUsd(total, service.currency, wallet?.fx?.rates);
  const canPayWithWallet =
    Boolean(user) && walletEstimate != null && total > 0 && walletBalance + 0.001 >= walletEstimate;

  if (orderCreated) {
    return (
      <BoostPage>
        <Seo
          title="Commande payée — MboppiBoost"
          description="Votre commande MboppiBoost a été payée avec votre portefeuille Boost."
        />
        <section className="boost-order-done">
          <div className="boost-card boost-card-pad boost-order-done-card">
            <span className="boost-done-icon">✅</span>
            <p className="boost-kicker">MboppiBoost</p>
            <h1 className="boost-section-title">{t("Commande payée")}</h1>
            <p className="boost-section-lead">
              {t(
                "Votre commande a été payée avec votre portefeuille Boost. Le traitement a démarré immédiatement."
              )}
            </p>
            <div className="boost-order-done-rows">
              <div className="boost-summary-row">
                <span>{t("Numéro de commande")}</span>
                <strong>#{orderCreated.order_id}</strong>
              </div>
              <div className="boost-summary-row">
                <span>{t("Total")}</span>
                <strong>
                  {formatAmount(orderCreated.total)} {orderCreated.currency}
                </strong>
              </div>
              {orderCreated.wallet_debit_usd != null && (
                <div className="boost-summary-row">
                  <span>{t("Débit")}</span>
                  <strong>{formatUsd(orderCreated.wallet_debit_usd)}</strong>
                </div>
              )}
              {orderCreated.wallet_balance_after_usd != null && (
                <div className="boost-summary-row">
                  <span>{t("Nouveau solde")}</span>
                  <strong>{formatUsd(orderCreated.wallet_balance_after_usd)}</strong>
                </div>
              )}
            </div>
            {orderCreated.public_token && (
              <p className="boost-hint" style={{ overflowWrap: "anywhere" }}>
                {BASE_URL}/mboppi-boost/suivi/{orderCreated.order_id}?token={orderCreated.public_token}
              </p>
            )}
            <p className="boost-hint">
              {t("Retrouvez le suivi de votre commande dans votre espace MboppiBoost.")}
            </p>
            <div className="boost-order-done-actions">
              <Link to="/mboppi-boost/mes-commandes" className="boost-btn boost-btn-primary">
                {t("Suivre ma commande")}
              </Link>
              <Link to="/mboppi-boost" className="boost-btn boost-btn-secondary">
                {t("Retour aux services")}
              </Link>
            </div>
          </div>
        </section>
      </BoostPage>
    );
  }

  return (
    <BoostPage>
      <Seo
        title={`Commander : ${service.name} — MboppiBoost`}
        description={`Commander le service ${service.name} sur MboppiBoost.`}
      />
      <section className="boost-hero boost-order-hero">
        <div className="boost-hero-grid tw-absolute tw-inset-0" aria-hidden="true" />
        <span className="boost-orb boost-orb-a" aria-hidden="true" />
        <span className="boost-orb boost-orb-b" aria-hidden="true" />
        <div className="boost-order-hero-inner">
          <Link to="/mboppi-boost" className="boost-back">
            ← {t("Tous les services")}
          </Link>
          <span className="boost-eyebrow">⚡ MboppiBoost</span>
          <h1 className="boost-order-title">{service.name}</h1>
          {(service.short_description || service.description) && (
            <p className="boost-lead">{service.short_description || service.description}</p>
          )}
          <div className="boost-order-hero-meta">
            <span className="boost-chip">
              {service.price > 0
                ? `${formatAmount(service.price)} ${service.currency} / ${service.billing_unit || 1000}`
                : t("Tarif à définir — contacter MboppiBoost")}
            </span>
            {service.delivery_days && (
              <span className="boost-chip">
                ⏱ {t("Délai indicatif")} : {service.delivery_days} {t("jours")}
              </span>
            )}
            {service.platform && <span className="boost-chip">{service.platform}</span>}
          </div>
        </div>
      </section>

      <div className="boost-order-grid">
        <section className="boost-card boost-card-pad boost-order-form-card">
          <div className="boost-order-form-head">
            <div>
              <p className="boost-kicker">{t("Détails du service")}</p>
              <h2 className="boost-section-title">{t("Configurez votre commande")}</h2>
            </div>
            <span className="boost-trust-pill">🔒 {t("Commande sécurisée")}</span>
          </div>
          <p className="boost-section-lead">
            {t("Précisez les informations nécessaires à la prestation.")}
          </p>

          {service.conditions && (
            <div className="boost-order-note">
              <strong>{t("Conditions")} :</strong> {service.conditions}
            </div>
          )}

          {!user ? (
            <div className="boost-order-login-gate">
              <span className="boost-empty-icon">🔐</span>
              <h2 className="boost-section-title">{t("Connectez-vous pour commander")}</h2>
              <p className="boost-empty-text">
                {t(
                  "Les commandes MboppiBoost sont réservées aux membres connectés et se paient avec le portefeuille Boost."
                )}
              </p>
              <div className="boost-order-login-actions">
                <Link
                  to="/login"
                  state={{ from: `${location.pathname}${location.search}` }}
                  className="boost-btn boost-btn-primary"
                >
                  {t("Se connecter")}
                </Link>
                <Link to="/register" className="boost-btn boost-btn-secondary">
                  {t("Créer un compte")}
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="order-form boost-order-form">
              <div className="form-row">
                <label>{t("Quantité")}</label>
                <input
                  type="number"
                  min={minQty}
                  max={Number.isFinite(maxQty) && maxQty > 0 ? maxQty : undefined}
                  defaultValue={quantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setQuantity("");
                    } else {
                      const num = Number(val);
                      if (!isNaN(num)) setQuantity(num);
                    }
                  }}
                  required
                />
                <span className="unit-price">
                  {service.price > 0
                    ? `${formatAmount(service.price)} ${service.currency} / ${service.billing_unit || 1000}`
                    : t("Sur devis")}
                </span>
              </div>
              <p className="hint">
                <strong>Bornes :</strong>{" "}
                {Number.isFinite(maxQty) && maxQty > 0
                  ? `minimum ${minQty}, maximum ${maxQty}.`
                  : `minimum ${minQty} (pas de maximum).`}{" "}
                {unitPrice > 0 &&
                  `Montant minimum : ${formatAmount(minimumTotal)} ${service.currency}.`}
              </p>

              <h3>{t("Vos coordonnées")}</h3>
              <div className="form-row">
                <label>{t("Nom complet")}</label>
                <input
                  type="text"
                  value={clientInfo.name || ""}
                  onChange={(e) => handleInfoChange("name", e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
              <div className="form-row">
                <label>{t("Téléphone (WhatsApp de préférence)")}</label>
                <input
                  type="tel"
                  value={clientInfo.phone || ""}
                  onChange={(e) => handleInfoChange("phone", e.target.value)}
                  placeholder="Ex: +237 6XX XXX XXX"
                  required
                  maxLength={40}
                />
              </div>
              <div className="form-row">
                <label>{t("E-mail")}</label>
                <input
                  type="email"
                  value={clientInfo.email || ""}
                  onChange={(e) => handleInfoChange("email", e.target.value)}
                  required
                  maxLength={160}
                />
                <p className="form-hint">
                  {t("Utilisé pour recevoir la confirmation et le suivi de votre commande.")}
                </p>
              </div>

              <h3>{t("Informations pour la prestation")}</h3>
              <p className="form-hint">
                {t(
                  "Ces informations seront transmises au prestataire pour exécuter votre commande."
                )}
              </p>
              <div className="form-row">
                <label>
                  {service.is_automated
                    ? t("Lien ou compte cible (obligatoire)")
                    : t("URL ou compte concerné (optionnel)")}
                </label>
                <input
                  type="text"
                  placeholder="Ex: https://instagram.com/votre_compte ou @votre_pseudo"
                  value={clientInfo.profile_url || ""}
                  onChange={(e) => handleInfoChange("profile_url", e.target.value)}
                  required={!!service.is_automated}
                  maxLength={300}
                />
              </div>
              <div className="form-row">
                <label>{t("Objectif ou précision (optionnel)")}</label>
                <textarea
                  rows={3}
                  placeholder="Précisez votre besoin, votre cible, vos objectifs…"
                  value={clientInfo.objectif || ""}
                  onChange={(e) => handleInfoChange("objectif", e.target.value)}
                  maxLength={1000}
                />
              </div>

              <h3>{t("Paiement")}</h3>
              <div className="boost-pay-choice">
                <div
                  className={`boost-pay-option ${canPayWithWallet ? "is-selected" : "is-disabled"}`}
                >
                  <span className="boost-pay-option-main">
                    <span className="boost-pay-option-title">
                      👛 {t("Solde Boost")} <strong>{formatUsd(walletBalance)}</strong>
                    </span>
                    <span className="boost-pay-option-sub">
                      {walletLoading
                        ? t("Chargement du portefeuille…")
                        : walletEstimate == null
                          ? t("Taux de change indisponibles.")
                          : canPayWithWallet
                            ? `${t("Débit estimé")} : ${formatUsd(walletEstimate)}`
                            : `${t("Solde insuffisant")} · ${t("requis")} ${formatUsd(walletEstimate)}`}
                    </span>
                  </span>
                </div>
                {!walletLoading && !canPayWithWallet && (
                  <p className="boost-pay-wallet-link">
                    <Link to="/mboppi-boost/portefeuille">
                      {t("Recharger mon portefeuille Boost")}
                    </Link>
                  </p>
                )}
              </div>

              <div className="form-total">
                <strong>{t("Total")} :</strong>{" "}
                {service.price > 0 ? `${formatAmount(total)} ${service.currency}` : t("Sur devis")}
              </div>

              {walletLoading ? (
                <p className="hint">{t("Chargement du portefeuille…")}</p>
              ) : canPayWithWallet ? (
                <button
                  type="submit"
                  disabled={submitting}
                  className="boost-btn boost-btn-primary boost-btn-block"
                >
                  {submitting
                    ? t("Paiement en cours…")
                    : `${t("Payer")} ${formatUsd(walletEstimate || 0)} ${t("avec mon solde")}`}
                </button>
              ) : (
                <Link
                  to="/mboppi-boost/portefeuille"
                  className="boost-btn boost-btn-primary boost-btn-block"
                >
                  {t("Recharger mon portefeuille Boost")}
                </Link>
              )}
              {error && <p className="error-msg">{error}</p>}
            </form>
          )}
        </section>

        <aside className="boost-order-aside">
          <div className="boost-summary boost-order-summary">
            <div className="boost-summary-head">
              <p className="boost-summary-kicker">{t("Récapitulatif")}</p>
              <h2 className="boost-summary-title">{t("Votre commande")}</h2>
            </div>
            <div className="boost-order-summary-body">
              <div className="boost-summary-row">
                <span>{t("Service")}</span>
                <strong>{service.name}</strong>
              </div>
              <div className="boost-summary-row">
                <span>{t("Quantité")}</span>
                <strong>{quantity}</strong>
              </div>
              <div className="boost-summary-row">
                <span>{t("Prix unitaire")}</span>
                <strong>
                  {service.price > 0
                    ? `${formatAmount(service.price)} ${service.currency} / ${service.billing_unit || 1000}`
                    : t("Sur devis")}
                </strong>
              </div>
              <div className="boost-summary-total">
                <div>
                  <p className="boost-summary-kicker">{t("Total estimé")}</p>
                  <p className="boost-total">
                    {service.price > 0
                      ? `${formatAmount(total)} ${service.currency}`
                      : t("Sur devis")}
                  </p>
                </div>
                <span className="boost-total-note">{service.currency}</span>
              </div>
              <div className="boost-summary-secure">
                {user
                  ? `👛 ${t("Solde Boost")} · ${formatUsd(walletBalance)}`
                  : `🔐 ${t("Connexion requise pour commander")}`}
              </div>
              <Link
                to="/mboppi-boost/mes-commandes"
                className="boost-btn boost-btn-secondary boost-btn-block boost-order-summary-link"
              >
                {t("Suivre ma commande")}
              </Link>
            </div>
          </div>
          <p className="boost-hint boost-order-aside-note">
            {t("Le montant est calculé automatiquement selon la quantité et le tarif du service.")}
          </p>
        </aside>
      </div>
    </BoostPage>
  );
}
