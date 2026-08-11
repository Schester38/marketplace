import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../i18n.jsx';

export default function CookiesBanner() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('mboppi_cookies')) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem('mboppi_cookies', 'ok');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookies-banner" role="dialog" aria-label={t('Cookies')}>
      <p>
        🍪 {t('Mboppi utilise des cookies pour améliorer votre expérience (thème, langue, panier). Nous ne vendons aucune donnée.')}{' '}
        <Link to="/donnees" onClick={accept}>{t('En savoir plus')}</Link>
      </p>
      <button type="button" className="btn btn-primary" onClick={accept}>{t('Accepter')}</button>
    </div>
  );
}
