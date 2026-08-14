import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, dashboardPath } from '../App.jsx';
import { GoogleIcon } from '../components/icons.jsx';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';
import { getRecaptchaToken } from '../recaptcha.js';

export default function Login() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const recaptchaToken = await getRecaptchaToken('login');
      const data = await api.login({ ...form, recaptchaToken });
      login(data.user, data.token);
      localStorage.setItem('mboppi_welcome', 'login');
      navigate(dashboardPath(data.user.role));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="container narrow">
      <Seo title={t('Connexion') + ' — Mboppi'} description={t('Connexion à Mboppi')} noindex/>
      <div className="card form-card">
        <div className="auth-brand">🛍️</div>
        <h2>{t('Connexion')}</h2>

        <form onSubmit={submit}>
          <label>{t('Email')}</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label>{t('Mot de passe')}</label>
          <input
            className="input"
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block">{t('Se connecter')}</button>
        </form>

        <div className="divider"><span>{t('ou')}</span></div>
        <button
          type="button"
          className="btn btn-google btn-block"
          onClick={() => {
            window.location.href = '/api/auth/google';
          }}
        >
          <GoogleIcon />
          {t('Se connecter avec Google')}
        </button>
        <p className="hint">
          {t('Pas encore de compte ?')} <Link to="/register">{t('Créer un compte')}</Link>
        </p>
      </div>
    </main>
  );
}
