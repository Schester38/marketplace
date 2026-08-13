import { useState } from 'react';
import Seo from '../components/Seo.jsx';
import { WHATSAPP_NUMBER, whatsappLink } from '../config.js';
import { useLang } from '../i18n.jsx';

const PHONE = '237672886348';

export default function Contact() {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = [
      subject ? `*${subject}*` : '',
      t('Bonjour Mboppi, je suis {name}.', { name: name || t('un visiteur') }),
      message,
    ]
      .filter(Boolean)
      .join('\n\n');
    window.open(whatsappLink(text), '_blank');
  };

  return (
    <main className="container">
      <Seo
        title={t('Contact') + ' — Mboppi'}
        description={t('Une question, un problème ou une suggestion ? Écrivez-nous, nous répondons rapidement.')}
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">💬 {t('Contact')}</span>
        <h1>{t('Comment pouvons-nous vous aider ?')}</h1>
        <p>{t('Une question, une suggestion, un souci ? Écrivez-nous, nous répondons vite.')}</p>
      </section>

      <div className="contact-grid">
        <div className="card">
          <h2>{t('Nos coordonnées')}</h2>
          <div className="contact-item">
            <span className="contact-emoji">💬</span>
            <div>
              <h3>WhatsApp</h3>
              <p>{t('Le moyen le plus rapide de nous joindre.')}</p>
              <a className="btn btn-whatsapp" href={whatsappLink('Bonjour Mboppi !')} target="_blank" rel="noopener noreferrer">
                {t('Écrire sur WhatsApp')}
              </a>
            </div>
          </div>
          <div className="contact-item">
            <span className="contact-emoji">📞</span>
            <div>
              <h3>{t('Téléphone')}</h3>
              <p>{t('Appelez-nous aux heures de travail.')}</p>
              <a className="btn btn-outline" href={`tel:+${PHONE}`}>+237 672 88 63 48</a>
            </div>
          </div>
          <div className="contact-item">
            <span className="contact-emoji">📧</span>
            <div>
              <h3>E-mail</h3>
              <p>{t('Pour les demandes écrites détaillées.')}</p>
              <a className="btn btn-outline" href="mailto:mboppishop@gmail.com">contact@mboppi.com</a>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>{t('Envoyer un message')}</h2>
          <p className="contact-hint">
            {t('Votre message est transmis directement sur notre WhatsApp.')}
          </p>
          <form className="contact-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>{t('Votre nom')}</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. : Marie"
              />
            </label>
            <label className="field">
              <span>{t('Sujet')}</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">{t('Choisir un sujet…')}</option>
                <option>{t('Question sur une offre')}</option>
                <option>{t('Je veux vendre sur Mboppi')}</option>
                <option>{t('Problème de compte')}</option>
                <option>{t('Autre')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('Message')}</span>
              <textarea
                rows="4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('Écrivez votre message ici…')}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary">{t('Envoyer via WhatsApp')}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
