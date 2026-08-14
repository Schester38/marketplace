import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../i18n.jsx';

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
      <span className="back-btn-label">{t('Retour')}</span>
    </button>
  );
}