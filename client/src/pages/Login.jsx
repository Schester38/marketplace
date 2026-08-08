import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { GoogleIcon } from '../components/icons.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api.login(form);
      login(data.user, data.token);
      navigate(data.user.role === 'shop' ? '/shop' : '/seller');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="container narrow">
      <div className="card form-card">
        <h2>Connexion</h2>
        <form onSubmit={submit}>
          <label>Email</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label>Mot de passe</label>
          <input
            className="input"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block">Se connecter</button>

          <div className="divider"><span>ou</span></div>
          <button
            type="button"
            className="btn btn-google btn-block"
            onClick={() => {
              window.location.href = '/api/auth/google';
            }}
          >
            <GoogleIcon />
            Se connecter avec Google
          </button>
        </form>
        <p className="hint">
          Pas encore de compte ? <Link to="/register">Créer un compte</Link>
        </p>
      </div>
    </main>
  );
}
