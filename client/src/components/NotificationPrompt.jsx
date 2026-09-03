import React, { useEffect, useState } from "react";
import { useLang } from "../i18n.jsx";
import { requestPushPermission } from "../push.js";

// Bannière d'activation des notifications, affichée à l'ouverture du site.
// Un clic sur « Activer » est nécessaire : tous les navigateurs exigent un
// geste utilisateur pour Notification.requestPermission() (le déclenchement
// automatique est ignoré). On ne harcèle pas : la bannière n'apparaît que si
// la permission est encore « default » et pas déjà refusée / proposée au
// cours des 7 derniers jours.
const NOTIF_PROMPT_KEY = (uid) => `mboppi_notif_prompt_${uid || "guest"}`;

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
    // permission === "default" → proposer, mais pas plus d'une fois / 7 jours.
    try {
      const id = NOTIF_PROMPT_KEY(user && user.id);
      const last = Number(localStorage.getItem(id) || 0);
      const WEEK = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - last < WEEK) return;
    } catch {
      /* stockage indisponible : on affiche quand même */
    }
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
    try {
      localStorage.setItem(NOTIF_PROMPT_KEY(user && user.id), String(Date.now()));
    } catch {
      /* silencieux */
    }
    setBusy(false);
    setVisible(false);
  };

  const dismiss = () => {
    try {
      localStorage.setItem(NOTIF_PROMPT_KEY(user && user.id), String(Date.now()));
    } catch {
      /* silencieux */
    }
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