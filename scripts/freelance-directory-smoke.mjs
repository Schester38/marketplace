// Smoke-test de l'annuaire Freelance. L'application Express est éphémère et
// aucun appel IA ni accès base n'est requis.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "freelance-smoke-secret-".padEnd(48, "x");
}

const express = (await import("express")).default;
const jwt = (await import("jsonwebtoken")).default;
const freelanceRoutes = (await import("../server/routes/freelance.js")).default;
const secret = process.env.JWT_SECRET;
const app = express();
app.use(express.json());
app.use("/api/freelance", freelanceRoutes);
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
});

const server = await new Promise((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}/api/freelance`;
const ownerToken = jwt.sign(
  { id: 1, email: "bestrong9124@gmail.com", role: "creator" },
  secret
);
const otherToken = jwt.sign(
  { id: 2, email: "other@example.com", role: "creator" },
  secret
);
const headers = { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" };
const checks = [];

async function check(label, run) {
  try {
    checks.push([label, Boolean(await run())]);
  } catch (error) {
    checks.push([`${label}: ${error.message}`, false]);
  }
}

async function post(path, body) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

try {
  await check("annuaire non authentifié → 401", async () => {
    const response = await fetch(`${base}/directory`);
    return response.status === 401;
  });

  await check("annuaire réservé au compte autorisé → 403", async () => {
    const response = await fetch(`${base}/directory`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    return response.status === 403;
  });

  await check("réponse paginée sans coordonnées complètes", async () => {
    const response = await fetch(`${base}/directory?q=laroseline`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const data = await response.json();
    const serialized = JSON.stringify(data);
    const company = data.companies?.[0];
    return (
      response.status === 200 &&
      company?.[8] === "0" &&
      company[5].includes("•") &&
      company[7].includes("•") &&
      !serialized.includes("+237 690 54 32 27") &&
      !serialized.includes("booking@laroseline.com")
    );
  });

  await check("filtres de page bornés", async () => {
    const response = await fetch(`${base}/directory?page=0`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const data = await response.json();
    return response.status === 422 && data.code === "INVALID_PAGE";
  });

  await check("API de scripts refuse les coordonnées envoyées par le client", async () => {
    const response = await post("/scripts", {
      company: { name: "Entreprise client" },
      researcher: { name: "Test", offer: "Une offre professionnelle" },
      channels: ["email"],
    });
    const data = await response.json();
    return response.status === 422 && data.code === "INVALID_COMPANY";
  });

  await check("contact individuel révélé uniquement par l'action explicite", async () => {
    const response = await post("/contact-link", {
      company_id: "0",
      channel: "email",
      subject: "Proposition",
      message: "Bonjour",
    });
    const data = await response.json();
    return (
      response.status === 200 &&
      data.href.startsWith("mailto:booking@laroseline.com?") &&
      data.href.includes(encodeURIComponent("Bonjour"))
    );
  });

  await check("comptage e-mail sans retour des adresses", async () => {
    const response = await post("/bulk-email/count", { company_ids: ["0"] });
    const text = await response.text();
    const data = JSON.parse(text);
    return (
      response.status === 200 &&
      data.recipient_count === 1 &&
      !text.includes("booking@laroseline.com")
    );
  });

  await check("brouillon groupé : seules les adresses sélectionnées partent dans mailto", async () => {
    const response = await post("/bulk-email", {
      company_ids: ["0"],
      subject: "Proposition",
      message: "Bonjour",
    });
    const data = await response.json();
    return (
      response.status === 200 &&
      data.recipient_count === 1 &&
      !Object.prototype.hasOwnProperty.call(data, "recipients") &&
      data.href.includes("booking%40laroseline.com")
    );
  });

  await check("identifiant nul refusé (ne résout pas la première entreprise)", async () => {
    const response = await post("/contact-link", { company_id: null, channel: "email" });
    const data = await response.json();
    return response.status === 422 && data.code === "INVALID_CONTACT";
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "OK   " : "FAIL "}${label}`);
}
console.log(
  failures.length
    ? `\nSMOKE Freelance : échec (${failures.length}/${checks.length})`
    : `\nSMOKE Freelance : ${checks.length}/${checks.length} OK`
);
if (failures.length) process.exitCode = 1;
