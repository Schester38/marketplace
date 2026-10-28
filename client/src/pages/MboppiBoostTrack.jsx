import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { BASE_URL } from "../config.js";

const STATUS_LABELS = {
  draft: "Brouillon",
  pending_payment: "Paiement en attente",
  paid: "Pay�",
  submitted: "Transmise au prestataire",
  processing: "En cours de traitement",
  completed: "Termin�e",
  failed: "�chou�e",
  cancelled: "Annul�e",
  refund_pending: "Remboursement en attente",
  refunded: "Rembours�e",
};

function BoostPage({ children }) {
  return (
    <main className="boost-page">
      <div className="boost-shell">{children}</div>
    </main>
  );
}

export default function MboppiBoostTrack() {
  const { t } = useLang();
  const { id: idParam } = useParams();
  const [searchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(idParam || "");
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchOrder = async (id, tok) => {
    if (!id) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const resp = await api.smmOrder(id, (tok || "").trim() || undefined);
      setData(resp);
    } catch (err) {
      setData(null);
      setError(err?.message || "Commande introuvable");
    } finally {
      setLoading(false);
    }
  };
  const fetchOrderSilent = async (id, tok) => {
    if (!id) return;
    try {
      const resp = await api.smmOrder(id, (tok || "").trim() || undefined);
      setData(resp);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    const urlToken = searchParams.get("token") || "";
    if (idParam) {
      setOrderId(idParam);
      setToken(urlToken);
      if (urlToken) fetchOrder(idParam, urlToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam, searchParams]);
  useEffect(() => {
    if (!order || !trackingToken) return;
    const terminal = new Set(["completed", "failed", "cancelled", "refunded", "refund_pending"]);
    if (terminal.has(order.status)) return;
    const iv = setInterval(() => fetchOrderSilent(order.id, trackingToken), 8000);
    return () => clearInterval(iv);
  }, [order?.id, order?.status, trackingToken]);

  const submit = async (e) => {
    e?.preventDefault?.();
    await fetchOrder(orderId.trim(), token.trim());
  };

  const order = data?.order;
  const trackingToken = (token || order?.tracking_token || "").trim();
  const shareUrl =
    order && trackingToken
      ? `${BASE_URL}/mboppi-boost/suivi/${order.id}?token=${encodeURIComponent(trackingToken)}`
      : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <BoostPage>
      <Seo title="Suivi MboppiBoost" />
      <div className="boost-card boost-card-pad">
        <h1 className="boost-section-title">{t("Suivi d'une commande MboppiBoost")}</h1>
        <p className="boost-section-lead">
          {t("Entrez le num�ro de commande et le jeton de suivi pour consulter son �tat.")}
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <input className="boost-input" placeholder={t("Num�ro de commande")} value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          <input className="boost-input" placeholder={t("Jeton de suivi (token)")} value={token} onChange={(e) => setToken(e.target.value)} />
          <button type="submit" className="boost-btn boost-btn-primary" disabled={loading || !orderId.trim()}>
            {loading ? t("Chargement�") : t("Suivre")}
          </button>
        </form>

        {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

        {order && (
          <div style={{ marginTop: 16 }}>
            <div className="boost-order-meta"><span>{t("Commande")}</span><strong>#{order.id}</strong></div>
            <div className="boost-order-meta"><span>{t("Service")}</span><strong>{order.service_name}</strong></div>
            <div className="boost-order-meta"><span>{t("Statut")}</span><strong>{t(STATUS_LABELS[order.status] || order.status)}</strong></div>
            <div className="boost-order-meta"><span>{t("Quantit�")}</span><strong>{order.quantity ?? "�"}</strong></div>
            <div className="boost-order-meta"><span>{t("Total")}</span><strong>{order.total} {order.currency}</strong></div>
            {order.created_at && (
              <div className="boost-order-meta"><span>{t("Cr��e le")}</span><strong>{new Date(order.created_at).toLocaleString("fr-FR")}</strong></div>
            )}
            {(() => {
              const total = Number(order.quantity) || 0;
              const remains = data?.final_outcome?.remains ?? data?.remains;
              if (total <= 0 || remains == null) return null;
              const delivered = Math.max(0, total - Number(remains));
              const pct = Math.min(100, Math.round((delivered / total) * 100));
              return (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>Progression</span>
                    <strong>{delivered} / {total}</strong>
                  </div>
                  <div style={{ height: 8, background: "var(--border,#eee)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: "var(--primary,#0ea5e9)", transition: "width .4s" }} />
                  </div>
                  <div className="hint" style={{ marginTop: 4 }}>{pct}% livre</div>
                </div>
              );
            })()}

            {data?.final_outcome && (
              <p style={{ marginTop: 10 }}>
                <strong>{t("R�sultat final")} :</strong>{" "}
                {t(STATUS_LABELS[data.final_outcome.status] || data.final_outcome.status)}
                {data.final_outcome.remains != null && (<> � {t("Restant")} : {data.final_outcome.remains}</>)}
                {data.final_outcome.charge != null && (<> � {t("Charge")} : {data.final_outcome.charge}</>)}
              </p>
            )}

            {shareUrl && (
              <div style={{ marginTop: 12 }}>
                <p className="hint" style={{ overflowWrap: "anywhere" }}>{shareUrl}</p>
                <button type="button" className="boost-btn boost-btn-secondary boost-btn-sm" onClick={copyLink}>
                  {copied ? t("Copi� !") : t("Copier le lien de suivi")}
                </button>
              </div>
            )}

            {(data?.events || []).length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
                {data.events.map((ev, idx) => (
                  <li key={idx} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong>{ev.event_type}</strong>
                      <span className="hint">{new Date(ev.created_at).toLocaleString("fr-FR")}</span>
                    </div>
                    {(ev.old_status || ev.new_status) && (<div className="hint">{ev.old_status || "�"} ? {ev.new_status || "�"}</div>)}
                    {ev.message && <div className="hint" style={{ overflowWrap: "anywhere" }}>{ev.message}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p style={{ marginTop: 16 }}>
          <Link to="/mboppi-boost" className="boost-btn boost-btn-secondary boost-btn-sm">
            {t("Retour � MboppiBoost")}
          </Link>
        </p>
      </div>
    </BoostPage>
  );
}
