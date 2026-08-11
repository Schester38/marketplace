import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../i18n.jsx';
import { useCart, useFavs } from '../store.jsx';

export default function BottomNav() {
  const { t } = useLang();
  const { cartCount } = useCart();
  const { favs } = useFavs();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const focusSearch = () => {
    const el = document.querySelector('.hero-search input');
    if (el) {
      el.focus();
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        /* anciens navigateurs */
      }
    }
  };

  const goSearch = () => {
    if (path === '/') {
      focusSearch();
      return;
    }
    navigate('/');
    setTimeout(focusSearch, 500);
  };

  const item = (to, label, emoji, count, active) => (
    <Link
      to={to}
      className={path === to ? 'active' : ''}
      aria-label={label}
      aria-current={path === to ? 'page' : undefined}
    >
      <span className="bn-icon">
        {emoji}
        {count > 0 && <span className="nav-badge">{count > 99 ? '99+' : count}</span>}
      </span>
      <span className="bn-label">{label}</span>
    </Link>
  );

  return (
    <nav className="bottom-nav" aria-label={t('Menu principal')}>
      {item('/', t('Accueil'), '🏠', 0, path === '/')}
      <button
        className={path === '/' ? 'active' : ''}
        onClick={goSearch}
        aria-label={t('Recherche')}
      >
        <span className="bn-icon">🔍</span>
        <span className="bn-label">{t('Recherche')}</span>
      </button>
      {item('/contact', t('Contact'), '💬', 0, path === '/contact')}
      {item('/favoris', t('Favoris'), '❤️', favs.length, path === '/favoris')}
      {item('/panier', t('Panier'), '🛒', cartCount, path === '/panier')}
    </nav>
  );
}
