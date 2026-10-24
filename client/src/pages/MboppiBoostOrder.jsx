import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";

export default function MboppiBoostOrder() {
  const { t } = useLang();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { serviceId } = useParams();

  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientInfo, setClientInfo] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("manual");
  const [orderCreated, setOrderCreated] = useState(null);

  useEffect(() => {
    if (!serviceId) return;
    fetchService();
  }, [serviceId]);

  async function fetchService() {
    try {
      const resp = await api.get(`/smm/services/${serviceId}`);
      setService(resp.data?.service || null);
    } catch (err) {
      setError("Impossible de charger le service.");
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
      const resp = await api.post("/smm/orders", {
        service_id: Number(serviceId),
        quantity: Number(quantity),
        client_info: clientInfo,
        payment_method: paymentMethod,
        idempotency_key: idempotencyKey,
      });
      if (resp.data?.ok) {
        setOrderCreated(resp.data);
      } else {
        setError(resp.data?.error || "Échec de la création de la commande.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de la création de la commande.");
    } finally {
      setSubmitting(false);
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

  const total = Math.round((Number(service.price || 0) * Number(quantity)) * 100) / 100;

  if (orderCreated) {
    return (
      <main className="container">
        <Seo title="Commande enregistrée — MboppiBoost" description="Votre commande MboppiBoost a été créée avec succès." />
        <section className="section">
          <div className="cta-card">
            <h2>{t("Commande enregistrée")}</h2>
            <p>{t("Votre commande a été créée avec succès.")} ({orderCreated.total} {orderCreated.currency})</p>
            <p>{t("Numéro de commande")} : #{orderCreated.order_id}</p>
            <Link to="/mboppi-boost/mes-commandes" className="btn btn-primary">{t("Voir mes commandes")}</Link>
            <Link to="/mboppi-boost" className="btn btn-outline">{t("Retour aux services")}</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="container">
      <Seo title={`Commander : ${service.name} — MboppiBoost`} description={`Commander le service ${service.name} sur MboppiBoost.`} />
      <section className="hero vitrine-hero">
        <span className="hero-badge">⚡ MboppiBoost</span>
        <h1>{service.name}</h1>
        <p>{service.short_description || service.description}</p>
        <p>{service.price > 0 ? `${service.price} ${service.currency} / ${service.billing_unit}` : t("Tarif à définir — contacter MboppiBoost")}</p>
        {service.delivery_days && <p>{t("Délai indicatif")} : {service.delivery_days} {t("jours")}</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("Détails du service")}</h2>
          <p>{t("Précisez les informations nécessaires à la prestation.")}</p>
        </div>
        <div className="card service-order-card">
          {service.conditions && (
            <div className="service-conditions"><strong>{t("Conditions")} :</strong> {service.conditions}</div>
          )}
          <form onSubmit={handleSubmit} className="order-form">
            <div className="form-row">
              <label>{t("Quantité")}</label>
              <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} required />
              <span className="unit-price">{service.price > 0 ? `${service.price} ${service.currency}` : t("Sur devis")}</span>
            </div>

            <h3>{t("Informations pour la prestation")}</h3>
            <p className="form-hint">{t("Ces informations seront transmises au prestataire pour exécuter votre commande.")}</p>
            <div className="form-row">
              <label>{t("URL ou compte concerné (optionnel)")}</label>
              <input type="text" placeholder="Ex: https://instagram.com/votre_compte ou @votre_pseudo" value={clientInfo.profile_url || ""} onChange={(e) => handleInfoChange("profile_url", e.target.value)} />
            </div>
            <div className="form-row">
              <label>{t("Objectif ou précision (optionnel)")}</label>
              <textarea rows={3} placeholder="Précisez votre besoin, votre cible, vos objectifs…" value={clientInfo.objectif || ""} onChange={(e) => handleInfoChange("objectif", e.target.value)} />
            </div>

            <h3>{t("Paiement")}</h3>
            <div className="form-row">
              <label>{t("Moyen de paiement")}</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="manual">{t("Paiement manuel (espèce / Mobile Money / virement)")}</option>
                <option value="mobile_money">{t("Mobile Money")}</option>
                <option value="virement">{t("Virement bancaire")}</option>
                <option value="espece">{t("Espèces")}</option>
              </select>
            </div>

            <div className="form-total"><strong>{t("Total")} :</strong> {service.price > 0 ? `${total} ${service.currency}` : t("Sur devis")}</div>

            <button type="submit" disabled={submitting} className="btn btn-primary btn-block">{submitting ? t("Enregistrement…") : t("Confirmer la commande")}</button>
            {error && <p className="error-msg">{error}</p>}
          </form>
        </div>
      </section>

      {!user && (
        <section className="section">
          <div className="card"><p>{t("Connectez-vous pour retrouver vos commandes dans votre espace.")}</p><Link to="/login" className="btn btn-outline">{t("Se connecter")}</Link></div>
        </section>
      )}
    </main>
  );
}