import { previewProviderCatalogImport } from "../services/smmCatalogImport.js";

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

const catalog = [
  {
    external_service_id: "100",
    name: "Service standard",
    type: "default",
    rate: 1,
    min: 10,
    max: 1000,
    category: "Instagram",
  },
  {
    external_service_id: "101",
    name: "Service premium",
    type: "premium",
    rate: 2,
    min: 10,
    max: 1000,
    category: "Instagram",
  },
  {
    external_service_id: "102",
    name: "Service standard bis",
    type: "DEFAULT",
    rate: 3,
    min: 1,
    max: 100,
    category: "TikTok",
  },
  {
    external_service_id: "103",
    name: "Service hors budget",
    type: "default",
    rate: 5000,
    min: 1,
    max: 100,
    category: "YouTube",
  },
];

test("dry-run : compte les services acceptes sans rien importer", () => {
  const result = previewProviderCatalogImport(catalog, {
    types: ["default"],
    usdToXaf: 655.957,
    markup: 1,
  });
  assertEqual(result.dry_run, true, "dry_run");
  assertEqual(result.imported, 0, "imported");
  assertEqual(result.source_total, 4, "source_total");
  assertEqual(result.would_import, 3, "would_import");
  assertEqual(result.skipped, 1, "skipped");
});

test("dry-run : les types multiples sont acceptes", () => {
  const result = previewProviderCatalogImport(catalog, {
    types: ["default", "premium"],
    usdToXaf: 655.957,
    markup: 1,
  });
  assertEqual(result.would_import, 4, "would_import");
  assertEqual(result.skipped, 0, "skipped");
});

test("dry-run : les prix au-dela du plafond public sont masques", () => {
  const result = previewProviderCatalogImport(catalog, {
    types: ["default"],
    usdToXaf: 655.957,
    markup: 1,
  });
  assertEqual(result.would_activate, 2, "would_activate");
  assertEqual(result.would_hide, 1, "would_hide");
});

test("dry-run : catalogue vide", () => {
  const result = previewProviderCatalogImport([], { types: ["default"] });
  assertEqual(result.would_import, 0, "would_import");
  assertEqual(result.source_total, 0, "source_total");
});

if (process.exitCode) {
  process.exit(process.exitCode);
} else {
  console.log("smmCatalogImport: tous les tests sont passes");
}
