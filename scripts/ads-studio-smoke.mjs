process.env.JWT_SECRET = process.env.JWT_SECRET || "x".repeat(48);

const express = (await import("express")).default;
const adsStudioRoutes = (await import("../server/routes/adsStudio.js")).default;
const { AD_FEATURES, AD_ROLES, AD_STYLES } = await import("../server/data/adCatalog.js");
const {
  normalizeBrandProfile,
  normalizeIdeas,
  referenceFacts,
} = await import("../server/services/adsStudio.js");

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
  await check("profil et campagnes réservés à l'admin", async () => {
    const responses = await Promise.all([
      fetch(`${base}/api/ads-studio/brand`),
      fetch(`${base}/api/ads-studio/campaigns`),
      fetch(`${base}/api/ads-studio/campaigns`, { method: "POST" }),
    ]);
    return responses.every((response) => response.status === 401);
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
  await check("profil de marque borné et listes dédupliquées", async () => {
    const profile = normalizeBrandProfile({
      brand_name: " Mboppi   Studio ",
      approved_claims: ["Sans frais", "Sans frais", "Livraison rapide"],
      avoid_claims: "garanti\nrésultat assuré",
    });
    return (
      profile.brand_name === "Mboppi Studio" &&
      profile.approved_claims.length === 2 &&
      profile.avoid_claims.length === 2
    );
  });
  await check("preuve d'affirmation uniquement si la référence correspond exactement", async () => {
    const profile = normalizeBrandProfile({ approved_claims: ["Compte gratuit"] });
    const facts = referenceFacts(
      { name: "Mboppi", description: "Marketplace camerounaise" },
      profile
    );
    const ideas = normalizeIdeas(
      {
        ideas: [
          {
            title: "Test",
            hook: "Découvrez Mboppi",
            script: "Un script\navec plusieurs lignes.",
            storyboard: [{ visual: "Une scène", camera: "Plan rapproché" }],
            claim_checks: [
              { claim: "Compte gratuit", evidence: "Compte gratuit" },
              { claim: "Disponible partout", evidence: "Cette phrase ne figure pas aux sources" },
            ],
          },
        ],
      },
      2,
      facts
    );
    return (
      ideas.length === 1 &&
      ideas[0].script.includes("\n") &&
      ideas[0].storyboard[0].camera === "Plan rapproché" &&
      ideas[0].claim_checks[0].status === "reference_found" &&
      ideas[0].claim_checks[1].status === "needs_review"
    );
  });

  let ok = true;
  for (const [label, passed] of results) {
    console.log(`${passed ? "OK   " : "FAIL "}${label}`);
    if (!passed) ok = false;
  }
  console.log(ok ? `\nSMOKE: ${results.length}/${results.length} OK` : "\nSMOKE: ÉCHEC");
  server.close();
  setTimeout(() => process.exit(ok ? 0 : 1), 200);
});
