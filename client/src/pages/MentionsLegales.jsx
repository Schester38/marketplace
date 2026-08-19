import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

export default function MentionsLegales() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo title={t('Mentions légales') + ' — Mboppi'} description={t('Mentions légales')} />
      <section className="hero vitrine-hero">
        <span className="hero-badge">⚖️ {t('Mentions légales')}</span>
        <h1>{t('Mentions légales')}</h1>
      </section>
      <section className="privacy-list">
        <div className="card">
          <h2>{t('Éditeur du site')}</h2>
          <p>{t('Le site Mboppi est édité par l\'équipe Mboppi. Pour toute question, utilisez la page Contact.')}</p>
        </div>
        <div className="card">
          <h2>{t('Hébergement')}</h2>
          <p>{t('Le site est hébergé par Vercel Inc. (340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis). La base de données PostgreSQL et le stockage des images sont assurés par Supabase Inc., 1111 Broadway, Suite 1355, Oakland, CA 94607, États-Unis.')}</p>
        </div>
        <div className="card">
          <h2>{t('Propriété intellectuelle')}</h2>
          <p>{t('Les contenus publiés par les boutiques et vendeurs (produits, photos, descriptions) leur appartiennent. La marque et le nom Mboppi appartiennent à leurs propriétaires.')}</p>
        </div>
        <div className="card">
          <h2>{t('Prestataire de paiement')}</h2>
          <p>{t('Les paiements en ligne sont traités par iKeePay, prestataire de paiement mobile money. Ses conditions d\'utilisation et sa politique de confidentialité s\'appliquent au traitement des paiements effectués sur Mboppi.')}</p>
        </div>
        <div className="card">
          <h2>{t('Contact')}</h2>
          <p>{t('Vous pouvez nous joindre via la page Contact ou WhatsApp.')}</p>
          <Link to="/contact" className="btn btn-outline">{t('Contact')}</Link>
        </div>
      </section>
    </main>
  );
}
