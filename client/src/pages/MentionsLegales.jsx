import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function MentionsLegales() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo title={t("Mentions légales") + " — Mboppi"} description={t("Mentions légales")} />
      <section className="hero vitrine-hero">
        <span className="hero-badge">⚖️ {t("Mentions légales")}</span>
        <h1>{t("Mentions légales")}</h1>
      </section>
      <section className="privacy-list">
        <div className="card">
          <h2>{t("Éditeur du site")}</h2>
          <p>
            {t(
              "Le site Mboppi est édité par l'équipe Mboppi. Pour toute question, utilisez la page Contact."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("Hébergement")}</h2>
          <p>
            {t(
              "Le site est hébergé par Vercel Inc. (340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis). La base de données PostgreSQL et le stockage des images sont assurés par Supabase Inc., 1111 Broadway, Suite 1355, Oakland, CA 94607, États-Unis."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("Propriété intellectuelle")}</h2>
          <p>
            {t(
              "Les contenus publiés par les boutiques, vendeurs et créateurs (produits, photos, descriptions et créations) restent sous leur responsabilité et leur appartenance. Ils autorisent Mboppi à les afficher pour le fonctionnement de la marketplace. La marque et le nom Mboppi appartiennent à leurs propriétaires."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("Prestataire de paiement")}</h2>
          <p>
            {t(
              "Les paiements peuvent être réalisés directement entre les parties par espèces, Mobile Money ou virement bancaire, ou via le prestataire Ikeepay pour les adhésions, les dons et les ventes. Les paiements encaissés en ligne correspondent au prix normal ; Ikeepay prélève 10% de frais de traitement sur chaque reversement sortant, versé aux bénéficiaires nets de ces frais."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("Rôle de l’éditeur")}</h2>
          <p>
            {t(
              "Mboppi fournit un outil de présentation, de mise en relation, de suivi des commandes et de coordination de livraison. Les contrats de vente, paiements directs ou via Ikeepay, garanties, retours et litiges relèvent d’abord des parties concernées."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("Disponibilité du service")}</h2>
          <p>
            {t(
              "L’équipe Mboppi peut faire évoluer, suspendre ou interrompre une fonctionnalité pour maintenance, sécurité ou amélioration. Les informations publiées peuvent être modifiées par leur auteur et doivent être vérifiées avant toute transaction."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("Contact")}</h2>
          <p>{t("Vous pouvez nous joindre via la page Contact ou WhatsApp.")}</p>
          <Link to="/contact" className="btn btn-outline">
            {t("Contact")}
          </Link>
        </div>
      </section>
    </main>
  );
}
