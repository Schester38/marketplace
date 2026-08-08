import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { whatsappLink } from '../config.js';
import Seo from '../components/Seo.jsx';

export default function ClientDashboard() {
  const { user } = useAuth();

  return (
    <main className="container">
      <Seo title="Mon espace client — Mboppi" description="Retrouvez vos raccourcis produits, offres et commandes sur Mboppi." />
      <section className="dash-header">
        <div>
          <h1>Mon espace client</h1>
          <p>Bienvenue {user.name} ! Tout est réuni ici pour faire vos achats en un clin d'œil.</p>
        </div>
      </section>

      <section className="steps">
        <Link to="/vitrine-offre" className="step">
          <span className="step-icon">⚡</span>
          <h3>Les offres du moment</h3>
          <p>Découvrez les promotions en cours avec les meilleures réductions.</p>
        </Link>
        <Link to="/" className="step">
          <span className="step-icon">🏪</span>
          <h3>Produits des boutiques</h3>
          <p>Parcourez les produits disponibles chez les boutiques partenaires.</p>
        </Link>
        <a
          className="step"
          href={whatsappLink(
            `Bonjour, je suis un client de Mboppi (${user.email}) et j'aimerais passer une commande.`
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="step-icon">💬</span>
          <h3>Commander sur WhatsApp</h3>
          <p>Contactez directement la centrale Mboppi pour commander.</p>
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
          <strong>Client</strong>
        </div>
        <div className="info-row">
          <span className="label">Inscrit le</span>
          <strong>{new Date(user.created_at).toLocaleDateString('fr-FR')}</strong>
        </div>
      </section>
    </main>
  );
}
