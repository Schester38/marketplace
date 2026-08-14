import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../i18n.jsx';

const NO_BACK_PATHS = ['/', '/shop', '/seller', '/client', '/creator', '/livreur', '/admin'];

export default function BackButton() {
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const navs = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    navs.current += 1;
  }, [location.key]);

  if (NO_BACK_PATHS.includes(location.pathname)) return null;

  const goBack = () => {
    if (navs.current > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <button
      type="button"
      className="back-btn"
      onClick={goBack}
      aria-label={t('Retour')}
      title={t('Retour')}
    >
      <span className="back-btn-icon" aria-hidden="true">←</span>
    </button>
  );
}