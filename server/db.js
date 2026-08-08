import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/marketplace';

export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
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
      role TEXT NOT NULL CHECK (role IN ('shop', 'seller', 'client', 'creator')),
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

    CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
    CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id);
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'email';
    ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('shop', 'seller', 'client', 'creator'));
    ALTER TABLE products ADD COLUMN IF NOT EXISTS photos TEXT NOT NULL DEFAULT '[]';
    UPDATE products SET photos = json_build_array(image)::text WHERE image IS NOT NULL AND photos = '[]';
  `);
}
