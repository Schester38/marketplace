import React, { useState } from 'react';

const VITRINE_URL = 'https://mboppi-mboppi.vercel.app/vitrine-offre';

export const SHARE_MESSAGE =
  '✨ **Une offre pour presque chaque besoin !**\n' +
  '🔥 Découvrez ma vitrine et explorez une sélection d’offres et de solutions dans plusieurs domaines.\n\n' +
  'Que tu recherches une opportunité, un service, un produit ou simplement quelque chose d’intéressant à découvrir, **tu pourrais bien trouver ton bonheur.** 👀\n\n' +
  '👉 **Découvre la vitrine ici :**\n' +
  '🔗 ' + VITRINE_URL + '\n\n' +
  '🚀 *Un clic, plusieurs possibilités !*';

function openUrl(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function ShareVitrine({ onClose }) {
  const [copied, setCopied] = useState(false);

  const shareNative = async () => {
    try {
      await navigator.share({ title: 'Ma vitrine Mboppi', text: SHARE_MESSAGE, url: VITRINE_URL });
      onClose();
    } catch {
      /* annulé par l'utilisateur */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_MESSAGE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible */
    }
  };

  const encoded = encodeURIComponent(SHARE_MESSAGE);
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
      onClick: () => openUrl(`mailto:?subject=${encodeURIComponent('Découvre ma vitrine Mboppi')}&body=${encoded}`),
    },
    {
      name: 'Copier le lien',
      color: '#6b7280',
      icon: copied ? '✅' : '🔗',
      onClick: copyLink,
    },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Partager ma vitrine</h3>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        {navigator.share && (
          <button className="btn btn-primary btn-block" onClick={shareNative}>
            📲 Partager via l'appareil
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
          <pre>{SHARE_MESSAGE}</pre>
        </div>
      </div>
    </div>
  );
}
