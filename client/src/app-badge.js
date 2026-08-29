// Gestion du badge de compteur sur l'icône de l'application installée (PWA).
// Utilise l'API Badging (navigator.setAppBadge / clearAppBadge) : supportée sur
// Android (PWA installée, launcher) et desktop (Chrome/Edge). NON supportée sur
// iOS/iPhone (les PWA n'y ont pas accès à la Badging API).
export function setAppBadge(count) {
  try {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (typeof navigator !== "undefined" && typeof navigator.setAppBadge === "function") {
      if (n > 0) navigator.setAppBadge(n);
      else navigator.clearAppBadge();
    }
  } catch {
    /* silencieux — navigateur sans la Badging API */
  }
}

export function clearAppBadge() {
  setAppBadge(0);
}

// Joue le son de notification côté client quand l'application est OUVERTE.
// Limites honnêtes :
//  - Chrome Android ignore le champ `sound` de showNotification()/Notification :
//    quand l'app est FERMÉE, seul le son du canal système de la PWA retentit
//    (impossible à forcer en web). On compense ici en jouant réellement un
//    <audio> quand l'app est au premier plan (fonctionne sur tous les appareils).
//  - Un geste de l'utilisateur sur la page est parfois requis (autoplay policy)
//    pour la lecture audio ; on se calme sur l'échec sans crasher.
let _audio = null;
export function playNotificationSound() {
  try {
    if (typeof Audio === "undefined") return;
    if (!_audio) {
      _audio = new Audio("/notification.wav");
      _audio.preload = "auto";
    }
    _audio.currentTime = 0;
    const p = _audio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    /* silencieux — politique autoplay ou navigateur sans audio */
  }
}
