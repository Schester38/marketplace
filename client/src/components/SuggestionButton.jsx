import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { whatsappLink } from '../config.js';
import { useLang } from '../i18n.jsx';

export default function SuggestionButton({ onOpened }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    if (open && onOpened) {
      onOpened();
    }
  }, [open, onOpened]);

  const close = () => {
    setOpen(false);
    setText('');
  };

  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    window.open(whatsappLink(text.trim()), '_blank', 'noopener,noreferrer');
    close();
  };

  return (
    <>
      <button
        type="button"
        className="suggest-toggle"
        aria-label={t('Faire une suggestion')}
        title={t('Faire une suggestion')}
        onClick={() => setOpen(true)}
      >
        💡 <span>{t('Suggestion')}</span>
      </button>
      {open &&
        createPortal(
          <div className="modal-overlay suggest-overlay" onClick={close} role="dialog" aria-modal="true">
            <div className="modal suggest-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>💡 {t('Faire une suggestion')}</h3>
                <button type="button" className="drawer-close" aria-label={t('Fermer')} onClick={close}>✕</button>
              </div>
              <p className="hint">
                {t("Aidez-nous à améliorer Mboppi : votre message s'ouvrira dans WhatsApp.")}
              </p>
              <form onSubmit={send}>
                <textarea
                  className="msg-textarea"
                  rows="5"
                  maxLength="2000"
                  placeholder={t('Votre suggestion…')}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn btn-whatsapp btn-block"
                  disabled={!text.trim()}
                >
                  💚 {t('Envoyer sur WhatsApp')}
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}