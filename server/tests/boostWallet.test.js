import {
  BOOST_MAX_ADMIN_CREDIT_USD,
  BOOST_MAX_TOPUP_USD,
  BOOST_MIN_TOPUP_USD,
  BOOST_WALLET_REF_PREFIX,
  BoostWalletError,
  amountsMatch,
  amountTolerance,
  generateBoostWalletReference,
  isBoostWalletReference,
} from "../services/boostWallet.js";

function assert(condition, label) {
  if (!condition) throw new Error(label);
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

test("référence : préfixe MBP-WAL reconnu avant les autres flux", () => {
  const reference = generateBoostWalletReference();
  assert(reference.startsWith(`${BOOST_WALLET_REF_PREFIX}-`), "préfixe");
  assert(isBoostWalletReference(reference), "référence générée acceptée");
  assert(isBoostWalletReference("mbp-wal-test-1234"), "casse ignorée");
  assert(!isBoostWalletReference("MBP-BST-123"), "commande Boost refusée");
  assert(!isBoostWalletReference("MBP-FC-123"), "FamiliCash refusé");
  assert(!isBoostWalletReference(""), "vide refusé");
  assert(!isBoostWalletReference(null), "null refusé");
});

test("montants : tolérance selon les décimales de la devise", () => {
  assert(amountTolerance("USD") === 0.01, "USD au centime");
  assert(amountTolerance("XAF") === 1, "XAF sans décimale");
  assert(amountsMatch(10, 10.01, "USD"), "écart USD toléré");
  assert(!amountsMatch(10, 10.02, "USD"), "écart USD trop grand");
  assert(amountsMatch(5000, 5001, "XAF"), "écart XAF toléré");
  assert(!amountsMatch(5000, 5002, "XAF"), "écart XAF trop grand");
  assert(!amountsMatch("abc", 10, "USD"), "montant illisible refusé");
});

test("constantes : bornes de recharge et de crédit admin", () => {
  assert(BOOST_MIN_TOPUP_USD === 1, "minimum recharge");
  assert(BOOST_MAX_TOPUP_USD === 5000, "maximum recharge");
  assert(BOOST_MAX_ADMIN_CREDIT_USD === 10000, "maximum crédit admin");
});

test("erreur métier : statut HTTP et code conservés", () => {
  const err = new BoostWalletError("Solde insuffisant.", {
    statusCode: 402,
    code: "INSUFFICIENT_BOOST_FUNDS",
    details: { balance_usd: 1 },
  });
  assert(err.statusCode === 402, "statut");
  assert(err.code === "INSUFFICIENT_BOOST_FUNDS", "code");
  assert(err.details.balance_usd === 1, "détails");
});

if (process.exitCode) {
  process.exit(process.exitCode);
} else {
  console.log("boostWallet: tous les tests sont passes");
}
