import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

/**
 * Checkout hébergé iKeePay ouvert en lightbox.
 * iKeePay ne notifie PAS notre serveur via webhook pour ce parcours : le
 * succès arrive uniquement par postMessage (« ikeepay-success ») dans le
 * navigateur. Ce composant :
 *  - affiche le checkout iKeePay dans un iframe (contourne les bloqueurs de popups),
 *  - écoute la confirmation client (postMessage) et un bouton « J'ai payé »,
 *  - remonte la confirmation au serveur (POST /api/payments/ikeepay/confirm)
 *    pour marquer le paiement « completed » et déclencher les reversements.
 */
export default function IkeepayCheckout({
  link,
  externalReference,
  onClose,
  onConfirmed,
  label,
}) {
  const { t } = useLang();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const iframeRef = useRef(null);
  const refCalled = useRef(null);
  // Sur mobile, l'iframe iKeePay rend souvent une page vide : on bascule sur
  // l'ouverture en nouvel onglet + confirmation manuelle.
  const isMobile =
    typeof window !== "undefined" &&
    (typeof window.innerWidth === "number" ? window.innerWidth < 820 : false) ||
    window?.matchMedia?.("(pointer: coarse)")?.matches === true;

  const confirmPayment = async (via) => {
    if (!externalReference || refCalled.current) return;
    refCalled.current = via || "postmessage";
    setConfirming(true);
    setError("");
    try {
      const result = await api.ikeepayConfirm({ external_reference: externalReference });
      setDone(true);
      if (onConfirmed) onConfirmed(result);
    } catch (err) {
      setError(err.message || String(err));
      setConfirming(false);
      refCalled.current = null;
    }
  };

  useEffect(() => {
    if (done) return;
    const handler = (event) => {
      // iKeePay post `ikeepay-success` / `ikeepay-close` / `ikeepay-ready`
      const data = event.data;
      if (data === "ikeepay-success") confirmPayment("postmessage");
      else if (data === "ikeepay-close") { if (onClose) onClose(); }
      else if (data === "ikeepay-ready") { /* checkout chargé */ }
      else if (
        data &&
        typeof data === "object" &&
        data.type === "ikeepay-success"
      ) {
        confirmPayment("postmessage");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, externalReference, link]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-checkout"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h3>{label || t("Paiement sécurisé")}</h3>
          <button className="drawer-close" onClick={onClose} aria-label={t("Fermer")}>
            ✕
          </button>
        </div>

        {done ? (
          <div className="deliver-recap" style={{ textAlign: "center", padding: 30 }}>
            <div style={{ fontSize: 42 }}>✅</div>
            <p>
              <strong>{t("Paiement confirmé !")}</strong>
            </p>
            <p className="hint">{t("La confirmation a été enregistrée.")}</p>
            <button className="btn btn-primary" onClick={onClose}>
              {t("Fermer")}
            </button>
          </div>
        ) : isMobile ? (
          // Mobile : l'iframe iKeePay est souvent vide. On ouvre le checkout en
          // plein écran (nouvel onglet, geste utilisateur => non bloqué) puis le
          // client revient ici confirmer manuellement.
          <div style={{ textAlign: "center", padding: 6 }}>
            <p className="hint">
              {t(
                "La page de paiement s’ouvre dans un nouvel onglet. Après le règlement, revenez ici et confirmez."
              )}
            </p>
            <a className="btn btn-primary btn-block" href={link} target="_blank" rel="noreferrer">
              {t("Ouvrir la page de paiement")} ↗
            </a>
            {confirming && <p className="hint">{t("Confirmation en cours…")}</p>}
            {error && <p className="error">{error}</p>}
            <div className="row2" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary btn-block"
                disabled={confirming}
                onClick={() => confirmPayment("manual")}
              >
                ✓ {t("J’ai payé, confirmer")}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={onClose}
            >
              {t("Annuler")}
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                position: "relative",
                height: "70vh",
                minHeight: 420,
                overflow: "hidden",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <iframe
                ref={iframeRef}
                src={link}
                title={label || t("Paiement sécurisé")}
                allow="payment *"
                allowTransparency
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  borderRadius: 10,
                  background: "#fff",
                }}
              />
            </div>
            {confirming && <p className="hint">{t("Confirmation en cours…")}</p>}
            {error && <p className="error">{error}</p>}
            <div className="row2" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary btn-block"
                disabled={confirming}
                onClick={() => confirmPayment("manual")}
              >
                ✓ {t("J’ai payé, confirmer")}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-block"
              style={{ marginTop: 8 }}
              onClick={onClose}
            >
              {t("Annuler")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}