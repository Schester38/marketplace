// Vérifie/prépare les colonnes GPS du suivi temps réel (v228).
import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const needed = {
  sales: ["livreur_lat", "livreur_lng", "livreur_pos_at", "livreur_track", "buyer_lat", "buyer_lng"],
  users: ["lat", "lng", "position_updated_at"],
};

for (const [table, cols] of Object.entries(needed)) {
  const r = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
    [table]
  );
  const present = new Set(r.rows.map((x) => x.column_name));
  for (const col of cols) {
    if (present.has(col)) {
      console.log(`${table}.${col} : OK`);
    } else {
      console.log(`${table}.${col} : MANQUANT -> ajout...`);
      const type =
        col === "livreur_track"
          ? "JSONB NOT NULL DEFAULT '[]'::jsonb"
          : col === "livreur_pos_at" || col === "position_updated_at"
            ? "TIMESTAMPTZ"
            : "DOUBLE PRECISION";
      await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${type}`);
      console.log(`${table}.${col} : AJOUTE`);
    }
  }
}
await pool.end();