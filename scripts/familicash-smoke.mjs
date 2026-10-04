// Test de fumée du relais FamiliCash — montage de /familicash/api sur une
// application Express éphémère. AUCUNE base de données n'est sollicitée : les
// vérifications portent sur l'état du relais, sur le catalogue serveur et sur
// les refus de validation, qui interviennent AVANT tout accès base. Le vrai
// encaissement se vérifie en production (voir GUIDE-2 du dossier FamiliCash).
// Exécution :
//   node scripts/familicash-smoke.mjs
process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const express = (await import("express")).default;
const familicashRoutes = (await import("../server/routes/familicash.js")).default;

const app = express();
app.use(express.json());
app.use("/familicash/api", familicashRoutes);

const server = app.listen(0, async () => {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const results = [];

  async function check(label, fn) {
    try {
      results.push([label, await fn()]);
    } catch (err) {
      results.push([`${label} → ${err.message}`, false]);
    }
  }

  const get = (path) => fetch(`${base}${path}`);
  const post = (path, body) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });

  // ---- état du relais ----------------------------------------------------
  await check("GET /familicash/api/ → 200, logiciel + état actif", async () => {
    const r = await get("/familicash/api/");
    const d = await r.json();
    return r.status === 200 && d.ok === true && /FamiliCash/.test(d.logiciel || "") && d.etat === "actif";
  });
  await check("GET /familicash/api (sans slash final) → 200", async () => {
    return (await get("/familicash/api")).status === 200;
  });
  await check("GET ?action=ping → action reflétée + catalogue serveur", async () => {
    const r = await get("/familicash/api/?action=ping");
    const d = await r.json();
    const prix = (d.plans || []).map((p) => `${p.code}:${p.montant}:${p.jours}`).join(",");
    return r.status === 200 && d.action === "ping" && prix === "m:1500:30,y:15000:365";
  });
  await check("GET /index.php?action=ping (chemin hérité du PHP) → 200", async () => {
    const r = await get("/familicash/api/index.php?action=ping");
    const d = await r.json();
    return r.status === 200 && d.action === "ping";
  });
  await check("aucune réponse mise en cache (no-store)", async () => {
    const r = await get("/familicash/api/");
    return /no-store/.test(r.headers.get("cache-control") || "");
  });

  // ---- validations (refus AVANT tout accès base) -------------------------
  await check("POST ?action=payer sans foyer → 400 INVALID_HOUSEHOLD", async () => {
    const r = await post("/familicash/api/?action=payer", { plan: "m" });
    const d = await r.json();
    return r.status === 400 && d.ok === false && d.code === "INVALID_HOUSEHOLD";
  });
  await check("POST ?action=payer, foyer au format ambigu → 400", async () => {
    const r = await post("/familicash/api/?action=payer", { id: "FC-AB2O-DE34", plan: "m" });
    return r.status === 400;
  });
  await check("POST ?action=payer avec une offre inconnue → 400 INVALID_PLAN", async () => {
    const r = await post("/familicash/api/?action=payer", { id: "FC-AB2C-DE34", plan: "z" });
    const d = await r.json();
    return r.status === 400 && d.code === "INVALID_PLAN";
  });
  await check("POST ?action=payer avec un montant client → jamais 200 avec ce montant", async () => {
    // Une application modifiée peut envoyer « amount: 1 » : la réponse ne doit
    // jamais entériner ce montant (il vient du catalogue, pas du client).
    const r = await post("/familicash/api/?action=payer", {
      id: "FC-AB2C-DE34",
      plan: "y",
      amount: 1,
    });
    if (r.status !== 200) return true; // sans base : refus, c'est acceptable ici
    const d = await r.json();
    return d.amount !== 1;
  });
  await check("GET ?action=licence avec un foyer invalide → 400 INVALID_HOUSEHOLD", async () => {
    const r = await get("/familicash/api/?action=licence&id=nimportequoi");
    const d = await r.json();
    return r.status === 400 && d.code === "INVALID_HOUSEHOLD";
  });

  // ---- répartition des chemins -------------------------------------------
  await check("GET ?action=inconnue → 404 UNKNOWN_ACTION (jamais de HTML)", async () => {
    const r = await get("/familicash/api/?action=inconnue");
    const d = await r.json();
    const type = r.headers.get("content-type") || "";
    return r.status === 404 && d.code === "UNKNOWN_ACTION" && /json/.test(type);
  });
  await check("GET ?action=payer → 405 (cette action attend POST)", async () => {
    const r = await get("/familicash/api/?action=payer");
    const d = await r.json();
    return r.status === 405 && d.code === "METHOD_NOT_ALLOWED";
  });
  await check("POST ?action=webhook sans jeton → 403 (jamais de confirmation anonyme)", async () => {
    const r = await post("/familicash/api/?action=webhook", {
      reference: "MBP-FC-ABCDEF",
      amount: 1500,
    });
    const d = await r.json();
    return r.status === 403 && d.received === false && d.error === "invalid_webhook_token";
  });

  const echecs = results.filter(([, pass]) => !pass);
  for (const [label, pass] of results) {
    console.log(`${pass ? "OK   " : "FAIL "}${label}`);
  }
  console.log(
    echecs.length === 0
      ? `\nSMOKE FamiliCash : ${results.length}/${results.length} OK`
      : `\nSMOKE FamiliCash : ÉCHEC — ${echecs.map(([l]) => l).join(" | ")}`
  );
  // Fermeture propre : un court délai laisse undici (fetch) fermer ses sockets
  // keep-alive — sans lui, un process.exit() immédiat déclenche une assertion
  // libuv sous Windows (« UV_HANDLE_CLOSING ») et fausse le code de sortie.
  server.close();
  setTimeout(() => process.exit(echecs.length === 0 ? 0 : 1), 200);
});
