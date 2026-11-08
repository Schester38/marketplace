import {
  SMM_PROVIDERS,
  findSmmProvider,
  providerKeyFromSettings,
} from "../services/smmProvider.js";

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

test("deux fournisseurs supportes", () => {
  assertEqual(SMM_PROVIDERS.length, 2, "nombre");
  assertEqual(findSmmProvider("smm_africa")?.name, "SMM Africa", "smm_africa");
  assertEqual(findSmmProvider("prm4u")?.name, "PRM4U", "prm4u");
  assertEqual(findSmmProvider("inconnu"), null, "inconnu");
});

test("fournisseur choisi : cle retournee si renseignee", () => {
  assertEqual(
    providerKeyFromSettings({ smm_provider_enabled: "true", smm_provider_key: "prm4u" }),
    "prm4u",
    "active"
  );
  assertEqual(
    providerKeyFromSettings({ smm_provider_enabled: "false", smm_provider_key: "prm4u" }),
    "prm4u",
    "desactive mais choisi"
  );
  assertEqual(
    providerKeyFromSettings({ smm_provider_enabled: "true", smm_provider_key: "none" }),
    null,
    "aucun"
  );
  assertEqual(
    providerKeyFromSettings({ smm_provider_enabled: "true", smm_provider_key: "" }),
    null,
    "cle vide"
  );
  assertEqual(providerKeyFromSettings({}), null, "reglages absents");
});

test("fournisseur choisi : espaces ignorés et clé inconnue conservée", () => {
  assertEqual(
    providerKeyFromSettings({ smm_provider_enabled: "true", smm_provider_key: "  smm_africa  " }),
    "smm_africa",
    "espaces"
  );
  assertEqual(
    providerKeyFromSettings({ smm_provider_enabled: "true", smm_provider_key: "futur" }),
    "futur",
    "inconnu"
  );
});

if (process.exitCode) {
  process.exit(process.exitCode);
} else {
  console.log("smmProvider: tous les tests sont passes");
}
