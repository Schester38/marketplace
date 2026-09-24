// Promotion commune aux pieds de page des exports du Générateur.
// Le texte reste en français quelle que soit la langue du document, et le lien
// pointe toujours vers le domaine public piloté par VITE_SITE_URL.
import { BASE_URL } from "../config.js";

export const MBOPPI_CONTENT_URL = BASE_URL;
export const MBOPPI_CONTENT_LABEL = "www.mboppishop.com";
// Taille commune à tous les rendus : assez grande pour être lisible sur papier
// et écran, sans dépendre de la petite taille « small » du modèle.
export const MBOPPI_PROMO_FONT_PT = 10.5;
export const MBOPPI_PROMO_BOX_H_MM = 8.5;
export const MBOPPI_PROMO_HTML = `<em data-mboppi-footer-promo="true">visitez <a href="${MBOPPI_CONTENT_URL}" target="_blank" rel="noopener noreferrer">${MBOPPI_CONTENT_LABEL}</a> pour plus de contenu</em>`;

export function hasMboppiPromo(html) {
  const value = String(html || "");
  return value.includes("data-mboppi-footer-promo") || value === MBOPPI_PROMO_HTML;
}

/** N'accepte que les URL web ; les schémas dangereux ne deviennent jamais des annotations PDF. */
export function safeWebUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
