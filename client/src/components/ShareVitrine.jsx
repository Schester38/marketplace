import React, { useState } from 'react';
import { useLang } from '../i18n.jsx';

const VITRINE_URL = 'https://mboppi-mboppi.vercel.app/vitrine-offre';

function shareMessage(t) {
  return t('✨ **Une offre pour presque chaque besoin !**\n🔥 Découvrez ma vitrine et explorez une sélection d\'offres et de solutions dans plusieurs domaines.\n\nQue tu recherches une opportunité, un service, un produit ou simplement quelque chose d\'intéressant à découvrir, **tu pourrais bien trouver ton bonheur.** 👀\n\n👉 **Découvre la vitrine ici :**\n🔗 {url}\n\n🚀 *Un clic, plusieurs possibilités !*', { url: VITRINE_URL });
}

function openUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function ShareVitrine({ onClose }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const msg = shareMessage(t);

  const shareNative = async () => {
    try {
      await navigator.share({ title: t('Ma vitrine Mboppi'), text: msg, url: VITRINE_URL });
      onClose();
    } catch {
      /* annulé par l'utilisateur */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible */
    }
  };

  const encoded = encodeURIComponent(msg);
  const encodedUrl = encodeURIComponent(VITRINE_URL);

  const networks = [
    {
      name: 'WhatsApp',
      color: '#25D366',
      icon: '💬',
      onClick: () => openUrl(`https://wa.me/?text=${encoded}`),
    },
    {
      name: 'Facebook',
      color: '#1877F2',
      icon: '📘',
      onClick: () => openUrl(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encoded}`),
    },
    {
      name: 'Telegram',
      color: '#26A5E4',
      icon: '✈️',
      onClick: () => openUrl(`https://t.me/share/url?url=${encodedUrl}&text=${encoded}`),
    },
    {
      name: 'X (Twitter)',
      color: '#000000',
      icon: '🐦',
      onClick: () => openUrl(`https://twitter.com/intent/tweet?text=${encoded}&url=${encodedUrl}`),
    },
    {
      name: 'E-mail',
      color: '#EA4335',
      icon: '📧',
      onClick: () => openUrl(`mailto:?subject=${encodeURIComponent(t('Découvre ma vitrine Mboppi'))}&body=${encoded}`),
    },
    {
      name: t('Copier le lien'),
      color: '#6b7280',
      icon: copied ? '✅' : '🔗',
      onClick: copyLink,
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t('Partager ma vitrine')}</h3>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {navigator.share && (
          <button className="btn btn-primary btn-block" onClick={shareNative}>
            {t('📲 Partager via l\'appareil')}
          </button>
        )}

        <div className="share-grid">
          {networks.map((n) => (
            <button
              key={n.name}
              className="share-btn"
              style={{ '--share-color': n.color }}
              onClick={n.onClick}
            >
              <span className="share-icon">{n.icon}</span>
              {n.name}
            </button>
          ))}
        </div>

        <div className="share-preview">
          <pre>{msg}</pre>
        </div>
      </div>
    </div>
  );
}
