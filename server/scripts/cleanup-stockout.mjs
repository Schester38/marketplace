import { pool } from '../db.js';
import { cleanupOutOfStock, cleanupOldStats } from '../cleanup.js';

// Nettoyage : produits/offres épuisés (quantité = 0) + statistiques de plus de 6 mois.
// Usage : node server/scripts/cleanup-stockout.mjs [--dry-run]
const dryRun = process.argv.includes('--dry-run');
const result = await cleanupOutOfStock({ dryRun });
const stats = dryRun ? [] : await cleanupOldStats();
console.log(JSON.stringify({ ...result, purge_statistiques: stats }, null, 2));
await pool.end();