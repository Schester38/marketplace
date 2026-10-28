import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { BASE_URL } from "../config.js";
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

function BoostPage({ children }) {
  return (
    <main className="boost-page">
      <div className="boost-shell">{children}</div>
    </main>
  );
}

export default function MboppiBoostOrders() {
  const { t } = useLang();
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [declareId, setDeclareId] = useState(null);
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState("mobile_money");
  const [declaring, setDeclaring] = useState(false);
  const [reportingId, setReportingId] = useState(null);
  const [reportMessage, setReportMessage] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState("");
  const [declareError, setDeclareError] = useState("");
  const [notice, setNotice] = useState("");
  const [payingId, setPayingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [orderDetails, setOrderDetails] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sortOrder, setSortOrder] = useState("date_desc");
  const [serverOrders, setServerOrders] = useState([]);
  const [localOrders, setLocalOrders] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchOrders();
    if (!user) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api.smmSyncMine(20);
        if (cancelled) return;
        if (res && (res.updated || 0) > 0) {
          fetchOrders({ silent: true, reset: true });
        }
      } catch {
        /* best-effort */
      }
    };
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  useEffect(() => {
    fetchOrders({ reset: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFrom, dateTo, minAmount, maxAmount, sortOrder]);

  async function toggleDetail(order) {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);
    if (orderDetails[order.id]) return;
    setDetailLoadingId(order.id);
    try {
      const token = order._token || undefined;
      const resp = await api.smmOrder(order.id, token);
      setOrderDetails((prev) => ({ ...prev, [order.id]: resp }));
    } catch (err) {
      setOrderDetails((prev) => ({ ...prev, [order.id]: { error: err.message } }));
    } finally {
      setDetailLoadingId(null);
    }
  }


  async function fetchOrders({ silent = false, reset = true } = {}) {
    if (silent) setRefreshing(true);
    else if (reset) setLoading(true);
    else setLoadingMore(true);
    setError("");
    const params = {
      limit: 20,
      status: statusFilter,
      from: dateFrom,
      to: dateTo,
      min_total: minAmount,
      max_total: maxAmount,
      sort: sortOrder,
    };
    if (!reset) params.offset = offset;
    try {
      const merged = new Map();
      if (user) {
        try {
          const resp = await api.smmOrders(params);
          for (const order of resp.orders || []) merged.set(Number(order.id), { ...order, _token: null });
          setHasMore(!!resp.has_more);
          setTotal(resp.total || 0);
          setOffset((resp.offset != null ? resp.offset : 0) + (resp.orders || []).length);
          setCursor(resp.next_cursor || null);
        } catch (err) {
          setError(err.message || "Impossible de charger vos commandes.");
        }
      }
      if (reset) {
        const locals = listLocalBoostOrders();
        for (const local of locals) {
          try {
            const resp = await api.smmOrder(local.id, local.token);
            if (resp.order) {
              const o = { ...resp.order, _token: local.token };
              if (!merged.has(Number(o.id))) merged.set(Number(o.id), o);
            }
          } catch (err) {
            if (err?.status === 404) removeLocalBoostOrder(local.id);
          }
        }
      }
      const list = [...merged.values()];
      if (reset) {
        setOrders(list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
      } else {
        setOrders((prev) => [...prev, ...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)));
      }
    } finally {
      if (silent) setRefreshing(false);
      else if (reset) setLoading(false);
      else setLoadingMore(false);
    }
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
    setVerifyingId(orderId);
    setNotice(t("Vérification du paiement en cours…"));
    for (let attempt = 0; attempt < 90; attempt += 1) {
      try {
        const resp = await api.smmPaymentStatus(orderId, token || undefined);
        if (resp?.paid) {
          const status = [
            "paid",
            "submitted",
            "processing",
            "completed",
            "refund_pending",
            "refunded",
          ].includes(resp.status)
            ? resp.status
            : "paid";
          setOrders((prev) =>
            prev.map((o) =>
              Number(o.id) === Number(orderId)
                ? { ...o, status, payment_status: "paid", paid_at: new Date().toISOString() }
                : o
            )
          );
          setNotice(
            ["refund_pending", "refunded"].includes(status)
              ? `Paiement reçu pour la commande #${orderId}. Elle avait été annulée : ${
                  status === "refunded" ? "elle a été remboursée." : "un remboursement est en cours."
                }`
              : ["submitted", "processing", "completed"].includes(status)
                ? `Paiement confirmé pour la commande #${orderId}. Elle a été transmise au prestataire.`
                : `Paiement confirmé pour la commande #${orderId}. Transmission au prestataire en cours.`
          );
          setVerifyingId(null);
          return;
        }
      } catch {
        /* on réessaie */
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    setVerifyingId(null);
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

  async function cancelOrder(order) {
    if (!order?.id) return;
    if (!window.confirm(t("Annuler cette commande ? Le montant sera remboursé sur votre portefeuille Boost si elle a été payée."))) return;
    setCancellingId(order.id);
    setNotice("");
    setError("");
    try {
      const resp = await api.smmCancelOrder(order.id);
      if (resp?.ok) {
        setOrders((prev) =>
          prev.map((o) =>
            Number(o.id) === Number(order.id)
              ? { ...o, status: "cancelled", payment_status: "cancelled" }
              : o
          )
        );
        setNotice(
          resp.refunded_usd
            ? `Commande #${order.id} annulée : ${resp.refunded_usd} USD remboursés.`
            : `Commande #${order.id} annulée.`
        );
      }
    } catch (err) {
      setError(err.message || "Impossible d'annuler la commande.");
    } finally {
      setCancellingId(null);
    }
  }

  async function reportProblem(order) {
    if (!order?.id) return;
    setReportingId(order.id);
    setReportMessage("");
    setReportError("");
    setNotice("");
  }

  async function submitReport(order) {
    if (!order?.id) return;
    setReporting(true);
    setReportError("");
    try {
      await api.smmReportProblem(order.id, { message: reportMessage.trim() });
      setNotice(t("Problème signalé à l'administration. Nous vous recontacterons rapidement."));
      setReportingId(null);
      setReportMessage("");
    } catch (err) {
      setReportError(err.message || t("Impossible de signaler le problème."));
    } finally {
      setReporting(false);
    }
  }

  const activeCount = orders.filter((o) =>
    ["draft", "pending_payment", "paid", "submitted", "processing"].includes(o.status)
  ).length;

  if (loading) {
    return (
      <BoostPage>
        <Seo title="Mes commandes — MboppiBoost" />
        <section className="boost-card boost-card-pad boost-order-state boost-fade-up">
          <span className="boost-loader" aria-hidden="true" />
          <p className="boost-strong">{t("Chargement…")}</p>
        </section>
      </BoostPage>
    );
  }

  return (
    <BoostPage>
      <Seo title="Mes commandes — MboppiBoost" description="Suivez vos commandes MboppiBoost." />

      <section className="boost-hero boost-orders-hero">
        <div className="boost-hero-grid tw-absolute tw-inset-0" aria-hidden="true" />
        <span className="boost-orb boost-orb-a" aria-hidden="true" />
        <span className="boost-orb boost-orb-b" aria-hidden="true" />
        <div className="boost-order-hero-inner">
          <Link to="/mboppi-boost" className="boost-back">
            ← {t("Tous les services")}
          </Link>
          <span className="boost-eyebrow">⚡ MboppiBoost</span>
          <h1 className="boost-order-title">{t("Mes commandes MboppiBoost")}</h1>
          <p className="boost-lead">
            {t("Suivez l'état de vos commandes de services marketing digital.")}
          </p>
          <div className="boost-order-hero-meta">
            <span className="boost-chip">
              {orders.length} {orders.length > 1 ? t("commandes") : t("commande")}
            </span>
            {activeCount > 0 && (
              <span className="boost-chip">
                {activeCount} {t("en cours")}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="boost-orders-body">
        {notice && (
          <div className="boost-alert boost-alert-success boost-fade-up" role="status">
            ✅ {notice}
          </div>
        )}

        {error && (
          <div className="boost-alert boost-alert-error" role="alert">
            ⚠️ {error}
          </div>
        )}

        {orders.length > 0 && (
          <div className="boost-orders-toolbar">
            <button
              type="button"
              className="boost-page-btn"
              onClick={() => fetchOrders({ silent: true })}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              ↻ {refreshing ? t("Chargement…") : t("Actualiser")}
            </button>
            <Link to="/mboppi-boost/portefeuille" className="boost-page-btn">
              👛 {t("Portefeuille Boost")}
            </Link>
          </div>
        )}

        <div className="boost-orders-filters" style={{display:"flex",flexWrap:"wrap",gap:"8px",marginBottom:"12px"}}>
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="boost-input">
            <option value="all">Tous les statuts</option>
            {Object.keys(STATUS_LABELS).map((s)=>(<option key={s} value={s}>{STATUS_LABELS[s]}</option>))}
          </select>
          <input type="date" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} className="boost-input" placeholder="Du" />
          <input type="date" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} className="boost-input" placeholder="Au" />
          <input type="number" value={minAmount} onChange={(e)=>setMinAmount(e.target.value)} className="boost-input" placeholder="Montant min" />
          <input type="number" value={maxAmount} onChange={(e)=>setMaxAmount(e.target.value)} className="boost-input" placeholder="Montant max" />
          <select value={sortOrder} onChange={(e)=>setSortOrder(e.target.value)} className="boost-input">
            <option value="date_desc">Date (r�cent)</option>
            <option value="date_asc">Date (ancien)</option>
            <option value="total_desc">Montant (desc)</option>
            <option value="total_asc">Montant (asc)</option>
          </select>
        </div>

        {orders.length === 0 && !error && (
          <div className="boost-empty boost-fade-up">
            <span className="boost-empty-icon" aria-hidden="true">
              🛍️
            </span>
            <h2 className="boost-empty-title">{t("Aucune commande pour le moment")}</h2>
            <p className="boost-empty-text">
              {t("Les commandes créées sur cet appareil apparaissent aussi ici.")}
            </p>
            <Link to="/mboppi-boost" className="boost-btn boost-btn-primary">
              {t("Découvrir les services")}
            </Link>
          </div>
        )}

        {orders.length > 0 && (
          <div className="boost-orders-list">
            {orders.map((o) => {
              const createdLabel = new Date(o.created_at).toLocaleDateString("fr-FR");
              const isRefunding =
                o.status === "refund_pending" || o.payment_status === "refund_pending";
              const isRefunded = o.status === "refunded" || o.payment_status === "refunded";
              const isPaid = o.payment_status === "paid";
              const isDeclared = o.payment_status === "declared";
              const canPay =
                ["draft", "pending_payment"].includes(o.status) && o.payment_status !== "declared";
              const paymentLabel = o.status === "refund_pending"
                ? t("Remboursement en attente")
                : isRefunded
                  ? t("Remboursé")
                  : isRefunding
                    ? t("Remboursement en attente")
                    : isPaid
                      ? t("Confirmé")
                      : isDeclared
                        ? t("Déclaré — vérification")
                        : t("Non payé");
              const paymentTone = isRefunded || isRefunding
                ? "boost-pay-danger"
                : isPaid
                  ? "boost-pay-ok"
                  : isDeclared
                    ? "boost-pay-warn"
                    : "boost-pay-muted";

              return (
                <article key={o.id} className="boost-order-item boost-fade-up">
                  <div className="boost-order-item-head">
                    <div className="boost-order-identity">
                      <span className="boost-order-ref">#{o.id}</span>
                      <div>
                        <h3 className="boost-order-service">{o.service_name}</h3>
                        <p className="boost-order-date">{createdLabel}</p>
                      </div>
                    </div>
                    <span className={`boost-status boost-status-${o.status}`}>
                      {t(STATUS_LABELS[o.status] || o.status)}
                    </span>
                  </div>

                  <div className="boost-order-meta-grid">
                    <div className="boost-order-meta">
                      <span>{t("Total")}</span>
                      <strong>
                        {o.total} {o.currency}
                      </strong>
                    </div>
                    <div className="boost-order-meta">
                      <span>{t("Paiement")}</span>
                      <strong className={paymentTone}>{paymentLabel}</strong>
                      {o.payment_provider === "boost_wallet" || o.payment_method === "wallet" ? (
                        <small className="boost-order-ref-line">
                          👛 {t("Portefeuille Boost")}
                        </small>
                      ) : null}
                      {o.payment_reference ? (
                        <small className="boost-order-ref-line">Réf. {o.payment_reference}</small>
                      ) : null}
                    </div>
                    <div className="boost-order-meta">
                      <span>{t("Quantité")}</span>
                      <strong>{o.quantity ?? "—"}</strong>
                    </div>
                  </div>

                  {(() => {
                    const shareToken = o._token || orderDetails[o.id]?.order?.tracking_token || orderDetails[o.id]?.tracking_token;
                    const shareUrl = shareToken
                      ? `${BASE_URL}/mboppi-boost/suivi/${o.id}?token=${encodeURIComponent(shareToken)}`
                      : "";
                    return shareUrl ? (
                      <button
                        type="button"
                        className="boost-btn boost-btn-secondary boost-btn-sm"
                        style={{ marginTop: 8, marginRight: 8 }}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(shareUrl);
                            setNotice(t("Lien de suivi copié."));
                          } catch {
                            setNotice(shareUrl);
                          }
                        }}
                      >
                        {t("Copier le lien de suivi")}
                      </button>
                    ) : null;
                  })()}

                  <button
                    type="button"
                    className="boost-btn boost-btn-secondary boost-btn-sm"
                    onClick={() => toggleDetail(o)}
                    style={{ marginTop: 8 }}
                  >
                    {expandedId === o.id ? t("Masquer la progression") : t("Voir la progression")}
                  </button>

                  {expandedId === o.id && (
                    <div className="boost-order-detail" style={{ marginTop: 10 }}>
                      {detailLoadingId === o.id && <p className="hint">{t("Chargement…")}</p>}
                      {orderDetails[o.id]?.error && (
                        <p className="error-msg">{orderDetails[o.id].error}</p>
                      )}
                      {orderDetails[o.id] && !orderDetails[o.id].error && (
                        <>
                          {orderDetails[o.id].final_outcome && (
                            <p>
                              <strong>{t("Résultat final")} :</strong>{" "}
                              {t(STATUS_LABELS[orderDetails[o.id].final_outcome.status] || orderDetails[o.id].final_outcome.status)}
                              {orderDetails[o.id].final_outcome.remains != null && (
                                <> · {t("Restant")} : {orderDetails[o.id].final_outcome.remains}</>
                              )}
                              {orderDetails[o.id].final_outcome.charge != null && (
                                <> · {t("Charge")} : {orderDetails[o.id].final_outcome.charge}</>
                              )}
                            </p>
                          )}
                          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                            {(orderDetails[o.id].events || []).map((ev, idx) => (
                              <li key={idx} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                                  <strong>{ev.event_type}</strong>
                                  <span className="hint">{new Date(ev.created_at).toLocaleString("fr-FR")}</span>
                                </div>
                                {(ev.old_status || ev.new_status) && (
                                  <div className="hint">{ev.old_status || "—"} → {ev.new_status || "—"}</div>
                                )}
                                {ev.message && <div className="hint" style={{ overflowWrap: "anywhere" }}>{ev.message}</div>}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {canPay && (
                    <div className="boost-order-actions">
                      <button
                        type="button"
                        className="boost-btn boost-btn-primary boost-btn-sm"
                        disabled={payingId === o.id || verifyingId === o.id}
                        onClick={() => startOnlinePayment(o)}
                      >
                        {verifyingId === o.id
                          ? t("Vérification du paiement…")
                          : payingId === o.id
                            ? t("Ouverture…")
                            : t("Payer avec iKeePay")}
                      </button>
                      <button
                        type="button"
                        className="boost-btn boost-btn-secondary boost-btn-sm"
                        onClick={() => {
                          setDeclareId(declareId === o.id ? null : o.id);
                          setReference("");
                          setDeclareError("");
                        }}
                      >
                        {t("J'ai payé")}
                      </button>
                    </div>
                  )}

                  {["pending_payment", "paid"].includes(o.status) && !o.external_reference && (
                    <div className="boost-order-actions">
                      <button
                        type="button"
                        className="boost-btn boost-btn-secondary boost-btn-sm"
                        disabled={cancellingId === o.id}
                        onClick={() => cancelOrder(o)}
                      >
                        {cancellingId === o.id ? t("Annulation…") : t("Annuler la commande")}
                      </button>
                    </div>
                  )}

                  <div className="boost-order-actions">
                    <button
                      type="button"
                      className="boost-btn boost-btn-secondary boost-btn-sm"
                      onClick={() => reportProblem(o)}
                    >
                      {t("Signaler un problème")}
                    </button>
                  </div>

                  {reportingId === o.id && (
                    <div className="boost-declare">
                      <p className="boost-declare-title">{t("Décrire le problème (optionnel)")}</p>
                      <textarea
                        value={reportMessage}
                        onChange={(e) => setReportMessage(e.target.value)}
                        placeholder={t("Décrivez le problème rencontré avec cette commande…")}
                        maxLength={1000}
                        className="boost-input"
                        rows={3}
                      />
                      {reportError && <p className="error-msg">{reportError}</p>}
                      <div className="boost-order-actions">
                        <button
                          type="button"
                          className="boost-btn boost-btn-primary boost-btn-sm"
                          disabled={reporting}
                          onClick={() => submitReport(o)}
                        >
                          {reporting ? t("Envoi…") : t("Envoyer")}
                        </button>
                        <button
                          type="button"
                          className="boost-btn boost-btn-secondary boost-btn-sm"
                          disabled={reporting}
                          onClick={() => {
                            setReportingId(null);
                            setReportMessage("");
                            setReportError("");
                          }}
                        >
                          {t("Annuler")}
                        </button>
                      </div>
                    </div>
                  )}
                  {declareId === o.id && (

                    <div className="boost-declare">
                      <p className="boost-declare-title">{t("Déclarer un paiement hors ligne")}</p>
                      <input
                        type="text"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={t("Référence de transaction")}
                        maxLength={200}
                        className="boost-input"
                      />
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="boost-input"
                      >
                        {METHOD_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {t(m.label)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="boost-btn boost-btn-primary boost-btn-sm"
                        disabled={declaring || !reference.trim()}
                        onClick={() => declarePayment(o)}
                      >
                        {declaring ? t("Envoi…") : t("Envoyer")}
                      </button>
                      {declareError && <p className="error-msg">{declareError}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          {hasMore && (
            <button type="button" className="boost-page-btn" onClick={() => fetchOrders({ reset: false, silent: true })} disabled={loadingMore}>
              {loadingMore ? t("Chargement�") : t("Charger la suite")}
            </button>
          )}
          </div>
        )}

        {!user && (
          <div className="boost-card boost-card-pad boost-order-login">
            <p>
              {t(
                "Les commandes passées sans compte restent visibles sur cet appareil. Connectez-vous pour les retrouver partout."
              )}
            </p>
            <Link to="/login" className="boost-btn boost-btn-secondary">
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
    </BoostPage>
  );
}
