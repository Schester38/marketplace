import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { whatsappLink } from '../config.js';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

export default function CreatorDashboard() {
  const { user } = useAuth();
  const { t, locale } = useLang();

  return (
    <main className="container">
      <Seo title={t('Mon espace créateur') + ' — Mboppi'} description={t('Présentez vos créations au marché.')} />
      <section className="dash-header">
        <div>
          <h1>{t('Mon espace créateur')}</h1>
          <p>{t('Bienvenue {name} ! Faites rayonner vos créations sur le marché Mboppi.', { name: user.name })}</p>
        </div>
      </section>

      <section className="steps">
        <Link to="/vitrine-offre" className="step">
          <span className="step-icon">⚡</span>
          <h3>{t('Les offres du moment')}</h3>
          <p>{t('Suivez les promotions en cours et repérez les bonnes affaires.')}</p>
        </Link>
        <Link to="/" className="step">
          <span className="step-icon">🏪</span>
          <h3>{t('Produits des boutiques')}</h3>
          <p>{t('Parcourez les produits disponibles chez les boutiques partenaires.')}</p>
        </Link>
        <a
          className="step"
          href={whatsappLink(
            t('Bonjour, je suis un créateur sur Mboppi ({email}) et j\'aimerais présenter mes créations.', { email: user.email })
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="step-icon">🎨</span>
          <h3>{t('Présenter mes créations')}</h3>
          <p>{t('Contactez la centrale Mboppi pour exposer vos créations au marché.')}</p>
        </a>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>{t('Mon compte')}</h2>
        <div className="info-row">
          <span className="label">{t('Nom')}</span>
          <strong>{user.name}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t('Email')}</span>
          <strong>{user.email}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t('Rôle')}</span>
          <strong>{t('Créateur')}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t('Inscrit le')}</span>
          <strong>{new Date(user.created_at).toLocaleDateString(locale)}</strong>
        </div>
      </section>
    </main>
  );
}
