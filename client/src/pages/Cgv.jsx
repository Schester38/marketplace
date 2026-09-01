import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function Cgv() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo
        title={t("Conditions générales de vente") + " — Mboppi"}
        description={t("Conditions générales de vente")}
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">📜 {t("Conditions générales")}</span>
        <h1>{t("Conditions générales de vente")}</h1>
        <p>{t("Les règles qui régissent les ventes sur Mboppi.")}</p>
      </section>

      <section className="privacy-list">
        <div className="card">
          <h2>{t("1. Rôle de la plateforme")}</h2>
          <p>
            {t(
              "Mboppi met en relation des boutiques, des créateurs, des vendeurs, des livreurs et des clients. Les ventes sont conclues directement entre les parties. Mboppi n’est pas propriétaire des produits, ne fixe pas les prix et ne collecte pas les paiements."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("2. Commandes")}</h2>
          <p>
            {t(
              "Une commande est enregistrée avec les informations nécessaires à la livraison et un code de confirmation. Elle peut être en attente, confirmée, livrée ou annulée. Le client doit conserver son code et vérifier le produit au moment de la remise."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("3. Paiement et livraison")}</h2>
          <p>
            {t(
              "Le paiement se fait directement avec la boutique, le vendeur ou le livreur : espèces à la livraison, Mobile Money direct ou virement bancaire. Mboppi ne collecte pas les paiements et ne prélève aucun frais de plateforme. Les frais de livraison sont indiqués sur chaque fiche produit."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("4. Garanties et retours")}</h2>
          <p>
            {t(
              "Les garanties éventuelles sont indiquées sur chaque produit. Les retours se traitent directement avec la boutique ou le vendeur. En cas de litige, Mboppi peut servir d'intermédiaire de médiation."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("5. Commissions et promotions")}</h2>
          <p>
            {t(
              "La commission affichée sur un produit est définie par la boutique et revient au vendeur qui réalise la vente avec son code. Un client inscrit avec le code d’un vendeur peut générer 2 % de parrainage sur ses achats livrés. Pendant une promotion éclair, la commission vendeur est de 0 % et le produit peut être masqué des catalogues."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("6. Responsabilité")}</h2>
          <p>
            {t(
              "Mboppi ne peut être tenu responsable des produits vendus par les boutiques et vendeurs, ni des retards de livraison imputables aux livreurs. Les paiements et les transferts sont réalisés directement entre les parties. Les informations publiées le sont par les vendeurs eux-mêmes."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("7. Contact")}</h2>
          <p>{t("Pour toute question sur ces conditions, contactez-nous via la page Contact.")}</p>
          <Link to="/contact" className="btn btn-outline">
            {t("Contact")}
          </Link>
        </div>
      </section>
    </main>
  );
}
