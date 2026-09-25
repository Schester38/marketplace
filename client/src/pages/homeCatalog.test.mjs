import assert from "node:assert/strict";
import {
  nextCatalogRefresh,
  normalizeServerCatalog,
  productsOfType,
  shouldRetryDigitalCatalog,
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

console.log("homeCatalog: 8 assertions OK");
