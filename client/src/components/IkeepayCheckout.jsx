import React, { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n.jsx";

// Tunnel de paiement inline iKeePay (doc officielle) :
//   — on charge l'URL de checkout dans une iframe ;
//   — iKeePay communique via window.postMessage :
//       "ikeepay-ready"  → tunnel prêt (on l'affiche)
//       "ikeepay-success"→ paiement validé côté iKeePay
//       "ikeepay-close"  → l'utilisateur a fermé le tunnel
//       { type:'ikeepay-error', message } → erreur affichée par iKeePay
//   — la confirmation finale est TOUJOURS faite côté serveur par le webhook
//     (le postMessage "success" sert à raffraîchir l'UI immédiatement).
//
// UX anti-lenteur : l'overlay s'ouvre IMMÉDIATEMENT avec un écran de chargement
// (au lieu d'attendre iKeePay invisiblement pendant plusieurs secondes — la
// page distante met souvent ~4-8 s à charger). On bascule sur le tunnel dès
// "ikeepay-ready", ou en secours dès que l'iframe a fini de charger. Si rien ne
// se passe au bout de 25 s, on propose un nouvel essai au lieu de bloquer.
export default function IkeepayCheckout({ checkoutUrl, onSuccess, onClose }) {
  const { t } = useLang();
  const mountedRef = useRef(true);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [retryKey, setRetryKey] = useState(0);

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
        if (mountedRef.current) setStatus("ready");
      } else if (e.data === "ikeepay-close") {
        if (typeof onClose === "function") onClose();
      } else if (e.data === "ikeepay-success") {
        if (typeof onSuccess === "function") onSuccess();
      } else if (e.data && e.data.type === "ikeepay-error") {
        if (mountedRef.current) setStatus("error");
        if (typeof onClose === "function") onClose(e.data.message || "Erreur iKeePay.");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("message", handleMessage);
    };
  }, [onSuccess, onClose]);

  // Secours : afficher le tunnel dès que l'iframe a chargé, même si le message
  // "ikeepay-ready" n'est pas arrivé (réseau/JS tiers capricieux).
  const handleIframeLoad = () => {
    if (mountedRef.current) {
      setStatus((s) => (s === "loading" ? "ready" : s));
    }
  };

  // Garde-fou : si toujours en chargement après 25 s, proposer un réessai.
  useEffect(() => {
    if (status !== "loading") return undefined;
    const id = setTimeout(() => {
      if (mountedRef.current) setStatus("error");
    }, 25000);
    return () => clearTimeout(id);
  }, [status]);

  const retry = () => {
    setStatus("loading");
    // Change la clé React → l'iframe est remontée et recharge le tunnel
    // (réaffecter src à la même URL ne suffit pas toujours).
    setRetryKey((k) => k + 1);
  };

  return (
    <div className="ikeepay-overlay" style={{ display: "flex" }} role="dialog" aria-label="iKeePay">
      <div className="ikeepay-modal">
        <button
          type="button"
          className="ikeepay-close"
          aria-label={t("Fermer")}
          onClick={() => typeof onClose === "function" && onClose()}
        >
          ✕
        </button>

        {status !== "ready" && (
          <div className="ikeepay-loading">
            {status === "loading" ? (
              <>
                <span className="ikeepay-spinner" aria-hidden="true" />
                <p>{t("Ouverture du tunnel de paiement…")}</p>
              </>
            ) : (
              <>
                <p className="error">{t("Le tunnel de paiement met trop de temps à répondre.")}</p>
                <button type="button" className="btn btn-primary btn-small" onClick={retry}>
                  {t("Réessayer")}
                </button>
              </>
            )}
          </div>
        )}

        <iframe
          key={retryKey}
          title="iKeePay"
          src={checkoutUrl}
          allowTransparency="true"
          className={`ikeepay-iframe ${status === "ready" ? "is-ready" : "is-loading"}`}
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}