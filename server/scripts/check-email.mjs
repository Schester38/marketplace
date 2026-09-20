// Vérifie si une adresse rebondissante existe dans la base (users / newsletter).
// Usage : node scripts/check-email.mjs .env email
import "./_load-env.mjs";
import pg from "pg";

const target = (process.argv[3] || "").trim().toLowerCase();
if (!target) {
  console.error("Usage : node scripts/check-email.mjs [env] adresse@email.com");
  process.exit(1);
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const q = (t, p) => client.query(t, p);

const users = await q(
  `SELECT id, name, role, email, email_verified, created_at FROM users WHERE LOWER(email) = $1`,
  [target]
);
const subs = await q(`SELECT id, email, created_at FROM newsletter_subscribers WHERE LOWER(email) = $1`, [target]);

console.log(`Adresse : ${target}`);
console.log("Comptes users :", users.rows.length ? JSON.stringify(users.rows, null, 2) : "aucun");
console.log("Newsletter   :", subs.rows.length ? JSON.stringify(subs.rows, null, 2) : "aucun");
await client.end();