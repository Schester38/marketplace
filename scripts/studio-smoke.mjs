// Test de fumée MboppiStudio — montage de /api/studio sur une app Express
// éphémère + garde d'authentification. AUCUNE base de données sollicitée :
// les requêtes sans jeton valide sont rejetées en 401 par authRequired AVANT
// toute requête SQL (le Pool pg reste inactif). Exécution :
//   node scripts/studio-smoke.mjs
process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const express = (await import("express")).default;
const studioRoutes = (await import("../server/routes/studio.js")).default;

const app = express();
app.use(express.json());
app.use("/api/studio", studioRoutes);

const server = app.listen(0, async () => {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const results = [];

  async function check(label, fn) {
    try {
      const pass = await fn();
      results.push([label, pass]);
    } catch (err) {
      results.push([`${label} → ${err.message}`, false]);
    }
  }

  await check("GET /api/studio sans jeton → 401", async () => {
    const r = await fetch(`${base}/api/studio`);
    return r.status === 401;
  });
  await check("GET /api/studio jeton invalide → 401", async () => {
    const r = await fetch(`${base}/api/studio`, {
      headers: { Authorization: "Bearer invalid.token.here" },
    });
    return r.status === 401;
  });
  await check("POST /api/studio/hooks sans jeton → 401 (garde avant validation)", async () => {
    const r = await fetch(`${base}/api/studio/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "sujet de test" }),
    });
    return r.status === 401;
  });
  await check("le routeur est monté (401, pas 404) et aucun cache autorisé", async () => {
    const r = await fetch(`${base}/api/studio/`);
    return r.status === 401 && !/max-age/.test(r.headers.get("cache-control") || "");
  });

  let ok = true;
  for (const [label, pass] of results) {
    console.log(`${pass ? "OK   " : "FAIL "}${label}`);
    if (!pass) ok = false;
  }
  console.log(ok ? "\nSMOKE: 4/4 OK" : "\nSMOKE: ÉCHEC");
  // Fermeture propre : un court délai laisse undici (fetch) fermer ses sockets
  // keep-alive — sans lui, un process.exit() immédiat déclenche une assertion
  // libuv sous Windows (« UV_HANDLE_CLOSING ») et fausse le code de sortie.
  server.close();
  setTimeout(() => process.exit(ok ? 0 : 1), 200);
});
