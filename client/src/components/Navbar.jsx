import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import { LANGS, useLang } from '../i18n.jsx';
import { useCart, useFavs } from '../store.jsx';

function LangSwitcher() {
  const { lang, setLang, t } = useLang();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef(null);

  useEffect(() => {
    if (!langOpen) return;
    const onDoc = (e) => {
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [langOpen]);

  return (
    <div className="lang-wrap" ref={langRef}>
      <button
        className="lang-toggle"
        aria-label={t('Changer la langue du site')}
        title={t('Changer la langue du site')}
        onClick={() => setLangOpen(!langOpen)}
      >
        🌐 <span className="lang-current">{lang === 'ar' ? 'ع' : lang === 'en' ? 'EN' : 'FR'}</span>
      </button>
      {langOpen && (
        <ul className="lang-menu">
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                className={l.code === lang ? 'selected' : ''}
                onClick={() => {
                  setLang(l.code);
                  setLangOpen(false);
                }}
              >
                <span className="ss-flag">{l.flag}</span> {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Navbar({ onLogout }) {
  const { user } = useAuth();
  const { t } = useLang();
  const { cartCount } = useCart();
  const { favs } = useFavs();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const close = () => setOpen(false);
  const logout = () => {
    close();
    onLogout();
  };
  const roleLabel = user
    ? user.role === 'shop' ? t('boutique') : user.role === 'seller' ? t('vendeur') : user.role === 'client' ? t('client') : t('créateur')
    : '';

  const links = (
    <>
      <LangSwitcher />
      <button
        className="theme-toggle"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={t('Basculer le mode sombre ou clair')}
        title={theme === 'dark' ? t('Passer en mode clair') : t('Passer en mode sombre')}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <Link to="/" onClick={close}>{t('Produits')}</Link>
      <Link to="/vitrine-offre" onClick={close}>{t("Vitrine d'offre")}</Link>
      <Link to="/favoris" className="nav-icon-link" onClick={close} aria-label={t('Mes favoris')} title={t('Mes favoris')}>
        ❤️{favs.length > 0 && <span className="nav-badge">{favs.length}</span>}
      </Link>
      <Link to="/panier" className="nav-icon-link" onClick={close} aria-label={t('Mon panier')} title={t('Mon panier')}>
        🛒{cartCount > 0 && <span className="nav-badge">{cartCount}</span>}
      </Link>
      {!user && <Link to="/login" onClick={close}>{t('Connexion')}</Link>}
      {!user && <Link to="/register" className="btn btn-primary" onClick={close}>{t('Créer un compte')}</Link>}
      {user && user.role === 'shop' && <Link to="/shop" onClick={close}>{t('Ma boutique')}</Link>}
      {user && user.role === 'seller' && <Link to="/seller" onClick={close}>{t('Mon espace vendeur')}</Link>}
      {user && user.role === 'client' && <Link to="/client" onClick={close}>{t('Mon espace client')}</Link>}
      {user && user.role === 'creator' && <Link to="/creator" onClick={close}>{t('Mon espace créateur')}</Link>}
      {user && (
        <>
          <Link to="/compte" onClick={close}>{t('Mon compte')}</Link>
          <span className="user-chip">
            {user.name} ({roleLabel})
          </span>
          <button className="btn btn-outline" onClick={logout}>{t('Déconnexion')}</button>
        </>
      )}
    </>
  );

  return (
    <header className="navbar">
      <Link to="/" className="brand" onClick={close}>
        <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
        <span>Mboppi</span>
      </Link>

      <button
        className="hamburger"
        aria-label={t('Ouvrir le menu')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>

      <nav className="desktop-nav">{links}</nav>

      {open && <div className="drawer-overlay" onClick={close}></div>}
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer-header">
          <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
          <span>Mboppi</span>
          <button className="drawer-close" aria-label={t('Fermer le menu')} onClick={close}>✕</button>
        </div>
        <nav className="drawer-nav">{links}</nav>
      </aside>
    </header>
  );
}
