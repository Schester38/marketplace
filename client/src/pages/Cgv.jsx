import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

export default function Cgv() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo title={t('Conditions générales de vente') + ' — Mboppi'} description={t('Conditions générales de vente')} />
      <section className="hero vitrine-hero">
        <span className="hero-badge">📜 {t('Conditions générales')}</span>
        <h1>{t('Conditions générales de vente')}</h1>
        <p>{t('Les règles qui régissent les ventes sur Mboppi.')}</p>
      </section>

      <section className="privacy-list">
        <div className="card">
          <h2>{t('1. Rôle de la plateforme')}</h2>
          <p>{t('Mboppi met en relation des boutiques, des créateurs, des vendeurs et des clients. Les ventes sont conclues directement entre l\'acheteur et le vendeur ou la boutique. Mboppi ne perçoit aucun paiement en ligne.')}</p>
        </div>
        <div className="card">
          <h2>{t('2. Commandes')}</h2>
          <p>{t('Une commande est enregistrée avec le nom et le code de l\'acheteur. L\'état de la commande (en attente, confirmée, livrée) peut être suivi sur la page de suivi. Une commande annulée ne donne lieu à aucun paiement.')}</p>
        </div>
        <div className="card">
          <h2>{t('3. Paiement et livraison')}</h2>
          <p>{t('Le paiement s\'effectue directement avec le vendeur ou le livreur, à la livraison ou par mobile money. Les frais de livraison sont indiqués sur chaque produit. Mboppi ne stocke aucun moyen de paiement.')}</p>
        </div>
        <div className="card">
          <h2>{t('4. Garanties et retours')}</h2>
          <p>{t('Les garanties éventuelles sont indiquées sur chaque produit. Les retours se traitent directement avec la boutique ou le vendeur. En cas de litige, Mboppi peut servir d\'intermédiaire de médiation.')}</p>
        </div>
        <div className="card">
          <h2>{t('5. Responsabilité')}</h2>
          <p>{t('Mboppi ne peut être tenu responsable des produits vendus par les boutiques et vendeurs, ni des retards de livraison imputables aux livreurs. Les informations publiées le sont par les vendeurs eux-mêmes.')}</p>
        </div>
        <div className="card">
          <h2>{t('6. Contact')}</h2>
          <p>{t('Pour toute question sur ces conditions, contactez-nous via la page Contact.')}</p>
          <Link to="/contact" className="btn btn-outline">{t('Contact')}</Link>
        </div>
      </section>
    </main>
  );
}
