import React from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n.jsx";
import { whatsappLink } from "../config.js";

/**
 * Contenu de la page de recrutement VENDEURS (utilisé par /vendre et par la
 * page d'adhésion via le bouton « AVANTAGE D'ÊTRE VENDEUR SUR MBOPPI »).
 * `showRegisterCta` : masque le bouton « Devenir vendeur » (adhésion = déjà inscrit).
 */
export default function SellContent({ showRegisterCta = true }) {
  const { t } = useLang();

  const steps = [
    {
      emoji: "1️⃣",
      title: t("Créez votre compte"),
      text: t(
        "Inscription gratuite et sans engagement : votre compte vendeur est prêt en moins d'une minute."
      ),
    },
    {
      emoji: "2️⃣",
      title: t("Payer votre adhésion à seulement 1500 F/mois. Partagez vos liens vendeur à vos contacts:"),
      text: t(
        "Un code unique à 6 caractères : vos clients l'utilisent pour consulter/commander et vos commissions sont calculées automatiquement."
      ),
    },
    {
      emoji: "3️⃣",
      title: t("Vendez et touchez vos commissions"),
      text: t(
        "Commandes par téléphone ou WhatsApp, livraison suivie GPS, commissions affichées avant la vente."
      ),
    },
  ];

  const benefits = [
    {
      emoji: "🔥",
      title: t("0 % de frais de service"),
      text: t(
        "Vous gardez 100 % de vos ventes. Seule l'adhésion est payante : 1 500 F pour 30 jours."
      ),
    },
    {
      emoji: "🤝",
      title: t("Parrainage = revenus complémentaires"),
      text: t(
        "1 000 F par vendeur que vous parrainez + 2 % sur les achats de vos clients affiliés."
      ),
    },
    {
      emoji: "🛵",
      title: t("Livraison intégrée"),
      text: t(
        "Vos clients suivent leur colis en temps réel avec un livreur Mboppi."
      ),
    },
    {
      emoji: "📲",
      title: t("Commandes téléphone & WhatsApp"),
      text: t(
        "Vos clients commandent en quelques clics et contactent directement la boutique sur WhatsApp."
      ),
    },
  ];

  return (
    <>
      <section className="hero sell-hero">
        <span className="hero-badge">🧑🏾‍💼 {t("POURQUOI DEVENIR VENDEUR SUR MBOPPI")}</span>
        <h1>{t("Vendez partout où vous voulez, gardez 100 % de vos ventes.")}</h1>
        <p>
          {t(
            "0 % de frais de service. Générez votre code vendeur, partagez les liens à vos contacts et encaissez vos commissions sur chaque vente — par téléphone ou WhatsApp."
          )}
        </p>
        {showRegisterCta && (
          <div className="hero-actions">
            <Link to="/register?role=seller" className="btn btn-primary">
              🚀 {t("Devenir vendeur")}
            </Link>
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">🚀 {t("3 étapes pour commencer")}</h2>
        <div className="grid steps-grid">
          {steps.map((s) => (
            <div className="card" key={s.title}>
              <div className="step-emoji">{s.emoji}</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>{s.title}</h3>
              <p className="hint" style={{ margin: 0 }}>
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">💎 {t("Vos avantages")}</h2>
        <div className="grid">
          {benefits.map((b) => (
            <div className="card" key={b.title}>
              <div style={{ fontSize: "1.5rem" }}>{b.emoji}</div>
              <h3 style={{ margin: "8px 0 6px", fontSize: "1.02rem" }}>{b.title}</h3>
              <p className="hint" style={{ margin: 0 }}>
                {b.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="hero sell-footer">
        <span className="hero-badge">🎉 {t("Prêt à vendre sur Mboppi ?")}</span>
        <p>
          {t(
            "Créez votre compte en moins d'une minute. Besoin d'aide ? L'équipe vous accompagne sur WhatsApp."
          )}
        </p>
        <div className="hero-actions">
          {showRegisterCta && (
            <Link to="/register?role=seller" className="btn btn-primary">
              {t("Devenir vendeur")}
            </Link>
          )}
          <a
            href={whatsappLink(
              t("Bonjour, je veux devenir vendeur sur Mboppi.")
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-whatsapp"
          >
            💬 {t("Nous contacter sur WhatsApp")}
          </a>
          <Link to="/faq" className="btn btn-outline">
            ❓ {t("Comment ça marche ?")}
          </Link>
        </div>
      </section>
    </>
  );
}