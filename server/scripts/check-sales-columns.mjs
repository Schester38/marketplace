// Diagnostic: compare les colonnes référencées par la route /api/sales/livreur
// avec celles réellement présentes dans la table sales en production.
import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const NEEDED = [
  "id", "product_id", "seller_id", "buyer_id", "buyer_name", "buyer_phone", "buyer_code", "buyer_city", "buyer_address",
  "quantity", "total_price", "purchase_price", "commission", "referral_commission", "referred_by",
  "status", "currency", "created_at", "confirm_code", "hidden_for", "stock_reserved",
  "delivery_fee", "payment_method", "delivered_at", "delivered_by", "shop_confirmed_at",
  "paid", "paid_at", "payment_status", "referral_paid", "referral_paid_at",
  "commission_claimed_at", "referral_claimed_at",
  "online_payment", "payment_provider", "payment_country", "payment_operator",
  "payment_external_reference", "payment_provider_reference", "payment_link", "payment_error",
  "payment_received_by", "payout_initiated", "payout_initiated_at",
  "livreur_viewed_at", "signature",
];

const r = await pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'sales'"
);
const present = new Set(r.rows.map((x) => x.column_name));
const missing = NEEDED.filter((c) => !present.has(c));
console.log("=== Colonnes manquantes dans sales (prod) ===");
if (missing.length === 0) {
  console.log("AUCUNE — toutes les colonnes référencées existent.");
} else {
  missing.forEach((c) => console.log("  MANQUE:", c));
}
await pool.end();