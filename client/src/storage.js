// Accès sûr au stockage navigateur.
//
// Dans certaines configurations (cookies / données de site bloqués, autorisation
// "Service Worker" ou stockage refusée pour le site, extensions de
// confidentialité), le moindre accès à localStorage / sessionStorage lève une
// SecurityError. Sans protection, ces erreurs peuvent casser le démarrage de
// l'application (i18n, thème, session, requêtes API). Ce wrapper dégrade
// proprement : si le stockage est indisponible, un stockage en mémoire (perdu au
// rechargement, mais l'application fonctionne) prend le relais.

const memory = new Map();
const sessionMemory = new Map();
let localOk = null;
let sessionOk = null;

function probe(kind) {
  try {
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    const k = "__mboppi_probe__";
    s.setItem(k, "1");
    s.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function local() {
  if (localOk === null) localOk = probe("local");
  return localOk ? window.localStorage : null;
}

function session() {
  if (sessionOk === null) sessionOk = probe("session");
  return sessionOk ? window.sessionStorage : null;
}

export const storage = {
  getItem(key) {
    try {
      const v = local()?.getItem(key);
      if (v !== null && v !== undefined) return v;
    } catch {}
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    try {
      const l = local();
      if (l) {
        l.setItem(key, value);
        return;
      }
    } catch {}
    memory.set(key, String(value));
  },
  removeItem(key) {
    try {
      local()?.removeItem(key);
    } catch {}
    memory.delete(key);
  },
};

export const sessionStore = {
  getItem(key) {
    try {
      const v = session()?.getItem(key);
      if (v !== null && v !== undefined) return v;
    } catch {}
    return sessionMemory.has(key) ? sessionMemory.get(key) : null;
  },
  setItem(key, value) {
    try {
      const s = session();
      if (s) {
        s.setItem(key, value);
        return;
      }
    } catch {}
    sessionMemory.set(key, String(value));
  },
  removeItem(key) {
    try {
      session()?.removeItem(key);
    } catch {}
    sessionMemory.delete(key);
  },
};
