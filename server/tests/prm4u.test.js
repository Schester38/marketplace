import { Prm4uAdapter } from "../services/prm4u.js";

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  OK ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, options) => {
    const body = new URLSearchParams(options.body);
    const fields = Object.fromEntries(body.entries());
    calls.push({ url, options, fields });
    const result = await handler(fields);
    const status = result.status || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof result.body === "string" ? result.body : JSON.stringify(result.body)),
    };
  };
  return calls;
}

const adapter = () =>
  new Prm4uAdapter({
    baseUrl: "https://prm4u.com/api/v2",
    apiKey: "TEST_KEY",
    timeoutMs: 2000,
  });

await test("balance : requete form-urlencoded avec key", async () => {
  const calls = mockFetch(() => ({ body: { balance: "100.84292", currency: "USD" } }));
  const result = await adapter().fetchBalance();
  assert(result.balance === "100.84292", "solde");
  assert(result.currency === "USD", "devise");
  assert(calls[0].url === "https://prm4u.com/api/v2", "url");
  assert(calls[0].options.method === "POST", "methode POST");
  assert(
    String(calls[0].options.headers["Content-Type"]).startsWith("application/x-www-form-urlencoded"),
    "content-type"
  );
  assert(calls[0].fields.key === "TEST_KEY", "cle API");
  assert(calls[0].fields.action === "balance", "action");
});

await test("services : normalisation du catalogue", async () => {
  mockFetch(() => ({
    body: [
      {
        service: 1,
        name: "Instagram Followers",
        type: "Default",
        category: "Instagram - Followers",
        rate: "0.90",
        min: "50",
        max: "10000",
        refill: true,
        cancel: true,
      },
    ],
  }));
  const catalog = await adapter().fetchCatalog();
  assert(catalog.length === 1, "taille");
  assert(catalog[0].external_service_id === "1", "id externe");
  assert(catalog[0].name === "Instagram Followers", "nom");
  assert(catalog[0].rate === "0.90", "taux");
  assert(catalog[0].min === "50", "min");
  assert(catalog[0].max === "10000", "max");
  assert(catalog[0].refill === true, "refill");
  assert(catalog[0].cancel === true, "cancel");
});

await test("add : parametres service/link/quantity et reference retournee", async () => {
  const calls = mockFetch(() => ({ body: { order: 23501 } }));
  const result = await adapter().placeOrder({
    external_service_id: "1",
    link: "https://instagram.com/test",
    quantity: 1000,
  });
  assert(result.ok === true, "ok");
  assert(result.external_reference === "23501", "reference");
  assert(calls[0].fields.action === "add", "action");
  assert(calls[0].fields.service === "1", "service");
  assert(calls[0].fields.link === "https://instagram.com/test", "lien");
  assert(calls[0].fields.quantity === "1000", "quantite");
});

await test("add : erreur fournisseur remontee", async () => {
  mockFetch(() => ({ body: { error: "Not enough funds" } }));
  let error = null;
  try {
    await adapter().placeOrder({
      external_service_id: "1",
      link: "https://instagram.com/test",
      quantity: 1000,
    });
  } catch (err) {
    error = err;
  }
  assert(error && error.message === "Not enough funds", "message d'erreur");
  assert(error.statusCode === 400, "statut 400");
});

await test("status : statut et restes", async () => {
  mockFetch(() => ({
    body: { charge: "0.27819", start_count: "3572", status: "In progress", remains: "157", currency: "USD" },
  }));
  const result = await adapter().checkOrderStatus("23501");
  assert(result.ok === true, "ok");
  assert(result.status === "In progress", "statut");
  assert(result.remains === "157", "restes");
  assert(result.start_count === "3572", "start_count");
});

await test("cancel : erreur dans la reponse tableau", async () => {
  mockFetch(() => ({
    body: [{ order: 23501, cancel: { error: "Incorrect order ID" } }],
  }));
  let error = null;
  try {
    await adapter().cancelOrder("23501");
  } catch (err) {
    error = err;
  }
  assert(error && error.message === "Incorrect order ID", "message d'annulation");
});

await test("cle API absente : erreur explicite sans appel reseau", async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => "{}" };
  };
  const noKey = new Prm4uAdapter({});
  let error = null;
  try {
    await noKey.fetchBalance();
  } catch (err) {
    error = err;
  }
  assert(error && /Clé API PRM4U/.test(error.message), "message");
  assert(called === false, "aucun appel reseau");
});

await test("HTTP 401 : erreur remontee avec le statut", async () => {
  mockFetch(() => ({ status: 401, body: { error: "Invalid API key" } }));
  let error = null;
  try {
    await adapter().fetchBalance();
  } catch (err) {
    error = err;
  }
  assert(error && error.message === "Invalid API key", "message");
  assert(error.statusCode === 401, "statut");
});
