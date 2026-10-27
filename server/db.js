import pg from "pg";
import { SMM_CATEGORIES, SMM_SERVICES } from "./services/smmCatalog.js";

const { Pool } = pg;

// Une version de schÃ©ma doit Ãªtre incrÃ©mentÃ©e uniquement lorsqu'une nouvelle
// migration est ajoutÃ©e Ã  initDb(). Sans ce garde-fou, chaque cold start Vercel
// rejouait toutes les CREATE/ALTER/INDEX et produisait des logs PostgreSQL.
// Marqueur de schÃ©ma : Ã  incrÃ©menter Ã  CHAQUE changement de structure, sinon
// initDb() (marqueur dÃ©jÃ  posÃ©) ne rejoue pas les migrations sur une base en
// service. 2026-10-03 : table familicash_orders (licences de l'application).
const DB_INIT_VERSION = "2026-10-26-mboppi-boost-payments-v2";
const DB_INIT_LOCK = "mboppi-db-init-v1";
let initDbPromise = null;

const LOCAL_DEFAULT = "postgres://postgres:postgres@localhost:5432/marketplace";

// PRIORITÃ‰ : DATABASE_URL (l'URL qui a toujours fonctionnÃ© en production).
// DATABASE_URL_POOLED (PgBouncer) est gardÃ© en secours uniquement : sa valeur
// sur Vercel contient un mot de passe invalide (Â« password authentication
// failed for user "postgres" Â») â€” elle ne doit redevenir prioritaire qu'aprÃ¨s
// correction du mot de passe dans les rÃ©glages Vercel.
const dbCandidates = [process.env.DATABASE_URL, process.env.DATABASE_URL_POOLED].filter(Boolean);
if (!dbCandidates.length) dbCandidates.push(LOCAL_DEFAULT);

function maskUrl(url) {
  return url.includes("@") ? url.replace(/:[^:@]+@/, ":***@") : url;
}

function createPool(url) {
  const p = new Pool({
    connectionString: url,
    ssl: url !== LOCAL_DEFAULT ? { rejectUnauthorized: false } : undefined,
    // Robustesse serverless (Vercel) :
    //  - max bas (2) : avec DATABASE_URL_POOLED (PgBouncer) les requÃªtes logiques
    //    sont multiplexÃ©es sur un petit pool physique â€” pas besoin de beaucoup de
    //    connexions par instance. Ã‰vite aussi de saturer PgBouncer lui-mÃªme.
    //  - connectionTimeoutMillis : si le pool de l'instance est plein (rafale de
    //    requÃªtes, ex. panneau admin qui poll en parallÃ¨le), les requÃªtes
    //    attendent AVANT d'Ã©chouer (8 s) â€” Ã©vite des 500 en Ã©pingle.
    //  - idleTimeoutMillis : libÃ¨re les connexions inactives, rÃ©duit la pression.
    max: 2,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  });
  // CRITIQUE : sans ce handler, quand Supabase ferme une connexion idle (timeout,
  // redÃ©marrage, coupure rÃ©seau), pg Ã©met un Ã©vÃ©nement 'error' NON gÃ©rÃ© sur le
  // pool â†’ crash de l'instance Node â†’ Â« erreur interne de serveur Â» sur toutes
  // les requÃªtes en vol. On capture et on loggie Ã  la place.
  p.on("error", (err) => {
    console.error("[db] erreur de connexion PostgreSQL (pool) :", err.message);
  });
  p.on("connect", (client) => {
    client.query("SET search_path TO public").catch(() => {});
  });
  return p;
}

// Pool initial : premier candidat (DATABASE_URL). La sÃ©lection dÃ©finitive se
// fait ci-dessous EN ARRIÃˆRE-PLAN (sans bloquer le chargement du module â€” des
// tests importent db.js en cascade) : on sonde chaque URL avec une vraie
// connexion et le pool est remplacÃ© Ã  chaud si une URL fonctionnelle est
// trouvÃ©e (ex. mot de passe invalide sur la prioritaire).
let currentUrl = dbCandidates[0];
let pool = createPool(currentUrl);

async function probeDbUrl(url) {
  const client = new pg.Client({
    connectionString: url,
    ssl: url !== LOCAL_DEFAULT ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 4000,
  });
  try {
    await client.query("SELECT 1");
  } finally {
    client.end().catch(() => {});
  }
}

(async () => {
  let chosen = dbCandidates[dbCandidates.length - 1];
  let ok = false;
  for (const candidate of dbCandidates) {
    try {
      await probeDbUrl(candidate);
      chosen = candidate;
      ok = true;
      break;
    } catch (err) {
      console.error(`[db] URL de base de donnÃ©es rejetÃ©e (${err.message}) : ${maskUrl(candidate)}`);
    }
  }
  if (!ok) return; // aucune URL fonctionnelle : on garde le pool initial (erreurs explicites cÃ´tÃ© requÃªtes)
  if (chosen !== currentUrl) {
    const old = pool;
    currentUrl = chosen;
    pool = createPool(chosen);
    console.error(`[db] bascule vers l'URL de secours : ${maskUrl(chosen)}`);
    old.end().catch(() => {});
  }
})();

export function getPool() {
  return pool;
}

export async function q(text, params = []) {
  const p = getPool();
  const res = await p.query(text, params);
  return res.rows;
}

export async function ensureColumn(table, column, definition) {
  const exists = await q(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  if (!exists.length) {
    await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
  }
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const tx = {
      query: async (text, params = []) => (await client.query(text, params)).rows,
    };
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function runInitDb() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT,
      provider TEXT NOT NULL DEFAULT 'email',
      role TEXT NOT NULL CHECK (role IN ('shop', 'seller', 'client', 'creator', 'livreur')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL CHECK (price >= 0),
      commission_percent REAL NOT NULL DEFAULT 0 CHECK (commission_percent >= 0 AND commission_percent <= 100),
      image TEXT,
      currency TEXT NOT NULL DEFAULT 'XAF',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      buyer_name TEXT NOT NULL,
      buyer_phone TEXT,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
      total_price REAL NOT NULL,
      commission REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
      currency TEXT NOT NULL DEFAULT 'XAF',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      warranty TEXT,
      original_price REAL NOT NULL CHECK (original_price >= 0),
      promo_price REAL NOT NULL CHECK (promo_price >= 0),
      phone TEXT,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
      photos TEXT NOT NULL DEFAULT '[]',
      currency TEXT NOT NULL DEFAULT 'XAF',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      buyer_name TEXT NOT NULL,
      buyer_phone TEXT,
      buyer_address TEXT,
      items JSONB NOT NULL DEFAULT '[]',
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'shipped', 'cancelled')),
      currency TEXT NOT NULL DEFAULT 'XAF',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    DROP TABLE IF EXISTS otp_codes;

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      keys JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Origine (hÃ´te) du service worker qui a crÃ©Ã© l'abonnement : un push est
    -- affichÃ© par le SW de CETTE origine â€” un abonnement crÃ©Ã© sur l'ancien
    -- alias ou l'apex faisait donc apparaÃ®tre l'ancienne URL sous la
    -- notification. Les envois ne visent que les origines officielles
    -- (server/urls.js), les autres se rÃ©abonnent sur le domaine officiel.
    ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS origin TEXT;

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      unsubscribe_token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_sent_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);

    CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
    CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id);
    CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'email';
    ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('shop', 'seller', 'client', 'creator', 'livreur', 'admin'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  // admin_approved : backfill UNIQUEMENT Ã  la crÃ©ation de la colonne.
  // âš ï¸ Ne JAMAIS resynchroniser admin_approved sur verified Ã  chaque boot :
  // l'admin ouvre les comptes (admin_approved = TRUE alors que verified reste
  // FALSE) â€” une resynchronisation les refermerait Ã  chaque cold start.
  {
    const { rows: pre } = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'admin_approved') AS existed`
    );
    const existed = pre?.[0]?.existed === true;
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN NOT NULL DEFAULT FALSE;`);
    if (!existed) {
      await pool.query(`UPDATE users SET admin_approved = COALESCE(verified, FALSE) WHERE admin_approved IS DISTINCT FROM verified;`);
    }
  }

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_expires TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
    UPDATE users SET email_verified = TRUE WHERE email_verified IS NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS photos TEXT NOT NULL DEFAULT '[]';
    UPDATE products SET photos = json_build_array(image)::text WHERE image IS NOT NULL AND photos = '[]';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty INTEGER;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_fee REAL NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS contact TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0;
    UPDATE products SET reserved_quantity = 0 WHERE reserved_quantity IS NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price REAL;
    ALTER TABLE products ALTER COLUMN price TYPE NUMERIC(14,2) USING round(price::numeric, 2);
    ALTER TABLE products ALTER COLUMN commission_percent TYPE NUMERIC(9,6) USING round(commission_percent::numeric, 6);
    ALTER TABLE products ALTER COLUMN delivery_fee TYPE NUMERIC(14,2) USING round(delivery_fee::numeric, 2);
    ALTER TABLE products ALTER COLUMN old_price TYPE NUMERIC(14,2) USING CASE WHEN old_price IS NULL THEN NULL ELSE round(old_price::numeric, 2) END;
    ALTER TABLE products ALTER COLUMN warranty TYPE TEXT USING warranty::text;
    ALTER TABLE sales ALTER COLUMN buyer_name DROP NOT NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS purchase_price REAL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_code TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_city TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_address TEXT;
    -- E-mail de l'acheteur (facultatif, saisi Ã  la commande) : reÃ§u, suivi, et
    -- invitation Ã  laisser un avis Trustpilot aprÃ¨s la livraison (BCC).
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_email TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_email TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_fee REAL NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS confirm_code TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivered_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    -- Signature du client (PNG data URI) capturÃ©e par le livreur Ã  la
    -- livraison, rÃ©affichÃ©e sur la facture PDF.
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS signature TEXT;
    -- Marquage Â« prise en charge par un livreur Â» â€” posÃ© quand un livreur
    -- authentifiÃ© consulte l'espace de la boutique (serve de preuve et
    -- dÃ©clenche la confirmation automatique de la commande).
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS livreur_viewed_at TIMESTAMPTZ;
    -- Suivi GPS temps rÃ©el d'une livraison : position actuelle du livreur +
    -- trace (dernier ~60 points) + position GPS du client (partagÃ©e Ã  la
    -- commande). MasquÃ©es dÃ¨s que la vente n'est plus pending/confirmed.
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS livreur_lat DOUBLE PRECISION;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS livreur_lng DOUBLE PRECISION;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS livreur_pos_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS livreur_track JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_lat DOUBLE PRECISION;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_lng DOUBLE PRECISION;
    -- Position GPS partagÃ©e volontairement par la boutique (carte de suivi).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
    -- FraÃ®cheur de la position : un livreur Â« disponible Â» met Ã  jour cette
    -- colonne Ã  chaque ping â†’ les cartes Â« Ã  proximitÃ© Â» ne montrent que les
    -- acteurs rÃ©ellement en ligne (position < 10 min), pas les anciennes.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS position_updated_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_proof TEXT;
    ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
    ALTER TABLE sales ADD CONSTRAINT sales_status_check CHECK (status IN ('pending', 'confirmed', 'bought', 'delivered', 'cancelled'));
    ALTER TABLE sales ALTER COLUMN seller_id DROP NOT NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS shop_confirmed_at TIMESTAMPTZ;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reference_number TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_paid_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_expires_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_fee NUMERIC(14,2);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_payment_reference TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_commission REAL NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_paid BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_paid_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_claimed_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_claimed_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_payment_proof TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS hidden_for INTEGER[] NOT NULL DEFAULT '{}';
    ALTER TABLE sales ALTER COLUMN total_price TYPE NUMERIC(14,2) USING round(total_price::numeric, 2);
    ALTER TABLE sales ALTER COLUMN commission TYPE NUMERIC(14,2) USING round(commission::numeric, 2);
    ALTER TABLE sales ALTER COLUMN purchase_price TYPE NUMERIC(14,2) USING CASE WHEN purchase_price IS NULL THEN NULL ELSE round(purchase_price::numeric, 2) END;
    ALTER TABLE sales ALTER COLUMN delivery_fee TYPE NUMERIC(14,2) USING round(delivery_fee::numeric, 2);
    ALTER TABLE sales ALTER COLUMN referral_commission TYPE NUMERIC(14,2) USING round(referral_commission::numeric, 2);
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_sales_confirm_code ON sales(confirm_code) WHERE confirm_code IS NOT NULL;

    ALTER TABLE sales ADD COLUMN IF NOT EXISTS online_payment BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_status TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'manual';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS provider_order_id TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS provider_payload JSONB;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_received_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payout_initiated BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payout_initiated_at TIMESTAMPTZ;

    -- Email partagÃ© : AUTORISÃ‰ UNIQUEMENT entre un compte boutique (shop) et
    -- un compte livreur. On remplace la contrainte globale UNIQUE (email) par
    -- des index partiels. Cette partie est exÃ©cutÃ©e SEPAREMENT (ligne ci-dessous
    -- en JS) avec try/catch : si la migration partielle Ã©choue (ex. doublons
    -- historiques), elle ne fait PAS Ã©chouer tout initDb.
    ALTER TABLE products ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'XAF';
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'XAF';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'XAF';
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'XAF';

    ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL;

    CREATE TABLE IF NOT EXISTS seller_payment_methods (
      id SERIAL PRIMARY KEY,
      seller_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT,
      wallets JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS shop_payment_methods (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT,
      wallets JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS livreur_payment_methods (
      id SERIAL PRIMARY KEY,
      livreur_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT,
      wallets JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // ------------------------------------------------ MIGRATION EMAIL PARTAGÃ‰
  // AUTORISÃ‰ : boutique (shop) â†” livreur uniquement. On remplace la
  // contrainte globale UNIQUE(email) par des index partiels. EXÃ‰CUTÃ‰
  // SÃ‰PARÃ‰MENT avec try/catch : un Ã©chec ici ne doit PAS faire Ã©chouer le
  // reste de initDb (Ex : doublons historiques).
  try {
    // 1) Retirer la contrainte globale UNIQUE(email) â€” quel que soit son nom rÃ©el.
    const constraints = await pool.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'users'::regclass AND contype = 'u'
         AND conkey = (
           SELECT ARRAY[attnum::int2] FROM pg_attribute
           WHERE attrelid = 'users'::regclass AND attname = 'email'
         )`
    );
    for (const row of constraints.rows) {
      await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "${row.conname}"`).catch(() => {});
    }
    // 2) Index partiels (uniques) â€” le Â« one per email Â» se fait par rÃ´le.
    await pool
      .query(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_email_shop_key ON users(email) WHERE role = 'shop'`
      )
      .catch(() => {});
    await pool
      .query(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_email_livreur_key ON users(email) WHERE role = 'livreur'`
      )
      .catch(() => {});
    await pool
      .query(
        `CREATE UNIQUE INDEX IF NOT EXISTS users_email_other_key ON users(email) WHERE role NOT IN ('shop', 'livreur')`
      )
      .catch(() => {});
  } catch (err) {
    console.warn("[db] migration email partagÃ© (boutique-livreur) ignorÃ©e :", err.message);
  }

  await pool.query(`
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;\n    ALTER TABLE offers ALTER COLUMN original_price TYPE NUMERIC(14,2) USING round(original_price::numeric, 2);
    ALTER TABLE offers ALTER COLUMN promo_price TYPE NUMERIC(14,2) USING round(promo_price::numeric, 2);
    ALTER TABLE orders ALTER COLUMN total TYPE NUMERIC(14,2) USING round(total::numeric, 2);
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_external_reference TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_provider_reference TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_link TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_error TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_country TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_operator TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_external_reference TEXT;
  `);

  // ------------------------------------- PRODUITS DIGITAUX (tÃ©lÃ©chargeables)
  // Un produit digital n'est JAMAIS exposÃ© par une URL publique : le fichier
  // vit dans le bucket PRIVÃ‰ `digital-products` (Supabase Storage) et n'est
  // remis qu'en URL SIGNÃ‰E Ã  durÃ©e courte, aprÃ¨s vÃ©rification du droit
  // d'accÃ¨s cÃ´tÃ© serveur (POST /api/digital/:saleId/download).
  // `digital_downloads` sert de journal ET de compteur (quota par vente).
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS is_digital BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS digital_path TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS digital_name TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS digital_mime TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS digital_size BIGINT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS digital_version INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS digital_download_limit INTEGER NOT NULL DEFAULT 5;
    -- Contenus PROTÃ‰GÃ‰S (vidÃ©os YouTube non rÃ©pertoriÃ©es, expiration, rÃ©vocation).
    -- digital_kind : NULL/'file' = fichier tÃ©lÃ©chargeable (comportement historique),
    -- 'youtube'    = vidÃ©o hÃ©bergÃ©e sur YouTube (non rÃ©pertoriÃ©e) â€” l'ID n'est
    -- JAMAIS exposÃ© publiquement (retirÃ© par productRow) : il n'est remis qu'au
    -- dÃ©tenteur du droit, par GET /api/digital/:saleId/video.
    -- access_days  : durÃ©e d'accÃ¨s en jours aprÃ¨s confirmation du paiement
    --                (NULL = illimitÃ©, comportement historique).
    ALTER TABLE products ADD COLUMN IF NOT EXISTS digital_kind TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS youtube_id TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS access_days INTEGER;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS access_revoked BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ;
    -- Prolongation d'accÃ¨s PAR ACHETEUR : jours ajoutÃ©s Ã  la durÃ©e du produit
    -- (access_days) sans modifier la fiche produit ni les autres acheteurs.
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS access_days_extra INTEGER NOT NULL DEFAULT 0;
    -- Journal enrichi : action = 'download' (historique, dÃ©faut) ou 'video'
    -- (visionnage d'une vidÃ©o protÃ©gÃ©e). Les visionnages ne consomment PAS le
    -- quota de tÃ©lÃ©chargements (usedDownloads ne compte que 'download').
    ALTER TABLE digital_downloads ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'download';

    ALTER TABLE products ADD COLUMN IF NOT EXISTS digital_download_limit INTEGER NOT NULL DEFAULT 5;

    CREATE TABLE IF NOT EXISTS digital_downloads (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_digital_downloads_sale ON digital_downloads(sale_id);
    CREATE INDEX IF NOT EXISTS idx_digital_downloads_user ON digital_downloads(user_id);

    -- ACHATS DIGITAUX EN LIGNE (iKeePay) : paiement par vente + rÃ©partition
    -- des gains par bÃ©nÃ©ficiaire (crÃ©ateur / vendeur / parrain). Le
    -- tÃ©lÃ©chargement s'ouvre quand sales.shop_confirmed_at est posÃ© (webhook).
    CREATE TABLE IF NOT EXISTS digital_payments (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      external_reference TEXT UNIQUE NOT NULL,
      provider_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','expired')),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_digital_payments_sale ON digital_payments(sale_id);
    CREATE INDEX IF NOT EXISTS idx_digital_payments_status ON digital_payments(status, created_at);

    CREATE TABLE IF NOT EXISTS online_earnings (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      beneficiary_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      beneficiary_role TEXT NOT NULL CHECK (beneficiary_role IN ('creator','seller','referral')),
      kind TEXT NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale','referral')),
      amount REAL NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_online_earnings_sale_user ON online_earnings(sale_id, beneficiary_id, kind);
    CREATE INDEX IF NOT EXISTS idx_online_earnings_user ON online_earnings(beneficiary_id);

    -- Demandes de retrait (crÃ©ateur + vendeur) : mÃªme principe que les
    -- retraits d'activation â€” l'admin paie manuellement (espÃ¨ces/Mobile Money).
    CREATE TABLE IF NOT EXISTS online_withdrawals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','rejected')),
      payment_method TEXT,
      payment_detail TEXT,
      admin_note TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_online_withdrawals_user ON online_withdrawals(user_id);
  `);

  // Horodatage du paiement EN LIGNE d'une vente digitale (webhook iKeePay).
  await pool
    .query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS paid_online_at TIMESTAMPTZ`)
    .catch((err) =>
      console.warn("[db] colonne sales.paid_online_at ignorÃ©e :", err.message)
    );

  // ------------------------------------- ACHATS DIGITAUX EN LIGNE (iKeePay)
  // (tables dÃ©jÃ  crÃ©Ã©es ci-dessus : digital_payments, online_earnings,
  // online_withdrawals â€” ce bloc ne faisait que les dupliquer.)

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_seller_code ON users(seller_code) WHERE seller_code IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_shop_code ON users(shop_code) WHERE shop_code IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_reference_number ON users(reference_number) WHERE reference_number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_payment_external_reference ON sales(payment_external_reference) WHERE payment_external_reference IS NOT NULL;

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'sale_bought',
      sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
      amount REAL,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS amount REAL;
    ALTER TABLE notifications ALTER COLUMN amount TYPE NUMERIC(14,2) USING CASE WHEN amount IS NULL THEN NULL ELSE round(amount::numeric, 2) END;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
    ALTER TABLE notifications ADD COLUMN IF NOT EXISTS body TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      buyer_name TEXT,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
    DELETE FROM reviews a USING reviews b
      WHERE a.product_id = b.product_id AND a.user_id = b.user_id AND a.id > b.id;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_product ON reviews(product_id, user_id) WHERE user_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      detail TEXT,
      ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

    CREATE TABLE IF NOT EXISTS client_logs (
      id BIGSERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      stack TEXT,
      url TEXT,
      username TEXT,
      user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_client_logs_created ON client_logs(created_at);

    -- PrÃ©fÃ©rences de notifications push par utilisateur (absence de ligne =
    -- tout activÃ© par dÃ©faut). L'utilisateur opt-out via Mon compte.
    CREATE TABLE IF NOT EXISTS push_prefs (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      flash_ok BOOLEAN NOT NULL DEFAULT TRUE,
      digest_ok BOOLEAN NOT NULL DEFAULT TRUE,
      messages_ok BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS admin_messages (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'user')),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_admin_messages_target ON admin_messages(target);
    CREATE INDEX IF NOT EXISTS idx_admin_messages_user ON admin_messages(user_id);

    CREATE TABLE IF NOT EXISTS admin_message_reads (
      message_id INTEGER NOT NULL REFERENCES admin_messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (message_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_admin_message_reads_user ON admin_message_reads(user_id);

    CREATE TABLE IF NOT EXISTS wallet_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'XAF',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('commission_credit','referral_credit','payout_debit','adjustment','online_collect','online_payout')),
      reference_type TEXT,
      reference_id INTEGER,
      description TEXT,
      fee NUMERIC(14,2) DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, transaction_type, reference_type, reference_id)
    );
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON wallet_transactions(reference_type, reference_id);

    CREATE TABLE IF NOT EXISTS automatic_payouts (
      id BIGSERIAL PRIMARY KEY,
      external_reference TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      fee NUMERIC(14,2) DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
      provider_reference TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_automatic_payouts_user ON automatic_payouts(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS payment_webhook_logs (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'manual',
      provider_transaction_id TEXT,
      provider_order_id TEXT,
      event TEXT,
      payload JSONB,
      status TEXT,
      sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
      handled BOOLEAN NOT NULL DEFAULT FALSE,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS membership_payments (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(14,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'XAF',
      external_reference TEXT NOT NULL UNIQUE,
      provider_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
      payment_link TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS platform_payouts (
      id BIGSERIAL PRIMARY KEY,
      external_reference TEXT NOT NULL UNIQUE,
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
      provider_reference TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS donations (
      id BIGSERIAL PRIMARY KEY,
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      country TEXT NOT NULL DEFAULT 'Cameroun',
      donor_phone TEXT,
      operator TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
      external_reference TEXT UNIQUE,
      provider_reference TEXT,
      payment_link TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_membership_payments_user ON membership_payments(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payment_webhook_logs_provider ON payment_webhook_logs(provider, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payment_webhook_logs_order ON payment_webhook_logs(provider_order_id);

    -- FamiliCash : licences de l'application mobile. Le relais /familicash/api
    -- crÃ©e une commande par achat, iKeePay confirme, puis la licence signÃ©e
    -- (Ed25519) est stockÃ©e ici et vÃ©rifiable hors ligne par l'application.
    -- Aucune FK vers users : un foyer FamiliCash existe sans compte Mboppi.
    CREATE TABLE IF NOT EXISTS familicash_orders (
      id BIGSERIAL PRIMARY KEY,
      household_id TEXT NOT NULL,
      plan TEXT NOT NULL CHECK (plan IN ('m', 'y')),
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      external_reference TEXT NOT NULL UNIQUE,
      provider_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
      license TEXT,
      license_expires_at TIMESTAMPTZ,
      email TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_familicash_orders_household ON familicash_orders(household_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_familicash_orders_expires ON familicash_orders(license_expires_at DESC) WHERE license_expires_at IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_familicash_orders_pending ON familicash_orders(household_id, plan) WHERE status = 'pending';

    -- Configuration plateforme (paiement) : mode manuel/automatique + clÃ©s iKeePay.
    -- En mode automatique, seuls les PAYIN (adhÃ©sion, don) passent par iKeePay ;
    -- les versements vers vendeurs/parrains restent manuels.
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE donations ADD COLUMN IF NOT EXISTS donor_email TEXT;

    ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check CHECK (transaction_type IN ('commission_credit','referral_credit','payout_debit','adjustment','online_collect','online_payout'));
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_buyer ON sales(buyer_id) WHERE buyer_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sales_referred_by ON sales(referred_by) WHERE referred_by IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sales_paid_at ON sales(paid_at) WHERE paid_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_products_shop_created ON products(shop_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read = FALSE;
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
  `);

  // GÃ‰NÃ‰RATEUR DE DOCUMENTS (ebooks/PDF) â€” module isolÃ©, tables ADDITIVES.
  // owner_id n'a volontairement PAS de FK vers users : l'admin Â« virtuel Â»
  // (id 0, connexion par mot de passe admin) n'existe pas dans la table users
  // et doit pouvoir crÃ©er/sauvegarder des documents.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gen_documents (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL DEFAULT 0,
      doc_ref TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT 'Sans titre',
      subtitle TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
      page_format TEXT NOT NULL DEFAULT 'A4',
      page_width REAL,
      page_height REAL,
      orientation TEXT NOT NULL DEFAULT 'portrait',
      margins JSONB NOT NULL DEFAULT '{}'::jsonb,
      template_id TEXT NOT NULL DEFAULT 'moderne',
      style_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
      cover JSONB NOT NULL DEFAULT '{}'::jsonb,
      back_cover JSONB NOT NULL DEFAULT '{}'::jsonb,
      protection JSONB NOT NULL DEFAULT '{}'::jsonb,
      content_hash TEXT NOT NULL DEFAULT '',
      -- Produit digital publiÃ© depuis le GÃ©nÃ©rateur (Â« Vendre sur MboppiShop Â») :
      -- une republication met Ã  jour CE produit au lieu d'en crÃ©er un doublon.
      published_product_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS gen_documents_data (
      doc_id INTEGER PRIMARY KEY REFERENCES gen_documents(id) ON DELETE CASCADE,
      content JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS gen_versions (
      id BIGSERIAL PRIMARY KEY,
      doc_id INTEGER NOT NULL REFERENCES gen_documents(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '',
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_gen_documents_owner ON gen_documents(owner_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gen_versions_doc ON gen_versions(doc_id, created_at DESC);
  `);

  // Migration additive (bases dÃ©jÃ  crÃ©Ã©es par une version antÃ©rieure) : lien
  // vers le produit digital publiÃ©. Un Ã©chec ne bloque pas le dÃ©marrage.
  try {
    await pool.query(
      `ALTER TABLE gen_documents ADD COLUMN IF NOT EXISTS published_product_id INTEGER`
    );
  } catch (err) {
    console.warn("[db] migration gen_documents.published_product_id :", err.message);
  }

  // Migration additive (Studio d'Ã©dition page par page) : modÃ¨le structurÃ©
  // Page â†’ Ã©lÃ©ments typÃ©s (JSONB). null = document jamais ouvert dans le
  // Studio â†’ le moteur historique (paginÃ©) reste la seule source de vÃ©ritÃ©.
  try {
    await pool.query(
      `ALTER TABLE gen_documents ADD COLUMN IF NOT EXISTS page_layout JSONB`
    );
  } catch (err) {
    console.warn("[db] migration gen_documents.page_layout :", err.message);
  }

  try {
    await purgeOldTransactions();
  } catch {
    /* purge best-effort : un Ã©chec ne doit pas bloquer le dÃ©marrage */
  }

  // ===== MBOPPIBOOST : services de marketing digital =====
  // Tables additives : catÃ©gories, services, fournisseurs, commandes, Ã©vÃ©nements.
  await pool.query(`
    -- CatÃ©gories de services (audience, contenus, rÃ©seaux sociaux, publicitÃ©)
    CREATE TABLE IF NOT EXISTS smm_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_smm_categories_slug ON smm_categories(slug);
    CREATE INDEX IF NOT EXISTS idx_smm_categories_active ON smm_categories(is_active);

    -- Services de marketing digital (un service appartient Ã  une catÃ©gorie)
    CREATE TABLE IF NOT EXISTS smm_services (
      id SERIAL PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES smm_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      short_description TEXT,
      price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      billing_unit TEXT NOT NULL DEFAULT 'service',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
      is_automated BOOLEAN NOT NULL DEFAULT FALSE,
      is_consulting BOOLEAN NOT NULL DEFAULT FALSE,
      is_campaign BOOLEAN NOT NULL DEFAULT FALSE,
      external_service_id TEXT,
      delivery_days INTEGER,
      conditions TEXT,
      limits JSONB NOT NULL DEFAULT '{}'::jsonb,
      platform TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE smm_services ADD COLUMN IF NOT EXISTS platform TEXT;
    CREATE INDEX IF NOT EXISTS idx_smm_services_category ON smm_services(category_id);
    CREATE INDEX IF NOT EXISTS idx_smm_services_status ON smm_services(status);
    CREATE INDEX IF NOT EXISTS idx_smm_services_platform ON smm_services(platform);
    CREATE INDEX IF NOT EXISTS idx_smm_services_public ON smm_services(status, platform, category_id);
    UPDATE smm_services s
    SET platform = c.slug
    FROM smm_categories c
    WHERE s.category_id = c.id
      AND s.platform IS NULL
      AND c.slug IN ('instagram', 'tiktok', 'youtube', 'telegram', 'facebook', 'twitter', 'spotify');

    -- Fournisseurs SMM configurÃ©s (un seul actif Ã  la fois)
    CREATE TABLE IF NOT EXISTS smm_providers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      provider_key TEXT NOT NULL UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_smm_providers_active ON smm_providers(is_active);
    CREATE INDEX IF NOT EXISTS idx_smm_providers_key ON smm_providers(provider_key);

    -- Commandes MboppiBoost (passÃ©es par les clients)
    CREATE TABLE IF NOT EXISTS smm_orders (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      service_id INTEGER NOT NULL REFERENCES smm_services(id) ON DELETE RESTRICT,
      service_name TEXT NOT NULL,
      service_price NUMERIC(14,2) NOT NULL CHECK (service_price >= 0),
      currency TEXT NOT NULL DEFAULT 'XAF',
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
      total NUMERIC(14,2) NOT NULL CHECK (total >= 0),
      billing_unit TEXT NOT NULL DEFAULT 'service',
      client_info JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_payment', 'paid', 'submitted', 'processing', 'completed', 'failed', 'cancelled', 'refund_pending', 'refunded')),
      payment_status TEXT,
      provider_status TEXT,
      external_reference TEXT,
      provider_reference TEXT,
      idempotency_key TEXT UNIQUE,
      public_token TEXT,
      payment_method TEXT,
      payment_proof TEXT,
      payment_reference TEXT,
      payment_declared_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE smm_orders ADD COLUMN IF NOT EXISTS public_token TEXT;
    ALTER TABLE smm_orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
    ALTER TABLE smm_orders ADD COLUMN IF NOT EXISTS payment_declared_at TIMESTAMPTZ;
    ALTER TABLE smm_orders ADD COLUMN IF NOT EXISTS payment_external_reference TEXT;
    ALTER TABLE smm_orders ADD COLUMN IF NOT EXISTS payment_provider TEXT;
    ALTER TABLE smm_orders ADD COLUMN IF NOT EXISTS payment_fallback_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_smm_orders_user ON smm_orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_smm_orders_status ON smm_orders(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_smm_orders_idempotency ON smm_orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_smm_orders_external ON smm_orders(external_reference) WHERE external_reference IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_smm_orders_public_token ON smm_orders(public_token) WHERE public_token IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_smm_orders_payment_external
      ON smm_orders(payment_external_reference) WHERE payment_external_reference IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_smm_orders_pending_payment
      ON smm_orders(created_at) WHERE status = 'pending_payment';

    -- Journal des Ã©vÃ©nements de commande (traÃ§abilitÃ©)
    CREATE TABLE IF NOT EXISTS smm_order_events (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES smm_orders(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      message TEXT,
      provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_smm_order_events_order ON smm_order_events(order_id, created_at DESC);

    -- Mapping service interne â†” service externe fournisseur
    CREATE TABLE IF NOT EXISTS smm_provider_mappings (
      id SERIAL PRIMARY KEY,
      provider_id INTEGER NOT NULL REFERENCES smm_providers(id) ON DELETE CASCADE,
      smm_service_id INTEGER NOT NULL REFERENCES smm_services(id) ON DELETE CASCADE,
      external_service_id TEXT NOT NULL,
      external_name TEXT,
      external_price NUMERIC(14,2),
      currency TEXT DEFAULT 'XAF',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (provider_id, smm_service_id)
    );
    CREATE INDEX IF NOT EXISTS idx_smm_provider_mappings_provider ON smm_provider_mappings(provider_id);
    CREATE INDEX IF NOT EXISTS idx_smm_provider_mappings_service ON smm_provider_mappings(smm_service_id);
  `);

  // Amorçage idempotent du catalogue MboppiBoost (7 plateformes, 34 services).
  // Le catalogue visible vient de server/services/smmCatalog.js, jamais du client.
  try {
    const activeServices = (
      await pool.query(`SELECT COUNT(*)::int AS n FROM smm_services WHERE status = 'active'`)
    ).rows[0]?.n || 0;
    if (!activeServices) {
      await pool.query(
        `UPDATE smm_categories SET is_active = FALSE
         WHERE slug = ANY($1::text[])`,
        [["audience", "contenus", "reseaux-sociaux", "publicite"]]
      );
    }
    for (const category of SMM_CATEGORIES) {
      await pool.query(
        `INSERT INTO smm_categories (name, slug, description, icon, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               icon = EXCLUDED.icon,
               sort_order = EXCLUDED.sort_order,
               is_active = TRUE`,
        [
          category.name,
          category.slug,
          category.description,
          category.icon,
          category.sort_order,
          category.is_active,
        ]
      );
    }
    const serviceCount = (
      await pool.query(`SELECT COUNT(*)::int AS n FROM smm_services`)
    ).rows[0]?.n || 0;
    if (!serviceCount) {
      for (const service of SMM_SERVICES) {
        await pool.query(
          `INSERT INTO smm_services
             (category_id, name, short_description, description, price, currency, billing_unit,
              status, is_automated, is_consulting, is_campaign, delivery_days, conditions, limits,
              platform, sort_order, created_at, updated_at)
           SELECT c.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, now(), now()
           FROM smm_categories c WHERE c.slug = $1`,
          [
            service.categorySlug,
            service.name,
            service.short_description,
            service.description,
            service.price,
            service.currency,
            service.billing_unit,
            service.status,
            service.is_automated,
            service.is_consulting,
            service.is_campaign,
            service.delivery_days,
            service.conditions,
            JSON.stringify(service.limits),
            service.categorySlug,
            service.sort_order,
          ]
        );
      }
    }
  } catch (err) {
    console.warn("[db] amorçage MboppiBoost :", err.message);
  }
}

// Lance le schÃ©ma une seule fois par version sur une base partagÃ©e. Le
// marqueur est posÃ© seulement aprÃ¨s la rÃ©ussite complÃ¨te des migrations.
// Une autre instance qui frappe pendant l'initialisation peut lire un ancien
// marqueur et dÃ©marrer la mÃªme course : le verrou advisory PostgreSQL Ã©vite ce
// doublon sans conserver d'Ã©tat en mÃ©moire entre fonctions Vercel.
export async function initDb() {
  if (initDbPromise) return initDbPromise;
  initDbPromise = (async () => {
    const client = await getPool().connect();
    try {
      // Attendre le propriÃ©taire Ã©ventuel du verrou est volontaire : une autre
      // instance doit lire le marqueur aprÃ¨s la premiÃ¨re, au lieu de believing
      // que l'initialisation est terminÃ©e. Le verrou est de session et libÃ©rÃ©
      // dans le finally, mÃªme en cas d'erreur de migration.
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [DB_INIT_LOCK]);

      let marker = null;
      try {
        marker = (
          await client.query("SELECT value FROM platform_settings WHERE key = $1", [
            "db_init_version",
          ])
        ).rows?.[0]?.value;
      } catch {
        // PremiÃ¨re installation : la table sera crÃ©Ã©e par runInitDb().
      }
      if (marker === DB_INIT_VERSION) return;

      await runInitDb();
      await client.query(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ('db_init_version', $1, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [DB_INIT_VERSION]
      );
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [DB_INIT_LOCK]).catch(() => {});
      client.release();
    }
  })().catch((err) => {
    // Une instance suivante pourra rÃ©essayer si la migration a Ã©chouÃ©.
    initDbPromise = null;
    throw err;
  });
  return initDbPromise;
}

const RETENTION_DAYS = Number(process.env.TRANSACTION_RETENTION_DAYS || 2555);
const NOTIFICATION_RETENTION_DAYS = Number(process.env.NOTIFICATION_RETENTION_DAYS || 90);

export async function purgeOldTransactions() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Les donnÃ©es financiÃ¨res sont conservÃ©es par dÃ©faut ~7 ans.
  await getPool().query("DELETE FROM notifications WHERE created_at < $1", [
    new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  ]);
  // Ne jamais supprimer automatiquement les ventes/commandes : elles constituent l'historique financier.
  void cutoff;
}


