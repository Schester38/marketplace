import pg from "pg";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/marketplace";

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

pool.on("connect", (client) => {
  client.query("SET search_path TO public").catch(() => {});
});

export function getPool() {
  return pool;
}

export async function q(text, params = []) {
  const p = getPool();
  const res = await p.query(text, params);
  return res.rows;
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

export async function initDb() {
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
    ALTER TABLE products ALTER COLUMN commission_percent TYPE NUMERIC(6,2) USING round(commission_percent::numeric, 2);
    ALTER TABLE products ALTER COLUMN delivery_fee TYPE NUMERIC(14,2) USING round(delivery_fee::numeric, 2);
    ALTER TABLE products ALTER COLUMN old_price TYPE NUMERIC(14,2) USING CASE WHEN old_price IS NULL THEN NULL ELSE round(old_price::numeric, 2) END;
    ALTER TABLE products ALTER COLUMN warranty TYPE TEXT USING warranty::text;
    ALTER TABLE sales ALTER COLUMN buyer_name DROP NOT NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS purchase_price REAL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_code TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_city TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS buyer_address TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_fee REAL NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS confirm_code TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivered_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
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

  try {
    await purgeOldTransactions();
  } catch {
    /* purge best-effort : un échec ne doit pas bloquer le démarrage */
  }
}

const RETENTION_DAYS = Number(process.env.TRANSACTION_RETENTION_DAYS || 2555);
const NOTIFICATION_RETENTION_DAYS = Number(process.env.NOTIFICATION_RETENTION_DAYS || 90);

export async function purgeOldTransactions() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Les données financières sont conservées par défaut ~7 ans.
  await getPool().query("DELETE FROM notifications WHERE created_at < $1", [
    new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  ]);
  // Ne jamais supprimer automatiquement les ventes/commandes : elles constituent l'historique financier.
  void cutoff;
}
