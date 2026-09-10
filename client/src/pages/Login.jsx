import { storage, sessionStore } from "../storage";
import React, { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth, postLoginPath } from "../App.jsx";
import { GoogleIcon } from "../components/icons.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";
import { useLang } from "../i18n.jsx";

export default function Login() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState("");
  const [resending, setResending] = useState(false);

  // Plusieurs espaces (ex. boutique + livreur) sur le même email : attend le
  // choix de l'espace à ouvrir.
  const [accountChoice, setAccountChoice] = useState([]);

  const ROLE_LABEL = (role) =>
    role === "shop"
      ? "🏪 Boutique"
      : role === "livreur"
        ? "🛵 Livreur"
        : role === "seller"
          ? "🛒 Vendeur"
          : role === "creator"
            ? "🎨 Créateur"
            : "👤 Client";


  const pickSpace = async (role) => {
    setError("");
    setUnverified("");
    try {
      const data = await api.login({ ...form, role });
      setAccountChoice([]);
      login(data.user, data.token);
      storage.setItem("mboppi_welcome", "login");
      navigate(postLoginPath(data.user));
    } catch (err) {
      if (err.code === "EMAIL_NOT_VERIFIED") {
        setUnverified(err.email || form.email);
        return;
      }
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setUnverified("");
    try {
      const data = await api.login(form);
      // Même email sur plusieurs rôles (boutique + livreur) : l'API demande
      // de choisir l'espace à ouvrir avant de délivrer le jeton.
      if (data && data.needs_account_choice) {
        setAccountChoice(Array.isArray(data.roles) ? data.roles : []);
        return;
      }
      setAccountChoice([]);
      console.log("[login] api.login role=", data.user?.role, "email=", data.user?.email);
      login(data.user, data.token);
      storage.setItem("mboppi_welcome", "login");
      const force = new URLSearchParams(location.search).get("force");
      const from = location.state?.from;
      if (force === "livreur" && data.user?.role !== "livreur") {
        navigate("/livreur-inscription", { replace: true });
        return;
      }
      navigate(typeof from === "string" && from ? from : postLoginPath(data.user));
    } catch (err) {
      if (err.code === "EMAIL_NOT_VERIFIED") {
        setUnverified(err.email || form.email);
        return;
      }
      setError(err.message);
    }
  };

  const resend = async () => {
    setResending(true);
    setError("");
    try {
      await api.resendVerification(unverified);
      setError("");
      setUnverified("");
      alert(t("Un nouveau lien de confirmation vient d'être envoyé. Vérifiez votre boîte mail."));
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="container narrow">
      <Seo title={t("Connexion") + " — Mboppi"} description={t("Connexion à Mboppi")} noindex />
      <div className="card form-card">
        <div className="auth-brand">
          <Logo className="logo-inline" />
        </div>
        <h2>{t("Connexion")}</h2>

        {unverified && (
          <div
            className="card"
            style={{ background: "#fffbeb", borderColor: "#fde68a", marginBottom: 16 }}
          >
            <p className="hint" style={{ margin: 0 }}>
              ⚠️{" "}
              {t(
                "Votre adresse email n'est pas encore confirmée. Cliquez sur le lien reçu par email pour activer votre compte."
              )}
            </p>
            <button
              className="link-button"
              onClick={resend}
              disabled={resending}
              style={{ marginTop: 8 }}
            >
              {resending ? t("Envoi…") : t("Renvoyer le lien de confirmation")}
            </button>
          </div>
        )}

        <form onSubmit={submit}>
          <label>{t("Email")}</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label>{t("Mot de passe")}</label>
          <PasswordInput
            className="input"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block">{t("Se connecter")}</button>
        </form>

        {accountChoice.length > 0 && (
          <div
            className="card"
            style={{
              background: "var(--soft)",
              border: "1px solid #f0b429",
              borderRadius: 10,
              padding: "14px 16px",
              marginTop: 14,
            }}
          >
            <strong style={{ display: "block", marginBottom: 8 }}>
              {t("Plusieurs espaces détectés sur cet email. Quel espace voulez-vous ouvrir ?")}
            </strong>
            <div className="row2" style={{ flexWrap: "wrap", gap: 8 }}>
              {accountChoice.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => pickSpace(r)}
                >
                  {ROLE_LABEL(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="divider">
          <span>{t("ou")}</span>
        </div>
        <button
          type="button"
          className="btn btn-google btn-block"
          onClick={() => {
            window.location.href = "/api/auth/google";
          }}
        >
          <GoogleIcon />
          {t("Se connecter avec Google")}
        </button>
        <p className="hint">
          {t("Pas encore de compte ?")} <Link to="/register">{t("Créer un compte")}</Link>
        </p>
      </div>
    </main>
  );
}
