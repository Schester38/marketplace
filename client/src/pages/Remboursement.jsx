import React from "react";
import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function Remboursement() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo title={t("Politique de remboursement") + " — MboppiShop"} description={t("Politique de remboursement")} />
      <section className="hero vitrine-hero">
        <span className="hero-badge">💰 {t("Politique de remboursement")}</span>
        <h1>{t("Politique de remboursement")}</h1>
        <p>{t("Les conditions de remboursement pour les services MboppiBoost et les produits digitaux.")}</p>
      </section>
      <section className="privacy-list">
        <div className="card">
          <h2>{t("1. Services MboppiBoost (SMM)")}</h2>
          <p>
            {t(
              "Les commandes payées et transmises au fournisseur ne peuvent plus être annulées. En cas de non-livraison dans le délai prévu, contactez le support pour évaluation d'une compensation. Les remboursements, lorsqu'ils sont accordés, sont crédités sur votre portefeuille MboppiBoost."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("2. Produits digitaux")}</h2>
          <p>
            {t(
              "Les produits digitaux (fichiers téléchargeables et vidéos protégées) sont livrés automatiquement après paiement. Aucun remboursement n'est accordé une fois le fichier téléchargé ou la vidéo visionnée. En cas de problème technique empêchant l'accès, contactez le vendeur ou le support."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("3. Adhésions")}</h2>
          <p>
            {t(
              "Les frais d'adhésion (vendeur, boutique, créateur) ne sont pas remboursables une fois l'adhésion activée et la période de 30 jours commencée."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("4. Dons")}</h2>
          <p>
            {t(
              "Les dons effectués via la page « Soutenir MboppiShop » sont volontaires et ne sont pas remboursables."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("5. Procédure de demande")}</h2>
          <p>
            {t(
              "Pour toute demande de remboursement, contactez-nous via la page Contact ou WhatsApp avec votre référence de commande. Chaque demande est examinée au cas par cas. Le délai de traitement est de 7 jours ouvrables."
            )}
          </p>
          <div className="tw-mt-4 tw-flex tw-gap-3 tw-flex-wrap">
            <Link to="/contact" className="btn btn-outline">
              {t("Contact")}
            </Link>
            <Link to="/mboppi-boost" className="btn btn-outline">
              {t("Retour à MboppiBoost")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
