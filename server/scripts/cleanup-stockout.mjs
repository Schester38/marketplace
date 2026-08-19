import { pool } from '../db.js';
import { cleanupOutOfStock } from '../cleanup.js';

// Nettoyage des produits/offres épuisés (quantité = 0).
// Usage : node server/scripts/cleanup-stockout.mjs [--dry-run]
const dryRun = process.argv.includes('--dry-run');
const result = await cleanupOutOfStock({ dryRun });
console.log(JSON.stringify(result, null, 2));
await pool.end();