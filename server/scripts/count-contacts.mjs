// Compte des contacts joignables par téléphone dans le système (lecture seule).
import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const users = await pool.query(
  `SELECT role, COUNT(*) AS n
     FROM users
    WHERE phone IS NOT NULL AND phone <> ''
    GROUP BY role ORDER BY n DESC`
);
console.log("=== users avec téléphone ===");
for (const r of users.rows) console.log(`${r.role}: ${r.n}`);

const sales = await pool.query(
  `SELECT COUNT(*) AS n FROM sales WHERE buyer_phone IS NOT NULL AND buyer_phone <> ''`
);
console.log(`sales.buyer_phone distincts: ${(await pool.query(
  "SELECT COUNT(DISTINCT buyer_phone) AS n FROM sales WHERE buyer_phone IS NOT NULL AND buyer_phone <> ''"
)).rows[0].n}`);

const total = await pool.query(
  `SELECT COUNT(DISTINCT id) AS n FROM users WHERE phone IS NOT NULL AND phone <> ''`
);
console.log(`TOTAL contacts users (distincts): ${total.rows[0].n}`);
await pool.end();