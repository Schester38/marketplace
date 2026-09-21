import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

/**
 * Lecture d'une vidéo PROTÉGÉE (produit digital de type « youtube »).
 *
 * La vidéo est hébergée sur YouTube (non répertoriée) : son lecteur ne
 * s'affiche QUE si le serveur valide le droit d'accès — acheteur connecté
 * (sales.buyer_id), code de confirmation pour un achat sans compte, ou
 * propriétaire du produit — et si l'accès n'est ni révoqué ni expiré.
 * L'ID de la vidéo ne quitte jamais le serveur avant cette validation
 * (GET /api/digital/:saleId/video) ; il n'existe aucune URL publique.
 *
 * Props : sale (ligne de vente avec digital_kind), code (code de confirmation
 * d'un achat invité), compact (variante réduite).
 */
export default function ProtectedVideo({ sale, code, compact = false }) {
  const { t } = useLang();
  const [state, setState] = useState(null); // état d'accès serveur
  const [embed, setEmbed] = useState(null); // URL d'iframe déverrouillée
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const loadState = useCallback(async () => {
    try {
      const d = await api.digitalStatus(sale.id, code);
      setState(d.digital || null);
    } catch (e) {
      setErr(e.message);
    }
  }, [sale.id, code]);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const watch = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const d = await api.digitalVideo(sale.id, code);
      setEmbed(d.embed_src);
      if (d.expires_at) {
        setMsg(
          t("Accès valable jusqu'au {date}.", {
            date: new Date(d.expires_at).toLocaleString(),
          })
        );
      }
    } catch (e) {
      setErr(e.message);
      loadState();
    } finally {
      setBusy(false);
    }
  };

  if (!sale || sale.digital_kind !== "youtube") return null;

  const st = state;
  return (
    <div className="protected-video" style={{ marginTop: 8 }}>
      {embed ? (
        <div className="protected-video-frame">
          <iframe
            src={embed}
            title={sale.product_name || t("Vidéo protégée")}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <button
          type="button"
          className={`btn btn-primary${compact ? " btn-small" : ""}`}
          onClick={watch}
          disabled={busy || (st ? !st.ready && st.protected_video : false)}
        >
          {busy
            ? `⏳ ${t("Vérification de l'accès…")}`
            : `▶ ${t("Regarder la vidéo")}`}
        </button>
      )}
      {st && st.protected_video && (
        <>
          {st.waiting_confirmation && (
            <p className="hint" style={{ margin: "6px 0 0" }}>
              ⏳ {t("La vidéo sera accessible dès que le paiement est confirmé.")}
            </p>
          )}
          {st.revoked && (
            <p className="error" style={{ margin: "6px 0 0" }}>
              🚫 {t("L'accès à cette vidéo a été révoqué. Contactez le créateur.")}
            </p>
          )}
          {!st.revoked && st.expired && (
            <p className="error" style={{ margin: "6px 0 0" }}>
              ⏱️ {t("La durée d'accès à cette vidéo est écoulée. Contactez le créateur pour la prolonger.")}
            </p>
          )}
          {!st.waiting_confirmation && !st.expired && st.expires_at && !msg && (
            <p className="hint" style={{ margin: "6px 0 0" }}>
              ⏱️ {t("Accès valable jusqu'au {date}.", { date: new Date(st.expires_at).toLocaleString() })}
            </p>
          )}
        </>
      )}
      {sale.digital_name && (
        <p className="hint" style={{ margin: "6px 0 0" }}>
          🎬 {sale.digital_name}
        </p>
      )}
      {msg && (
        <p className="hint" style={{ margin: "4px 0 0" }}>
          {msg}
        </p>
      )}
      {err && (
        <p className="error" style={{ margin: "4px 0 0" }}>
          {err}
        </p>
      )}
    </div>
  );
}
