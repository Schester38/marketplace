process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const express = (await import("express")).default;
const adsStudioRoutes = (await import("../server/routes/adsStudio.js")).default;
const { AD_FEATURES, AD_ROLES, AD_STYLES } = await import("../server/data/adCatalog.js");

const app = express();
app.use(express.json());
app.use("/api/ads-studio", adsStudioRoutes);

const server = app.listen(0, async () => {
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const results = [];

  async function check(label, fn) {
    try {
      results.push([label, Boolean(await fn())]);
    } catch (error) {
      results.push([`${label} → ${error.message}`, false]);
    }
  }

  await check("GET catalogue sans jeton → 401, pas 404", async () => {
    const response = await fetch(`${base}/api/ads-studio/catalog?type=features`);
    return response.status === 401;
  });
  await check("POST génération sans jeton → 401 avant génération", async () => {
    const response = await fetch(`${base}/api/ads-studio/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_type: "features", source_id: "marketplace" }),
    });
    return response.status === 401;
  });
  await check("réponses non mises en cache", async () => {
    const response = await fetch(`${base}/api/ads-studio/catalog`);
    return response.status === 401 && !/max-age/i.test(response.headers.get("cache-control") || "");
  });
  await check("référentiel de fonctionnalités valide et identifiants uniques", async () => {
    const ids = AD_FEATURES.map((item) => item.id);
    return ids.length > 0 && new Set(ids).size === ids.length && ids.every(Boolean);
  });
  await check("rôles et styles publicitaires disponibles", async () => {
    return ["shop", "seller", "creator", "client", "livreur"].every(
      (role) => AD_ROLES[role]?.name && AD_ROLES[role]?.description
    ) && ["ugc", "cinema", "presentation", "demonstration", "storytelling", "humor", "testimonial"].every(
      (style) => Boolean(AD_STYLES[style])
    );
  });

  let ok = true;
  for (const [label, passed] of results) {
    console.log(`${passed ? "OK   " : "FAIL "}${label}`);
    if (!passed) ok = false;
  }
  console.log(ok ? "\nSMOKE: 5/5 OK" : "\nSMOKE: ÉCHEC");
  server.close();
  setTimeout(() => process.exit(ok ? 0 : 1), 200);
});
