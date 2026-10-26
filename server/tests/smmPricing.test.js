import {
  computeSmmTotal,
  decorateSmmService,
  minimumSmmQuantity,
  smmBillingUnit,
  isSmmPricePublic,
} from "../services/smmPricing.js";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

test("prix par 1000 : 450 XAF x 2000 = 900 XAF", () => {
  assertEqual(computeSmmTotal(450, 2000, "1000"), 900, "total");
});

test("prix par 1000 : 8 XAF x 62500 = 500 XAF", () => {
  assertEqual(computeSmmTotal(8, 62500, "1000"), 500, "total");
});

test("unite de facturation absente = 1000", () => {
  assertEqual(smmBillingUnit(null), 1000, "unite");
  assertEqual(smmBillingUnit("250"), 250, "unite");
});

test("minimum de commande 500 XAF : quantite 1112 pour 450/1000", () => {
  assertEqual(
    minimumSmmQuantity({ price: 450, billingUnit: "1000", min: 10 }),
    1112,
    "quantite minimale"
  );
});

test("devise non XAF : minimum fournisseur conserve", () => {
  assertEqual(
    minimumSmmQuantity({ price: 450, billingUnit: "1000", min: 25, currency: "USD" }),
    25,
    "quantite minimale"
  );
});

test("prix public accepte jusqu'a 1 000 000 XAF", () => {
  assertEqual(isSmmPricePublic(1000000), true, "plafond");
  assertEqual(isSmmPricePublic(1000000.01), false, "au-dela");
  assertEqual(isSmmPricePublic(0), false, "zero");
});

test("service decore avec min_total_quantity", () => {
  const service = decorateSmmService({
    price: "450",
    billing_unit: "1000",
    currency: "XAF",
    limits: { min: 10, max: 100000 },
  });
  assertEqual(service.min_total_quantity, 1112, "min_total_quantity");
});
