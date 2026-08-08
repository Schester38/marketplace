import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { whatsappLink } from '../config.js';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

export default function ClientDashboard() {
  const { user } = useAuth();
  const { t, locale } = useLang();

  return (
    <main className="container">
      <Seo title={t('Mon espace client') + ' — Mboppi'} description={t('Découvrez les produits et offres des boutiques.')} />
      <section className="dash-header">
        <div>
          <h1>{t('Mon espace client')}</h1>
          <p>{t('Bienvenue {name} !', { name: user.name })} {t('Découvrez les produits et offres des boutiques.')}</p>
        </div>
      </section>

      <section className="steps">
        <Link to="/vitrine-offre" className="step">
          <span className="step-icon">⚡</span>
          <h3>{t('Les offres du moment')}</h3>
          <p>{t('Découvrez les promotions en cours avec les meilleures réductions.')}</p>
        </Link>
        <Link to="/" className="step">
          <span className="step-icon">🏪</span>
          <h3>{t('Produits des boutiques')}</h3>
          <p>{t('Parcourez les produits disponibles chez les boutiques partenaires.')}</p>
        </Link>
        <a
          className="step"
          href={whatsappLink(
            t('Bonjour, je suis un client de Mboppi ({email}) et j\'aimerais passer une commande.', { email: user.email })
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="step-icon">💬</span>
          <h3>{t('Commander sur WhatsApp')}</h3>
          <p>{t('Contactez directement la centrale Mboppi pour commander.')}</p>
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
          <strong>{t('Client')}</strong>
        </div>
        <div className="info-row">
          <span className="label">{t('Inscrit le')}</span>
          <strong>{new Date(user.created_at).toLocaleDateString(locale)}</strong>
        </div>
      </section>
    </main>
  );
}
