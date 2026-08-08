import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

export default function Privacy() {
  const { t } = useLang();
  return (
    <main className="container">
      <Seo
        title={t('Données & confidentialité') + ' — Mboppi'}
        description={t('Quelles données collectons-nous ?')}
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">🔒 {t('Données personnelles')}</span>
        <h1>{t('Comment vos données sont conservées')}</h1>
        <p>
          {t('La transparence est importante pour nous. Voici comment Mboppi collecte, stocke et protège vos données.')}
        </p>
      </section>

      <section className="privacy-list">
        <div className="card">
          <h2>{t('📦 Quelles données sont collectées ?')}</h2>
          <p>
            {t('Lors de votre inscription : votre nom, votre e-mail et votre rôle (boutique, vendeur, client ou créateur). Si vous vous connectez avec Google, seul votre e-mail Google est utilisé. Selon votre rôle, vous pouvez publier des produits, des offres avec photos, et vos ventes sont enregistrées dans votre espace.')}
          </p>
        </div>

        <div className="card">
          <h2>{t('🔐 Comment sont-elles stockées ?')}</h2>
          <p>
            {t('Toutes les données sont enregistrées dans une base de données PostgreSQL hébergée et sécurisée. Les mots de passe sont hachés (chiffrés de façon irréversible) : personne, même l\'équipe Mboppi, ne peut lire votre mot de passe. Toutes les connexions passent par un protocole sécurisé (HTTPS).')}
          </p>
        </div>

        <div className="card">
          <h2>{t('⏳ Combien de temps sont-elles conservées ?')}</h2>
          <p>
            {t('Vos données restent enregistrées aussi longtemps que votre compte existe. Les offres et produits que vous retirez sont supprimés définitivement, avec leurs photos. Aucune donnée n\'est vendue ni transmise à des tiers.')}
          </p>
        </div>

        <div className="card">
          <h2>{t('👀 Qui peut les voir ?')}</h2>
          <p>
            {t('Seule la personne concernée accède à son espace : une boutique voit ses produits, un vendeur ses ventes et commissions. Les offres de la vitrine sont publiquement visibles par les visiteurs, mais sans vos informations de compte.')}
          </p>
        </div>

        <div className="card">
          <h2>{t('💳 Aucun paiement en ligne')}</h2>
          <p>
            {t('Mboppi ne demande jamais de numéro de carte bancaire. Les commandes passent par téléphone ou WhatsApp, et le paiement se fait directement avec le vendeur.')}
          </p>
        </div>

        <div className="card">
          <h2>{t('🗑️ Supprimer vos données')}</h2>
          <p>
            {t('Vous pouvez retirer vos offres et produits à tout moment depuis votre espace.')}{' '}
            {t('Pour supprimer votre compte, contactez-nous via la page')}{' '}
            <Link to="/contact" className="privacy-link">{t('Contact')}</Link>{' '}
            {t('et nous le supprimerons rapidement.')}
          </p>
        </div>
      </section>
    </main>
  );
}
