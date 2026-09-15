import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import SocialProof from "../components/SocialProof.jsx";
import { useLang } from "../i18n.jsx";

/**
 * Page d'atterrissage de recrutement vendeurs/boutiques : explique la valeur
 * de Mboppi (0 % de frais, parrainages, livraison suivie) et redirige vers
 * /register?role=seller (vendeur) ou /register?role=shop (boutique).
 */
export default function SellLanding() {
  const { t } = useLang();

  const steps = [
    {
      emoji: "1️⃣",
      title: t("Créez votre compte"),
      text: t(
        "Choisissez le rôle « Vendeur », « Boutique » ou « Créateur » : inscription gratuite et sans engagement."
      ),
    },
    {
      emoji: "2️⃣",
      title: t("Publiez ou partagez"),
      text: t(
        "Boutiques et créateurs publient leurs produits. Les vendeurs partagent leur code vendeur."
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
        "Vous gardez 100 % de vos ventes. Vendeur : 1 500 F / 30 jours. Boutique & créateur : gratuit."
      ),
    },
    {
      emoji: "🤝",
      title: t("Parrainage = revenus complémentaires"),
      text: t(
        "1 000 F par vendeur activé via votre lien + 2 % sur les achats de vos clients affiliés."
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
          "0 % de frais de service. Publiez vos produits gratuitement et recevez vos commandes par téléphone ou WhatsApp."
        )}
      />
      <section className="hero sell-hero">
        <span className="hero-badge">🛍️ {t("VENDEURS & BOUTIQUES")}</span>
        <h1>{t("Vendez où vous vivez, gardez 100 % de vos ventes.")}</h1>
        <p>
          {t(
            "0 % de frais de service. Publiez vos produits gratuitement et recevez vos commandes par téléphone ou WhatsApp."
          )}
        </p>
        <div className="hero-actions">
          <Link to="/register?role=seller" className="btn btn-primary">
            🚀 {t("Devenir vendeur")}
          </Link>
          <Link to="/register?role=shop" className="btn btn-outline">
            🏪 {t("Créer ma boutique")}
          </Link>
        </div>
      </section>

      <SocialProof />

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