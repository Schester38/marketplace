import { storage, sessionStore } from "../storage";
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { useAuth, postLoginPath } from "../App.jsx";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";
import { useLang } from "../i18n.jsx";

export default function AuthGoogle() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const done = useRef(false);

  // Plusieurs espaces (boutique + livreur) sur le même email : la page propose
  // le choix, sécurisé par le jeton éphémère émis après validation Google.
  const chooseRoles = params.get("choose");
  const chooseToken = params.get("ct");

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
    try {
      const data = await api.googleChoose(chooseToken, role);
      login(data.user, data.token);
      storage.setItem("mboppi_welcome", "login");
      navigate(postLoginPath(data.user), { replace: true });
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (done.current) return;
    if (chooseRoles && chooseToken) return; // écran de choix affiché
    const token = params.get("token");
    const err = params.get("error");
    if (err) {
      setError(err);
      return;
    }
    if (!token) {
      setError("Retour Google invalide. Réessayez.");
      return;
    }
    done.current = true;
    storage.setItem("token", token);
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Le serveur met trop de temps à répondre. Réessayez.")),
        15000
      )
    );
    Promise.race([api.me(), timeout])
      .then((data) => {
        console.log("[AuthGoogle] me response", data.user?.id, data.user?.email, data.user?.role);
        login(data.user, token);
        storage.setItem("mboppi_welcome", "login");
        navigate(postLoginPath(data.user), { replace: true });
      })
      .catch((e) => {
        storage.removeItem("token");
        setError(e.message);
      });
  }, [params, login, navigate, chooseRoles, chooseToken]);

  return (
    <main className="container narrow">
      <Seo
        title={t("Connexion en cours…") + " — Mboppi"}
        description={t("Connexion en cours…")}
        noindex
      />
      <div className="card form-card page-center">
        <div className="auth-brand">
          <Logo className="logo-inline" />
        </div>
        {chooseRoles && chooseToken ? (
          <>
            <h2 style={{ marginBottom: 6 }}>Quel espace voulez-vous ouvrir ?</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              Votre compte Google est connecté à plusieurs espaces Mboppi.
            </p>
            <div className="row2" style={{ flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {chooseRoles
                .split(",")
                .filter((r) => r)
                .map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="btn btn-outline"
                    onClick={() => pickSpace(r)}
                  >
                    {ROLE_LABEL(r)}
                  </button>
                ))}
            </div>
            {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
            <p className="hint" style={{ marginTop: 14 }}>
              <Link to="/login">{t("Se connecter")}</Link>
            </p>
          </>
        ) : error ? (
          <>
            <p className="error" style={{ textAlign: "center" }}>
              {error}
            </p>
            <p className="hint">
              <Link to="/register">{t("Retour à l'inscription")}</Link> ·{" "}
              <Link to="/login">{t("Se connecter")}</Link>
            </p>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p className="hint">{t("Connexion en cours…")}</p>
          </>
        )}
      </div>
    </main>
  );
}
