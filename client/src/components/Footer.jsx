import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
          <span>Mboppi</span>
        </div>
        <nav className="footer-nav">
          <Link to="/a-propos">À propos</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <p className="footer-copy">
          © {new Date().getFullYear()} Mboppi — Le marché de votre quartier en ligne
        </p>
      </div>
    </footer>
  );
}
