// Décodage JWT côté client — UNIQUEMENT pour savoir si la session a expiré.
// Aucune vérification cryptographique ici : le serveur reste l'autorité
// (401 « Session invalide ou expirée »). Ce contrôle sert juste à ne pas
// rouvrir le site dans un état « faussement connecté ».
export function isTokenExpired(token) {
  if (!token || typeof token !== "string") return true;
  const parts = token.split(".");
  if (parts.length !== 3) return false; // pas un JWT → le serveur décidera
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = atob(b64);
    const m = json.match(/"exp"\s*:\s*(\d+)/);
    if (!m) return false;
    return Number(m[1]) * 1000 <= Date.now();
  } catch {
    return false; // illisible → ne pas déconnecter sur une supposition
  }
}
