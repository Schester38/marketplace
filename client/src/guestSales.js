/**
 * Mémorisation locale des achats digitaux effectués SANS COMPTE.
 *
 * Un achat invité n'est rattaché à aucun utilisateur : sa seule preuve est le
 * code de confirmation de la vente. Pour que l'acheteur retrouve son contenu
 * après fermeture de l'onglet (sans créer de compte), chaque vente créée par
 * le tunnel digital est notée dans localStorage. Cette liste reste sur
 * l'appareil du client — rien n'est stocké côté serveur (aucune donnée
 * personnelle supplémentaire), et le code de confirmation demeure l'unique
 * preuve acceptée par l'API.
 */

const KEY = "mboppi_guest_digital_sales";
const MAX_ENTRIES = 30;

export function rememberGuestSale(entry) {
  try {
    const list = guestSales().filter((x) => Number(x.saleId) !== Number(entry.saleId));
    list.unshift({ ...entry, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    /* stockage indisponible (navigation privée…) : la session en cours suffit */
  }
}

export function forgetGuestSale(saleId) {
  try {
    const list = guestSales().filter((x) => Number(x.saleId) !== Number(saleId));
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignoré */
  }
}

export function guestSales() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
