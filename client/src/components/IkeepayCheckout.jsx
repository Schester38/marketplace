import React, { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n.jsx";

// Tunnel de paiement inline iKeePay (doc officielle) :
//   — on charge l'URL de checkout dans une iframe ;
//   — iKeePay communique via window.postMessage :
//       "ikeepay-ready"  → on affiche l'overlay (pas de flash blanc)
//       "ikeepay-success"→ paiement validé côté iKeePay
//       "ikeepay-close"  → l'utilisateur a fermé le tunnel
//       { type:'ikeepay-error', message } → erreur affichée par iKeePay
//   — la confirmation finale est TOUJOURS faite côté serveur par le webhook
//     (le postMessage "success" sert à raffraîchir l'UI immédiatement).
export default function IkeepayCheckout({ checkoutUrl, onSuccess, onClose }) {
  const { t } = useLang();
  const mountedRef = useRef(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const handleMessage = (e) => {
      // On n'accepte que les messages provenant du tunnel iKeePay.
      try {
        if (!e.origin || !/ikeepay\.com$/i.test(new URL(e.origin).host)) return;
      } catch {
        return;
      }
      if (e.data === "ikeepay-ready") {
        if (!mountedRef.current) return;
        setVisible(true);
      } else if (e.data === "ikeepay-close") {
        if (typeof onClose === "function") onClose();
      } else if (e.data === "ikeepay-success") {
        if (typeof onSuccess === "function") onSuccess();
      } else if (e.data && e.data.type === "ikeepay-error") {
        if (typeof onClose === "function") onClose(e.data.message || "Erreur iKeePay.");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("message", handleMessage);
    };
  }, [onSuccess, onClose]);

  return (
    <div
      className="ikeepay-overlay"
      style={{ display: visible ? "flex" : "none" }}
      role="dialog"
      aria-label="iKeePay"
    >
      <div className="ikeepay-modal">
        <button
          type="button"
          className="ikeepay-close"
          aria-label={t("Fermer")}
          onClick={() => typeof onClose === "function" && onClose()}
        >
          ✕
        </button>
        <iframe
          title="iKeePay"
          src={checkoutUrl}
          allowTransparency="true"
          className="ikeepay-iframe"
        />
      </div>
    </div>
  );
}