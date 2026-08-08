import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../App.jsx';

export default function Navbar({ onLogout }) {
  const { user } = useAuth();
  return (
    <header className="navbar">
      <Link to="/" className="brand">
        <img src="/navbar-logo.png" alt="Mboppi" className="brand-logo" />
        <span>Mboppi</span>
      </Link>
      <nav>
        <Link to="/">Produits</Link>
        <Link to="/vitrine-offre">Vitrine d'offre</Link>
        <Link to="/verone">Verone</Link>
        {!user && <Link to="/login">Connexion</Link>}
        {!user && <Link to="/register" className="btn btn-primary">Créer un compte</Link>}
        {user && user.role === 'shop' && <Link to="/shop">Ma boutique</Link>}
        {user && user.role === 'seller' && <Link to="/seller">Mon espace vendeur</Link>}
        {user && (
          <>
            <span className="user-chip">{user.name} ({user.role === 'shop' ? 'boutique' : 'vendeur'})</span>
            <button className="btn btn-outline" onClick={onLogout}>Déconnexion</button>
          </>
        )}
      </nav>
    </header>
  );
}
