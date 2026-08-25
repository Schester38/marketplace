import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n.jsx";
import { api } from "../api.js";
import pkg from "../../package.json";

export default function Footer() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const subscribe = async (e) => {
    e.preventDefault();
    if (busy) return;
    const value = email.trim();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus("error");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await api.subscribeNewsletter(value);
      setStatus("ok");
      setEmail("");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
          <span>Mboppi</span>
        </div>
        <nav className="footer-nav">
          <Link to="/a-propos">{t("À propos")}</Link>
          <Link to="/faq">❓ {t("FAQ")}</Link>
          <Link to="/donnees">{t("Données & confidentialité")}</Link>
          <Link to="/cgv">{t("CGV")}</Link>
          <Link to="/cgu">{t("CGU")}</Link>
          <Link to="/mentions-legales">{t("Mentions légales")}</Link>
        </nav>
        <div className="tp-block">
          <div className="tp-head">
            <span className="tp-stars" aria-hidden="true">
              ★★★★★
            </span>
            <h3 className="tp-title">{t("Avis clients")}</h3>
          </div>
          <p className="tp-sub">{t("Partagez votre expérience avec nous sur Trustpilot")}</p>
          <a
            className="tp-btn"
            href="https://fr.trustpilot.com/review/mboppi-mboppi.vercel.app"
            target="_blank"
            rel="noopener"
          >
            <span className="tp-btn-stars" aria-hidden="true">
              ★★★★★
            </span>
            {t("Évaluez-nous sur Trustpilot")}
          </a>
        </div>
        <form className="newsletter" onSubmit={subscribe}>
          <h3 className="newsletter-title">✉️ {t("Restez informé")}</h3>
          <p className="newsletter-desc">
            {t("Recevez nos bons plans et nouveautés directement par email.")}
          </p>
          <div className="newsletter-row">
            <input
              type="email"
              className="newsletter-input"
              placeholder={t("Votre adresse email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t("Envoi…") : t("S'abonner")}
            </button>
          </div>
          {status === "ok" && (
            <p className="newsletter-status ok" role="status">
              {t("Merci ! Vous êtes bien inscrit(e) à la newsletter.")}
            </p>
          )}
          {status === "error" && (
            <p className="newsletter-status err" role="alert">
              {t("Adresse invalide ou problème lors de l'inscription. Réessayez.")}
            </p>
          )}
          <p className="newsletter-legal">
            {t("Désinscription possible à tout moment via le lien présent dans chaque email.")}
          </p>
        </form>
        <p className="footer-copy">
          © {new Date().getFullYear()} Mboppi. {t("Tous droits réservés.")}
        </p>
        <p className="footer-copy">v{pkg.version}</p>
      </div>
    </footer>
  );
}
