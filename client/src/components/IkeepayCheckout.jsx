import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

const IKEEPAY_ORIGIN = "https://ikeepay.com";

/**
 * Checkout iKeePay en lightbox (iframe) intégré à la plateforme.
 * La confirmation ne peut venir QUE du bouton « Confirmer » d'iKeePay :
 * iKeePay post `ikeepay-success` quand le paiement est confirmé sur SA page.
 * On vérifie event.origin === https://ikeepay.com => pas de fausse confirmation.
 * À la confirmation on remonte au serveur (confirm) pour « completed » +
 * reversements, puis on appelle onConfirmed() (ex. redirection vers l'espace).
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

  const confirmPayment = async () => {
    if (!externalReference || refCalled.current) return;
    refCalled.current = true;
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
      if (event.origin !== IKEEPAY_ORIGIN) return;
      const data = event.data;
      if (data === "ikeepay-success") confirmPayment();
      else if (data === "ikeepay-ready") {
        /* checkout chargé */
      } else if (data === "ikeepay-close") {
        if (onClose) onClose();
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
        style={{ maxWidth: 540 }}
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
            <p className="hint">{t("La confirmation a été enregistrée. Redirection…")}</p>
          </div>
        ) : (
          <>
            <div
              style={{
                position: "relative",
                height: "72vh",
                minHeight: 440,
                overflow: "hidden",
                borderRadius: 10,
                background: "#fff",
                border: "1px solid var(--border)",
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
            {confirming && (
              <p className="hint" style={{ textAlign: "center" }}>
                {t("Confirmation en cours…")}
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <button
              type="button"
              className="btn btn-outline btn-block"
              style={{ marginTop: 12 }}
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