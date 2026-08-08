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
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('shop', 'seller')),
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

    CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
    CREATE INDEX IF NOT EXISTS idx_sales_product ON sales(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id);
  `);
}
