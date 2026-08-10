import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, dashboardPath } from '../App.jsx';
import { GoogleIcon } from '../components/icons.jsx';
import Seo from '../components/Seo.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { COUNTRIES } from '../config.js';
import { useLang } from '../i18n.jsx';

export default function Register() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'seller', country: '' });
  const [error, setError] = useState('');

  const countryOptions = COUNTRIES.map((c) => ({ value: c.name, label: c.name, flag: c.flag }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.country) {
      setError(t('Veuillez remplir tous les champs.'));
      return;
    }
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
      <Seo
        title={t('Créer un compte') + ' — Mboppi'}
        description={t('Inscription') + ' : ' + t('Boutique (shop)') + ', vendeur, client ou créateur.'}
      />
      <div className="card form-card">
        <div className="auth-brand">🛍️</div>
        <h2>{t('Créer un compte')}</h2>

        <form onSubmit={submit}>
          <label>{t('Pays *')}</label>
          <SearchSelect
            options={countryOptions}
            value={form.country}
            onChange={(v) => setForm({ ...form, country: v })}
            placeholder={t('Choisir votre pays…')}
            emptyLabel={t('Aucun résultat')}
          />

          <label>{t('Je veux m\'inscrire en tant que :')}</label>
          <div className="role-picker">
            <label className={`role-option ${form.role === 'shop' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="role"
                value="shop"
                checked={form.role === 'shop'}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <span>🏪 {t('Boutique')}</span>
              <small>{t('Je publie mes produits (max 5) et je fixe les commissions')}</small>
            </label>
            <label className={`role-option ${form.role === 'seller' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="role"
                value="seller"
                checked={form.role === 'seller'}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <span>🛒 {t('Vendeur')}</span>
              <small>{t('Je vends les produits des boutiques et je gagne des commissions')}</small>
            </label>
            <label className={`role-option ${form.role === 'client' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="role"
                value="client"
                checked={form.role === 'client'}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <span>🛍️ {t('Client')}</span>
              <small>{t('Je consulte les offres et les produits, je commande facilement')}</small>
            </label>
            <label className={`role-option ${form.role === 'creator' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="role"
                value="creator"
                checked={form.role === 'creator'}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <span>🎨 {t('Créateur')}</span>
              <small>{t('Je présente et vends mes créations au marché Mboppi')}</small>
            </label>
          </div>

          <label>{t('Nom complet / Nom de la boutique')}</label>
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <label>{t('Email')}</label>
          <input
            className="input"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label>{t('Mot de passe (6 caractères minimum)')}</label>
          <input
            className="input"
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary btn-block">{t("S'inscrire")}</button>
          <div className="divider"><span>{t('ou')}</span></div>
          <button
            type="button"
            className="btn btn-google btn-block"
            onClick={() => {
              window.location.href = `/api/auth/google?role=${form.role}&country=${encodeURIComponent(form.country || '')}`;
            }}
          >
            <GoogleIcon />
            {t("S'inscrire avec Google")}
          </button>
        </form>
        <p className="hint">
          {t('Déjà inscrit ?')} <Link to="/login">{t('Se connecter')}</Link>
        </p>
      </div>
    </main>
  );
}
