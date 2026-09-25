import React, { useEffect, useState } from "react";
import { useLang } from "../i18n.jsx";
import { BASE_URL } from "../config.js";

// Bannière d'installation de la PWA, affichée automatiquement quand
// l'installation est possible. Couvre les 3 cas :
//  1. Chrome/Edge (Android + desktop) : l'événement beforeinstallprompt est
//     capté → bouton « Installer » qui déclenche la popup native ;
//  2. iPhone/iPad (Safari) : pas d'invite automatique côté Apple → guide
//     « Partager puis Sur l'écran d'accueil » ;
//  3. Navigateurs intégrés (Facebook, Instagram, TikTok…) : l'installation y
//     est IMPOSSIBLE → on guide vers Chrome (intent:// sur Android, sinon
//     copie du lien + instructions).
// Refuser (« Plus tard ») masque la bannière 7 jours (localStorage).
const DISMISS_KEY = "mboppi_install_dismissed";
const DISMISS_DAYS = 7;

function inAppBrowser() {
  const ua = navigator.userAgent || "";
  return (
    /FBAN|FBAV|FB_IAB/i.test(ua) ||
    /Instagram/i.test(ua) ||
    /TikTok|musical_ly/i.test(ua) ||
    /Snapchat/i.test(ua) ||
    /Line\//i.test(ua) ||
    /Twitter|x\.com.*mobile/i.test(ua) ||
    /Pinterest/i.test(ua)
  );
}

export default function InstallAppPrompt() {
  const { t } = useLang();
  const [mode, setMode] = useState(null); // null | "bip" | "ios" | "inapp"
  const [deferred, setDeferred] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedUntil > Date.now()) return; // refusé récemment
    } catch {
      /* localStorage indisponible : on affiche quand même */
    }
    // Déjà installée (mode application) → jamais de bannière.
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    ) {
      return;
    }
    const ua = navigator.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;

    if (inAppBrowser()) {
      setMode("inapp");
      return;
    }
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setMode("bip");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (isIOS) setMode("ios");
    // Nettoyage au démontage.
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setMode(null);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    } catch {
      /* silencieux */
    }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setMode(null);
    } catch {
      /* silencieux */
    }
  };

  const openInChrome = () => {
    // Ouvre Chrome (Android) sur la page courante, sur le domaine OFFICIEL
    // (un navigateur intégré ouvert sur l'ancien alias ne doit pas y installer
    // la PWA) ; sans effet ailleurs.
    const url = `${BASE_URL}${window.location.pathname}${window.location.search}`.replace(
      /^https?:\/\//,
      ""
    );
    window.location.href = `intent://${url}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  const copyLink = async () => {
    try {
      // Lien public officiel (BASE_URL ← VITE_SITE_URL) : jamais l'ancien alias.
      await navigator.clipboard.writeText(BASE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      /* silencieux */
    }
  };

  if (!mode) return null;

  return (
    <div className="notif-prompt" role="dialog" aria-label={t("Installer l'application")}>
      <span className="bell-icon" aria-hidden="true">
        📲
      </span>
      {mode === "bip" && (
        <>
          <p className="notif-prompt-text">{t("Installez MboppiShop sur votre écran d'accueil")}</p>
          <div className="notif-prompt-actions">
            <button type="button" className="btn btn-primary" onClick={install}>
              📲 {t("Installer")}
            </button>
            <button type="button" className="btn btn-outline" onClick={dismiss}>
              {t("Plus tard")}
            </button>
          </div>
        </>
      )}
      {mode === "ios" && (
        <>
          <p className="notif-prompt-text">
            {t("Sur iPhone : touchez Partager ⬆️ puis « Sur l'écran d'accueil » pour installer MboppiShop.")}
          </p>
          <div className="notif-prompt-actions">
            <button type="button" className="btn btn-outline" onClick={dismiss}>
              {t("Plus tard")}
            </button>
          </div>
        </>
      )}
      {mode === "inapp" && (
        <>
          <p className="notif-prompt-text">
            {t(
              "Cette application (Facebook, Instagram…) bloque l'installation. Ouvrez MboppiShop dans Chrome pour installer :"
            )}
          </p>
          <div className="notif-prompt-actions">
            <button type="button" className="btn btn-primary" onClick={openInChrome}>
              {t("Ouvrir dans Chrome")}
            </button>
            <button type="button" className="btn btn-outline" onClick={copyLink}>
              {copied ? `✅ ${t("Lien copié")}` : t("Copier le lien")}
            </button>
            <button type="button" className="btn btn-outline" onClick={dismiss}>
              {t("Plus tard")}
            </button>
          </div>
          {copied && (
            <p className="notif-prompt-text">
              {t("Lien copié ! Ouvrez Chrome, collez-le et installez MboppiShop.")}
            </p>
          )}
        </>
      )}
    </div>
  );
}