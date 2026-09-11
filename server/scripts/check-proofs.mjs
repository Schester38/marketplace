import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const r = await pool.query(`
  SELECT id, paid, status,
         left(payment_proof, 160) AS proof_prefix,
         left(referral_payment_proof, 160) AS ref_prefix
  FROM sales
  WHERE paid OR referral_paid
  ORDER BY id DESC
  LIMIT 12
`);
for (const row of r.rows) {
  console.log(
    `#${row.id} paid=${row.paid} status=${row.status} | proof: ${row.proof_prefix || "(NULL)"} | ref: ${row.ref_prefix || "(NULL)"}`
  );
}
await pool.end();