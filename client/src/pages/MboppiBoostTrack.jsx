import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { BASE_URL } from "../config.js";

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

  useEffect(() => {
    const urlToken = searchParams.get("token") || "";
    if (idParam) {
      setOrderId(idParam);
      setToken(urlToken);
      if (urlToken) fetchOrder(idParam, urlToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam, searchParams]);

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
          {t("Entrez le numéro de commande et le jeton de suivi pour consulter son état.")}
        </p>

        <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <input className="boost-input" placeholder={t("Numéro de commande")} value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          <input className="boost-input" placeholder={t("Jeton de suivi (token)")} value={token} onChange={(e) => setToken(e.target.value)} />
          <button type="submit" className="boost-btn boost-btn-primary" disabled={loading || !orderId.trim()}>
            {loading ? t("Chargement…") : t("Suivre")}
          </button>
        </form>

        {error && <p className="error-msg" style={{ marginTop: 12 }}>{error}</p>}

        {order && (
          <div style={{ marginTop: 16 }}>
            <div className="boost-order-meta"><span>{t("Commande")}</span><strong>#{order.id}</strong></div>
            <div className="boost-order-meta"><span>{t("Service")}</span><strong>{order.service_name}</strong></div>
            <div className="boost-order-meta"><span>{t("Statut")}</span><strong>{t(STATUS_LABELS[order.status] || order.status)}</strong></div>
            <div className="boost-order-meta"><span>{t("Quantité")}</span><strong>{order.quantity ?? "—"}</strong></div>
            <div className="boost-order-meta"><span>{t("Total")}</span><strong>{order.total} {order.currency}</strong></div>
            {order.created_at && (
              <div className="boost-order-meta"><span>{t("Créée le")}</span><strong>{new Date(order.created_at).toLocaleString("fr-FR")}</strong></div>
            )}

            {data?.final_outcome && (
              <p style={{ marginTop: 10 }}>
                <strong>{t("Résultat final")} :</strong>{" "}
                {t(STATUS_LABELS[data.final_outcome.status] || data.final_outcome.status)}
                {data.final_outcome.remains != null && (<> · {t("Restant")} : {data.final_outcome.remains}</>)}
                {data.final_outcome.charge != null && (<> · {t("Charge")} : {data.final_outcome.charge}</>)}
              </p>
            )}

            {shareUrl && (
              <div style={{ marginTop: 12 }}>
                <p className="hint" style={{ overflowWrap: "anywhere" }}>{shareUrl}</p>
                <button type="button" className="boost-btn boost-btn-secondary boost-btn-sm" onClick={copyLink}>
                  {copied ? t("Copié !") : t("Copier le lien de suivi")}
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
                    {(ev.old_status || ev.new_status) && (<div className="hint">{ev.old_status || "—"} ? {ev.new_status || "—"}</div>)}
                    {ev.message && <div className="hint" style={{ overflowWrap: "anywhere" }}>{ev.message}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p style={{ marginTop: 16 }}>
          <Link to="/mboppi-boost" className="boost-btn boost-btn-secondary boost-btn-sm">
            {t("Retour à MboppiBoost")}
          </Link>
        </p>
      </div>
    </BoostPage>
  );
}
