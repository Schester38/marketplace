import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

/**
 * Gestion des ACCÈS aux vidéos protégées (produits digitaux `digital_kind =
 * "youtube"`) : le créateur propriétaire voit chaque acheteur avec l'état de son
 * accès — en attente de confirmation, actif, expiré ou révoqué — et peut
 * RÉVOQUER / RÉTABLIR l'accès ou le PROLONGER (en jours). Un compte sans vidéo
 * protégée ne rend rien (aucune requête inutile).
 */
const EXTEND_OPTIONS = [30, 90, 365];

export default function VideoAccessPanel() {
  const { t } = useLang();
  const [videos, setVideos] = useState([]);
  const [productId, setProductId] = useState(null);
  const [data, setData] = useState(null); // { product, sales }
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // 1. Mes vidéos protégées (liste vide ⇒ composant invisible).
  useEffect(() => {
    let alive = true;
    api
      .digitalMine()
      .then((d) => {
        if (!alive) return;
        const list = (d.items || []).filter((it) => it.digital_kind === "youtube");
        setVideos(list);
        if (list.length) setProductId((cur) => (cur === null ? list[0].id : cur));
      })
      .catch(() => {
        if (alive) setVideos([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 2. Liste des acheteurs de la vidéo sélectionnée.
  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      setData(await api.digitalProductAccesses(id));
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (productId) load(productId);
  }, [productId, load]);

  if (!videos.length) return null;

  const product = data?.product || videos.find((v) => v.id === productId) || {};
  const unlimited = !product.access_days;
  const sales = data?.sales || [];
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

  const act = async (sale, payload, okMsg) => {
    setBusyId(sale.id);
    setError("");
    setNotice("");
    try {
      const r = await api.digitalAccessSet(productId, sale.id, payload);
      setData((d) =>
        d
          ? {
              ...d,
              sales: d.sales.map((s) => (s.id === sale.id ? { ...s, ...r.sale } : s)),
            }
          : d
      );
      setNotice(okMsg);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };


  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h2>🔐 {t("Accès aux vidéos protégées")}</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        {t(
          "Chaque acheteur d'une vidéo protégée apparaît ici : vous pouvez couper son accès (révocation immédiate) ou le prolonger de quelques jours."
        )}
      </p>

      {videos.length > 1 && (
        <select
          className="input"
          value={productId || ""}
          onChange={(e) => setProductId(Number(e.target.value))}
        >
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              🎬 {v.name}
            </option>
          ))}
        </select>
      )}

      <p className="hint">
        {unlimited
          ? t("Durée d'accès : illimitée.")
          : t("Durée d'accès : {n} jours après confirmation du paiement.", {
              n: product.access_days,
            })}
      </p>

      {loading && <p className="hint">{t("Chargement…")}</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="success">{notice}</p>}

      {!loading && data && sales.length === 0 && (
        <p className="empty">{t("Aucun acheteur pour cette vidéo pour le moment.")}</p>
      )}

      {sales.length > 0 && (
        <div className="access-list">
          {sales.map((s) => (
            <div key={s.id} className={`access-row${s.revoked ? " access-revoked" : ""}`}>
              <div className="access-row-main">
                <strong>
                  {s.buyer_name || t("Acheteur")}
                  {s.buyer_id ? "" : ` · ${t("achat sans compte")}`}
                </strong>
                <span className="access-row-meta">
                  #{s.confirm_code} · {s.quantity} × {s.total_price}
                </span>
                <span className="access-row-meta">
                  {s.revoked
                    ? `🚫 ${t("Accès révoqué")}`
                    : !s.confirmed
                      ? `⏳ ${t("En attente de confirmation du paiement")}`
                      : s.expired
                        ? `⏱️ ${t("Accès expiré")}`
                        : `✅ ${t("Actif")}${
                            s.expires_at
                              ? ` — ${t("jusqu'au {date}", { date: fmtDate(s.expires_at) })}`
                              : ""
                          }`}
                  {s.access_days_extra > 0 ? ` · +${s.access_days_extra} ${t("jours")}` : ""}
                  {` · 👁 ${s.video_views}`}
                </span>
              </div>
              <div className="access-row-actions">
                {EXTEND_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="btn btn-small btn-outline"
                    disabled={busyId === s.id || unlimited}
                    title={
                      unlimited
                        ? t(
                            "Accès illimité : définissez d'abord une durée d'accès sur le produit."
                          )
                        : undefined
                    }
                    onClick={() =>
                      act(s, { extend_days: n }, t("Accès prolongé de {n} jours.", { n }))
                    }
                  >
                    +{n} {t("j")}
                  </button>
                ))}
                <button
                  type="button"
                  className={`btn btn-small${s.revoked ? "" : " btn-outline"}`}
                  disabled={busyId === s.id}
                  onClick={() =>
                    act(
                      s,
                      { revoked: !s.revoked },
                      s.revoked ? t("Accès rétabli.") : t("Accès révoqué.")
                    )
                  }
                >
                  {s.revoked ? `♻️ ${t("Rétablir")}` : `🚫 ${t("Révoquer")}`}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
