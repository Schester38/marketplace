import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import IkeepayCheckout from "../components/IkeepayCheckout.jsx";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import { countrySymbol, getCountry } from "../config.js";
import { api } from "../api.js";

export default function MembershipPage() {
  const { user } = useAuth();
  const { t } = useLang();
  const [settings, setSettings] = useState({ mode: "manual", ikeepay_configured: false });
  const [checkout, setCheckout] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api
      .paymentSettings()
      .then((d) => setSettings(d || { mode: "manual", ikeepay_configured: false }))
      .catch(() => {});
  }, []);

  const isManual = settings.mode !== "auto";
  const isAutoReady = settings.mode === "auto" && settings.ikeepay_configured;

  // Confirmation automatique : tant que l'adhÃ©sion n'est pas active, la page
  // sonde le serveur toutes les 4 s (max 6 min). Le serveur y vÃ©rifie l'Ã©tat
  // ET rÃ©pare au besoin (webhook restÃ© non rattachÃ©) â†’ dÃ¨s que `active`
  // repasse Ã  true, la session est rechargÃ©e et l'utilisateur est redirigÃ©
  // vers son espace par App.jsx. Aucune intervention admin nÃ©cessaire.
  useEffect(() => {
    if (!isAutoReady) return undefined;
    let stopped = false;
    const startedAt = Date.now();
    const tick = async () => {
      if (stopped) return;
      try {
        const d = await api.membershipStatus();
        if (d && d.debug) {
          // Diagnostic visible dans la console navigateur (F12).
          console.log(
            "[adhésion] statut :",
            d.debug.reason,
            "| adhésion en attente :",
            d.debug.pending_membership,
            "| webhooks reçus (24 h) :",
            d.debug.webhooks_24h
          );
        }
        if (d && d.active) {
          stopped = true;
          clearInterval(id);
          try {
            const me = await api.me();
            if (me?.user) localStorage.setItem("user", JSON.stringify(me.user));
          } catch {
            /* la session se synchronisera au rechargement */
          }
          window.location.reload();
          return;
        }
      } catch {
        /* rÃ©seau indisponible : on retentera */
      }
      if (Date.now() - startedAt > 6 * 60 * 1000) {
        stopped = true;
        clearInterval(id);
        setConfirming(false);
      }
    };
    const id = setInterval(tick, 4000);
    setConfirming(true);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [isAutoReady]);

  const payOnline = async () => {
    setError("");
    setBusy(true);
    try {
      const d = await api.membershipPayin();
      setCheckout(d.checkout_url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSuccess = async () => {
    // Adhésion payée → session à jour puis retour automatique vers l'espace.
    try {
      const d = await api.me();
      if (d?.user) {
        localStorage.setItem("user", JSON.stringify(d.user));
      }
    } catch {
      /* la session se synchronisera au prochain cycle */
    }
    window.location.reload();
  };

  const isCameroon = user?.country === "Cameroun";
  const country = getCountry(user?.country || "Cameroun");
  const symbol = country?.symbol || "XAF";

  const prices = {
    seller: 1500,
    shop: 2500,
    creator: 2500,
  };

  const userPrice = prices[user?.role] || 2500;

  return (
    <main className="container narrow">
      <Seo
        title={t("Adhésion Mboppi") + " — Mboppi"}
        description={t("Payez votre adhésion Mboppi et accédez à votre espace professionnel.")}
        noindex
      />
      <div className="card form-card">
        <div className="auth-brand">💳</div>
        <h1>{t("Adhésion Mboppi")}</h1>
        <p className="hint">
          {t(
            "Après votre inscription, l'accès à votre tableau de bord professionnel est accordé dès paiement de votre adhésion. Suivez les instructions ci-dessous pour effectuer votre paiement."
          )}
        </p>

        {/* Votre tarif */}
        <div
          className="card"
          style={{
            borderColor: "var(--primary)",
            backgroundColor: "rgba(var(--primary-rgb), 0.05)",
            padding: 20,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.5 }}>
            {t("Votre adhésion :")} {" "}
            <span
              style={{
                color: "var(--primary)",
                fontSize: 30,
                fontWeight: 800,
                display: "inline-block",
              }}
            >
              {userPrice.toLocaleString()} {symbol}
            </span>
          </div>
          <p
            className="hint"
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {t("pour 30 jours d'accès à votre espace professionnel")}
          </p>
        </div>

        {/* Paiement en ligne — mode automatique iKeePay */}
        {!isManual && (
          <div
            className="card"
            style={{
              borderColor: "var(--primary)",
              backgroundColor: "rgba(var(--primary-rgb), 0.05)",
              padding: 20,
              marginBottom: 24,
              textAlign: "center",
            }}
          >
            {isAutoReady ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                  💳 {t("Paiement en ligne sécurisé")}
                </div>
                <p className="hint" style={{ textAlign: "center", marginBottom: 16 }}>
                  {t(
                    "Cliquez sur le bouton ci-dessous pour payer votre adhésion en ligne. Votre espace sera activé immédiatement après confirmation du paiement."
                  )}
                </p>
                {error && <p className="error">{error}</p>}
                {confirming && (
                  <p
                    className="hint"
                    style={{ textAlign: "center", marginBottom: 10, fontWeight: 600 }}
                  >
                    âŒ› {t("Confirmation du paiement en coursâ€¦ Votre espace sera activÃ© automatiquement.")}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  disabled={busy}
                  onClick={payOnline}
                >
                  {busy ? "…" : "💳 " + t("Payer avec iKeePay")}
                </button>
              </>
            ) : (
              <p className="hint" style={{ textAlign: "center", marginBottom: 0 }}>
                {t("Le paiement en ligne sera bientôt disponible. Veuillez réessayer plus tard.")}
              </p>
            )}
          </div>
        )}

        {/* Mode manuel : instructions de paiement direct */}
        {isManual && (
          <>
        {/* Instructions Cameroun */}
        <h3 style={{ marginTop: 24, marginBottom: 12 }}>🇨🇲 {t("CAMEROUN")}</h3>
        <p className="hint">
          {t("Faites le dépôt sur l'un des numéros suivants :")}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              borderRadius: 8,
              border: "2px solid var(--border)",
              padding: 16,
              textAlign: "center",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              🟠 Orange Money
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)" }}>
              699486146
            </div>
          </div>
          <div
            style={{
              borderRadius: 8,
              border: "2px solid var(--border)",
              padding: 16,
              textAlign: "center",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              🟡 MTN Mobile Money
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)" }}>
              672886348
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 24,
            fontSize: 14,
          }}
        >
          <strong>{t("Nom du compte :")}</strong> Ndjoum Jean Arthur
        </div>

        {/* Instructions Autre pays */}
        <h3 style={{ marginTop: 24, marginBottom: 12 }}>🌍 {t("AUTRE PAYS")}</h3>
        <p className="hint">
          {t(
            "Téléchargez l'application MoneyFusion pour effectuer votre transfert international."
          )}
        </p>

        <a
          href="https://play.google.com/store/apps/details?id=com.moneyfusion"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-block"
          style={{ marginBottom: 24 }}
        >
          📱 MoneyFusion — {t("Télécharger")}
        </a>

        <div
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <strong style={{ display: "block", marginBottom: 8 }}>
            {t("Étapes du transfert :")}
          </strong>
          <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
            <li>{t("Téléchargez et configurez MoneyFusion")}</li>
            <li>
              {t("Sélectionnez le pays")} <strong>Cameroun</strong>
            </li>
            <li>
              {t("Effectuez un transfert MoneyFusion vers MoneyFusion au numéro")}{" "}
              <strong>672886348</strong>
            </li>
            <li>{t("Faites une capture de la transaction")}</li>
          </ol>
        </div>

        {/* Instructions générales de paiement */}
        <h3 style={{ marginTop: 24, marginBottom: 12 }}>✅ {t("APRÈS VOTRE TRANSFERT")}</h3>
        <div
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
            <li>
              {t("Cliquez sur")} <strong>{t("Contacter le support")}</strong>{" "}
              {t("ci-dessous")}
            </li>
            <li>
              {t("Envoyez :")}
              <ul style={{ marginTop: 8 }}>
                <li>{t("Votre preuve de paiement (capture d'écran)")}</li>
                <li>
                  {t("Votre N° de référence depuis")} <strong>{t("Mon Compte")}</strong>
                </li>
              </ul>
            </li>
            <li>{t("Votre tableau de bord sera activé dans les minutes qui suivent")}</li>
          </ol>
        </div>

        {/* Info pour vendeurs sur les moyens de paiement */}
        {user?.role === "seller" && (
          <div
            style={{
              backgroundColor: "rgba(255, 193, 7, 0.1)",
              border: "2px solid #FFC107",
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <strong style={{ display: "block", marginBottom: 8 }}>
              💳 {t("Vendeur : Configuration des moyens de paiement")}
            </strong>
            <p className="hint" style={{ marginBottom: 0 }}>
              {t(
                "Configurez vos moyens de paiement par lesquels vous recevrez vos commissions (1 000 F) de parrainage vendeur. Accédez à vos paramètres de compte pour les ajouter."
              )}
            </p>
          </div>
        )}

          </>
        )}

        {/* Liens d'action */}
        <div className="row2" style={{ gap: 12 }}>
          <Link to="/compte" className="btn btn-outline btn-block">
            👤 {t("Mon Compte")} ({t("N° de référence")})
          </Link>
          <a
            href="https://wa.me/237672886348"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-block"
          >
            💬 {t("Contacter le support")}
          </a>
        </div>
      </div>
      {checkout && (
        <IkeepayCheckout
          checkoutUrl={checkout}
          onSuccess={handleSuccess}
          onClose={() => setCheckout(null)}
        />
      )}
    </main>
  );
}
