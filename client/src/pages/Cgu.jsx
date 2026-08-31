import { Link } from "react-router-dom";
import Seo from "../components/Seo.jsx";
import { useLang } from "../i18n.jsx";

export default function Cgu() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo
        title={t("Conditions générales d'utilisation") + " — Mboppi"}
        description={t("Conditions générales d'utilisation")}
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">📜 {t("Conditions générales")}</span>
        <h1>{t("Conditions générales d'utilisation")}</h1>
        <p>
          {t(
            "Les règles pour utiliser Mboppi en tant que boutique, vendeur, client, livreur ou créateur."
          )}
        </p>
      </section>

      <section className="privacy-list">
        <div className="card">
          <h2>{t("1. Objet et acceptation")}</h2>
          <p>
            {t(
              "Les présentes Conditions générales d'utilisation (CGU) régissent votre accès et votre utilisation de la plateforme Mboppi. En créant votre compte, vous acceptez pleinement et sans réserve ces conditions."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("2. Création d'un compte")}</h2>
          <p>
            {t(
              "Vous vous engagez à fournir des informations exactes et à jour lors de votre inscription. Vous êtes responsable de la confidentialité de votre mot de passe et de toutes les actions réalisées avec votre compte."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("2.1. Accès gratuit et sécurité")}</h2>
          <p>
            {t(
              "La création d’un compte et l’espace vendeur sont gratuits. Vous devez protéger vos identifiants, ne pas partager votre session et signaler rapidement toute utilisation non autorisée. Un compte peut être limité ou suspendu en cas de risque pour les utilisateurs ou la plateforme."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("3. Les rôles sur Mboppi")}</h2>
          <p>
            {t(
              "Mboppi met en relation des boutiques, des vendeurs, des clients, des livreurs et des créateurs. Chaque compte est associé à un rôle qui détermine les fonctionnalités disponibles : publier des produits, vendre, commander, livrer ou créer."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("4. Commandes et paiement")}</h2>
          <p>
            {t(
              "Le paiement peut être effectué directement avec la boutique, le vendeur ou le livreur : espèces à la livraison, Mobile Money direct ou virement bancaire. Mboppi ne collecte pas les paiements et ne prélève aucun frais de plateforme sur les transactions directes. Aucun paiement en ligne n'est proposé : l'acheteur paie le prix affiché, sans supplément."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("5. Paiements directs et commissions")}</h2>
          <p>
            {t(
              "Les paiements directs sont convenus entre le client et la boutique, le vendeur ou le livreur. Les commissions sont enregistrées sur la plateforme et réglées manuellement par la boutique, sans frais, sur le moyen de paiement Mobile Money enregistré de chaque bénéficiaire."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("6. Commissions et parrainage")}</h2>
          <p>
            {t(
              "La boutique définit la commission affichée sur chaque produit. Le vendeur reçoit la commission liée à une vente réalisée avec son code. Le parrainage concerne un client affilié et représente 2 % du montant de ses achats livrés ; le cumul est versé à partir de 5 000 XAF. Les paiements aux bénéficiaires sont effectués manuellement par la boutique, sans frais de plateforme."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("7. Contenu publié")}</h2>
          <p>
            {t(
              "Les boutiques, vendeurs et créateurs publient leurs propres produits, offres et créations. Ils sont seuls responsables de l'exactitude et de la légalité de leur contenu. Mboppi peut retirer tout contenu illicite ou inapproprié."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("8. Livraison")}</h2>
          <p>
            {t(
              "La livraison est assurée par la boutique ou par un livreur Mboppi. Les délais et les frais sont indiqués sur chaque produit et convenus lors de la commande. Le client paie directement à la livraison ou par transfert convenu avec le bénéficiaire."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("8.1. Promotions éclair")}</h2>
          <p>
            {t(
              "Une boutique peut lancer une promotion éclair dans les limites affichées par la plateforme : une promotion par semaine et une durée maximale de 24 heures. Le produit peut être masqué des catalogues pendant la promotion et la commission vendeur est alors fixée à 0 %."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("9. Dons et soutien")}</h2>
          <p>
            {t(
              "La page « Soutenir Mboppi » permet, lorsque cette option est disponible, de contribuer volontairement au projet. Les modalités indiquées sur la page de soutien s’appliquent au don. Aucun don n’est obligatoire pour utiliser Mboppi."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("10. Comportement interdit")}</h2>
          <p>
            {t(
              "Il est interdit d'utiliser la plateforme de manière frauduleuse : créer de fausses commandes, usurper une identité, publier des informations fausses ou trompeuses, ou tenter de contourner les règles de la plateforme."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("11. Suspension et résiliation")}</h2>
          <p>
            {t(
              "Mboppi peut suspendre ou supprimer un compte en cas de non-respect des présentes conditions. Vous pouvez supprimer votre compte à tout moment depuis votre espace « Mon compte »."
            )}
          </p>
        </div>
        <div className="card">
          <h2>{t("12. Données personnelles")}</h2>
          <p>
            {t(
              "Vos données personnelles sont traitées conformément à notre politique de confidentialité, consultable sur la page Données personnelles."
            )}
          </p>
          <Link to="/donnees" className="btn btn-outline">
            {t("Données personnelles")}
          </Link>
        </div>
        <div className="card">
          <h2>{t("13. Acceptation des conditions")}</h2>
          <p>
            {t(
              "En cochant la case lors de votre inscription, vous confirmez avoir lu et accepté ces Conditions générales d'utilisation. Pour toute question, contactez-nous via la page Contact."
            )}
          </p>
          <Link to="/contact" className="btn btn-outline">
            {t("Contact")}
          </Link>
        </div>
      </section>
    </main>
  );
}
