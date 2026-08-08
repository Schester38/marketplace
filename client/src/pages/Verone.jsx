import React, { useEffect, useState } from 'react';

export default function Verone() {
  const [installEvent, setInstallEvent] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setInstallEvent(null);
  };

  return (
    <main className="container narrow">
      <section className="card page-center">
        <div className="verone-placeholder">🛍️</div>
        <h1>Verone</h1>
        <p className="hint">
          Cette page est en cours de préparation. Le contenu de la page « Verone »
          sera ajouté prochainement ici.
        </p>
        {installEvent && (
          <button className="btn btn-primary" onClick={install}>
            Installer l'application Verone
          </button>
        )}
      </section>
    </main>
  );
}
