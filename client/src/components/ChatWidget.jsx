import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';

const MAX_CONTEXT = 12;

export default function ChatWidget() {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef(null);
  const firstRef = useRef(true);

  const langKey = lang === 'en' ? 'en' : lang === 'ar' ? 'ar' : 'fr';

  const greeting = t('Bonjour 👋 Je suis l\'assistant Mboppi. Posez-moi vos questions sur la boutique, les commandes, les paiements ou la livraison !');

  useEffect(() => {
    setMessages([{ role: 'bot', text: greeting }]);
    firstRef.current = true;
  }, [langKey]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, open]);

  const send = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || typing) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setTyping(true);
    setUnread(0);
    try {
      const history = messages
        .slice(-MAX_CONTEXT)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
      const d = await api.chat({ message: text, history, lang: langKey });
      setMessages((prev) => [...prev, { role: 'bot', text: d.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: t('Une erreur est survenue. Réessayez ou contactez-nous via la page Contact.') },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && firstRef.current) {
      firstRef.current = false;
      setUnread(0);
    }
    if (!next) {
      setUnread((u) => u + (typing ? 0 : 1));
    }
  };

  const suggestions = [
    t('Comment commander ?'),
    t('Comment payer ?'),
    t('Comment suivre ma commande ?'),
    t('Comment devenir vendeur ?'),
  ];

  return (
    <>
      {open && (
        <div className="chat-panel" role="dialog" aria-label={t('Assistant Mboppi')}>
          <div className="chat-header">
            <div className="chat-header-title">
              <span className="chat-avatar">🤖</span>
              <div>
                <strong>{t('Assistant Mboppi')}</strong>
                <span className="chat-status">● {t('En ligne')}</span>
              </div>
            </div>
            <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label={t('Fermer')}>
              ✕
            </button>
          </div>

          <div className="chat-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role === 'user' ? 'chat-msg-user' : 'chat-msg-bot'}`}>
                {m.text}
              </div>
            ))}
            {typing && (
              <div className="chat-msg chat-msg-bot chat-typing">
                <span className="dot"></span><span className="dot"></span><span className="dot"></span>
              </div>
            )}
          </div>

          {messages.length <= 2 && (
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s} type="button" className="chat-chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('Écrivez votre question…')}
              maxLength={2000}
            />
            <button className="btn btn-primary chat-send" type="submit" disabled={typing || !input.trim()} aria-label={t('Envoyer')}>
              ➤
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className={`chat-bubble ${open ? 'chat-bubble-open' : ''}`}
        onClick={toggle}
        aria-label={t('Assistant Mboppi')}
      >
        {open ? '✕' : '💬'}
        {!open && unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>
    </>
  );
}
