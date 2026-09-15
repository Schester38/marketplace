import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
// import SocialProof from "../components/SocialProof.jsx"; // réactiver avec la section (voir plus bas)
import { useLang } from "../i18n.jsx";

/**
 * Page d'atterrissage de recrutement VENDEURS indépendants uniquement :
 * explique la valeur de Mboppi pour eux (0 % de frais, code vendeur,
 * parrainages, livraison suivie) et redirige vers /register?role=seller.
 */
export default function SellLanding() {
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
      title: t("Partagez votre code vendeur"),
      text: t(
        "Un code unique à 6 caractères : vos clients l'utilisent pour commander et vos commissions sont calculées automatiquement."
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
        "Vos clients commandent en quelques clics ou vous contactent directement sur WhatsApp."
      ),
    },
  ];

  return (
    <main className="container sell-landing">
      <Seo
        title={`${t("Vendez où vous vivez, gardez 100 % de vos ventes.")} — Mboppi`}
        description={t(
          "0 % de frais de service. Recevez votre code vendeur, partagez-le sur WhatsApp et encaissez vos commissions sur chaque vente."
        )}
      />
      <section className="hero sell-hero">
        <span className="hero-badge">🧑🏾‍💼 {t("VENDEURS INDÉPENDANTS")}</span>
        <h1>{t("Vendez où vous vivez, gardez 100 % de vos ventes.")}</h1>
        <p>
          {t(
            "0 % de frais de service. Recevez votre code vendeur, partagez-le à vos contacts et encaissez vos commissions sur chaque vente — par téléphone ou WhatsApp."
          )}
        </p>
        <div className="hero-actions">
          <Link to="/register?role=seller" className="btn btn-primary">
            🚀 {t("Devenir vendeur")}
          </Link>
        </div>
      </section>

      {/* Preuve sociale désactivée : compteurs trop faibles pour convaincre.
          Réactiver avec la page d'accueil quand les chiffres auront grandi :
      <SocialProof />
      */}

      <section className="section">
        <h2 className="section-title">🚀 {t("3 étapes pour commencer")}</h2>
        <div className="grid">
          {steps.map((s) => (
            <div className="card" key={s.title}>
              <div style={{ fontSize: "1.6rem", marginBottom: 6 }}>{s.emoji}</div>
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
          <Link to="/register?role=seller" className="btn btn-primary">
            {t("Devenir vendeur")}
          </Link>
          <Link to="/faq" className="btn btn-outline">
            ❓ {t("Comment ça marche ?")}
          </Link>
        </div>
      </section>
    </main>
  );
}