import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, dashboardPath } from '../App.jsx';
import { GoogleIcon } from '../components/icons.jsx';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'seller' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api.register(form);
      login(data.user, data.token);
      navigate(dashboardPath(data.user.role));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="container narrow">
      <div className="card form-card">
        <h2>Créer un compte</h2>
        <form onSubmit={submit}>
          <label>Je veux m'inscrire en tant que :</label>
          <div className="role-picker">
            <label className={`role-option ${form.role === 'shop' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="role"
                value="shop"
                checked={form.role === 'shop'}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <span>🏪 Boutique</span>
              <small>Je publie mes produits (max 5) et je fixe les commissions</small>
            </label>
            <label className={`role-option ${form.role === 'seller' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="role"
                value="seller"
                checked={form.role === 'seller'}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <span>🛒 Vendeur</span>
              <small>Je vends les produits des boutiques et je gagne des commissions</small>
            </label>
            <label className={`role-option ${form.role === 'client' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="role"
                value="client"
                checked={form.role === 'client'}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <span>🛍️ Client</span>
              <small>Je consulte les offres et les produits, je commande facilement</small>
            </label>
          </div>

          <label>Nom complet / Nom de la boutique</label>
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <label>Email</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label>Mot de passe (6 caractères minimum)</label>
          <input
            className="input"
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block">S'inscrire</button>

          <div className="divider"><span>ou</span></div>
          <button
            type="button"
            className="btn btn-google btn-block"
            onClick={() => {
              window.location.href = `/api/auth/google?role=${form.role}`;
            }}
          >
            <GoogleIcon />
            S'inscrire avec Google
          </button>
        </form>
        <p className="hint">
          Déjà inscrit ? <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </main>
  );
}
