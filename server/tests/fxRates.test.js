import {
  CURRENCY_DECIMALS,
  FxRatesUnavailableError,
  availableCurrencies,
  convertAmount,
  normalizeCurrency,
  roundMoney,
  usableTopupCurrencies,
} from "../services/fxRates.js";

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

test("devises : normalisation", () => {
  assert(normalizeCurrency(" xaf ") === "XAF", "normalisation");
  assert(normalizeCurrency(null) === "", "valeur vide");
});

test("arrondi : decimales par devise", () => {
  assert(roundMoney(10.126, "USD") === 10.13, "USD 2 decimales");
  assert(roundMoney(5000.4, "XAF") === 5000, "XAF sans decimale");
  assert(CURRENCY_DECIMALS.XOF === 0, "XOF sans decimale");
});

test("conversion : base USD et devise identique", () => {
  assert(convertAmount(10, "USD", "USD", {}) === 10, "USD vers USD");
  assert(convertAmount(10, "USD", "XAF", { XAF: 600 }) === 6000, "USD vers XAF");
  assert(convertAmount(6000, "XAF", "USD", { XAF: 600 }) === 10, "XAF vers USD");
});

test("conversion : croisee via USD", () => {
  const rates = { EUR: 0.8, XAF: 600 };
  assert(convertAmount(80, "EUR", "XAF", rates) === 60000, "EUR vers XAF");
  assert(convertAmount(3000, "XAF", "EUR", rates) === 4, "XAF vers EUR");
});

test("conversion : devise inconnue refusee", () => {
  let error = null;
  try {
    convertAmount(10, "USD", "BTC", { EUR: 0.8 });
  } catch (err) {
    error = err;
  }
  assert(error instanceof FxRatesUnavailableError, "erreur FX attendue");
  assert(error.statusCode === 503, "statut 503");
});

test("recharge : seules les devises whitelistees et disponibles", () => {
  const rates = { EUR: 0.8, GBP: 0.7, XAF: 600, NGN: 1500 };
  assert(availableCurrencies(rates).includes("USD"), "USD toujours disponible");
  assert(availableCurrencies(rates).includes("NGN"), "NGN disponible");
  const usable = usableTopupCurrencies(rates);
  assert(usable.includes("USD") && usable.includes("XAF"), "USD/XAF utilisables");
  assert(!usable.includes("CAD"), "CAD absent");
  assert(!usable.includes("NGN"), "NGN hors whitelist recharge");
});

if (process.exitCode) {
  process.exit(process.exitCode);
} else {
  console.log("fxRates: tous les tests sont passes");
}
