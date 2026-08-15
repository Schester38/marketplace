import { Link } from 'react-router-dom';
import { useLang } from '../i18n.jsx';
import pkg from '../../package.json';

export default function Footer() {
  const { t } = useLang();
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
          <span>Mboppi</span>
        </div>
        <nav className="footer-nav">
          <Link to="/a-propos">{t('À propos')}</Link>
          <Link to="/createurs">🎨 {t('Créateurs')}</Link>
          <Link to="/faq">❓ {t('FAQ')}</Link>
          <Link to="/donnees">{t('Données & confidentialité')}</Link>
          <Link to="/cgv">{t('CGV')}</Link>
          <Link to="/cgu">{t('CGU')}</Link>
          <Link to="/mentions-legales">{t('Mentions légales')}</Link>
        </nav>
        <p className="footer-copy">
          © {new Date().getFullYear()} Mboppi. {t('Tous droits réservés.')}
        </p>
        <p className="footer-copy">
          v{pkg.version}
        </p>
      </div>
    </footer>
  );
}
