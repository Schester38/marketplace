import React, { useEffect, useState } from 'react';
import { useLang } from '../i18n.jsx';
import { isLite, setLite, weakConnection, useLite } from '../liteMode.js';

export default function LiteBanner() {
  const { t } = useLang();
  const { setLite: setLiteState } = useLite();
  const [show, setShow] = useState(false);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (!isLite() && weakConnection()) {
      setLiteState(true);
      setShow(true);
      setAuto(true);
    }
  }, [setLiteState]);

  if (!show) return null;
  return (
    <div className="lite-banner" role="status">
      <span>
        📶 {t('Connexion lente détectée — mode économie activé (images allégées).')}
      </span>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => setShow(false)}
      >
        {t('OK')}
      </button>
      {auto && (
        <button
          type="button"
          className="btn btn-small btn-outline"
          onClick={() => {
            setLite(false);
            setLiteState(false);
            setShow(false);
          }}
        >
          {t('Désactiver')}
        </button>
      )}
    </div>
  );
}