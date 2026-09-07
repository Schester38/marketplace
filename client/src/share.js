const LOGO_URL = "/share-logo.png";

let logoFilePromise = null;

/** File du logo Mboppi (mise en cache après le premier chargement). */
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

/** Premier visuel d'un produit (photos[] = chaînes ou {thumb, full}). */
export function firstProductImage(product) {
  if (!product) return null;
  const p = product.photos && product.photos[0];
  if (typeof p === "string") return p;
  if (p && typeof p === "object") return p.full || p.thumb || null;
  return product.image || null;
}

/**
 * Partage natif avec pièce jointe image :
 *  - imageUrl fourni (produit) -> attache la photo du produit ;
 *  - sinon useLogo -> attache le logo Mboppi ;
 *  - si la plateforme refuse les fichiers, partage texte sans image.
 * Retourne true si navigator.share a été utilisé (false sinon, ex. desktop).
 */
export async function nativeShareWithImage({ title, text, url, imageUrl, useLogo = false }) {
  if (!navigator.share) return false;
  const shareData = { title, text };
  if (url) shareData.url = url;
  let file = null;
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
