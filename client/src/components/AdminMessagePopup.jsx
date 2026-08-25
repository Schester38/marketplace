import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../App.jsx";
import { useLang } from "../i18n.jsx";

export default function AdminMessagePopup() {
  const { user } = useAuth();
  const { t } = useLang();
  const [message, setMessage] = useState(null);

  const load = useCallback(() => {
    if (!user) return;
    let cancelled = false;
    api
      .popupMessage()
      .then((d) => {
        if (!cancelled) setMessage(d.message || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Affiché à l'ouverture de session ou après une nouvelle inscription :
  // dès que `user` existe, on récupère le prochain message non lu.
  useEffect(() => load(), [load]);

  if (!user || !message) return null;

  const close = () => {
    const id = message.id;
    setMessage(null);
    if (id) api.ackMessage(id).catch(() => {});
    // S'il reste des messages non lus, afficher le suivant.
    load();
  };

  return (
    <div
      className="modal-overlay admin-msg-overlay"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal admin-msg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>💬 {t("Message de l'équipe Mboppi")}</h3>
          <button type="button" className="drawer-close" aria-label={t("Fermer")} onClick={close}>
            ✕
          </button>
        </div>
        <p className="admin-msg-text">{message.message}</p>
        <div className="admin-msg-actions">
          <button type="button" className="btn btn-primary btn-block" onClick={close}>
            {t("Compris")} ✓
          </button>
        </div>
      </div>
    </div>
  );
}
