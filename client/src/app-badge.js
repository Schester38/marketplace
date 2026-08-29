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
