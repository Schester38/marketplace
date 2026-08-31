// Tests de la logique de reversement Mboppi.
//  - computeRedistribution : répartition comptable d'une vente
//    (boutique / vendeur / parrain / livreur).
//  - normalizeWalletPrimary : gestion du moyen de paiement principal des
//    espaces boutique / vendeur / créateur / livreur (paiement manuel).
//  - Régressions statiques : sendSalePayouts / planSalePayouts /
//    paymentTarget / payoutErrorCategory / resolveGuard / retryGuard /
//    providerPayout / markSalePaid / payoutPlatformShare /
//    authorizeConfirm / safeEqual / validateWebhookAmount /
//    verifyIkeepayWebhook n'existent plus (système iKeePay supprimé).
import { computeRedistribution, normalizeWalletPrimary } from "../services/payouts.js";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertTrue(cond, label) {
  if (!cond) throw new Error(`${label}: expected true`);
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

suite("computeRedistribution (répartition comptable)", () => {
  const baseSale = {
    total_price: 10000,
    commission: 1000,
    referral_commission: 200,
    delivery_fee: 500,
  };

  test("vente simple : boutique encaisse tout", () => {
    const r = computeRedistribution({
      ...baseSale,
      commission: 0,
      referral_commission: 0,
      delivery_fee: 0,
    });
    assertEqual(r.totalPrice, 10000, "total");
    assertEqual(r.shopAmount, 10000, "boutique");
    assertEqual(r.sellerAmount, 0, "vendeur");
    assertEqual(r.referrerAmount, 0, "parrain");
    assertEqual(r.livreurAmount, 0, "livreur");
  });

  test("vente avec commission vendeur", () => {
    const r = computeRedistribution({
      ...baseSale,
      commission: 1000,
      referral_commission: 0,
      delivery_fee: 0,
    });
    assertEqual(r.shopAmount, 9000, "boutique");
    assertEqual(r.sellerAmount, 1000, "vendeur");
  });

  test("vente avec parrainage", () => {
    const r = computeRedistribution({
      ...baseSale,
      commission: 0,
      referral_commission: 200,
      delivery_fee: 0,
    });
    assertEqual(r.shopAmount, 9800, "boutique");
    assertEqual(r.referrerAmount, 200, "parrain");
  });

  test("vente avec frais de livraison", () => {
    const r = computeRedistribution({
      ...baseSale,
      commission: 0,
      referral_commission: 0,
      delivery_fee: 500,
    });
    assertEqual(r.livreurAmount, 500, "livreur");
  });

  test("vente complète : tous les acteurs", () => {
    const r = computeRedistribution(baseSale);
    assertEqual(r.totalPrice, 10000, "total");
    assertEqual(r.shopAmount, 8800, "boutique");
    assertEqual(r.sellerAmount, 1000, "vendeur");
    assertEqual(r.referrerAmount, 200, "parrain");
    assertEqual(r.livreurAmount, 500, "livreur");
  });

  test("montants négatifs impossibles (commission <= total)", () => {
    const r = computeRedistribution({
      total_price: 1000,
      commission: 500,
      referral_commission: 200,
      delivery_fee: 100,
    });
    assertTrue(r.shopAmount >= 0, "boutique non négatif");
    assertEqual(r.shopAmount, 300, "boutique calculé");
  });
});

suite("normalizeWalletPrimary (paiement manuel)", () => {
  test("marque le 1er comme primary si aucun", () => {
    const out = normalizeWalletPrimary([
      { name: "A", value: "1" },
      { name: "B", value: "2" },
    ]);
    assertEqual(out.length, 2, "2 wallets");
    assertEqual(out.filter((w) => w.primary).length, 1, "un seul primary");
    assertEqual(out[0].primary, true, "1er marqué");
    assertEqual(out[1].primary, false, "2e non marqué");
  });

  test("au plus un primary, même si plusieurs cochés", () => {
    const out = normalizeWalletPrimary([
      { name: "A", value: "1", primary: true },
      { name: "B", value: "2", primary: true },
      { name: "C", value: "3", primary: true },
    ]);
    assertEqual(out.filter((w) => w.primary).length, 1, "un seul primary");
    assertEqual(out[0].primary, true, "le 1er primary reste");
  });

  test("ignore les wallets sans valeur", () => {
    const out = normalizeWalletPrimary([
      { name: "A", value: "" },
      { name: "B", value: "2", primary: true },
    ]);
    assertEqual(out.length, 1, "seul B conserve");
    assertEqual(out[0].name, "B", "B");
  });

  test("préserve un primary déjà défini (pas le 1er)", () => {
    const out = normalizeWalletPrimary([
      { name: "A", value: "1" },
      { name: "B", value: "2", primary: true },
      { name: "C", value: "3" },
    ]);
    assertEqual(out.find((w) => w.primary).name, "B", "B reste principal");
  });

  test("liste vide → tableau vide", () => {
    assertEqual(normalizeWalletPrimary([]).length, 0, "vide");
    assertEqual(normalizeWalletPrimary(null).length, 0, "null");
    assertEqual(normalizeWalletPrimary(undefined).length, 0, "undefined");
  });

  test("nettoie les champs (trim)", () => {
    const out = normalizeWalletPrimary([{ name: "  Orange  ", value: "  699  " }]);
    assertEqual(out[0].name, "Orange", "name trimé");
    assertEqual(out[0].value, "699", "value trimé");
  });
});

console.warn("\n✅ Tests payouts terminés");
