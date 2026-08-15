import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DATABASE_URL = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
const UPLOAD_URL = process.env.BACKUP_UPLOAD_URL;
const OUT_DIR = process.env.BACKUP_OUTPUT_DIR || '_backups';

if (!DATABASE_URL) {
  console.log('Sauvegarde non configurée : secret BACKUP_DATABASE_URL (ou env DATABASE_URL) absent — aucune action.');
  process.exit(0);
}

const TABLES = [
  'users', 'products', 'sales', 'offers', 'orders',
  'notifications', 'reviews', 'audit_log', 'client_logs',
  'admin_messages', 'admin_message_reads',
  'seller_payment_methods', 'shop_payment_methods',
  'wallet_accounts', 'wallet_transactions',
];

const { Pool } = require(path.join(__dirname, '..', 'node_modules', 'pg'));
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const stamp = new Date().toISOString();
const parts = [];

for (const table of TABLES) {
  const rows = await pool.query(`SELECT * FROM ${table}`);
  parts.push(`${JSON.stringify({ table, exported_at: stamp, rows: rows.rows })}\n`);
}
await pool.end();

const body = parts.join('');
const sha256 = crypto.createHash('sha256').update(body).digest('hex');
const fileName = `mboppi-backup-${stamp.slice(0, 10)}.ndjson`;
const filePath = path.join(OUT_DIR, fileName);
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(filePath, body);
console.log(`Sauvegarde générée : ${filePath} (${(body.length / 1024 / 1024).toFixed(2)} Mo, sha256 ${sha256})`);

if (UPLOAD_URL) {
  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-ndjson',
      'X-File-Name': fileName,
      'X-Sha256': sha256,
      'X-Export-Date': stamp,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Upload de la sauvegarde échoué (${res.status} ${res.statusText})`);
  }
  console.log(`Sauvegarde envoyée vers ${UPLOAD_URL}`);
}