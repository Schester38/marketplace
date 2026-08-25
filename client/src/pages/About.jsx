import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import Logo from "../components/Logo.jsx";
import { useLang } from "../i18n.jsx";

export default function About() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo
        title={t("À propos de Mboppi") + " — Mboppi"}
        description={t(
          "Mboppi est un marché en ligne conçu pour connecter boutiques, vendeurs, clients et créateurs."
        )}
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">
          <Logo className="logo-inline" /> {t("À propos")}
        </span>
        <h1>{t("Mboppi, le marché de votre quartier, en ligne")}</h1>
        <p>
          {t(
            "Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter près de chez soi, sans commission écrasante et sans dépendre des grands sites. Ici, les boutiques publient leurs produits, les vendeurs gagnent des commissions, les créateurs exposent leurs talents et les clients trouvent tout au même endroit."
          )}
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn btn-primary">
            {t("Créer un compte gratuit")}
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("Comment ça marche ?")}</h2>
          <p>{t("Un rôle pour chacun, une plateforme pour tous.")}</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-icon">🏪</div>
            <div className="step-num">1</div>
            <h3>{t("Boutique")}</h3>
            <p>{t("Publiez vos produits et recevez les commandes de vos clients.")}</p>
          </div>
          <div className="step">
            <div className="step-icon">🛒</div>
            <div className="step-num">2</div>
            <h3>{t("Vendeur")}</h3>
            <p>{t("Vendez en ligne et gagnez une commission sur chaque vente.")}</p>
          </div>
          <div className="step">
            <div className="step-icon">
              <Logo className="logo-inline" />
            </div>
            <div className="step-num">3</div>
            <h3>{t("Client")}</h3>
            <p>{t("Parcourez les offres du moment et commandez en un clic.")}</p>
          </div>
          <div className="step">
            <div className="step-icon">🎨</div>
            <div className="step-num">4</div>
            <h3>{t("Créateur")}</h3>
            <p>{t("Exposez vos créations et touchez un public plus large.")}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("Une marketplace pensée pour le terrain")}</h2>
          <p>{t("Mboppi rapproche la découverte en ligne de la relation commerciale locale.")}</p>
        </div>
        <div className="privacy-list">
          <div className="card">
            <h3>{t("Des vitrines simples à partager")}</h3>
            <p>
              {t(
                "Chaque produit dispose d’une fiche publique avec son prix, sa disponibilité, ses photos, sa catégorie, sa garantie éventuelle et les informations de la boutique. Les liens peuvent être partagés par WhatsApp ou sur les réseaux sociaux."
              )}
            </p>
          </div>
          <div className="card">
            <h3>{t("Une vente suivie de bout en bout")}</h3>
            <p>
              {t(
                "La commande reçoit un code de confirmation. La boutique la traite, le livreur vérifie le code de la boutique et le client confirme la remise avec son propre code. Chaque étape reste compréhensible pour les personnes concernées."
              )}
            </p>
          </div>
          <div className="card">
            <h3>{t("Une rémunération lisible")}</h3>
            <p>
              {t(
                "La commission vendeur est affichée avant la vente. Le parrainage client représente 2 % pour le vendeur référent, et les frais de livraison sont saisis au moment de la livraison. Pour les paiements en ligne via Ikeepay, l'acheteur paie le prix normal et les montants reversés aux bénéficiaires sont nets de 10 % de frais de traitement."
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>{t("Nos valeurs")}</h2>
          <p>{t("Ce qui nous pousse chaque jour.")}</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-icon">🤝</div>
            <h3>{t("La confiance")}</h3>
            <p>{t("Des commandes simples, des contacts directs avec les vendeurs.")}</p>
          </div>
          <div className="step">
            <div className="step-icon">📱</div>
            <h3>{t("La proximité")}</h3>
            <p>{t("Commander par WhatsApp, sans carte bancaire ni frais cachés.")}</p>
          </div>
          <div className="step">
            <div className="step-icon">⚡</div>
            <h3>{t("La rapidité")}</h3>
            <p>{t("Une plateforme légère, qui s'affiche vite, même en 3G.")}</p>
          </div>
          <div className="step">
            <div className="step-icon">💸</div>
            <h3>{t("L'argent, en toute transparence")}</h3>
            <p>
              {t(
                "Les paiements sont manuels et directs : espèces à la livraison, Mobile Money ou virement bancaire, sans frais. Pour les paiements en ligne via Ikeepay, l'acheteur paie le prix normal et un taux de traitement de 10 % s'applique sur les reversements aux bénéficiaires."
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <h2>{t("Prêt à rejoindre l'aventure ?")}</h2>
        <p>{t("Créez votre compte gratuitement en moins d'une minute.")}</p>
        <Link to="/register" className="btn btn-primary">
          {t("Créer mon compte")}
        </Link>
      </section>
    </main>
  );
}
