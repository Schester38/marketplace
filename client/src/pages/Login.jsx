import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, dashboardPath } from '../App.jsx';
import { GoogleIcon } from '../components/icons.jsx';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

const COOLDOWN = 60;

export default function Login() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [mode, setMode] = useState('email');
  const [form, setForm] = useState({ email: '', password: '', phone: '' });
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devCode, setDevCode] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

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
    try {
      const data = await api.login(form);
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
      const data = await api.otpRequest({ phone: form.phone, purpose: 'login' });
      setInfo(t('Code envoyé par WhatsApp au numéro {phone}.', { phone: form.phone }));
      if (data.dev_code) setDevCode(data.dev_code);
      startCooldown();
    } catch (err) {
      setError(err.message);
    } finally {
      setWaiting(false);
    }
  };

  const submitOtp = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await api.otpVerify({ phone: form.phone, code: otp });
      login(data.user, data.token);
      navigate(dashboardPath(data.user.role));
    } catch (err) {
      setError(err.message);
    }
  };

  const showPhone = mode === 'phone';

  return (
    <main className="container narrow">
      <Seo title={t('Connexion') + ' — Mboppi'} description={t('Connexion à Mboppi')} />
      <div className="card form-card">
        <div className="auth-brand">🛍️</div>
        <h2>{t('Connexion')}</h2>

        <div className="auth-tabs">
          <button type="button" className={mode === 'email' ? 'active' : ''} onClick={() => { setMode('email'); setError(''); setInfo(''); }}>
            ✉️ {t('Email')}
          </button>
          <button type="button" className={mode === 'phone' ? 'active' : ''} onClick={() => { setMode('phone'); setError(''); setInfo(''); }}>
            📱 {t('Téléphone')}
          </button>
        </div>

        {!showPhone && (
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
        )}

        {showPhone && (
          <form onSubmit={submitOtp}>
            <label>{t('Numéro de téléphone')}</label>
            <input
              className="input"
              type="tel"
              required
              placeholder="ex : +237 6 90 00 00 00"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <button type="button" className="btn btn-google btn-block" disabled={waiting || cooldown > 0} onClick={requestOtp}>
              {waiting ? t('Envoi…') : cooldown > 0 ? `${t('Renvoyer le code')} (${cooldown}s)` : t('Recevoir le code par WhatsApp')}
            </button>
            {devCode && (
              <p className="hint dev-code">{t('Mode démo : votre code est {code}', { code: devCode })}</p>
            )}
            {info && <p className="success">{info}</p>}
            {error && <p className="error">{error}</p>}
            {info && !error && (
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
                <button className="btn btn-primary btn-block">{t('Se connecter')}</button>
              </>
            )}
          </form>
        )}

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
