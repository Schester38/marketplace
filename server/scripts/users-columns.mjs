// Migration one-shot : remplacer UNIQUE(email) global par des index partiels
// (un seul compte PAR RÔLE et par email) pour autoriser le partage d'email
// UNIQUEMENT entre un compte boutique (shop) et un compte livreur.
import pg from "pg";

const url = process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

const step = async (label, sql) => {
  try {
    await pool.query(sql);
    console.log(`✓ ${label}`);
  } catch (e) {
    console.error(`✗ ${label} → ${e.code} ${e.message}`);
    process.exitCode = 1;
  }
};

// 1) Supprimer TOUTE contrainte UNIQUE portant uniquement sur (email)
const cons = await pool.query(
  `SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'u'
      AND conkey = (SELECT ARRAY[attnum::smallint] FROM pg_attribute
                     WHERE attrelid = 'public.users'::regclass AND attname = 'email')`
);
if (!cons.rows.length) console.log("• Aucune contrainte UNIQUE(email) restante");
for (const r of cons.rows) {
  await step(`DROP CONSTRAINT ${r.conname}`, `ALTER TABLE public.users DROP CONSTRAINT IF EXISTS "${r.conname}"`);
}

// 2) Index partiels : unicité PAR RÔLE
await step("INDEX users_email_shop_key (1 boutique / email)", "CREATE UNIQUE INDEX IF NOT EXISTS users_email_shop_key ON public.users(email) WHERE role = 'shop'");
await step("INDEX users_email_livreur_key (1 livreur / email)", "CREATE UNIQUE INDEX IF NOT EXISTS users_email_livreur_key ON public.users(email) WHERE role = 'livreur'");
await step("INDEX users_email_other_key (1 autre rôle / email)", "CREATE UNIQUE INDEX IF NOT EXISTS users_email_other_key ON public.users(email) WHERE role NOT IN ('shop','livreur')");

// 3) TEST transactionnel : boutique + livreur avec le MÊME email doit passer
try {
  await pool.query("BEGIN");
  const e = "__migration_probe__@example.com";
  await pool.query("INSERT INTO users (email, role, name, email_verified) VALUES ($1,'shop','__probe_shop__',true)", [e]);
  await pool.query("INSERT INTO users (email, role, name, email_verified) VALUES ($1,'livreur','__probe_livreur__',true)", [e]);
  console.log("✓ TEST shop+livreur même email : PASSÉ (rollback)");
} catch (e) {
  console.error(`✗ TEST shop+livreur même email → ${e.code} ${e.constraint ?? e.message}`);
  process.exitCode = 1;
} finally {
  await pool.query("ROLLBACK").catch(() => {});
}

// 4) État final
const final = await pool.query(
  `SELECT conname FROM pg_constraint WHERE conrelid='public.users'::regclass AND contype='u'`
);
console.log("Contraintes UNIQUE restantes :", final.rows.map((r) => r.conname).join(", ") || "(aucune)");
await pool.end();
