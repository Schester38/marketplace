import {
  smmImportCatalogSchema,
  smmOrderSchema,
  smmPaymentDeclareSchema,
  smmOrderStatusSchema,
  boostWalletTopupSchema,
  boostAdminWalletCreditSchema,
} from "../validators.js";

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

test("commande : methode wallet par defaut", () => {
  const parsed = smmOrderSchema.parse({ service_id: 1 });
  assert(parsed.payment_method === "wallet", "methode par defaut");
});

test("commande : moneyfusion accepte", () => {
  const parsed = smmOrderSchema.parse({ service_id: 1, payment_method: "moneyfusion" });
  assert(parsed.payment_method === "moneyfusion", "moneyfusion");
});

test("commande : methode inconnue refusee", () => {
  const result = smmOrderSchema.safeParse({ service_id: 1, payment_method: "crypto" });
  assert(result.success === false, "methode inconnue acceptee");
});

test("declaration : ikeepay interdit (paiement en ligne uniquement)", () => {
  const result = smmPaymentDeclareSchema.safeParse({
    payment_reference: "REF-123",
    payment_method: "ikeepay",
  });
  assert(result.success === false, "ikeepay accepte en declaration");
});

test("declaration : mobile money accepte", () => {
  const parsed = smmPaymentDeclareSchema.parse({
    payment_reference: "REF-123",
    payment_method: "mobile_money",
  });
  assert(parsed.payment_method === "mobile_money", "mobile money");
});

test("statut admin : remboursements acceptes", () => {
  assert(smmOrderStatusSchema.parse({ status: "refund_pending" }).status === "refund_pending", "refund_pending");
  assert(smmOrderStatusSchema.parse({ status: "refunded" }).status === "refunded", "refunded");
});

test("import : valeurs par defaut sures", () => {
  const parsed = smmImportCatalogSchema.parse({});
  assert(parsed.types.length === 1 && parsed.types[0] === "default", "types");
  assert(parsed.limit === 0 && parsed.dry_run === false, "limit/dry_run");
  assert(parsed.markup === 1, "markup");
});

test("import : dry-run et types multiples", () => {
  const parsed = smmImportCatalogSchema.parse({
    types: ["default", "premium"],
    limit: 50,
    dry_run: true,
  });
  assert(parsed.types.length === 2, "types multiples");
  assert(parsed.limit === 50 && parsed.dry_run === true, "limit/dry_run");
});

test("import : plus de 10 types refuse", () => {
  const types = Array.from({ length: 11 }, (_, i) => `type${i}`);
  const result = smmImportCatalogSchema.safeParse({ types });
  assert(result.success === false, "11 types acceptes");
});

test("commande : paiement wallet accepte", () => {
  const parsed = smmOrderSchema.parse({ service_id: 1, payment_method: "wallet" });
  assert(parsed.payment_method === "wallet", "wallet");
});

test("recharge wallet : devise USD par defaut", () => {
  const parsed = boostWalletTopupSchema.parse({ amount: 10 });
  assert(parsed.currency === "USD", "USD par defaut");
  assert(parsed.amount === 10, "montant");
});

test("recharge wallet : XOF accepte et devise inconnue refusee", () => {
  assert(boostWalletTopupSchema.parse({ amount: 5000, currency: "XOF" }).currency === "XOF", "XOF");
  assert(
    boostWalletTopupSchema.safeParse({ amount: 10, currency: "BTC" }).success === false,
    "BTC accepte"
  );
});

test("recharge wallet : montant nul refuse", () => {
  assert(boostWalletTopupSchema.safeParse({ amount: 0 }).success === false, "0 accepte");
  assert(boostWalletTopupSchema.safeParse({ amount: -1 }).success === false, "-1 accepte");
});

test("credit admin wallet : remboursement et plafond", () => {
  const parsed = boostAdminWalletCreditSchema.parse({
    user_id: 12,
    amount_usd: 25,
    transaction_type: "refund",
  });
  assert(parsed.transaction_type === "refund", "refund");
  assert(
    boostAdminWalletCreditSchema.safeParse({ user_id: 12, amount_usd: 10001 }).success === false,
    "plafond 10000 depasse"
  );
  assert(
    boostAdminWalletCreditSchema.safeParse({
      user_id: 12,
      amount_usd: 10,
      transaction_type: "topup",
    }).success === false,
    "type topup accepte en admin"
  );
});

if (process.exitCode) {
  process.exit(process.exitCode);
} else {
  console.log("smmValidators: tous les tests sont passes");
}
