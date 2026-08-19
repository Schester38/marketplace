import { pool } from '../db.js';
import { dbUsageReport } from '../cleanup.js';
import { storageUsage } from '../storage.js';

// Rapport d'usage Supabase (plan gratuit) : taille de la base par table + occupation du Storage.
// Usage : node server/scripts/supabase-usage.mjs
const base = await dbUsageReport();
const storage = await storageUsage()
  .then((s) => s || { note: 'Variables SUPABASE_URL / SUPABASE_SERVICE_KEY absentes' })
  .catch((e) => ({ erreur: e.message }));
console.log(JSON.stringify({ date: new Date().toISOString(), base, storage }, null, 2));
await pool.end();