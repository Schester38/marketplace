import { api } from "./api.js";
import { urlBase64ToUint8Array } from "./utils.js";

// Abonnement push pour l'utilisateur connecté (idempotent). Ne rejette jamais :
// renvoie false si le push n'est pas disponible/configuré, pour que l'appelant
// puisse ignorer silencieusement.
export async function subscribeToPush() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  if (!navigator.serviceWorker) return false;
  try {
    const { public_key } = await api.pushKey();
    if (!public_key) return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
    }
    await api.pushSubscribe(sub.toJSON());
    return true;
  } catch (err) {
    console.warn("[push] abonnement impossible :", err && err.message);
    return false;
  }
}

// Demande la permission de notification puis abonne l'utilisateur. À appeler
// depuis un geste utilisateur (les navigateurs exigent un clic pour afficher
// la demande de permission).
export async function requestPushPermission() {
  if (typeof Notification === "undefined") return false;
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch (err) {
      console.warn("[push] demande de permission impossible :", err && err.message);
      return false;
    }
  }
  if (permission === "granted") {
    await subscribeToPush();
    return true;
  }
  return false;
}