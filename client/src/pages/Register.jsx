import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, dashboardPath } from '../App.jsx';
import { GoogleIcon } from '../components/icons.jsx';
import Seo from '../components/Seo.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import { COUNTRIES } from '../config.js';
import { useLang } from '../i18n.jsx';

const COOLDOWN = 60;

export default function Register() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [mode, setMode] = useState('email');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'seller', country: '', phone: '' });
  const [otp, setOtp] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [info, setInfo] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  const countryOptions = COUNTRIES.map((c) => ({ value: c.name, label: c.name, flag: c.flag }));

  const startCooldown = () => {
    setCooldown(COOLDOWN);
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timer.current); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.country) {
      setError(t('Veuillez remplir tous les champs.'));
      return;
    }
    if (mode === 'phone') {
      if (!codeSent) return requestOtp();
      return submitOtp();
    }
    try {
      const data = await api.register(form);
      login(data.user, data.token);
      navigate(dashboardPath(data.user.role));
    } catch (err) {
      setError(err.message);
    }
  };

  const requestOtp = async () => {
    setError('');
    setInfo('');
    setDevCode('');
    setWaiting(true);
    try {
      const data = await api.otpRequest({ phone: form.phone, purpose: 'register', name: form.name, role: form.role, country: form.country });
      setCodeSent(true);
      setInfo(t('Code envoyé par WhatsApp au numéro {phone}.', { phone: form.phone }));
      if (data.dev_code) setDevCode(data.dev_code);
      startCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setWaiting(false);
    }
  };

  const submitOtp = async () => {
    try {
      const data = await api.otpVerify({ phone: form.phone, code: otp, name: form.name, role: form.role, country: form.country });
      login(data.user, data.token);
      navigate(dashboardPath(data.user.role));
    } catch (err) {
      setError(err.message);
    }
  };

  const showPhone = mode === 'phone';

  return (
    <main className="container narrow">
      <Seo
        title={t('Créer un compte') + ' — Mboppi'}
        description={t('Inscription') + ' : ' + t('Boutique (shop)') + ', vendeur, client ou créateur.'}
      />
      <div className="card form-card">
        <div className="auth-brand">🛍️</div>
        <h2>{t('Créer un compte')}</h2>

        <div className="auth-tabs">
          <button type="button" className={mode === 'email' ? 'active' : ''} onClick={() => { setMode('email'); setError(''); setInfo(''); }}>
            ✉️ {t('Email')}
          </button>
          <button type="button" className={mode === 'phone' ? 'active' : ''} onClick={() => { setMode('phone'); setError(''); setInfo(''); }}>
            📱 {t('Téléphone')}
          </button>
        </div>

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
            <label className={`role-option ${form.role === 'livreur' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="role"
                value="livreur"
                checked={form.role === 'livreur'}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
              <span>🛵 {t('Livreur')}</span>
              <small>{t('Je livre les articles commandés et je confirme l\'achat')}</small>
            </label>
          </div>

          <label>{t('Nom complet / Nom de la boutique')}</label>
          <input
            className="input"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          {!showPhone && (
            <>
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
            </>
          )}

          {showPhone && (
            <>
              <label>{t('Numéro de téléphone')}</label>
              <input
                className="input"
                type="tel"
                required
                placeholder="ex : +237 6 90 00 00 00"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              {!codeSent ? (
                <button type="submit" className="btn btn-google btn-block" disabled={waiting}>
                  {waiting ? t('Envoi…') : t('Recevoir le code par WhatsApp')}
                </button>
              ) : null}
              {devCode && (
                <p className="hint dev-code">{t('Mode démo : votre code est {code}', { code: devCode })}</p>
              )}
              {info && <p className="success">{info}</p>}
              {error && <p className="error">{error}</p>}
              {codeSent && (
                <>
                  <label>{t('Code reçu (6 chiffres)')}</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  />
                  <button type="submit" className="btn btn-primary btn-block" disabled={otp.length !== 6}>{t("S'inscrire")}</button>
                  <button type="button" className="btn btn-google btn-block" disabled={cooldown > 0} onClick={requestOtp}>
                    {cooldown > 0 ? `${t('Renvoyer le code')} (${cooldown}s)` : t('Renvoyer le code')}
                  </button>
                </>
              )}
              {!codeSent && error && <p className="error">{error}</p>}
            </>
          )}

          {!showPhone && (
            <>
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
            </>
          )}
        </form>
        <p className="hint">
          {t('Déjà inscrit ?')} <Link to="/login">{t('Se connecter')}</Link>
        </p>
      </div>
    </main>
  );
}
