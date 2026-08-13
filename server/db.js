import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/marketplace';

export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

pool.on('connect', (client) => {
  client.query('SET search_path TO public').catch(() => {});
});

export async function q(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}

export async function initDb() {
  await pool.query(`
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

    CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
    CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'email';
    ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('shop', 'seller', 'client', 'creator', 'livreur', 'admin'));
    ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS photos TEXT NOT NULL DEFAULT '[]';
    UPDATE products SET photos = json_build_array(image)::text WHERE image IS NOT NULL AND photos = '[]';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty INTEGER;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_fee REAL NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS contact TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS old_price REAL;
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
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_commission REAL NOT NULL DEFAULT 0;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_paid BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_paid_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_claimed_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_claimed_at TIMESTAMPTZ;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS referral_payment_proof TEXT;
    ALTER TABLE sales ADD COLUMN IF NOT EXISTS hidden_for INTEGER[] NOT NULL DEFAULT '{}';

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
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_seller_code ON users(seller_code) WHERE seller_code IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_shop_code ON users(shop_code) WHERE shop_code IS NOT NULL;

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
  `);

  try {
    await purgeOldTransactions();
  } catch {
    /* purge best-effort : un échec ne doit pas bloquer le démarrage */
  }
}

const RETENTION_DAYS = 7;

export async function purgeOldTransactions() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await pool.query('DELETE FROM sales WHERE created_at < $1', [cutoff]);
  await pool.query('DELETE FROM orders WHERE created_at < $1', [cutoff]);
  await pool.query('DELETE FROM notifications WHERE created_at < $1', [cutoff]);
}
