import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { GoogleIcon } from '../components/icons.jsx';
import Seo from '../components/Seo.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { COUNTRIES } from '../config.js';
import { useLang } from '../i18n.jsx';
import { getRecaptchaToken } from '../recaptcha.js';

export default function Register() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refCode = (searchParams.get('ref') || '').trim().toUpperCase();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: refCode ? 'client' : 'seller',
    country: '',
  });
  const [error, setError] = useState('');

  const countryOptions = COUNTRIES.map((c) => ({ value: c.name, label: c.name, flag: c.flag }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.country) {
      setError(t('Veuillez remplir tous les champs.'));
      return;
    }
    const trySubmit = async (remaining) => {
      try {
        const recaptchaToken = await getRecaptchaToken('register');
        const data = await api.register({ ...form, recaptchaToken, ref: refCode || undefined });
        login(data.user, data.token);
        localStorage.setItem('mboppi_welcome', 'register');
        navigate('/');
        return true;
      } catch (err) {
        if (remaining > 0 && /recaptcha|anti-robot|vérification/i.test(err.message)) {
          await new Promise((r) => setTimeout(r, 1200));
          return trySubmit(remaining - 1);
        }
        setError(err.message);
        return false;
      }
    };
    await trySubmit(2);
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

          {refCode && (
            <div className="card referral-banner">
              <p className="hint" style={{ margin: 0 }}>
                🎁 {t('Vous vous inscrivez via le lien d\'un vendeur Mboppi : votre inscription est gratuite, le rôle « Client » est sélectionné pour vous.')}
              </p>
              <label style={{ marginTop: 10 }}>{t('Code du vendeur (parrainage)')}</label>
              <input
                className="input code-input"
                value={refCode}
                onChange={(e) => navigate(`/register${e.target.value ? `?ref=${encodeURIComponent(e.target.value.toUpperCase())}` : ''}`, { replace: true })}
                maxLength="6"
              />
            </div>
          )}

          {!refCode && (
            <>
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
            </>
          )}

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
              const params = new URLSearchParams({ role: refCode ? 'client' : form.role, country: form.country || '' });
              if (refCode) params.set('ref', refCode);
              window.location.href = `/api/auth/google?${params.toString()}`;
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
