import React, { useEffect, useState } from 'react';
import { useLang } from '../i18n.jsx';

export default function PwaInstallButton() {
  const { t } = useLang();
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setInstalled(standalone);
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;

  if (installed) return null;
  if (!deferred && !isIOS) return null;

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setDeferred(null);
    } else if (isIOS) {
      setShowIos(true);
    }
  };

  return (
    <>
      <button className="btn btn-install" onClick={install}>
        📲 {t('Installer')}
      </button>
      {showIos && (
        <div className="modal-overlay" onClick={() => setShowIos(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📲 {t("Installer l'application")}</h3>
              <button className="drawer-close" onClick={() => setShowIos(false)}>✕</button>
            </div>
            <p className="hint">{t("Sur iPhone ou iPad : touchez Partager puis « Ajouter à l'écran d'accueil ».")}</p>
          </div>
        </div>
      )}
    </>
  );
}
