/**
 * Mémorisation locale des achats du tunnel de vente (/f/:id).
 *
 * Le code de confirmation reste l'unique preuve acceptée par l'API. Cette
 * liste permet simplement à l'acheteur de retrouver son reçu après fermeture
 * de l'onglet — rien n'est stocké côté serveur. L'e-mail de reçu contient le
 * même code MBP-… et la page /mes-recus permet aussi une recherche manuelle.
 */

const KEY = "mboppi_funnel_sales";
const MAX_ENTRIES = 30;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && Number(x.saleId) > 0) : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    /* stockage indisponible (navigation privée…) : la session en cours suffit */
  }
}

export function listFunnelSales() {
  return readAll().sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
}

export function rememberFunnelSale(entry) {
  const saleId = Number(entry?.saleId);
  if (!Number.isInteger(saleId) || saleId < 1) return;
  const previous = readAll().find((x) => Number(x.saleId) === saleId);
  const list = readAll().filter((x) => Number(x.saleId) !== saleId);
  list.unshift({
    ...previous,
    ...entry,
    saleId,
    at: previous?.at || Date.now(),
  });
  writeAll(list);
}

export function markFunnelSalePaid(saleId) {
  const id = Number(saleId);
  if (!Number.isInteger(id) || id < 1) return;
  const list = readAll();
  const index = list.findIndex((x) => Number(x.saleId) === id);
  if (index < 0) return;
  list[index] = { ...list[index], paid: true, paidAt: Date.now() };
  writeAll(list);
}

export function forgetFunnelSale(saleId) {
  const id = Number(saleId);
  writeAll(readAll().filter((x) => Number(x.saleId) !== id));
}
