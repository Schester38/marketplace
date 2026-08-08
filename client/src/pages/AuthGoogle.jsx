import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, dashboardPath } from '../App.jsx';
import Seo from '../components/Seo.jsx';
import { useLang } from '../i18n.jsx';

export default function AuthGoogle() {
  const { login } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const token = params.get('token');
    const err = params.get('error');
    if (err) {
      setError(err);
      return;
    }
    if (!token) {
      setError('Retour Google invalide. Réessayez.');
      return;
    }
    done.current = true;
    localStorage.setItem('token', token);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Le serveur met trop de temps à répondre. Réessayez.')), 15000)
    );
    Promise.race([api.me(), timeout])
      .then((data) => {
        login(data.user, token);
        navigate(dashboardPath(data.user.role), { replace: true });
      })
      .catch((e) => {
        localStorage.removeItem('token');
        setError(e.message);
      });
  }, [params, login, navigate]);

  return (
    <main className="container narrow">
      <Seo title={t('Connexion en cours…') + ' — Mboppi'} description={t('Connexion en cours…')} />
      <div className="card form-card page-center">
        <div className="auth-brand">🛍️</div>
        {error ? (
          <>
            <p className="error" style={{ textAlign: 'center' }}>{error}</p>
            <p className="hint">
              <Link to="/register">{t('Retour à l\'inscription')}</Link> ·{' '}
              <Link to="/login">{t('Se connecter')}</Link>
            </p>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p className="hint">{t('Connexion en cours…')}</p>
          </>
        )}
      </div>
    </main>
  );
}
