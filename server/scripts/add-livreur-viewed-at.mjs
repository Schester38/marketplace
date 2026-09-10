// Correction d'urgence: la colonne sales.livreur_viewed_at (v213) n'a pas été
// appliquée en prod (instances Vercel chaudes → initDb non ré-exécuté).
import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await pool.query(
  "ALTER TABLE sales ADD COLUMN IF NOT EXISTS livreur_viewed_at TIMESTAMPTZ"
);
const r = await pool.query(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'livreur_viewed_at'"
);
console.log("livreur_viewed_at présent:", r.rows.length > 0);
await pool.end();