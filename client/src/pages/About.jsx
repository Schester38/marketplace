import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';

export default function About() {
  return (
    <main className="container">
      <Seo
        title="À propos — Mboppi"
        description="Découvrez Mboppi : le marché de votre quartier en ligne. Boutiques, vendeurs, clients et créateurs réunis sur une même plateforme."
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">🛍️ À propos</span>
        <h1>Mboppi, le marché de votre quartier, en ligne</h1>
        <p>
          Mboppi est née d'une idée simple : permettre à chacun de vendre et d'acheter
          près de chez soi, sans commission écrasante et sans dépendre des grands sites.
          Ici, les boutiques publient leurs produits, les vendeurs gagnent des
          commissions, les créateurs exposent leurs talents et les clients trouvent
          tout au même endroit.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn btn-primary">Créer un compte gratuit</Link>
          <Link to="/vitrine-offre" className="btn btn-outline">Voir les offres</Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Comment ça marche ?</h2>
          <p>Un rôle pour chacun, une plateforme pour tous.</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-icon">🏪</div>
            <div className="step-num">1</div>
            <h3>Boutique</h3>
            <p>Publiez vos produits et recevez les commandes de vos clients.</p>
          </div>
          <div className="step">
            <div className="step-icon">🛒</div>
            <div className="step-num">2</div>
            <h3>Vendeur</h3>
            <p>Vendez en ligne et gagnez une commission sur chaque vente.</p>
          </div>
          <div className="step">
            <div className="step-icon">🛍️</div>
            <div className="step-num">3</div>
            <h3>Client</h3>
            <p>Parcourez les offres du moment et commandez en un clic.</p>
          </div>
          <div className="step">
            <div className="step-icon">🎨</div>
            <div className="step-num">4</div>
            <h3>Créateur</h3>
            <p>Exposez vos créations et touchez un public plus large.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Nos valeurs</h2>
          <p>Ce qui nous pousse chaque jour.</p>
        </div>
        <div className="steps">
          <div className="step">
            <div className="step-icon">🤝</div>
            <h3>La confiance</h3>
            <p>Des commandes simples, des contacts directs avec les vendeurs.</p>
          </div>
          <div className="step">
            <div className="step-icon">📱</div>
            <h3>La proximité</h3>
            <p>Commander par WhatsApp, sans carte bancaire ni frais cachés.</p>
          </div>
          <div className="step">
            <div className="step-icon">⚡</div>
            <h3>La rapidité</h3>
            <p>Une plateforme légère, qui s'affiche vite, même en 3G.</p>
          </div>
        </div>
      </section>

      <section className="section cta-section">
        <h2>Prêt à rejoindre l'aventure ?</h2>
        <p>Créez votre compte gratuitement en moins d'une minute.</p>
        <Link to="/register" className="btn btn-primary">Créer mon compte</Link>
      </section>
    </main>
  );
}
