import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { listLocalBoostOrders, removeLocalBoostOrder } from "../boostOrders.js";
import IkeepayCheckout from "../components/IkeepayCheckout.jsx";

const STATUS_LABELS = {
  draft: "Brouillon",
  pending_payment: "Paiement en attente",
  paid: "Payé",
  submitted: "Transmise au prestataire",
  processing: "En cours de traitement",
  completed: "Terminée",
  failed: "Échouée",
  cancelled: "Annulée",
  refund_pending: "Remboursement en attente",
  refunded: "Remboursée",
};

const METHOD_OPTIONS = [
  { value: "mobile_money", label: "Mobile Money" },
  { value: "moneyfusion", label: "MoneyFusion" },
  { value: "virement", label: "Virement bancaire" },
  { value: "espece", label: "Espèces" },
];

export default function MboppiBoostOrders() {
  const { t } = useLang();
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [declareId, setDeclareId] = useState(null);
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState("mobile_money");
  const [declaring, setDeclaring] = useState(false);
  const [declareError, setDeclareError] = useState("");
  const [notice, setNotice] = useState("");
  const [payingId, setPayingId] = useState(null);
  const [checkout, setCheckout] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, [user]);

  async function fetchOrders() {
    setLoading(true);
    setError("");
    const merged = new Map();

    if (user) {
      try {
        const resp = await api.smmOrders();
        for (const order of resp.orders || []) merged.set(Number(order.id), { ...order, _token: null });
      } catch (err) {
        setError(err.message || "Impossible de charger vos commandes.");
      }
    }

    const locals = listLocalBoostOrders();
    for (const local of locals) {
      if (merged.has(Number(local.id))) {
        merged.get(Number(local.id))._token = local.token;
        continue;
      }
      try {
        const resp = await api.smmOrder(local.id, local.token);
        if (resp.order) merged.set(Number(resp.order.id), { ...resp.order, _token: local.token });
      } catch (err) {
        if (err?.status === 404) removeLocalBoostOrder(local.id);
      }
    }

    setOrders(
      [...merged.values()].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    );
    setLoading(false);
  }

  async function startOnlinePayment(order) {
    setPayingId(order.id);
    setDeclareError("");
    setNotice("");
    try {
      const resp = await api.smmCreateCheckout(order.id, order._token || undefined);
      if (resp?.online && resp.checkout_url) {
        setCheckout({ orderId: order.id, token: order._token || null, url: resp.checkout_url });
      } else {
        setDeclareId(order.id);
        setNotice(
          t(
            "Le paiement en ligne n'est pas disponible pour cette commande. Déclarez votre paiement mobile money ou contactez le support."
          )
        );
      }
    } catch (err) {
      setDeclareError(err.message || "Impossible d'ouvrir le paiement en ligne.");
    } finally {
      setPayingId(null);
    }
  }

  async function confirmOnlinePayment(orderId, token) {
    setCheckout(null);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const resp = await api.smmPaymentStatus(orderId, token || undefined);
        if (resp?.paid) {
          const status = resp.status === "refund_pending" ? "refund_pending" : "paid";
          setOrders((prev) =>
            prev.map((o) =>
              Number(o.id) === Number(orderId)
                ? { ...o, status, payment_status: "paid", paid_at: new Date().toISOString() }
                : o
            )
          );
          setNotice(
            status === "refund_pending"
              ? `Paiement reçu pour la commande #${orderId}. Elle avait été annulée : un remboursement est en cours.`
              : `Paiement confirmé pour la commande #${orderId}. Merci !`
          );
          return;
        }
      } catch {
        /* on réessaie */
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    fetchOrders();
  }

  async function declarePayment(order) {
    if (!reference.trim()) return;
    setDeclaring(true);
    setDeclareError("");
    try {
      const resp = await api.smmDeclarePayment(order.id, {
        payment_reference: reference.trim(),
        payment_method: method,
        phone: order.client_info?.phone || "",
        token: order._token || undefined,
      });
      if (resp?.ok) {
        setOrders((prev) =>
          prev.map((o) =>
            Number(o.id) === Number(order.id)
              ? { ...o, status: "pending_payment", payment_status: "declared", payment_reference: reference.trim() }
              : o
          )
        );
        setNotice(
          `Paiement déclaré pour la commande #${order.id}. Notre équipe le vérifie puis transmet la commande au prestataire.`
        );
        setDeclareId(null);
        setReference("");
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
        <Seo title="Mes commandes — MboppiBoost" />
        <p>{t("Chargement…")}</p>
      </main>
    );
  }

  return (
    <main className="container">
      <Seo title="Mes commandes — MboppiBoost" description="Suivez vos commandes MboppiBoost." />
      <section className="section">
        <div className="section-head">
          <h2>{t("Mes commandes MboppiBoost")}</h2>
          <p>{t("Suivez l'état de vos commandes de services marketing digital.")}</p>
        </div>

        {notice && (
          <div className="card" style={{ borderColor: "var(--primary)" }}>
            <p>✅ {notice}</p>
          </div>
        )}

        {error && (
          <div className="card">
            <p className="error-msg">{error}</p>
          </div>
        )}

        {orders.length === 0 && !error && (
          <div className="card">
            <p>
              {t(
                "Aucune commande pour le moment. Les commandes créées sur cet appareil apparaissent aussi ici."
              )}
            </p>
            <Link to="/mboppi-boost" className="btn btn-primary">
              {t("Découvrir les services")}
            </Link>
          </div>
        )}

        {orders.length > 0 && (
          <div className="orders-table">
            <table>
              <thead>
                <tr>
                  <th>{t("N°")}</th>
                  <th>{t("Service")}</th>
                  <th>{t("Total")}</th>
                  <th>{t("Statut")}</th>
                  <th>{t("Paiement")}</th>
                  <th>{t("Date")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td>{o.service_name}</td>
                    <td>
                      {o.total} {o.currency}
                    </td>
                    <td>
                      <span className={`badge badge-${o.status}`}>
                        {t(STATUS_LABELS[o.status] || o.status)}
                      </span>
                    </td>
                    <td>
                      {o.status === "refund_pending"
                        ? t("Remboursement en attente")
                        : o.status === "refunded" || o.payment_status === "refunded"
                        ? t("Remboursé")
                        : o.payment_status === "refund_pending"
                          ? t("Remboursement en attente")
                          : o.payment_status === "paid"
                            ? t("Confirmé")
                            : o.payment_status === "declared"
                              ? t("Déclaré — vérification")
                              : t("Non payé")}
                      {o.payment_reference ? <div className="hint">Réf. {o.payment_reference}</div> : null}
                    </td>
                    <td>{new Date(o.created_at).toLocaleDateString("fr-FR")}</td>
                    <td>
                      {["draft", "pending_payment"].includes(o.status) && o.payment_status !== "declared" && (
                        <>
                          <button
                            type="button"
                            className="btn btn-small btn-primary"
                            disabled={payingId === o.id}
                            onClick={() => startOnlinePayment(o)}
                          >
                            {payingId === o.id ? t("Ouverture…") : t("Payer en ligne")}
                          </button>{" "}
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => {
                              setDeclareId(declareId === o.id ? null : o.id);
                              setReference("");
                              setDeclareError("");
                            }}
                          >
                            {t("J'ai payǸ")}
                          </button>
                        </>
                      )}
                      {declareId === o.id && (
                        <div className="boost-declare">
                          <input
                            type="text"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder={t("Référence de transaction")}
                            maxLength={200}
                          />
                          <select value={method} onChange={(e) => setMethod(e.target.value)}>
                            {METHOD_OPTIONS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {t(m.label)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            disabled={declaring || !reference.trim()}
                            onClick={() => declarePayment(o)}
                          >
                            {declaring ? t("Envoi…") : t("Envoyer")}
                          </button>
                          {declareError && <p className="error-msg">{declareError}</p>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!user && (
          <div className="card" style={{ marginTop: 16 }}>
            <p>
              {t(
                "Les commandes passées sans compte restent visibles sur cet appareil. Connectez-vous pour les retrouver partout."
              )}
            </p>
            <Link to="/login" className="btn btn-outline">
              {t("Se connecter")}
            </Link>
          </div>
        )}
      </section>
      {checkout && (
        <IkeepayCheckout
          checkoutUrl={checkout.url}
          onSuccess={() => confirmOnlinePayment(checkout.orderId, checkout.token)}
          onClose={() => setCheckout(null)}
        />
      )}
    </main>
  );
}
