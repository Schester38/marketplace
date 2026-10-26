import { storage } from "./storage.js";

const KEY = "mboppi_boost_orders";
const MAX = 30;

export function listLocalBoostOrders() {
  try {
    const raw = storage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((o) => o && o.id) : [];
  } catch {
    return [];
  }
}

export function saveLocalBoostOrder(entry) {
  if (!entry || !entry.id) return;
  const list = listLocalBoostOrders().filter((o) => Number(o.id) !== Number(entry.id));
  list.unshift({
    id: entry.id,
    token: entry.token || null,
    service_name: entry.service_name || "",
    total: entry.total ?? null,
    currency: entry.currency || "XAF",
    created_at: entry.created_at || new Date().toISOString(),
  });
  try {
    storage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* stockage indisponible : la commande reste consultable via son numéro */
  }
}

export function removeLocalBoostOrder(id) {
  const list = listLocalBoostOrders().filter((o) => Number(o.id) !== Number(id));
  try {
    storage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}
