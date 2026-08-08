import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';

export default function Navbar({ onLogout }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);
  const logout = () => {
    close();
    onLogout();
  };

  const links = (
    <>
      <Link to="/" onClick={close}>Produits</Link>
      <Link to="/vitrine-offre" onClick={close}>Vitrine d'offre</Link>
      <Link to="/a-propos" onClick={close}>À propos</Link>
      <Link to="/contact" onClick={close}>Contact</Link>
      {!user && <Link to="/login" onClick={close}>Connexion</Link>}
      {!user && <Link to="/register" className="btn btn-primary" onClick={close}>Créer un compte</Link>}
      {user && user.role === 'shop' && <Link to="/shop" onClick={close}>Ma boutique</Link>}
      {user && user.role === 'seller' && <Link to="/seller" onClick={close}>Mon espace vendeur</Link>}
      {user && user.role === 'client' && <Link to="/client" onClick={close}>Mon espace client</Link>}
      {user && user.role === 'creator' && <Link to="/creator" onClick={close}>Mon espace créateur</Link>}
      {user && (
        <>
          <Link to="/compte" onClick={close}>Mon compte</Link>
          <span className="user-chip">
            {user.name} ({user.role === 'shop' ? 'boutique' : user.role === 'seller' ? 'vendeur' : user.role === 'client' ? 'client' : 'créateur'})
          </span>
          <button className="btn btn-outline" onClick={logout}>Déconnexion</button>
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
        aria-label="Ouvrir le menu"
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
          <button className="drawer-close" aria-label="Fermer le menu" onClick={close}>✕</button>
        </div>
        <nav className="drawer-nav">{links}</nav>
      </aside>
    </header>
  );
}
