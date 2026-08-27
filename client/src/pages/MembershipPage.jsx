import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";
import IkeepayCheckout from "../components/IkeepayCheckout.jsx";

import { OPERATORS_BY_COUNTRY, DEFAULT_OPERATORS } from "../config.js";

export default function MembershipPage() {
  const { user, login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [operator, setOperator] = useState("ORANGE");
  const [phone, setPhone] = useState(user?.phone || "");
  const [paymentLink, setPaymentLink] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api.membershipPayin({ operator, phone, country: user.country });
      setPaymentLink(result.payment_link || "");
      setPaymentRef(result.external_reference || "");
      if (result.active) {
        const refreshed = await api.me();
        login(refreshed.user, localStorage.getItem("token"));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmed = async () => {
    setPaymentLink("");
    let fresh = null;
    try {
      const r = await api.me();
      login(r.user, localStorage.getItem("token"));
      fresh = r.user;
    } catch {
      fresh = user;
    }
    // Aiguiller vers l'espace du rôle (pas de route /dashboard dans le router).
    const role = fresh?.role || user?.role || "client";
    const target =
      role === "shop"
        ? "/shop"
        : role === "seller"
          ? "/seller"
          : role === "creator"
            ? "/creator"
            : role === "livreur"
              ? "/livreur"
              : "/client";
    navigate(target);
  };

  return (
    <main className="container narrow">
      <Seo
        title={t("Adhésion Mboppi") + " — Mboppi"}
        description={t("Activez votre espace professionnel Mboppi.")}
        noindex
      />
      <div className="card form-card">
        <div className="auth-brand">💳</div>
        <h1>{t("Activez votre espace")}</h1>
        <p className="hint">
          {t(
            "Votre adhésion de 30 jours est nécessaire pour accéder à votre tableau de bord professionnel."
          )}
        </p>
        <div className="card fee-card" style={{ borderColor: "var(--border)" }}>
          <strong>
            {t(
              user?.role === "shop"
                ? "Adhésion boutique : 2 500"
                : user?.role === "creator"
                  ? "Adhésion créateur : 2 500"
                  : "Adhésion vendeur : 1 500"
            )}{" "}
            XAF
          </strong>
          <p className="hint">
            {t(
              "Le numéro utilisé ici sert au paiement de l’adhésion et à la réception de vos paiements."
            )}
          </p>
        </div>
        <form onSubmit={submit}>
          <label>{t("Opérateur de paiement")}</label>
          <select
            className="input"
            value={operator}
            onChange={(event) => setOperator(event.target.value)}
          >
            {(OPERATORS_BY_COUNTRY[user?.country] || DEFAULT_OPERATORS).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <label>{t("Numéro de paiement")}</label>
          <input
            className="input"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "…" : t("Payer mon adhésion avec Ikeepay")}
          </button>
        </form>
        {paymentLink && (
          <IkeepayCheckout
            link={paymentLink}
            externalReference={paymentRef}
            label={t("Paiement de l'adhésion")}
            onConfirmed={handleConfirmed}
            onClose={() => setPaymentLink("")}
          />
        )}
        <p className="hint">
          {t(
            "Après confirmation du paiement, votre accès sera activé automatiquement pour 30 jours."
          )}
        </p>
        <Link to="/contact" className="btn btn-outline btn-block">
          {t("Contacter le support")}
        </Link>
      </div>
    </main>
  );
}
