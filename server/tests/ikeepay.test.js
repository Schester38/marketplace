// Tests du service iKeePay (PAYIN uniquement — adhésions + dons).
//  - normalizeWebhook : normalise les deux formats documentés
//    (« payment.success » et « transaction.updated » / « transaction.created »).
//  - Géométrie des montants / devises gérée côté webhook (processWebhook).
import { normalizeWebhook } from "../services/ikeepay.js";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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

suite("normalizeWebhook iKeePay", () => {
  test("accepte le format payment.success (completed)", () => {
    const w = normalizeWebhook({
      event: "payment.success",
      ikeepay_ref: "IKP-H2H-B5C9EC0E",
      order_id: "MBP-MEM-ABC123",
      amount: 1500,
      currency: "XOF",
      status: "completed",
    });
    assertTrue(!!w, "should parse");
    assertEqual(w.orderId, "MBP-MEM-ABC123", "orderId");
    assertEqual(w.amount, 1500, "amount");
    assertEqual(w.currency, "XOF", "currency");
    assertEqual(w.providerRef, "IKP-H2H-B5C9EC0E", "providerRef");
  });

  test("accepte le format transaction.updated (data.type=payin)", () => {
    const w = normalizeWebhook({
      event: "transaction.updated",
      data: {
        type: "payin",
        external_reference: "MBP-DON-ABC123",
        provider_reference: "IKP-H2H-DEF456",
        amount: 500,
        currency: "XAF",
        country: "CM",
        phone_number: "237699486146",
        operator: "ORANGE",
        status: "completed",
      },
    });
    assertTrue(!!w, "should parse");
    assertEqual(w.orderId, "MBP-DON-ABC123", "orderId");
    assertEqual(w.amount, 500, "amount");
    assertEqual(w.providerRef, "IKP-H2H-DEF456", "providerRef");
  });

  test("accepte transaction.created (data.type=payin)", () => {
    const w = normalizeWebhook({
      event: "transaction.created",
      data: { type: "payin", external_reference: "X", amount: 2500, currency: "XAF", status: "completed" },
    });
    assertTrue(!!w, "should parse");
    assertEqual(w.orderId, "X", "orderId");
  });

  test("rejette un payout (type != payin)", () => {
    const w = normalizeWebhook({
      event: "transaction.updated",
      data: { type: "payout", external_reference: "X", amount: 500, currency: "XAF", status: "completed" },
    });
    assertEqual(w, null, "should be null");
  });

  test("rejette une transaction non complétée (pending/failed)", () => {
    const w1 = normalizeWebhook({
      event: "transaction.updated",
      data: { type: "payin", external_reference: "X", amount: 500, currency: "XAF", status: "pending" },
    });
    const w2 = normalizeWebhook({
      event: "payment.success",
      order_id: "X",
      amount: 500,
      currency: "XAF",
      status: "failed",
    });
    assertEqual(w1, null, "pending rejected");
    assertEqual(w2, null, "failed rejected");
  });

  test("rejette un payload inconnu / vide", () => {
    assertEqual(normalizeWebhook(null), null, "null");
    assertEqual(normalizeWebhook({ event: "autre" }), null, "autre event");
    assertEqual(normalizeWebhook({}), null, "vide");
  });
});