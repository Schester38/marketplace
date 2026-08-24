import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth, postLoginPath } from "../App.jsx";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function ConfirmEmail() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";
  const [state, setState] = useState("loading"); // loading | ok | error
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(emailParam);
  const [resending, setResending] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      if (!token) {
        setState("error");
        setMessage(t("Lien de confirmation invalide ou manquant."));
        return;
      }
      try {
        const data = await api.verifyEmail(token);
        setState("ok");
        if (data.user && data.token) {
          login(data.user, data.token);
          navigate(postLoginPath(data.user), { replace: true });
        }
      } catch (err) {
        setState("error");
        setMessage(err.message);
        if (err.code === "LINK_EXPIRED" && err.email) setEmail(err.email);
      }
    })();
  }, [token, t, login, navigate]);

  const resend = async () => {
    if (!email) {
      setMessage(t("Renseignez votre adresse email."));
      return;
    }
    setResending(true);
    setMessage("");
    try {
      await api.resendVerification(email);
      setMessage(t("Un nouveau lien de confirmation a été envoyé. Vérifiez votre boîte mail."));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="container narrow">
      <Seo title={t("Confirmation de l'email") + " — Mboppi"} noindex />
      <div className="card form-card" style={{ textAlign: "center" }}>
        <div className="auth-brand">📬</div>
        {state === "loading" && (
          <>
            <h2>{t("Confirmation…")}</h2>
            <p className="hint" style={{ textAlign: "center" }}>
              {t("Nous vérifions votre adresse email…")}
            </p>
          </>
        )}
        {state === "ok" && (
          <>
            <div style={{ fontSize: "3rem" }}>✅</div>
            <h2>{t("Email confirmé !")}</h2>
            <p className="hint" style={{ textAlign: "center" }}>
              {t("Votre adresse email est confirmée. Votre compte est maintenant actif.")}
            </p>
            <Link to="/login" className="btn btn-primary btn-block">
              {t("Se connecter")}
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <div style={{ fontSize: "3rem" }}>⚠️</div>
            <h2>{t("Confirmation impossible")}</h2>
            <p className="error">{message}</p>
            <label>{t("Email")}</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("Votre adresse email")}
            />
            <button className="btn btn-primary btn-block" onClick={resend} disabled={resending}>
              {resending ? t("Envoi…") : t("Renvoyer un lien de confirmation")}
            </button>
            {message && (
              <p className="hint" style={{ textAlign: "center", marginTop: 10 }}>
                {message}
              </p>
            )}
            <Link to="/login" className="btn btn-outline btn-block">
              {t("Aller à la connexion")}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
