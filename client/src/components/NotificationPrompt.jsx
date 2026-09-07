import React, { useEffect, useState } from "react";
import { useLang } from "../i18n.jsx";
import { requestPushPermission } from "../push.js";

// Bannière d'activation des notifications, affichée à l'ouverture du site.
// Un clic sur « Activer » est nécessaire : tous les navigateurs exigent un
// geste utilisateur pour Notification.requestPermission() (le déclenchement
// automatique est ignoré). La bannière réapparaît à chaque connexion tant que
// la permission n'est pas accordée ; « Plus tard » ne la cache que pour la
// session en cours.
export default function NotificationPrompt({ user }) {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || typeof Notification === "undefined") return;
    if (Notification.permission === "denied") return;
    if (Notification.permission === "granted") {
      // Déjà autorisé : on (ré)abonne silencieusement si besoin (idempotent).
      requestPushPermission();
      return;
    }
    // permission === "default" → proposer à chaque connexion.
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, [user]);

  const activate = async () => {
    setBusy(true);
    try {
      await requestPushPermission();
    } catch {
      /* silencieux */
    }
    setBusy(false);
    setVisible(false);
  };

  const dismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="notif-prompt" role="dialog" aria-label={t("Notifications")}>
      <span className="bell-icon" aria-hidden="true">
        🔔
      </span>
      <p className="notif-prompt-text">
        {t(
          "Activez les notifications pour être prévenu immédiatement des commandes, paiements et messages, même lorsque l'application est fermée."
        )}
      </p>
      <div className="notif-prompt-actions">
        <button type="button" className="btn btn-primary" onClick={activate} disabled={busy}>
          {busy ? "⏳ …" : t("Activer")}
        </button>
        <button type="button" className="btn btn-outline" onClick={dismiss}>
          {t("Plus tard")}
        </button>
      </div>
    </div>
  );
}