import { api } from "./api.js";
import { urlBase64ToUint8Array } from "./utils.js";

// Abonnement push pour l'utilisateur connecté (idempotent). Ne rejette jamais :
// renvoie false si le push n'est pas disponible/configuré, pour que l'appelant
// puisse ignorer silencieusement.
export async function subscribeToPush() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  if (!navigator.serviceWorker) return false;
  if (!("PushManager" in window)) {
    console.warn("[push] PushManager non supporté sur ce navigateur : pas de notification hors ligne.");
    return false;
  }
  try {
    const { public_key } = await api.pushKey();
    if (!public_key) return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await subscribeWithRetry(reg, public_key);
    if (!sub) return false;
    await api.pushSubscribe(sub.toJSON());
    try {
      const host = String(sub.endpoint || "").replace(/^https?:\/\//, "").split("/")[0];
      console.info("[push] abonnement enregistré sur le push service :", host || "?");
    } catch {
      /* silencieux */
    }
    return true;
  } catch (err) {
    console.warn("[push] abonnement impossible :", err && err.message);
    return false;
  }
}

async function subscribeWithRetry(reg, publicKey) {
  const makeSub = () =>
    reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  try {
    return await makeSub();
  } catch (err) {
    // Sur Android, le push service (FCM) refuse parfois la première tentative de
    // façon transitoire (« Registration failed - push service error »). On
    // réessaie une fois après une courte pause avant d'abandonner.
    const name = err && err.name;
    if (name === "AbortError" || name === "InvalidStateError" || name === "NetworkError") {
      console.warn("[push] abonnement refusé par le push service, nouvelle tentative…", err.message);
      await new Promise((r) => setTimeout(r, 1500));
      try {
        return await makeSub();
      } catch (err2) {
        console.warn("[push] abonnement définitivement impossible :", err2 && err2.message);
        return null;
      }
    }
    console.warn("[push] erreur d'abonnement :", name, err && err.message);
    return null;
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