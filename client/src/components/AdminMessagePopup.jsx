import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { useLang } from '../i18n.jsx';

export default function AdminMessagePopup() {
  const { user } = useAuth();
  const { t } = useLang();
  const [message, setMessage] = useState(null);
  const [done, setDone] = useState(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!user || done) return;
    if (pendingRef.current) return;
    pendingRef.current = true;
    let cancelled = false;
    api
      .popupMessage()
      .then((d) => {
        if (!cancelled && d.message) setMessage(d.message);
      })
      .catch(() => {})
      .finally(() => {
        pendingRef.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [user, done]);

  if (!user || !message || done) return null;

  const close = () => {
    if (!message) return;
    const id = message.id;
    setMessage(null);
    setDone(true);
    api.ackMessage(id).catch(() => {});
  };

  return (
    <div className="modal-overlay" onClick={close} role="dialog" aria-modal="true">
      <div className="modal admin-msg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💬 {t('Message de l\'équipe Mboppi')}</h3>
          <button type="button" className="drawer-close" aria-label={t('Fermer')} onClick={close}>✕</button>
        </div>
        <p className="admin-msg-text">{message.message}</p>
        <div className="admin-msg-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={close}>
            {t('Compris')} ✓
          </button>
        </div>
      </div>
    </div>
  );
}