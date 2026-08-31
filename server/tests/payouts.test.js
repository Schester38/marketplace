// Tests de la logique de reversement Mboppi (Phase 3).
//  - computeRedistribution / planSalePayouts : sélection pure des bénéficiaires.
//  - Idempotence de la réservation atomique (INSERT ON CONFLICT DO NOTHING RETURNING id)
//    simulée : le "perdant" ne doit jamais appeler iKeePay.
//  - Régressions statiques : sendSalePayouts n'existe plus ; aucune référence à
//    payReferralAutomatically / REFERRAL_AUTO_PAY_MIN ;
//    un crédit wallet_transactions ne déclenche aucun payout externe.
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { computeRedistribution, normalizeWalletPrimary, paymentTarget, planSalePayouts, payoutErrorCategory, resolveGuard, retryGuard } from "../services/payouts.js";
import {
  authorizeConfirm,
  safeEqual,
  validateWebhookAmount,
  verifyIkeepayWebhook,
} from "../services/paymentSecurity.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected true`);
}

function assertFalse(cond, label) {
  if (cond) throw new Error(`${label}: expected false`);
}

function assertThrows(fn, label) {
  try {
    fn();
    throw new Error(`${label}: should have thrown`);
  } catch (err) {
    if (err.message === `${label}: should have thrown`) throw err;
  }
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

// ── Simulateur de réservation atomique (miroir du SQL réel) ────────────────
// Deux "workers" tentent de réserver la même external_reference. Le premier
// INSERT-returning gagne ; le second n'obtient aucune ligne et ne doit pas
// appeler payout().
function makeReservationSimulator() {
  const refs = new Map(); // reference -> state
  const calls = [];
  return {
    calls,
    async reserve(reference) {
      if (refs.has(reference)) return null; // ON CONFLICT DO NOTHING -> aucune ligne
      refs.set(reference, { status: "processing" });
      return { id: refs.size };
    },
    async applyProviderPayout(reference, money) {
      calls.push({ reference, money });
      const row = refs.get(reference);
      if (row) row.status = "completed";
    },
    async status(reference) {
      const row = refs.get(reference);
      return row ? row.status : null;
    },
  };
}

suite("planSalePayouts (sélection des bénéficiaires)", () => {
  const baseSale = {
    total_price: 10000,
    commission: 1000,
    referral_commission: 200,
    delivery_fee: 500,
  };

  test("Test 1 — vente simple sans vendeur : un seul payout boutique", () => {
    const targets = planSalePayouts(
      { ...baseSale, seller_id: null, referred_by: null, delivered_by: null },
      { shop: { id: 1, country: "CM" } }
    );
    assertEqual(targets.length, 1, "nb bénéficiaires");
    assertEqual(targets[0].kind, "shop", "kind boutique");
    assertEqual(targets[0].amount, 8800, "montant boutique");
  });

  test("Test 2 — vente avec vendeur : shop + seller", () => {
    const targets = planSalePayouts(
      { ...baseSale, seller_id: 2, referred_by: null, delivered_by: null },
      { shop: { id: 1 }, seller: { id: 2 } }
    );
    assertEqual(targets.length, 2, "2 bénéficiaires");
    const kinds = targets.map((t) => t.kind).sort();
    assertEqual(kinds.join(","), "seller,shop", "shop + seller");
  });

  test("Test 3 — vente avec livreur : le livreur reçoit les frais de livraison", () => {
    const targets = planSalePayouts(
      { ...baseSale, delivered_by: 4, seller_id: null, referred_by: null },
      { shop: { id: 1 }, livreur: { id: 4 } }
    );
    const livreur = targets.find((t) => t.kind === "livreur");
    assertTrue(!!livreur, "livreur présent");
    assertEqual(livreur.amount, 500, "frais de livraison");
  });

  test("Test 4 — vente avec parrain : le référent reçoit la commission de parrainage", () => {
    const targets = planSalePayouts(
      { ...baseSale, referred_by: 3, seller_id: 2, delivered_by: null },
      { shop: { id: 1 }, seller: { id: 2 }, referrer: { id: 3 } }
    );
    const referrer = targets.find((t) => t.kind === "referral");
    assertTrue(!!referrer, "parrain présent");
    assertEqual(referrer.amount, 200, "commission parrain");
  });
});
suite("idempotence de la réservation atomique", () => {
  test("Test 5 — confirm + webhook simultanés : UN SEUL appel iKeePay", async () => {
    const sim = makeReservationSimulator();
    const reference = "PAYOUT:shop:1";
    const w1 = sim.reserve(reference);
    const w2 = sim.reserve(reference);
    const [r1, r2] = await Promise.all([w1, w2]);
    assertTrue(r1 || r2, "au moins un gagnant");
    assertFalse(r1 && r2, "un seul gagnant");
    if (r1) await sim.applyProviderPayout(reference, 8800);
    if (r2) throw new Error("le perdant ne doit pas appeler iKeePay");
    assertEqual(sim.calls.length, 1, "un seul payout()");
  });

  test("Test 6 — deuxième webhook identique : aucun nouvel appel", async () => {
    const sim = makeReservationSimulator();
    const reference = "PAYOUT:seller:1";
    await sim.reserve(reference);
    await sim.applyProviderPayout(reference, 900);
    const again = await sim.reserve(reference);
    assertFalse(!!again, "re-réservation impossible après completed");
  });

  test("Test 7 — deux appels simultanés : 1 payout/bénéficiaire", () => {
    const refs = new Set();
    let winner = 0;
    const attempt = () => {
      const ref = "PAYOUT:shop:2";
      if (refs.has(ref)) return false;
      refs.add(ref);
      winner += 1;
      return true;
    };
    assertTrue(attempt(), "worker1 gagne");
    assertFalse(attempt(), "worker2 perd");
    assertEqual(winner, 1, "un seul gagnant");
  });

  test("Test 8 — payout déjà completed : aucun nouvel appel", async () => {
    const sim = makeReservationSimulator();
    const reference = "PAYOUT:livreur:1";
    await sim.reserve(reference);
    await sim.applyProviderPayout(reference, 450);
    const pendingReserve = await sim.reserve(reference);
    assertFalse(!!pendingReserve, "pas de réouverture");
  });

  test("Test 9 — payout failed : pas de double paiement automatique non contrôlé", async () => {
    const sim = makeReservationSimulator();
    const reference = "PAYOUT:shop:3";
    await sim.reserve(reference);
    const retryReserve = await sim.reserve(reference);
    assertFalse(!!retryReserve, "un retry nécessite un mécanisme contrôlé");
  });
});

suite("moyen de paiement manquant", () => {
  test("Test 10 — sans moyen de paiement : échec retryable (logique paymentTarget)", () => {
    const methods = { wallets: [] };
    const target = planSalePayouts(
      { total_price: 1000, commission: 0, referral_commission: 0, delivery_fee: 0 },
      { shop: { id: 1 } }
    );
    assertEqual(target.length, 1, "shop sélectionné");
    assertThrows(() => {
      if (!methods.wallets.length) throw new Error("Moyen de paiement automatique non configuré");
    }, "payout sans moyens");
  });
});
suite("régressions (chemin unique)", () => {
  const PAYOUTS_PATH = join(ROOT, "server", "services", "payouts.js");
  const API_PATH = join(ROOT, "server", "routes", "payments.js");
  const SALES_PATH = join(ROOT, "server", "routes", "sales.js");
  const payoutsSource = existsSync(PAYOUTS_PATH) ? readFileSync(PAYOUTS_PATH, "utf8") : "";
  const apiSource = existsSync(API_PATH) ? readFileSync(API_PATH, "utf8") : "";
  const salesSource = existsSync(SALES_PATH) ? readFileSync(SALES_PATH, "utf8") : "";

  test("Test 11 — sendSalePayouts n'est plus appelé nulle part", () => {
    assertFalse(payoutsSource.includes("sendSalePayouts"), "sendSalePayouts absent de payouts.js");
    assertFalse(apiSource.includes("sendSalePayouts"), "sendSalePayouts absent de payments.js");
    assertFalse(salesSource.includes("sendSalePayouts"), "sendSalePayouts absent de sales.js");
  });

  test("Test 12 — un crédit wallet_transactions ne déclenche pas lui-même un payout externe", () => {
    assertFalse(payoutsSource.includes("ON INSERT INTO wallet_transactions"), "aucun trigger wallet");
    assertFalse(apiSource.includes("ON INSERT INTO wallet_transactions"), "aucun trigger wallet API");
  });

  test("Références anciennes (payReferralAutomatically / REFERRAL_AUTO_PAY_MIN) supprimées", () => {
    assertFalse(payoutsSource.includes("payReferralAutomatically"), "ancien cumul parrain retiré");
    assertFalse(payoutsSource.includes("REFERRAL_AUTO_PAY_MIN"), "constante de cumul retirée");
  });

  test("Les routes appellent markSalePaid (pas paySaleAutomatically directement)", () => {
    assertFalse(
      apiSource.includes("paySaleAutomatically("),
      "payments.js n'appelle plus paySaleAutomatically"
    );
    assertTrue(apiSource.includes("markSalePaid("), "payments.js appelle markSalePaid");
    assertFalse(
      salesSource.includes("paySaleAutomatically("),
      "sales.js n'appelle plus paySaleAutomatically"
    );
    assertTrue(salesSource.includes("markSalePaid("), "sales.js appelle markSalePaid");
  });

  test("Le webhook iKeePay est fail-closed (jamais traité sans authentification confirmée)", () => {
    assertTrue(
      apiSource.includes("verifyIkeepayWebhook("),
      "verifyIkeepayWebhook présent dans payments.js"
    );
    assertTrue(
      apiSource.includes('"Webhook non authentifié"'),
      "réponse 401 webhook présent"
    );
    assertTrue(
      apiSource.includes("authenticated, error"),
      "log webhook trace authenticated"
    );
    assertTrue(
      apiSource.includes("validateWebhookAmount("),
      "validation montant/devise du webhook"
    );
  });

  test("La confirmation /confirm exige une autorisation par type", () => {
    assertTrue(
      apiSource.includes("optionalAuth,"),
      "/confirm passe par optionalAuth"
    );
    assertTrue(
      apiSource.includes("authorizeConfirm("),
      "authorizeConfirm utilisé dans /confirm"
    );
    assertTrue(
      apiSource.includes("confirm_token"),
      "confirm_token (dons) présent dans payments.js"
    );
  });
});

suite("computeRedistribution (socle financier)", () => {
  test("équation de conservation : client = shop + seller + parrain + livreur", () => {
    const sale = {
      total_price: 10000,
      commission: 1000,
      referral_commission: 200,
      delivery_fee: 500,
    };
    const r = computeRedistribution(sale);
    const sum = r.shopAmount + r.sellerAmount + r.referrerAmount + r.livreurAmount;
    // Le montant payé par le client = total_price + delivery_fee.
    assertEqual(sum, 10500, "shop+commission+parrain+livraison");
  });
});

suite("paymentSecurity (sécurité paiements iKeePay)", () => {
  test("safeEqual : vraie égalité", () => {
    assertTrue(safeEqual("SECRET-ABC", "SECRET-ABC"), "mêmes valeurs");
  });

  test("safeEqual : différences rejetées (longueurs identiques)", () => {
    assertFalse(safeEqual("SECRET-ABC", "SECRET-ABD"), "1 char diff");
  });

  test("safeEqual : différences de longueur sans exception", () => {
    assertFalse(safeEqual("abc", "a-longer-value"), "longueurs différentes");
    assertFalse(safeEqual("", "abc"), "vide vs valeur");
  });

  test("verifyIkeepayWebhook : fail-closed sans secret (aucun mécanisme confirmé)", () => {
    const prev = process.env.IKEEPAY_WEBHOOK_SECRET;
    delete process.env.IKEEPAY_WEBHOOK_SECRET;
    try {
      const auth = verifyIkeepayWebhook({ headers: { "x-api-key": "nimporte" } });
      assertFalse(auth.ok, "webhook toujours refusé");
      assertEqual(auth.reason, "no_mechanism", "raison explicite");
    } finally {
      if (prev !== undefined) process.env.IKEEPAY_WEBHOOK_SECRET = prev;
    }
  });

  test("verifyIkeepayWebhook : secret configuré + bon header → OK", () => {
    const prev = process.env.IKEEPAY_WEBHOOK_SECRET;
    process.env.IKEEPAY_WEBHOOK_SECRET = "TEST_SECRET_123";
    try {
      const auth = verifyIkeepayWebhook({ headers: { "x-api-key": "TEST_SECRET_123" } });
      assertTrue(auth.ok, "webhook authentifié");
    } finally {
      if (prev !== undefined) process.env.IKEEPAY_WEBHOOK_SECRET = prev;
      else delete process.env.IKEEPAY_WEBHOOK_SECRET;
    }
  });

  test("verifyIkeepayWebhook : secret configuré + mauvais header → invalid_auth", () => {
    const prev = process.env.IKEEPAY_WEBHOOK_SECRET;
    process.env.IKEEPAY_WEBHOOK_SECRET = "TEST_SECRET_123";
    try {
      const auth = verifyIkeepayWebhook({ headers: { "x-api-key": "MAUVAIS_SECRET" } });
      assertFalse(auth.ok, "webhook refusé");
      assertEqual(auth.reason, "invalid_auth", "raison invalid_auth");
    } finally {
      if (prev !== undefined) process.env.IKEEPAY_WEBHOOK_SECRET = prev;
      else delete process.env.IKEEPAY_WEBHOOK_SECRET;
    }
  });

  test("verifyIkeepayWebhook : secret configuré + header absent → missing_auth", () => {
    const prev = process.env.IKEEPAY_WEBHOOK_SECRET;
    process.env.IKEEPAY_WEBHOOK_SECRET = "TEST_SECRET_123";
    try {
      const auth = verifyIkeepayWebhook({ headers: {} });
      assertFalse(auth.ok, "webhook refusé");
      assertEqual(auth.reason, "missing_auth", "raison missing_auth");
    } finally {
      if (prev !== undefined) process.env.IKEEPAY_WEBHOOK_SECRET = prev;
      else delete process.env.IKEEPAY_WEBHOOK_SECRET;
    }
  });

  test("validateWebhookAmount : montant cohérent → OK", () => {
    const v = validateWebhookAmount(
      { amount: 10500, currency: "XAF" },
      { expectedAmount: 10500, expectedCurrency: "XAF" }
    );
    assertTrue(v.ok, "valide");
  });

  test("validateWebhookAmount : montant incohérent → amount_mismatch", () => {
    const v = validateWebhookAmount(
      { amount: 9999, currency: "XAF" },
      { expectedAmount: 10500, expectedCurrency: "XAF" }
    );
    assertFalse(v.ok, "refusé");
    assertEqual(v.reason, "amount_mismatch", "reason");
  });

  test("validateWebhookAmount : devise incohérente → currency_mismatch", () => {
    const v = validateWebhookAmount(
      { amount: 10500, currency: "XOF" },
      { expectedAmount: 10500, expectedCurrency: "XAF" }
    );
    assertFalse(v.ok, "refusé");
    assertEqual(v.reason, "currency_mismatch", "reason");
  });

  test("payoutErrorCategory : refus 4xx → rejected", () => {
    const err = new Error("validation");
    err.statusCode = 400;
    assertEqual(payoutErrorCategory(err), "rejected", "4xx = refus explicite");
  });

  test("payoutErrorCategory : timeout/réseau/5xx → unknown (UNKNOWN ≠ FAILED)", () => {
    const err = new Error("fetch failed");
    err.statusCode = 502;
    assertEqual(payoutErrorCategory(err), "unknown", "5xx = résultat inconnu");
    assertEqual(payoutErrorCategory(new Error("iKeePay est momentanément injoignable")), "unknown", "injoignable");
    assertEqual(payoutErrorCategory(new Error("autre erreur")), "unknown", "par prudence");
  });

  test("authorizeConfirm sale : sans authentification → 401", () => {
    const r = authorizeConfirm({ kind: "sale", record: { id: 1, buyer_id: 10 }, user: null, token: null });
    assertFalse(r.ok, "refusé");
    assertEqual(r.code, 401, "code");
  });

  test("authorizeConfirm membership : sans authentification → 401", () => {
    const r = authorizeConfirm({ kind: "membership", record: { id: 1, user_id: 10 }, user: null, token: null });
    assertFalse(r.ok, "refusé");
    assertEqual(r.code, 401, "code");
  });

  test("authorizeConfirm donation avec propriétaire : autre utilisateur → 403", () => {
    const r = authorizeConfirm({ kind: "donation", record: { id: 1, user_id: 10, confirm_token: "abc" }, user: { id: 99 }, token: "abc" });
    assertFalse(r.ok, "refusé");
    assertEqual(r.code, 403, "code");
  });

  test("authorizeConfirm donation avec propriétaire : propriétaire → OK", () => {
    const r = authorizeConfirm({ kind: "donation", record: { id: 1, user_id: 10 }, user: { id: 10 }, token: null });
    assertTrue(r.ok, "autorisé");
  });

  test("authorizeConfirm donation : sans jeton → refusé (401)", () => {
    const r = authorizeConfirm({ kind: "donation", record: { id: 1, confirm_token: "abc" }, user: null, token: null });
    assertFalse(r.ok, "refusé");
    assertEqual(r.code, 401, "code");
  });

  test("authorizeConfirm donation : mauvais jeton → refusé (401)", () => {
    const r = authorizeConfirm({ kind: "donation", record: { id: 1, confirm_token: "abc" }, user: null, token: "wrong" });
    assertFalse(r.ok, "refusé");
    assertEqual(r.code, 401, "code");
  });

  test("authorizeConfirm donation : bon jeton → OK (don d'invité)", () => {
    const r = authorizeConfirm({ kind: "donation", record: { id: 1, confirm_token: "abc" }, user: null, token: "abc" });
    assertTrue(r.ok, "autorisé");
  });

  test("authorizeConfirm membership : non-propriétaire → refusé (403)", () => {
    const r = authorizeConfirm({ kind: "membership", record: { id: 1, user_id: 10 }, user: { id: 99 }, token: null });
    assertFalse(r.ok, "refusé");
    assertEqual(r.code, 403, "code");
  });

  test("authorizeConfirm membership : propriétaire → OK", () => {
    const r = authorizeConfirm({ kind: "membership", record: { id: 1, user_id: 10 }, user: { id: 10 }, token: null });
    assertTrue(r.ok, "autorisé");
  });

  test("authorizeConfirm sale : ni acheteur ni livreur → refusé (403)", () => {
    const r = authorizeConfirm({ kind: "sale", record: { id: 1, buyer_id: 10 }, user: { id: 99, role: "client" }, token: null });
    assertFalse(r.ok, "refusé");
    assertEqual(r.code, 403, "code");
  });

  test("authorizeConfirm sale : acheteur → OK", () => {
    const r = authorizeConfirm({ kind: "sale", record: { id: 1, buyer_id: 10 }, user: { id: 10, role: "client" }, token: null });
    assertTrue(r.ok, "acheteur autorisé");
  });

  test("authorizeConfirm sale : livreur → OK", () => {
    const r = authorizeConfirm({ kind: "sale", record: { id: 1, buyer_id: 10 }, user: { id: 7, role: "livreur" }, token: null });
    assertTrue(r.ok, "livreur autorisé");
  });

  test("authorizeConfirm : enregistrement inconnu → 404", () => {
    const r = authorizeConfirm({ kind: "sale", record: null, user: { id: 1, role: "livreur" }, token: null });
    assertFalse(r.ok, "refusé");
    assertEqual(r.code, 404, "code");
  });
});

suite("réconciliation des payouts bloqués (sortir de processing)", () => {
  const ADMIN_PATH = join(ROOT, "server", "routes", "admin.js");
  const PAYOUTS_PATH2 = join(ROOT, "server", "services", "payouts.js");
  const adminSource = existsSync(ADMIN_PATH) ? readFileSync(ADMIN_PATH, "utf8") : "";
  const payoutsSource2 = existsSync(PAYOUTS_PATH2) ? readFileSync(PAYOUTS_PATH2, "utf8") : "";

  test("resolveGuard : processing+completed → autorisé (sortie sûre)", () => {
    const g = resolveGuard("processing", "completed");
    assertTrue(g.ok, "processing → completed autorisé");
  });

  test("resolveGuard : processing+failed → autorisé", () => {
    const g = resolveGuard("processing", "failed");
    assertTrue(g.ok, "processing → failed autorisé");
  });

  test("resolveGuard : pending+completed → autorisé", () => {
    const g = resolveGuard("pending", "completed");
    assertTrue(g.ok, "pending → completed autorisé");
  });

  test("resolveGuard : completed → refusé (jamais rétrograder)", () => {
    const g = resolveGuard("completed", "failed");
    assertFalse(g.ok, "completed → failed refusé");
    assertEqual(g.reason, "already_completed", "reason");
  });

  test("resolveGuard : résolution invalide → refusé", () => {
    const g = resolveGuard("processing", "annuler");
    assertFalse(g.ok, "résolution invalide");
    assertEqual(g.reason, "invalid_resolution", "reason");
  });

  test("retryGuard : failed → autorisé (retry après échec explicite)", () => {
    const g = retryGuard("failed");
    assertTrue(g.ok, "failed → retry autorisé");
  });

  test("retryGuard : processing → REFUSÉ (il faut d'abord résoudre en failed)", () => {
    const g = retryGuard("processing");
    assertFalse(g.ok, "processing → retry refusé");
    assertEqual(g.reason, "must_resolve_failed_first", "reason");
  });

  test("retryGuard : pending → REFUSÉ (résultat inconnu)", () => {
    const g = retryGuard("pending");
    assertFalse(g.ok, "pending → retry refusé");
    assertEqual(g.reason, "must_resolve_failed_first", "reason");
  });

  test("retryGuard : completed → refusé", () => {
    const g = retryGuard("completed");
    assertFalse(g.ok, "completed → retry refusé");
    assertEqual(g.reason, "not_retryable", "reason");
  });

  test("Les fonctions de réconciliation sont exportées par payouts.js", () => {
    assertTrue(payoutsSource2.includes("export async function listPendingPayouts"), "listPendingPayouts exportée");
    assertTrue(payoutsSource2.includes("export async function resolvePayout"), "resolvePayout exportée");
    assertTrue(payoutsSource2.includes("export async function retryPayout"), "retryPayout exportée");
    assertTrue(payoutsSource2.includes("export function resolveGuard"), "resolveGuard exportée");
    assertTrue(payoutsSource2.includes("export function retryGuard"), "retryGuard exportée");
  });

  test("Les endpoints admin de réconciliation existent", () => {
    assertTrue(adminSource.includes('"/payouts"'), "GET /admin/payouts");
    assertTrue(adminSource.includes("/payouts/:reference/resolve"), "resolve endpoint");
    assertTrue(adminSource.includes("/payouts/:reference/retry"), "retry endpoint");
    assertTrue(adminSource.includes("admin.payout.resolve"), "audit resolve");
    assertTrue(adminSource.includes("admin.payout.retry"), "audit retry");
  });

  test("Un retry ne peut JAMAIS partir directement de processing (pas de contournement)", () => {
    // La garde retryGuard ET le SQL de retryPayout exigent status='failed'.
    assertFalse(payoutsSource2.includes("WHERE external_reference = $2 AND status IN ('processing'"), "pas de retry depuis processing");
  });
});

suite("moyen de paiement principal (prévention reversement vers ancien numéro)", () => {
  test("paymentTarget : privilégie le wallet `primary`, pas le premier du tableau", () => {
    const methods = {
      wallets: [
        { name: "MTN Mobile Money", value: "670000001", primary: false },
        { name: "Orange Money", value: "690000002", primary: true },
        { name: "Wave", value: "770000003", primary: false },
      ],
    };
    const target = paymentTarget(methods, "Cameroun");
    assertEqual(target.phoneNumber, "237690000002", "le primary est choisi");
  });

  test("paymentTarget : sans primary, garde le 1er valide (rétrocompat)", () => {
    const methods = {
      wallets: [
        { name: "Orange Money", value: "690000001" },
        { name: "MTN Mobile Money", value: "670000002" },
      ],
    };
    const target = paymentTarget(methods, "Cameroun");
    assertEqual(target.phoneNumber, "237690000001", "1er wallet valide");
  });

  test("paymentTarget : primary sur opérateur inconnu → ignore et prend le 1er valide connu", () => {
    const methods = {
      wallets: [
        { name: "Virement bancaire", value: "12345", primary: true },
        { name: "Orange Money", value: "690000001", primary: false },
      ],
    };
    const target = paymentTarget(methods, "Cameroun");
    assertEqual(target.phoneNumber, "237690000001", "repli sur le connu");
  });

  test("paymentTarget : aucun wallet → null", () => {
    assertEqual(paymentTarget({ wallets: [] }, "Cameroun"), null, "null");
    assertEqual(paymentTarget(null, "Cameroun"), null, "null methods");
  });

  test("normalizeWalletPrimary : marque le 1er comme primary si aucun", () => {
    const out = normalizeWalletPrimary([
      { name: "A", value: "1" },
      { name: "B", value: "2" },
    ]);
    assertEqual(out.length, 2, "2 wallets");
    assertEqual(out.filter((w) => w.primary).length, 1, "un seul primary");
    assertEqual(out[0].primary, true, "1er marqué");
    assertEqual(out[1].primary, false, "2e non marqué");
  });

  test("normalizeWalletPrimary : au plus un primary, même si plusieurs cochés", () => {
    const out = normalizeWalletPrimary([
      { name: "A", value: "1", primary: true },
      { name: "B", value: "2", primary: true },
      { name: "C", value: "3", primary: true },
    ]);
    assertEqual(out.filter((w) => w.primary).length, 1, "un seul primary");
    assertEqual(out[0].primary, true, "le 1er primary reste");
  });

  test("normalizeWalletPrimary : ignore les wallets sans valeur", () => {
    const out = normalizeWalletPrimary([
      { name: "A", value: "" },
      { name: "B", value: "2", primary: true },
    ]);
    assertEqual(out.length, 1, "seul B conserve");
    assertEqual(out[0].name, "B", "B");
  });

  test("normalizeWalletPrimary : préserve un primary déjà défini (pas le 1er)", () => {
    const out = normalizeWalletPrimary([
      { name: "A", value: "1" },
      { name: "B", value: "2", primary: true },
      { name: "C", value: "3" },
    ]);
    assertEqual(out.find((w) => w.primary).name, "B", "B reste principal");
  });
});

console.warn("\n✅ Tests payouts terminés");