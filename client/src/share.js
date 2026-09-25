const LOGO_URL = "/share-logo.png";
const MARK = "/storage/v1/object/public/photos/";
const PATH_RE = /^(products|offers|avatars)\/[A-Za-z0-9][A-Za-z0-9._/-]{0,240}$/;

/** Convertit une ancienne URL publique Supabase vers le proxy Vercel. */
export function proxyPhotoUrl(value) {
  if (typeof value !== "string" || !value || value.startsWith("data:")) return value;
  const i = value.indexOf(MARK);
  if (i < 0) return value;
  const path = value.slice(i + MARK.length).split(/[?#]/)[0];
  if (!PATH_RE.test(path)) return value;
  return `/api/photo?p=${encodeURIComponent(path)}`;
}

export function firstPhoto(product) {
  const photos = product?.photos;
  const p = Array.isArray(photos) ? photos[0] : null;
  if (typeof p === "string") return proxyPhotoUrl(p);
  if (p && typeof p === "object") return proxyPhotoUrl(p.full || p.large || p.medium || p.thumb);
  return proxyPhotoUrl(product?.image);
}

let logoFilePromise = null;

/** File du logo MboppiShop (mise en cache après le premier chargement). */
export function getLogoFile() {
  if (!logoFilePromise) {
    logoFilePromise = (async () => {
      try {
        const res = await fetch(LOGO_URL);
        if (!res.ok) return null;
        const blob = await res.blob();
        return new File([blob], "mboppi-logo.png", { type: blob.type || "image/png" });
      } catch {
        return null;
      }
    })();
  }
  return logoFilePromise;
}

/** Télécharge une image distante (photo produit, etc.) et la convertit en File. */
export async function getFileFromImageUrl(imageUrl, name = "image.png") {
  try {
    const res = await fetch(imageUrl, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.type && !blob.type.startsWith("image/")) return null;
    return new File([blob], name, { type: blob.type || "image/png" });
  } catch {
    return null;
  }
}

/** Premier visuel d'un produit, avec normalisation des anciennes URL Supabase. */
export function firstProductImage(product) {
  return firstPhoto(product);
}

/** Vrai sur appareil à écran tactile (téléphone/tablette), false sur ordinateur. */
export function isTouchDevice() {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

/**
 * Partage natif avec pièce jointe image :
 *  - imageUrl fourni (produit) -> attache la photo du produit ;
 *  - sinon useLogo -> attache le logo MboppiShop ;
 *  - si la plateforme refuse les fichiers, partage texte sans image.
 * Sur ordinateur, AUCUNE pièce jointe : la feuille de partage Windows
 * ne propose alors que de copier la photo, jamais le lien.
 * Retourne true si navigator.share a été utilisé (false sinon, ex. desktop).
 */
export async function nativeShareWithImage({ title, text, url, imageUrl, useLogo = false }) {
  if (!navigator.share) return false;
  const shareData = { title, text };
  if (url) shareData.url = url;
  let file = null;
  if (isTouchDevice()) {
    if (imageUrl) file = await getFileFromImageUrl(imageUrl);
    if (!file && useLogo) file = await getLogoFile();
    if (file) {
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          shareData.files = [file];
        }
      } catch {
        /* canShare indisponible : partage sans image */
      }
    }
  }
  try {
    await navigator.share(shareData);
  } catch (err) {
    // Annulé par l'utilisateur -> on s'arrête. En cas d'échec réel (ex. pièce
    // jointe refusée par la plateforme), on retombe sur la copie du lien.
    if (err && err.name === "AbortError") return true;
    if (shareData.files) {
      try {
        delete shareData.files;
        await navigator.share(shareData);
        return true;
      } catch (err2) {
        if (err2 && err2.name === "AbortError") return true;
      }
    }
    return false;
  }
  return true;
}
