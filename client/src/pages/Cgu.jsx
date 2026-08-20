import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

export default function Cgu() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo title={t('Conditions générales d\'utilisation') + ' — Mboppi'} description={t('Conditions générales d\'utilisation')} />
      <section className="hero vitrine-hero">
        <span className="hero-badge">📜 {t('Conditions générales')}</span>
        <h1>{t('Conditions générales d\'utilisation')}</h1>
        <p>{t('Les règles pour utiliser Mboppi en tant que boutique, vendeur, client, livreur ou créateur.')}</p>
      </section>

      <section className="privacy-list">
        <div className="card">
          <h2>{t('1. Objet et acceptation')}</h2>
          <p>{t('Les présentes Conditions générales d\'utilisation (CGU) régissent votre accès et votre utilisation de la plateforme Mboppi. En créant votre compte, vous acceptez pleinement et sans réserve ces conditions.')}</p>
        </div>
        <div className="card">
          <h2>{t('2. Création d\'un compte')}</h2>
          <p>{t('Vous vous engagez à fournir des informations exactes et à jour lors de votre inscription. Vous êtes responsable de la confidentialité de votre mot de passe et de toutes les actions réalisées avec votre compte.')}</p>
        </div>
        <div className="card">
          <h2>{t('3. Les rôles sur Mboppi')}</h2>
          <p>{t('Mboppi met en relation des boutiques, des vendeurs, des clients, des livreurs et des créateurs. Chaque compte est associé à un rôle qui détermine les fonctionnalités disponibles : publier des produits, vendre, commander, livrer ou créer.')}</p>
        </div>
        <div className="card">
          <h2>{t('4. Commandes et paiement')}</h2>
          <p>{t('Le paiement s\'effectue uniquement à la livraison du colis, par mobile money (Orange Money, MTN Mobile Money, etc.), via notre prestataire iKeePay. Le paiement est encaissé par iKeePay pour le compte de la boutique et du vendeur, puis Mboppi reverse automatiquement à chacun le montant qui lui revient.')}</p>
        </div>
        <div className="card">
          <h2>{t('5. Paiement en ligne, reversements et délais')}</h2>
          <p>{t('Pour recevoir un paiement en ligne, chaque acteur doit enregistrer un numéro de mobile money valide depuis son espace. Après confirmation du paiement par iKeePay, Mboppi reverse automatiquement la part de chacun : la boutique reçoit le prix, le vendeur sa commission, le parrain son pourcentage et le livreur ses frais de livraison. Les montants et l\'état des versements sont visibles dans chaque espace.')}</p>
        </div>
        <div className="card">
          <h2>{t('6. Commissions et parrainage')}</h2>
          <p>{t('Les boutiques rémunèrent les vendeurs et les parrains par des commissions enregistrées sur la plateforme. Ces commissions sont reversées automatiquement sur le portefeuille mobile enregistré par chaque acteur. Les montants et les modalités de réclamation sont affichés dans les espaces vendeur, boutique et client.')}</p>
        </div>
        <div className="card">
          <h2>{t('7. Contenu publié')}</h2>
          <p>{t('Les boutiques, vendeurs et créateurs publient leurs propres produits, offres et créations. Ils sont seuls responsables de l\'exactitude et de la légalité de leur contenu. Mboppi peut retirer tout contenu illicite ou inapproprié.')}</p>
        </div>
        <div className="card">
          <h2>{t('8. Livraison')}</h2>
          <p>{t('La livraison est assurée par la boutique ou par un livreur Mboppi. Les délais et les frais sont indiqués sur chaque produit et convenus lors de la commande. Le client paie à la livraison via iKeePay, et chaque acteur reçoit instantanément sa part sur son portefeuille mobile : la boutique le prix, le vendeur sa commission, le parrain son pourcentage et le livreur ses frais de livraison.')}</p>
        </div>
        <div className="card">
          <h2>{t('9. Dons et soutien')}</h2>
          <p>{t('La page « Soutenir Mboppi » permet de faire un don à la plateforme. Les dons par Orange Money et MTN Mobile Money sont traités automatiquement en ligne. Les dons par PayPal ou par virement UBA se font manuellement, en suivant les instructions de la page. Aucun don n\'est obligatoire pour utiliser Mboppi.')}</p>
        </div>
        <div className="card">
          <h2>{t('10. Comportement interdit')}</h2>
          <p>{t('Il est interdit d\'utiliser la plateforme de manière frauduleuse : créer de fausses commandes, usurper une identité, publier des informations fausses ou trompeuses, ou tenter de contourner les règles de la plateforme.')}</p>
        </div>
        <div className="card">
          <h2>{t('11. Suspension et résiliation')}</h2>
          <p>{t('Mboppi peut suspendre ou supprimer un compte en cas de non-respect des présentes conditions. Vous pouvez supprimer votre compte à tout moment depuis votre espace « Mon compte ».')}</p>
        </div>
        <div className="card">
          <h2>{t('12. Données personnelles')}</h2>
          <p>{t('Vos données personnelles sont traitées conformément à notre politique de confidentialité, consultable sur la page Données personnelles.')}</p>
          <Link to="/donnees" className="btn btn-outline">{t('Données personnelles')}</Link>
        </div>
        <div className="card">
          <h2>{t('13. Acceptation des conditions')}</h2>
          <p>{t('En cochant la case lors de votre inscription, vous confirmez avoir lu et accepté ces Conditions générales d\'utilisation. Pour toute question, contactez-nous via la page Contact.')}</p>
          <Link to="/contact" className="btn btn-outline">{t('Contact')}</Link>
        </div>
      </section>
    </main>
  );
}