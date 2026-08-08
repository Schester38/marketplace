import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function AuthGoogle() {
  const { login } = useAuth();
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
    api
      .me()
      .then((data) => {
        login(data.user, token);
        navigate(data.user.role === 'shop' ? '/shop' : '/seller', { replace: true });
      })
      .catch((e) => {
        localStorage.removeItem('token');
        setError(e.message);
      });
  }, [params, login, navigate]);

  return (
    <main className="container narrow">
      <div className="card form-card page-center">
        {error ? (
          <>
            <p className="error" style={{ textAlign: 'center' }}>{error}</p>
            <p className="hint">
              <Link to="/register">Retour à l'inscription</Link> ·{' '}
              <Link to="/login">Se connecter</Link>
            </p>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p className="hint">Connexion en cours…</p>
          </>
        )}
      </div>
    </main>
  );
}
