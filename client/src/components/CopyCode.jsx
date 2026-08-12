import React, { useState } from 'react';
import { useLang } from '../i18n.jsx';

export default function CopyCode({ code, label }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(code || ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignoré */
    }
  };
  return (
    <button
      type="button"
      className="btn btn-outline btn-small copy-code-btn"
      onClick={copy}
      disabled={!code}
      aria-label={t('Copier le code')}
    >
      {copied ? `✓ ${t('Code copié !')}` : label || t('Copier le code')}
    </button>
  );
}