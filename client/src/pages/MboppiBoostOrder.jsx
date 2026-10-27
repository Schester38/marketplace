import { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { saveLocalBoostOrder } from "../boostOrders.js";
import IkeepayCheckout from "../components/IkeepayCheckout.jsx";

const PAYMENT_METHODS = [
  { value: "ikeepay", label: "Paiement en ligne (iKeePay)" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "moneyfusion", label: "MoneyFusion" },
  { value: "virement", label: "Virement bancaire" },
  { value: "espece", label: "Espèces" },
];

const formatAmount = (value) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(value) || 0);

export default function MboppiBoostOrder() {
  const { t } = useLang();
  const { user } = useAuth();
  const { serviceId } = useParams();
  const [searchParams] = useSearchParams();

  const [service, setService] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null);
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
  const [paymentMethod, setPaymentMethod] = useState("ikeepay");
  const [onlineEnabled, setOnlineEnabled] = useState(null);
  const [orderCreated, setOrderCreated] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [paid, setPaid] = useState(false);
  const [refundPending, setRefundPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [declareError, setDeclareError] = useState("");

  useEffect(() => {
    if (!serviceId) return;
    fetchService();
    api
      .smmPaymentInfo()
      .then((resp) => {
        setPaymentInfo(resp.payment_info || null);
        const enabled = Boolean(resp.online_payment?.enabled);
        setOnlineEnabled(enabled);
        if (!enabled) setPaymentMethod("mobile_money");
      })
      .catch(() => {});
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

  async function verifyPayment(order = orderCreated) {
    if (!order?.order_id) return false;
    setVerifying(true);
    try {
      const resp = await api.smmPaymentStatus(order.order_id, order.public_token);
      if (resp?.paid) {
        setPaid(true);
        setRefundPending(resp.status === "refund_pending" || resp.status === "refunded");
        setCheckoutUrl("");
        return true;
      }
    } catch {
      /* le prochain sondage réessaiera */
    } finally {
      setVerifying(false);
    }
    return false;
  }

  useEffect(() => {
    if (!orderCreated || paid || !orderCreated.online_payment?.online) return undefined;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      if (cancelled) return;
      try {
        const resp = await api.smmPaymentStatus(orderCreated.order_id, orderCreated.public_token);
        if (!cancelled && resp?.paid) {
          setPaid(true);
          setRefundPending(resp.status === "refund_pending" || resp.status === "refunded");
          setCheckoutUrl("");
        }
      } catch {
        /* silencieux : nouvelle tentative dans 4 s */
      }
      if (attempts >= 90) clearInterval(id);
    };
    const id = setInterval(tick, 4000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [orderCreated, paid]);

  async function openCheckout() {
    if (!orderCreated) return;
    if (orderCreated.checkout_url) {
      setCheckoutUrl(orderCreated.checkout_url);
      return;
    }
    try {
      const resp = await api.smmCreateCheckout(orderCreated.order_id, orderCreated.public_token);
      if (resp?.checkout_url) {
        setCheckoutUrl(resp.checkout_url);
      } else {
        setManualOpen(true);
        setPaymentMethod((prev) => (prev === "ikeepay" ? "mobile_money" : prev));
        setOrderCreated((prev) => ({
          ...prev,
          online_payment: { online: false, reason: resp?.reason || "online_unavailable" },
          payment_info: resp?.payment_info || prev.payment_info,
        }));
      }
    } catch (err) {
      setDeclareError(err.message || "Impossible d'ouvrir le paiement en ligne.");
      setManualOpen(true);
      setPaymentMethod((prev) => (prev === "ikeepay" ? "mobile_money" : prev));
    }
  }

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
    setSubmitting(true);
    setError("");
    try {
      const idempotencyKey = `smm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const resp = await api.smmCreateOrder({
        service_id: Number(serviceId),
        quantity: Number(quantity),
        client_info: clientInfo,
        payment_method: paymentMethod,
        idempotency_key: idempotencyKey,
      });
      if (resp?.ok) {
        setOrderCreated(resp);
        setPaid(false);
        setRefundPending(false);
        setManualOpen(!resp.checkout_url);
        if (resp.checkout_url) setCheckoutUrl(resp.checkout_url);
        saveLocalBoostOrder({
          id: resp.order_id,
          token: resp.public_token,
          service_name: resp.service,
          total: resp.total,
          currency: resp.currency,
          created_at: new Date().toISOString(),
        });
      } else {
        setError("Échec de la création de la commande.");
      }
    } catch (err) {
      setError(err.message || "Erreur lors de la création de la commande.");
    } finally {
      setSubmitting(false);
    }
  }

  async function declarePayment(e) {
    e.preventDefault();
    setDeclaring(true);
    setDeclareError("");
    try {
      const resp = await api.smmDeclarePayment(orderCreated.order_id, {
        payment_reference: paymentReference.trim(),
        payment_method: paymentMethod,
        phone: clientInfo.phone || "",
        token: orderCreated.public_token,
      });
      if (resp?.ok) {
        setDeclared(true);
      } else {
        setDeclareError("Paiement non enregistré. Réessayez ou contactez le support.");
      }
    } catch (err) {
      setDeclareError(err.message || "Impossible de déclarer le paiement.");
    } finally {
      setDeclaring(false);
    }
  }

  if (loading) {
    return (
      <main className="container">
        <Seo title="Chargement… — MboppiBoost" />
        <p>{t("Chargement…")}</p>
      </main>
    );
  }

  if (!service) {
    return (
      <main className="container">
        <Seo title="Service introuvable — MboppiBoost" />
        <p>{error || "Ce service n'existe pas."}</p>
        <Link to="/mboppi-boost" className="btn btn-primary">
          Retour aux services
        </Link>
      </main>
    );
  }

  const billingUnit = Number(service.billing_unit) > 0 ? Number(service.billing_unit) : 1000;
  const unitPrice = Number(service.price || 0);
  const total = Math.round(((unitPrice * Number(quantity)) / billingUnit) * 100) / 100;
  const providerMin = Number(service.limits?.min);
  const minimumTotalQty = Number(service.min_total_quantity);
  const minQty = Math.max(
    Number.isFinite(providerMin) && providerMin > 0 ? providerMin : 1,
    Number.isFinite(minimumTotalQty) && minimumTotalQty > 0 ? minimumTotalQty : 1
  );
  const maxQty = Number(service.limits?.max);
  const minimumTotal = Math.round(((unitPrice * minQty) / billingUnit) * 100) / 100;

  if (orderCreated) {
    const whatsapp = paymentInfo?.whatsapp?.replace(/[^\d]/g, "");
    return (
      <main className="container">
        <Seo
          title="Commande enregistrée — MboppiBoost"
          description="Votre commande MboppiBoost a été créée avec succès."
        />
        <section className="section">
          <div className="cta-card">
            <h2>{t("Commande enregistrée")}</h2>
            <p>
              {t("Votre commande a été créée avec succès.")} ({formatAmount(orderCreated.total)}{" "}
              {orderCreated.currency})
            </p>
            <p>
              {t("Numéro de commande")} : <strong>#{orderCreated.order_id}</strong>
            </p>
            <p className="hint">
              {t(
                "Conservez ce numéro : il vous permet de déclarer votre paiement et de suivre la commande."
              )}
            </p>

            {paid ? (
              <div className="card mboost-paid-card" style={{ marginTop: 16 }}>
                <h3>{refundPending ? `↩️ ${t("Remboursement en cours")}` : `✅ ${t("Paiement confirmé")}`}</h3>
                <p>
                  {refundPending
                    ? t(
                        "Votre paiement a été reçu après l'annulation de la commande. Un remboursement est en cours de traitement."
                      )
                    : t(
                        "Votre paiement a été confirmé. La commande va être transmise au prestataire."
                      )}
                </p>
                <Link to="/mboppi-boost/mes-commandes" className="btn btn-primary">
                  {refundPending ? t("Voir mes commandes") : t("Suivre ma commande")}
                </Link>
              </div>
            ) : orderCreated.online_payment?.online ? (
              <div className="card mboost-online-card" style={{ marginTop: 16 }}>
                <div className="mboost-online-head">
                  <div>
                    <h3>💳 {t("Paiement en ligne sécurisé")}</h3>
                    <p>
                      {formatAmount(orderCreated.total)} {orderCreated.currency} ·{" "}
                      {t("Carte bancaire ou Mobile Money via iKeePay")}
                    </p>
                  </div>
                  <span className="mboost-secure-badge">🔒 iKeePay</span>
                </div>
                <button type="button" className="btn btn-primary btn-block" onClick={openCheckout}>
                  {t("Payer maintenant")}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    setManualOpen(true);
                    setPaymentMethod((prev) => (prev === "ikeepay" ? "mobile_money" : prev));
                  }}
                >
                  {t("Payer autrement (mobile money / virement)")}
                </button>
                {verifying && <p className="hint">{t("Vérification du paiement…")}</p>}
                {declareError && <p className="error-msg">{declareError}</p>}
              </div>
            ) : null}

            {declared ? (
              <div className="card" style={{ marginTop: 16 }}>
                <h3>✅ {t("Paiement déclaré")}</h3>
                <p>
                  {t(
                    "Votre paiement est en cours de vérification. La commande sera transmise au prestataire dès validation."
                  )}
                </p>
                <Link to="/mboppi-boost/mes-commandes" className="btn btn-primary">
                  {t("Voir mes commandes")}
                </Link>
              </div>
            ) : manualOpen || !orderCreated.online_payment?.online ? (
              <>
                <div className="card" style={{ marginTop: 16 }}>
                  <h3>💳 {t("Payer votre commande")}</h3>
                  <p>
                    {t("Montant à régler")} :{" "}
                    <strong>
                      {formatAmount(orderCreated.total)} {orderCreated.currency}
                    </strong>
                  </p>
                  {paymentInfo ? (
                    <ul style={{ lineHeight: 1.8 }}>
                      <li>
                        🟠 Orange Money : <strong>{paymentInfo.orange_money}</strong>
                      </li>
                      <li>
                        🟡 MTN Mobile Money : <strong>{paymentInfo.mtn_mobile_money}</strong>
                      </li>
                      <li>
                        📱 MoneyFusion : <strong>{paymentInfo.moneyfusion_phone}</strong>
                      </li>
                      <li>
                        {t("Nom du compte")} : <strong>{paymentInfo.account_name}</strong>
                      </li>
                    </ul>
                  ) : (
                    <p>
                      {t("Contactez le support pour recevoir les coordonnées de paiement.")}{" "}
                      <Link to="/contact">{t("Contact")}</Link>
                    </p>
                  )}
                  {paymentInfo?.note && <p className="hint">{paymentInfo.note}</p>}
                  {whatsapp && (
                    <a
                      className="btn btn-outline"
                      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                        `Bonjour, je viens de créer la commande MboppiBoost #${orderCreated.order_id} (${orderCreated.service} — ${formatAmount(orderCreated.total)} ${orderCreated.currency}).`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Envoyer la preuve sur WhatsApp
                    </a>
                  )}
                </div>

                <div className="card" style={{ marginTop: 16 }}>
                  <h3>{t("J'ai payé")}</h3>
                  <p className="hint">
                    {t(
                      "Indiquez la référence de votre transaction (ID Orange Money, MTN MoMo, MoneyFusion ou virement)."
                    )}
                  </p>
                  <form onSubmit={declarePayment} className="order-form">
                    <div className="form-row">
                      <label>{t("Référence de paiement")}</label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder="Ex: OM-123456789"
                        required
                        minLength={2}
                        maxLength={200}
                      />
                    </div>
                    <div className="form-row">
                      <label>{t("Moyen utilisé")}</label>
                      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                        {PAYMENT_METHODS.filter((m) => m.value !== "ikeepay").map((m) => (
                          <option key={m.value} value={m.value}>
                            {t(m.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" disabled={declaring} className="btn btn-primary btn-block">
                      {declaring ? t("Envoi…") : t("Déclarer mon paiement")}
                    </button>
                    {declareError && <p className="error-msg">{declareError}</p>}
                  </form>
                </div>
              </>
            ) : null}

            {!user && (
              <p className="hint" style={{ marginTop: 12 }}>
                {t("Astuce : connectez-vous pour retrouver toutes vos commandes dans votre espace.")}
              </p>
            )}
            <Link to="/mboppi-boost/mes-commandes" className="btn btn-outline" style={{ marginTop: 12 }}>
              {t("Suivre ma commande")}
            </Link>
            <Link to="/mboppi-boost" className="btn btn-outline" style={{ marginTop: 12 }}>
              {t("Retour aux services")}
            </Link>
          </div>
        </section>
        {checkoutUrl && (
          <IkeepayCheckout
            checkoutUrl={checkoutUrl}
            onSuccess={() => {
              setCheckoutUrl("");
              verifyPayment();
            }}
            onClose={() => setCheckoutUrl("")}
          />
        )}
      </main>
    );
  }

  return (
    <main className="container">
      <Seo
        title={`Commander : ${service.name} — MboppiBoost`}
        description={`Commander le service ${service.name} sur MboppiBoost.`}
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">⚡ MboppiBoost</span>
        <h1>{service.name}</h1>
        <p>{service.short_description || service.description}</p>
        <p>
          {service.price > 0
            ? `${formatAmount(service.price)} ${service.currency} / ${service.billing_unit || 1000}`
            : t("Tarif à définir — contacter MboppiBoost")}
        </p>
        {service.delivery_days && (
          <p>
            {t("Délai indicatif")} : {service.delivery_days} {t("jours")}
          </p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("Détails du service")}</h2>
          <p>{t("Précisez les informations nécessaires à la prestation.")}</p>
        </div>
        <div className="card service-order-card">
          {service.conditions && (
            <div className="service-conditions">
              <strong>{t("Conditions")} :</strong> {service.conditions}
            </div>
          )}
          <form onSubmit={handleSubmit} className="order-form">
            <div className="form-row">
              <label>{t("Quantité")}</label>
              <input
                type="number"
                min={minQty}
                max={Number.isFinite(maxQty) && maxQty > 0 ? maxQty : undefined}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(minQty, Number(e.target.value) || minQty))}
                required
              />
              <span className="unit-price">
                {service.price > 0
                  ? `${formatAmount(service.price)} ${service.currency} / ${service.billing_unit || 1000}`
                  : t("Sur devis")}
              </span>
            </div>
            <p className="hint">
              {Number.isFinite(maxQty) && maxQty > 0
                ? `Quantité entre ${minQty} et ${maxQty}.`
                : `Quantité minimale : ${minQty}.`}{" "}
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
              {t("Ces informations seront transmises au prestataire pour exécuter votre commande.")}
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
            <div className="form-row">
              <label>{t("Moyen de paiement")}</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.filter(
                  (m) => m.value !== "ikeepay" || onlineEnabled !== false
                ).map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.label)}
                  </option>
                ))}
              </select>
              {paymentMethod === "ikeepay" && (
                <p className="form-hint">
                  {t(
                    "Vous serez redirigé vers le tunnel sécurisé iKeePay (carte bancaire ou mobile money)."
                  )}
                </p>
              )}
            </div>

            <div className="form-total">
              <strong>{t("Total")} :</strong>{" "}
              {service.price > 0
                ? `${formatAmount(total)} ${service.currency}`
                : t("Sur devis")}
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary btn-block">
              {submitting ? t("Enregistrement…") : t("Confirmer la commande")}
            </button>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </div>
      </section>

      {!user && (
        <section className="section">
          <div className="card">
            <p>{t("Connectez-vous pour retrouver vos commandes dans votre espace.")}</p>
            <Link to="/login" className="btn btn-outline">
              {t("Se connecter")}
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
