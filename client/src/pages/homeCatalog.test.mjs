import assert from "node:assert/strict";
import {
  isCatalogResponseStale,
  nextCatalogRefresh,
  normalizeServerCatalog,
  productsOfType,
  shouldRetryDigitalCatalog,
  shouldRetryPhysicalCatalog,
} from "./homeCatalog.js";

const oldDigitalResponse = [{ id: 170, name: "Digital sans is_digital" }];
const normalized = normalizeServerCatalog("digital", oldDigitalResponse);
assert.equal(normalized.length, 1);
assert.equal(normalized[0].is_digital, true);
assert.deepEqual(productsOfType("digital", normalized).map((p) => p.id), [170]);

assert.equal(
  shouldRetryDigitalCatalog({
    type: "digital",
    products: [],
    unfiltered: true,
    append: false,
    retryCount: 0,
  }),
  true
);
assert.equal(
  shouldRetryDigitalCatalog({
    type: "digital",
    products: oldDigitalResponse,
    unfiltered: true,
    append: false,
    retryCount: 0,
  }),
  false
);
assert.equal(
  shouldRetryDigitalCatalog({
    type: "digital",
    products: [],
    unfiltered: true,
    append: false,
    retryCount: 1,
  }),
  false
);
assert.equal(nextCatalogRefresh(1000, 1000), 1001);
assert.equal(nextCatalogRefresh(1000, 999), 1001);

// --- Réponses obsolètes : une requête « physiques » ne doit jamais s'appliquer
// après la bascule vers le volet « digitaux » (bug : liste du bas vide).
assert.equal(
  isCatalogResponseStale({
    mounted: true,
    requestId: 7,
    latestRequestId: 7,
    family: "digital",
    currentFamily: "digital",
  }),
  false
);
assert.equal(
  isCatalogResponseStale({
    mounted: true,
    requestId: 7,
    latestRequestId: 7,
    family: "physical",
    currentFamily: "digital",
  }),
  true
);
assert.equal(
  isCatalogResponseStale({
    mounted: true,
    requestId: 7,
    latestRequestId: 8,
    family: "digital",
    currentFamily: "digital",
  }),
  true
);
assert.equal(
  isCatalogResponseStale({
    mounted: false,
    requestId: 7,
    latestRequestId: 7,
    family: "digital",
    currentFamily: "digital",
  }),
  true
);

// --- Réessai différé : uniquement une réponse physique VIDE (jamais une
// réponse normale, sinon boucle infinie qui invalide le catalogue digital).
assert.equal(
  shouldRetryPhysicalCatalog({
    type: "physical",
    empty: true,
    append: false,
    unfiltered: true,
    retryCount: 0,
  }),
  true
);
assert.equal(
  shouldRetryPhysicalCatalog({
    type: "physical",
    empty: false,
    append: false,
    unfiltered: true,
    retryCount: 0,
  }),
  false
);
assert.equal(
  shouldRetryPhysicalCatalog({
    type: "physical",
    empty: true,
    append: false,
    unfiltered: true,
    retryCount: 2,
  }),
  false
);
assert.equal(
  shouldRetryPhysicalCatalog({
    type: "physical",
    empty: true,
    append: false,
    unfiltered: false,
    retryCount: 0,
  }),
  false
);
assert.equal(
  shouldRetryPhysicalCatalog({
    type: "physical",
    empty: true,
    append: true,
    unfiltered: true,
    retryCount: 0,
  }),
  false
);
assert.equal(
  shouldRetryPhysicalCatalog({
    type: "digital",
    empty: true,
    append: false,
    unfiltered: true,
    retryCount: 0,
  }),
  false
);

console.log("homeCatalog: 18 assertions OK");
