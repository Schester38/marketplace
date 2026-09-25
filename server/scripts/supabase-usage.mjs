import { getPool } from '../db.js';
import { dbUsageReport } from '../cleanup.js';
import { storageUsage, digitalBucketName } from '../storage.js';

// Rapport d'usage Supabase (plan gratuit) : taille de la base + les 3 buckets
// utilisés par Mboppi (photos, fichiers digitaux, preuves de paiement).
const pool = getPool();
const base = await dbUsageReport();
const [photos, digital, proofs] = await Promise.all([
  storageUsage().catch((e) => ({ erreur: e.message })),
  storageUsage(digitalBucketName()).catch((e) => ({ erreur: e.message })),
  storageUsage("payment-proofs").catch((e) => ({ erreur: e.message })),
]);
console.log(JSON.stringify({
  date: new Date().toISOString(),
  base,
  storage: { photos, digital, proofs },
}, null, 2));
await pool.end();