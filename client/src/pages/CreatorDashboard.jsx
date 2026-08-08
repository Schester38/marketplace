import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { whatsappLink } from '../config.js';

export default function CreatorDashboard() {
  const { user } = useAuth();

  return (
    <main className="container">
      <section className="dash-header">
        <div>
          <h1>Mon espace créateur</h1>
          <p>Bienvenue {user.name} ! Faites rayonner vos créations sur le marché Mboppi.</p>
        </div>
      </section>

      <section className="steps">
        <Link to="/vitrine-offre" className="step">
          <span className="step-icon">⚡</span>
          <h3>Les offres du moment</h3>
          <p>Suivez les promotions en cours et repérez les bonnes affaires.</p>
        </Link>
        <Link to="/" className="step">
          <span className="step-icon">🏪</span>
          <h3>Produits des boutiques</h3>
          <p>Parcourez les produits disponibles chez les boutiques partenaires.</p>
        </Link>
        <a
          className="step"
          href={whatsappLink(
            `Bonjour, je suis un créateur sur Mboppi (${user.email}) et j'aimerais présenter mes créations.`
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="step-icon">🎨</span>
          <h3>Présenter mes créations</h3>
          <p>Contactez la centrale Mboppi pour exposer vos créations au marché.</p>
        </a>
      </section>

      <section className="card" style={{ marginTop: 24 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Mon compte</h2>
        <div className="info-row">
          <span className="label">Nom</span>
          <strong>{user.name}</strong>
        </div>
        <div className="info-row">
          <span className="label">Email</span>
          <strong>{user.email}</strong>
        </div>
        <div className="info-row">
          <span className="label">Rôle</span>
          <strong>Créateur</strong>
        </div>
        <div className="info-row">
          <span className="label">Inscrit le</span>
          <strong>{new Date(user.created_at).toLocaleDateString('fr-FR')}</strong>
        </div>
      </section>
    </main>
  );
}
