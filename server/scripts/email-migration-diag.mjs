import pg from "pg";

const candidates = [
  process.env.DATABASE_URL,
  process.env.DATABASE_URL_POOLED,
  process.env.SUPABASE_DIRECT_URL,
].filter((u) => u && u.includes("postgres"));

if (!candidates.length) {
  console.error("Aucune URL PostgreSQL trouvée dans l'environnement");
  process.exit(1);
}

let pool;
for (const url of candidates) {
  try {
    pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
    await pool.query("SELECT 1");
    console.log("Connecté via:", url.replace(/:[^:@/]+@/, ":***@"));
    break;
  } catch (e) {
    console.warn("Échec connexion:", e.message);
    await pool.end().catch(() => {});
    pool = null;
  }
}
if (!pool) {
  console.error("Aucune connexion possible");
  process.exit(1);
}

try {
  // 1) Contraintes uniques / PK sur la table users
  const cons = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint
      WHERE conrelid = 'users'::regclass AND contype IN ('u','p')
      ORDER BY conname`
  );
  console.log("=== CONTRAINTES users (u/p) ===");
  for (const r of cons.rows) console.log(`- ${r.conname}: ${r.def}`);

  // 2) Index sur users
  const idx = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'users' ORDER BY indexname`
  );
  console.log("=== INDEX users ===");
  console.log(idx.rows.map((r) => r.indexname).join(", "));

  // 3) Doublons bloquants pour les index partiels
  const dup = await pool.query(`
    SELECT 'shop (2+ comptes boutique même email)' AS cat, email, count(*) AS n
      FROM users WHERE role='shop' GROUP BY email HAVING count(*)>1
    UNION ALL
    SELECT 'livreur (2+ comptes livreur même email)', email, count(*)
      FROM users WHERE role='livreur' GROUP BY email HAVING count(*)>1
    UNION ALL
    SELECT 'autre rôle (2+ comptes même email hors shop/livreur)', email, count(*)
      FROM users WHERE role NOT IN ('shop','livreur') GROUP BY email HAVING count(*)>1
    ORDER BY cat, email
  `);
  console.log("=== DOUBLONS BLOQUANTS ===");
  if (!dup.rows.length) console.log("(aucun — migration sans risque)");
  for (const r of dup.rows) console.log(`- [${r.cat}] ${r.email} x${r.n}`);

  // 4) État du compte concerné (forme exacte stockée)
  const me = await pool.query(
    `SELECT id, email, quote_literal(email) AS email_quoted, length(email) AS email_len,
            role, email_verified, failed_attempts, locked_until,
            password IS NOT NULL AS has_password, created_at
       FROM users WHERE email ILIKE $1 ORDER BY id`,
    ["jeana7010@gmail.com"]
  );
  console.log("=== COMPTES jeana7010@gmail.com ===");
  for (const r of me.rows)
    console.log(
      `- id=${r.id} email=${r.email_quoted} (len=${r.email_len}) role=${r.role} verified=${r.email_verified} ` +
        `has_pwd=${r.has_password} failed=${r.failed_attempts} locked_until=${r.locked_until ?? "—"} ` +
        `created=${r.created_at?.toISOString?.() ?? r.created_at}`
    );

  // 5) Groupes multi-comptes à la casse près (toute la base)
  const dups = await pool.query(
    `SELECT lower(email) AS lem, count(*) AS n,
            string_agg(id::text || ':' || quote_literal(email), ' | ' ORDER BY id) AS variants
       FROM users GROUP BY lower(email) HAVING count(*) > 1 ORDER BY n DESC LIMIT 20`
  );
  console.log("=== GROUPES MULTI-COMPTES (même email, casse/variations) ===");
  if (!dups.rows.length) console.log("(aucun)");
  for (const d of dups.rows) console.log(`- ${d.lem} x${d.n} → ${d.variants}`);
  // 6) Définitions des index email (uniques ? partiels ?)
  const defs = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'users' AND indexname IN
        ('users_email_key','users_email_partial_key','users_email_shop_key',
         'users_email_livreur_key','users_email_other_key','idx_users_email')
      ORDER BY indexname`
  );
  console.log("=== DÉFINITIONS INDEX EMAIL ===");
  for (const d of defs.rows) console.log(`- ${d.indexname}: ${d.indexdef}`);

  // 7) Contrainte de vérification : INSERT test (rollback immédiat)
  const t = await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO users (email, role, name) VALUES ('__diag_probe__@example.com', 'livreur', '__diag__')`
    );
    console.log("=== TEST INSERT livreur email neuf : OK (rollback) ===");
  } catch (e) {
    console.log("=== TEST INSERT livreur email neuf : ÉCHEC →", e.code, e.constraint ?? e.message);
  } finally {
    await pool.query("ROLLBACK");
  }
} finally {
  await pool.end();
}
