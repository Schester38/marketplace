// Tests du relais FamiliCash — licences Ed25519 et catalogue des offres.
// AUCUNE base de données sollicitée : seules les fonctions pures et la
// cryptographie sont vérifiées ici. Le montage HTTP est couvert par
// scripts/familicash-smoke.mjs, et l'encaissement réel par un paiement de test.
// Exécution : node server/tests/familicash.test.js
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import {
  FC_LICENSE_PREFIX,
  buildLicensePayload,
  decodeLicenseToken,
  encodeLicenseToken,
  publicKeyInfo,
  verifyLicenseToken,
} from "../services/fcLicense.js";
import {
  FC_HOUSEHOLD_RE,
  FC_PLANS,
  amountMatchesFc,
  claimTokenMatches,
  currencyMatchesFc,
  expiryAfter,
  isFcReference,
  normalizeHouseholdId,
  orderView,
  planOf,
  renewalBase,
} from "../services/familicashOrders.js";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected true`);
}

function assertDeepEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

function test(name, fn) {
  try {
    fn();
    console.warn(`  ✅ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

function suite(name, fn) {
  console.warn(`\n${name}`);
  fn();
}

function makePair() {
  return generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
}

suite("signature des licences (Ed25519)", () => {
  const pair = makePair();
  const payload = buildLicensePayload({
    householdId: "FC-AB2C-DE34",
    plan: "m",
    expiresAt: new Date("2026-11-02T12:00:00Z"),
    reference: "MBP-FC-A1B2C3D4",
    issuedAt: new Date("2026-10-03T12:00:00Z"),
  });

  test("la charge utile porte la version, le foyer, l'offre et les dates", () => {
    assertEqual(payload.v, 1, "v");
    assertEqual(payload.id, "FC-AB2C-DE34", "id");
    assertEqual(payload.plan, "m", "plan");
    assertEqual(payload.ref, "MBP-FC-A1B2C3D4", "ref");
    assertEqual(payload.iat, "2026-10-03T12:00:00Z", "iat sans millisecondes");
    assertEqual(payload.exp, "2026-11-02T12:00:00Z", "exp sans millisecondes");
  });

  test("le jeton a la forme FC1.<charge>.<signature>", () => {
    const token = encodeLicenseToken(payload, pair.privateKey);
    const parts = token.split(".");
    assertEqual(parts.length, 3, "3 segments");
    assertEqual(parts[0], FC_LICENSE_PREFIX, "préfixe");
    assertTrue(parts[1].length > 0 && parts[2].length > 0, "segments non vides");
    assertTrue(!/[+/=]/.test(parts[1] + parts[2]), "base64url sans + / =");
  });

  test("une licence se vérifie hors ligne avec la clé publique", () => {
    const token = encodeLicenseToken(payload, pair.privateKey);
    const verified = verifyLicenseToken(token, pair.publicKey);
    assertDeepEqual(verified, payload, "charge utile restituée à l'identique");
    assertEqual(decodeLicenseToken(token).payload.id, "FC-AB2C-DE34", "id relu");
  });

  test("une charge utile modifiée est rejetée", () => {
    const token = encodeLicenseToken(payload, pair.privateKey);
    const [prefix, , signature] = token.split(".");
    const falsifie = Buffer.from(
      JSON.stringify({ ...payload, plan: "y", exp: "2099-01-01T00:00:00Z" }),
      "utf8"
    ).toString("base64url");
    assertEqual(
      verifyLicenseToken(`${prefix}.${falsifie}.${signature}`, pair.publicKey),
      null,
      "falsification détectée"
    );
  });

  test("la signature d'une autre clé est rejetée", () => {
    const autre = makePair();
    const token = encodeLicenseToken(payload, autre.privateKey);
    assertEqual(verifyLicenseToken(token, pair.publicKey), null, "clé étrangère refusée");
  });

  test("un jeton tronqué, vide ou inconnu est refusé sans exception", () => {
    assertEqual(decodeLicenseToken(""), null, "vide");
    assertEqual(decodeLicenseToken("FC1.abc"), null, "2 segments");
    assertEqual(decodeLicenseToken("FC2.abc.def"), null, "préfixe inconnu");
    assertEqual(decodeLicenseToken("FC1.%%%.###"), null, "base64 invalide");
    assertEqual(verifyLicenseToken(null, pair.publicKey), null, "null");
  });

  test("les informations publiques sont exploitables par l'application", () => {
    // getLicenseKeyPair() transmet un KeyObject : la paire PEM doit donc être
    // convertie avant l'appel (seul écart du test avec le chemin réel).
    const info = publicKeyInfo(createPublicKey(pair.publicKey));
    assertEqual(info.algorithme, "Ed25519", "algorithme");
    assertTrue(info.pem.includes("BEGIN PUBLIC KEY"), "PEM SPKI");
    // 32 octets bruts en base64url = 43 caractères (ni +, ni /, ni =).
    assertEqual(info.brut.length, 43, "clé brute base64url");
    assertEqual(info.empreinte_sha256.length, 64, "empreinte SHA-256 hex");
  });
});

suite("catalogue des offres (source de vérité des prix)", () => {
  test("les deux offres existent avec leurs prix et durées", () => {
    assertEqual(FC_PLANS.m.amount, 1500, "mensuel");
    assertEqual(FC_PLANS.m.days, 30, "30 jours");
    assertEqual(FC_PLANS.y.amount, 15000, "annuel");
    assertEqual(FC_PLANS.y.days, 365, "365 jours");
  });

  test("le code d'offre ignore la casse et l'inconnu est refusé", () => {
    assertEqual(planOf("M").code, "m", "majuscule acceptée");
    assertEqual(planOf(" y ").code, "y", "espaces ignorés");
    assertEqual(planOf("z"), null, "offre inconnue");
    assertEqual(planOf(""), null, "vide");
    assertEqual(planOf(null), null, "null");
    assertEqual(planOf({ amount: 1 }), null, "objet refusé (aucun montant client)");
  });
});

suite("identifiants de foyer", () => {
  test("la forme FC-XXXX-XXXX est normalisée", () => {
    assertEqual(normalizeHouseholdId(" fc-ab2c-de34 "), "FC-AB2C-DE34", "normalisation");
    // Huit caractères utiles, sans 0/O, 1/I ni L : un identifiant de foyer se
    // dicte et se recopie à la main, ces caractères y prêtent à confusion.
    assertTrue(FC_HOUSEHOLD_RE.test("FC-AB2C-DE34"), "forme valide");
    assertTrue(!FC_HOUSEHOLD_RE.test("FC-AB12-CD34"), "chiffre 1 exclu de l'alphabet");
  });

  test("les caractères ambigus et les formes voisines sont refusés", () => {
    const mauvais = [
      "FC-AB2O-DE34", // lettre O
      "FC-AB2L-DE34", // lettre L
      "FC-AB20-DE34", // chiffre 0
      "FC-AB2C-DE14", // chiffre 1
      "FC-AB2C-DE3",
      "FC-AB2C-DE345",
      "AB-AB2C-DE34",
      "FCAB2CDE34",
      "",
    ];
    for (const valeur of mauvais) {
      assertTrue(!FC_HOUSEHOLD_RE.test(valeur), `refusé : ${JSON.stringify(valeur)}`);
    }
  });
});

suite("montants et devises", () => {
  test("un NUMERIC renvoyé en chaîne par pg est accepté", () => {
    assertTrue(amountMatchesFc("1500.00", 1500), "chaîne vs nombre");
    assertTrue(amountMatchesFc(1500, 1500), "nombre vs nombre");
  });

  test("un montant inférieur, différent ou illisible est refusé", () => {
    assertTrue(!amountMatchesFc(1, 1500), "1 ≠ 1500 (APK modifié)");
    assertTrue(!amountMatchesFc(1499.5, 1500), "écart trop grand");
    assertTrue(!amountMatchesFc("1450.00", 1500), "chaîne inférieure");
    assertTrue(!amountMatchesFc("abc", 1500), "illisible");
    assertTrue(!amountMatchesFc(null, 1500), "absent");
  });

  test("XAF et XOF sont équivalents (parité du franc CFA)", () => {
    assertTrue(currencyMatchesFc("XAF"), "XAF");
    assertTrue(currencyMatchesFc("xof"), "XOF minuscule");
    assertTrue(!currencyMatchesFc("EUR"), "EUR refusé");
    assertTrue(!currencyMatchesFc(""), "vide refusé");
  });
});

suite("références de commande", () => {
  test("seules les références MBP-FC sont prises en charge", () => {
    assertTrue(isFcReference("MBP-FC-A1B2C3D4"), "référence FamiliCash");
    assertTrue(isFcReference("mbp-fc-a1b2c3d4"), "casse ignorée");
    assertTrue(!isFcReference("MBP-MEM-A1B2C3D4"), "adhésion");
    assertTrue(!isFcReference("MBP-DON-A1B2C3D4"), "don");
    assertTrue(!isFcReference("MBP-FC-"), "trop courte");
    assertTrue(!isFcReference(null), "absente");
  });
});

suite("vue publique d'une commande", () => {
  const view = orderView({
    external_reference: "MBP-FC-A1B2C3D4",
    household_id: "FC-AB2C-DE34",
    plan: "m",
    amount: "1500.00",
    currency: "XAF",
    status: "completed",
    license: "FC1.charge.signature",
    license_expires_at: new Date("2026-11-02T00:00:00Z"),
    email: "parent@example.com",
    provider_reference: "IKP-H2H-1",
    created_at: new Date("2026-10-03T00:00:00Z"),
    completed_at: null,
  });

  test("les montants sortent en nombre et les dates en ISO", () => {
    assertEqual(view.amount, 1500, "montant numérique");
    assertEqual(view.expires_at, "2026-11-02T00:00:00.000Z", "expiration ISO");
    assertEqual(view.created_at, "2026-10-03T00:00:00.000Z", "création ISO");
    assertEqual(view.completed_at, null, "non payée → null");
  });

  test("les données internes ne sont pas exposées", () => {
    assertEqual(view.email, undefined, "email absent de la vue");
    assertEqual(view.provider_reference, undefined, "référence fournisseur absente");
  });

  test("une commande en attente n'a ni licence ni expiration", () => {
    const attente = orderView({
      external_reference: "MBP-FC-ZZZZZZ",
      household_id: "FC-AB2C-DE34",
      plan: "y",
      amount: 15000,
      currency: "XAF",
      status: "pending",
    });
    assertEqual(attente.license, null, "licence nulle");
    assertEqual(attente.expires_at, null, "expiration nulle");
  });
});

suite("renouvellement (les jours déjà payés ne se perdent pas)", () => {
  const maintenant = new Date("2026-10-03T12:00:00Z");

  test("premier achat : la période part de maintenant", () => {
    assertEqual(
      renewalBase(null, maintenant).toISOString(),
      maintenant.toISOString(),
      "aucune licence"
    );
    assertEqual(
      renewalBase(new Date("2026-09-01T00:00:00Z"), maintenant).toISOString(),
      maintenant.toISOString(),
      "licence expirée"
    );
  });

  test("renouvellement anticipé : la nouvelle période s'ajoute à l'ancienne", () => {
    const future = new Date("2026-10-20T00:00:00Z");
    assertEqual(
      renewalBase(future, maintenant).toISOString(),
      future.toISOString(),
      "départ = jours restants"
    );
    // Un mensuel acheté le 03/10 alors que la licence court jusqu'au 20/10
    // expire le 19/11 — et non le 02/11 : les 17 jours restants sont conservés.
    const fin = expiryAfter(renewalBase(future, maintenant), FC_PLANS.m.days);
    assertEqual(fin.toISOString(), "2026-11-19T00:00:00.000Z", "cumul de 30 jours");
  });

  test("les durées du catalogue sont exactes", () => {
    assertEqual(expiryAfter(maintenant, 30).toISOString(), "2026-11-02T12:00:00.000Z", "mensuel");
    assertEqual(expiryAfter(maintenant, 365).toISOString(), "2027-10-03T12:00:00.000Z", "annuel");
  });

  test("une date illisible ne bloque pas l'achat", () => {
    assertEqual(
      renewalBase("n'importe quoi", maintenant).toISOString(),
      maintenant.toISOString(),
      "valeur invalide ignorée"
    );
  });
});

// ⚠️ LE JETON DE RÉCLAMATION : LA BARRIÈRE QUI PROTÈGE LES LICENCES
// ------------------------------------------------------------------------
// L'identifiant de foyer ne fait que 40 bits et il est PUBLIC. Sans preuve
// supplémentaire, connaître un identifiant suffirait à récupérer la licence de
// n'importe qui. Ces tests verrouillent la règle : le bon jeton ouvre, tout le
// reste est refusé — y compris les cas « subtils » (casse, espaces, longueur).
suite("jeton de réclamation", () => {
  const jeton = "kM3nR7pQ2wX8yZ1aB4cD6eF9gH2jK5lM8nO1pQ4";

  test("le bon jeton est accepte", () => {
    assertTrue(
      claimTokenMatches(jeton, jeton),
      "jeton identique accepté"
    );
  });

  test("un jeton différent est refuse", () => {
    assertTrue(
      !claimTokenMatches(
        "AAAA3nR7pQ2wX8yZ1aB4cD6eF9gH2jK5lM8nO1pQ4",
        jeton
      ),
      "jeton falsifié refusé"
    );
  });

  test("aucun jeton n'est refusé face à un jeton attendu", () => {
    // Le cas le plus important : c'est exactement ce que fait un attaquant qui
    // connaît l'identifiant mais pas le secret.
    assertTrue(
      !claimTokenMatches("", jeton),
      "jeton absent refusé"
    );
    assertTrue(
      !claimTokenMatches(null, jeton),
      "jeton null refusé"
    );
  });

  test("les espaces de bord sont tolérés, pas le contenu", () => {
    assertTrue(
      claimTokenMatches(`  ${jeton}  `, jeton),
      "espaces de bord tolérés (copier-coller depuis un papier)"
    );
  });

  test("une longueur différente est refusée SANS lever d'exception", () => {
    // timingSafeEqual lève si les tampons diffèrent : il faut donc vérifier la
    // longueur AVANT, sinon un jeton tronqué ferait tomber le relais en 500.
    assertTrue(
      !claimTokenMatches(jeton.slice(0, 10), jeton),
      "jeton tronqué refusé proprement"
    );
    assertTrue(
      !claimTokenMatches(`${jeton}AAAA`, jeton),
      "jeton allongé refusé proprement"
    );
  });

  test("le jeton ne fuit JAMAIS dans la vue publique d'une commande", () => {
    // Il finirait sinon dans un journal ou une capture d'écran.
    const vue = orderView({
      external_reference: "MBP-FC-1A2B3C",
      household_id: "FC-AB2C-DE34",
      plan: "y",
      amount: "15000",
      currency: "XAF",
      status: "completed",
      license: "FC1.aaa.bbb",
      license_expires_at: new Date("2027-01-01T00:00:00Z"),
      claim_token: jeton,
      email: "quelquun@example.com",
    });
    assertTrue(
      vue.claim_token === undefined,
      "claim_token absent de la vue publique"
    );
    assertTrue(
      !JSON.stringify(vue).includes(jeton),
      "le jeton n'apparaît nulle part dans la vue"
    );
  });
});
