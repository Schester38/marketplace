import { useState } from 'react';
import Seo from '../components/Seo.jsx';
import { WHATSAPP_NUMBER, whatsappLink } from '../config.js';

const PHONE = '237679475343';

export default function Contact() {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = [
      subject ? `*${subject}*` : '',
      `Bonjour Mboppi, je suis ${name || 'un visiteur'}.`,
      message,
    ]
      .filter(Boolean)
      .join('\n\n');
    window.open(whatsappLink(text), '_blank');
  };

  return (
    <main className="container">
      <Seo
        title="Contact — Mboppi"
        description="Contactez l'équipe Mboppi : WhatsApp, téléphone ou formulaire. Nous vous répondons rapidement."
      />
      <section className="hero vitrine-hero">
        <span className="hero-badge">💬 Contact</span>
        <h1>Comment pouvons-nous vous aider ?</h1>
        <p>Une question, une suggestion, un souci ? Écrivez-nous, nous répondons vite.</p>
      </section>

      <div className="contact-grid">
        <div className="card">
          <h2>Nos coordonnées</h2>
          <div className="contact-item">
            <span className="contact-emoji">💬</span>
            <div>
              <h3>WhatsApp</h3>
              <p>Le moyen le plus rapide de nous joindre.</p>
              <a className="btn btn-whatsapp" href={whatsappLink('Bonjour Mboppi !')} target="_blank" rel="noopener noreferrer">
                Écrire sur WhatsApp
              </a>
            </div>
          </div>
          <div className="contact-item">
            <span className="contact-emoji">📞</span>
            <div>
              <h3>Téléphone</h3>
              <p>Appelez-nous aux heures de travail.</p>
              <a className="btn btn-outline" href={`tel:+${PHONE}`}>+237 679 47 53 43</a>
            </div>
          </div>
          <div className="contact-item">
            <span className="contact-emoji">📧</span>
            <div>
              <h3>E-mail</h3>
              <p>Pour les demandes écrites détaillées.</p>
              <a className="btn btn-outline" href="mailto:contact@mboppi.com">contact@mboppi.com</a>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Envoyer un message</h2>
          <p className="contact-hint">
            Votre message est transmis directement sur notre WhatsApp.
          </p>
          <form className="contact-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Votre nom</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. : Marie"
              />
            </label>
            <label className="field">
              <span>Sujet</span>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Choisir un sujet…</option>
                <option>Question sur une offre</option>
                <option>Je veux vendre sur Mboppi</option>
                <option>Problème de compte</option>
                <option>Autre</option>
              </select>
            </label>
            <label className="field">
              <span>Message</span>
              <textarea
                rows="4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Écrivez votre message ici…"
                required
              />
            </label>
            <button type="submit" className="btn btn-primary">Envoyer via WhatsApp</button>
          </form>
        </div>
      </div>
    </main>
  );
}
