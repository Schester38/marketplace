import {
  computeRedistribution,
  referralThresholdReached,
  commissionThresholdReached,
  REFERRAL_CLAIM_THRESHOLD,
} from "../services/payouts.js";
import {
  registerSchema,
  loginSchema,
  createProductSchema,
  deliverSaleSchema,
  proofSchema,
  reviewSchema,
  offerSchema,
  donationSchema,
  productListQuerySchema,
  salesListQuerySchema,
} from "../validators.js";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertValid(schema, value, label) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `${label}: should be valid — ${result.error.issues.map((i) => i.message).join(", ")}`
    );
  }
}

function assertInvalid(schema, value, label) {
  const result = schema.safeParse(value);
  if (result.success) {
    throw new Error(`${label}: should be invalid`);
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

suite("computeRedistribution", () => {
  test("distribue correctement sans parrainage", () => {
    const sale = { total_price: 1000, commission: 200, referral_commission: 0, delivery_fee: 500 };
    const r = computeRedistribution(sale);
    assertEqual(r.shopAmount, 800, "shopAmount");
    assertEqual(r.sellerAmount, 200, "sellerAmount");
    assertEqual(r.referrerAmount, 0, "referrerAmount");
    assertEqual(r.livreurAmount, 500, "livreurAmount");
  });

  test("distribue correctement avec parrainage 2%", () => {
    const sale = {
      total_price: 10000,
      commission: 1000,
      referral_commission: 200,
      delivery_fee: 1000,
    };
    const r = computeRedistribution(sale);
    assertEqual(r.shopAmount, 8800, "shopAmount");
    assertEqual(r.sellerAmount, 1000, "sellerAmount");
    assertEqual(r.referrerAmount, 200, "referrerAmount");
    assertEqual(r.livreurAmount, 1000, "livreurAmount");
  });

  test("gère les valeurs à 0", () => {
    const sale = { total_price: 0, commission: 0, referral_commission: 0, delivery_fee: 0 };
    const r = computeRedistribution(sale);
    assertEqual(r.shopAmount, 0, "shopAmount");
    assertEqual(r.sellerAmount, 0, "sellerAmount");
    assertEqual(r.referrerAmount, 0, "referrerAmount");
    assertEqual(r.livreurAmount, 0, "livreurAmount");
  });

  test("arrondit correctement les centimes", () => {
    const sale = {
      total_price: 333.33,
      commission: 66.66,
      referral_commission: 6.67,
      delivery_fee: 0,
    };
    const r = computeRedistribution(sale);
    assertEqual(r.shopAmount, 260, "shopAmount");
    assertEqual(r.sellerAmount, 66.66, "sellerAmount");
    assertEqual(r.referrerAmount, 6.67, "referrerAmount");
  });

  test("gère commission à 100% (boutique ne touche rien)", () => {
    const sale = { total_price: 5000, commission: 5000, referral_commission: 0, delivery_fee: 0 };
    const r = computeRedistribution(sale);
    assertEqual(r.shopAmount, 0, "shopAmount");
    assertEqual(r.sellerAmount, 5000, "sellerAmount");
  });

  test("gère des valeurs manquantes", () => {
    const sale = {};
    const r = computeRedistribution(sale);
    assertEqual(r.shopAmount, 0, "shopAmount");
    assertEqual(r.sellerAmount, 0, "sellerAmount");
    assertEqual(r.referrerAmount, 0, "referrerAmount");
    assertEqual(r.livreurAmount, 0, "livreurAmount");
  });

  test("gère une commission supérieure au total (erreur)", () => {
    const sale = { total_price: 1000, commission: 1500, referral_commission: 0, delivery_fee: 0 };
    const r = computeRedistribution(sale);
    assertEqual(r.shopAmount, -500, "shopAmount");
    assertEqual(r.sellerAmount, 1500, "sellerAmount");
  });
});

suite("referral threshold", () => {
  test("active le cumul à 5000 XAF pour les commissions de parrainage", () => {
    assertEqual(referralThresholdReached(4999), false, "below threshold");
    assertEqual(referralThresholdReached(5000), true, "at threshold");
    assertEqual(referralThresholdReached(15000), true, "above threshold");
    assertEqual(REFERRAL_CLAIM_THRESHOLD, 5000, "threshold value");
  });

  test("applique le même seuil aux commissions de vente produit", () => {
    assertEqual(commissionThresholdReached(4999), false, "product commission below threshold");
    assertEqual(commissionThresholdReached(5000), true, "product commission at threshold");
    assertEqual(commissionThresholdReached(15000), true, "product commission above threshold");
  });
});

suite("validators: registerSchema", () => {
  test("accepte un register valide", () => {
    assertValid(
      registerSchema,
      {
        name: "Jean Dupont",
        email: "jean@example.com",
        password: "secret123",
        role: "seller",
        acceptedTerms: true,
      },
      "valid register"
    );
  });

  test("rejette un email invalide", () => {
    assertInvalid(
      registerSchema,
      {
        name: "Jean",
        email: "bad-email",
        password: "secret123",
        role: "seller",
        acceptedTerms: true,
      },
      "invalid email"
    );
  });

  test("rejette acceptedTerms false", () => {
    assertInvalid(
      registerSchema,
      {
        name: "Jean",
        email: "jean@example.com",
        password: "secret123",
        role: "seller",
        acceptedTerms: false,
      },
      "terms not accepted"
    );
  });

  test("rejette un mot de passe trop court", () => {
    assertInvalid(
      registerSchema,
      {
        name: "Jean",
        email: "jean@example.com",
        password: "123",
        role: "seller",
        acceptedTerms: true,
      },
      "short password"
    );
  });

  test("rejette un rôle invalide", () => {
    assertInvalid(
      registerSchema,
      {
        name: "Jean",
        email: "jean@example.com",
        password: "secret123",
        role: "admin",
        acceptedTerms: true,
      },
      "invalid role"
    );
  });
});

suite("validators: loginSchema", () => {
  test("accepte un login valide", () => {
    assertValid(loginSchema, { email: "user@example.com", password: "password123" }, "valid login");
  });

  test("rejette un email invalide", () => {
    assertInvalid(
      loginSchema,
      { email: "not-an-email", password: "password123" },
      "invalid login email"
    );
  });
});

suite("validators: createProductSchema", () => {
  test("accepte un produit valide", () => {
    assertValid(
      createProductSchema,
      {
        name: "iPhone 15",
        price: 500000,
        commission_percent: 5,
        quantity: 10,
        delivery_fee: 2500,
      },
      "valid product"
    );
  });

  test("rejette une commission > 100", () => {
    assertInvalid(
      createProductSchema,
      {
        name: "iPhone 15",
        price: 500000,
        commission_percent: 101,
        quantity: 10,
      },
      "commission > 100"
    );
  });

  test("rejette un prix négatif", () => {
    assertInvalid(
      createProductSchema,
      {
        name: "iPhone 15",
        price: -100,
        quantity: 10,
      },
      "negative price"
    );
  });

  test("accepte commission à 0%", () => {
    assertValid(
      createProductSchema,
      {
        name: "Produit gratuit",
        price: 0,
        commission_percent: 0,
        quantity: 10,
      },
      "zero commission"
    );
  });
});

suite("validators: deliverSaleSchema", () => {
  test("accepte une livraison valide", () => {
    assertValid(
      deliverSaleSchema,
      {
        delivery_fee: 500,
        payment_method: "mobile",
        shop_code: "ABC123",
      },
      "valid delivery"
    );
  });

  test("rejette un code boutique vide", () => {
    assertInvalid(
      deliverSaleSchema,
      {
        delivery_fee: 500,
        payment_method: "mobile",
        shop_code: "",
      },
      "empty shop_code"
    );
  });

  test("accepte espèce", () => {
    assertValid(
      deliverSaleSchema,
      {
        delivery_fee: 0,
        payment_method: "espece",
        shop_code: "ABC123",
      },
      "cash delivery"
    );
  });

  test("accepte une signature client PNG valide", () => {
    assertValid(
      deliverSaleSchema,
      {
        delivery_fee: 1000,
        payment_method: "espèce",
        shop_code: "ABC123",
        signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
      },
      "delivery with valid signature"
    );
  });

  test("accepte une livraison sans signature (champ optionnel)", () => {
    assertValid(
      deliverSaleSchema,
      {
        delivery_fee: 0,
        payment_method: "mobile",
        shop_code: "ABC123",
      },
      "delivery without signature"
    );
  });

  test("rejette une signature qui n'est pas un PNG data URI", () => {
    assertInvalid(
      deliverSaleSchema,
      {
        delivery_fee: 0,
        payment_method: "mobile",
        shop_code: "ABC123",
        signature: "data:text/html;base64,PHNjcmlwdD4=",
      },
      "delivery with non-PNG signature"
    );
  });
});

suite("validators: proofSchema", () => {
  test("accepte une data URI valide", () => {
    assertValid(proofSchema, "data:image/png;base64,abc123", "valid proof");
  });

  test("rejette une URL HTTP", () => {
    assertInvalid(proofSchema, "http://example.com/proof.jpg", "http url");
  });

  test("rejette une string vide", () => {
    assertInvalid(proofSchema, "", "empty string");
  });

  test("rejette une data URI trop longue", () => {
    const longData = "data:image/png;base64," + "a".repeat(12000001);
    assertInvalid(proofSchema, longData, "too long proof");
  });
});

suite("validators: reviewSchema", () => {
  test("accepte un avis valide", () => {
    assertValid(reviewSchema, { product_id: 1, rating: 5, comment: "Excellent!" }, "valid review");
  });

  test("rejette une note à 0", () => {
    assertInvalid(reviewSchema, { product_id: 1, rating: 0 }, "rating 0");
  });

  test("rejette une note à 6", () => {
    assertInvalid(reviewSchema, { product_id: 1, rating: 6 }, "rating 6");
  });

  test("rejette un commentaire trop long", () => {
    assertInvalid(
      reviewSchema,
      { product_id: 1, rating: 5, comment: "a".repeat(501) },
      "comment too long"
    );
  });
});

suite("validators: offerSchema", () => {
  test("accepte une offre valide", () => {
    assertValid(
      offerSchema,
      {
        name: "Promo",
        original_price: 1000,
        promo_price: 500,
        quantity: 10,
      },
      "valid offer"
    );
  });

  test("rejette un prix promotionnel supérieur au prix normal", () => {
    assertInvalid(
      offerSchema,
      {
        name: "Promo",
        original_price: 500,
        promo_price: 1000,
        quantity: 10,
      },
      "promo > original"
    );
  });

  test("rejette plus de 3 photos", () => {
    assertInvalid(
      offerSchema,
      {
        name: "Promo",
        original_price: 1000,
        promo_price: 500,
        photos: [
          "data:image/png;base64,abc",
          "data:image/png;base64,def",
          "data:image/png;base64,ghi",
          "data:image/png;base64,jkl",
        ],
      },
      "too many photos"
    );
  });
});

suite("validators: donationSchema", () => {
  test("accepte un don valide", () => {
    assertValid(
      donationSchema,
      {
        amount: 1000,
        operator: "ORANGE",
        phone_number: "699123456",
      },
      "valid donation"
    );
  });

  test("rejette un montant <= 0", () => {
    assertInvalid(
      donationSchema,
      {
        amount: 0,
        operator: "ORANGE",
        phone_number: "699123456",
      },
      "zero amount"
    );
  });

  test("rejette un opérateur vide", () => {
    assertInvalid(
      donationSchema,
      {
        amount: 1000,
        operator: "",
        phone_number: "699123456",
      },
      "empty operator"
    );
  });
});

suite("validators: productListQuerySchema", () => {
  test("accepte une query valide", () => {
    assertValid(
      productListQuerySchema,
      {
        search: "iphone",
        category: "Électronique",
        sort: "price_asc",
        min_price: 1000,
        max_price: 500000,
        limit: 24,
        offset: 0,
      },
      "valid product query"
    );
  });

  test("rejette un sort invalide", () => {
    assertInvalid(productListQuerySchema, { sort: "invalid_sort" }, "invalid sort");
  });

  test("rejette un limit > 60", () => {
    assertInvalid(productListQuerySchema, { limit: 100 }, "limit too high");
  });

  test("rejette un min_price négatif", () => {
    assertInvalid(productListQuerySchema, { min_price: -100 }, "negative min_price");
  });
});

suite("validators: salesListQuerySchema", () => {
  test("accepte limit et offset valides", () => {
    assertValid(salesListQuerySchema, { limit: 50, offset: 10 }, "valid sales query");
  });

  test("rejette un limit > 200", () => {
    assertInvalid(salesListQuerySchema, { limit: 999 }, "limit too high");
  });
});

console.warn("\n✅ Tests terminés");
