import { q } from './db.js';
import { collectStorageKeys, deleteStorageKeys } from './storage.js';

// Purge des statistiques datant de plus de 6 mois : daily_visits, item_views,
// client_logs et audit_log. Ces tables grossissent chaque jour sans servir au-delà
// de quelques mois (les tendances/vues affichées sont calculées sur 7 jours).
const STATS_TABLES = [
  { table: 'daily_visits', col: 'seen_on' },
  { table: 'item_views', col: 'seen_on' },
  { table: 'client_logs', col: 'created_at' },
  { table: 'audit_log', col: 'created_at' },
];

export async function cleanupOldStats() {
  const kept = [];
  for (const { table, col } of STATS_TABLES) {
    try {
      const r = await q(
        `DELETE FROM ${table} WHERE ${col} < CURRENT_DATE - INTERVAL '6 months' RETURNING 1`
      );
      kept.push({ table, supprimees: r.length });
    } catch (err) {
      kept.push({ table, supprimees: 0, erreur: err.message });
    }
  }
  return kept;
}

// Rapport d'usage de la base : taille et lignes estimées des tables principales.
// Permet de surveiller le quota gratuit (500 Mo) sans requête coûteuse.
const USAGE_TABLES = [
  'users',
  'products',
  'sales',
  'offers',
  'orders',
  'notifications',
  'reviews',
  'item_views',
  'daily_visits',
  'audit_log',
  'client_logs',
  'wallet_transactions',
];

export async function dbUsageReport() {
  const rows = [];
  for (const table of USAGE_TABLES) {
    try {
      const [s] = await q(
        `SELECT pg_total_relation_size('${table}') AS octets,
                (SELECT GREATEST(reltuples, 0)::bigint FROM pg_class WHERE relname = '${table}') AS lignes`
      );
      rows.push({ table, lignes: Number(s.lignes || 0), octets: Number(s.octets || 0) });
    } catch {
      rows.push({ table, lignes: 0, octets: 0 });
    }
  }
  return rows;
}

// Supprime les produits/offres épuisés (quantité = 0) pour libérer de l'espace.
// - Produits : une seule ligne le supprime quand aucun dossier de vente n'y est lié
//   (le PJT CASCADE sales -> produits effacerait l'historique des ventes/commissions).
// - Offres : supprimées directement (elles ne référencent aucune vente).
// - Les images Storage associées sont supprimées en même temps (best-effort).
export async function cleanupOutOfStock({ dryRun = false } = {}) {
  const products = await q(
    `SELECT p.id, p.name, p.photos
     FROM products p
     WHERE p.quantity <= 0
       AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.product_id = p.id)`
  );
  const keptProducts = await q(
    `SELECT COUNT(*)::int AS n
     FROM products p
     WHERE p.quantity <= 0
       AND EXISTS (SELECT 1 FROM sales s WHERE s.product_id = p.id)`
  );
  const offers = await q(`SELECT id, name, photos FROM offers WHERE quantity <= 0`);

  const canStorage = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  let removedProducts = 0;
  let removedOffers = 0;
  let deletedFiles = 0;

  const collectKeys = (rows) => rows.flatMap((r) => collectStorageKeys(r.photos));

  if (products.length && !dryRun) {
    const ids = products.map((p) => p.id);
    await q(`DELETE FROM products WHERE id = ANY($1::int[])`, [ids]);
    removedProducts = ids.length;
    if (canStorage) {
      const keys = collectKeys(products);
      try {
        deletedFiles += await deleteStorageKeys(keys);
      } catch (err) {
        console.error('[cleanup] suppression des images produits échouée :', err.message);
      }
    }
  } else if (dryRun) {
    removedProducts = products.length;
  }

  if (offers.length && !dryRun) {
    const ids = offers.map((o) => o.id);
    await q(`DELETE FROM offers WHERE id = ANY($1::int[])`, [ids]);
    removedOffers = ids.length;
    if (canStorage) {
      const keys = collectKeys(offers);
      try {
        deletedFiles += await deleteStorageKeys(keys);
      } catch (err) {
        console.error('[cleanup] suppression des images offres échouée :', err.message);
      }
    }
  } else if (dryRun) {
    removedOffers = offers.length;
  }

  return {
    mode: dryRun ? 'dry-run' : 'effectif',
    stockage_configure: canStorage,
    produits_supprimes: removedProducts,
    offres_supprimees: removedOffers,
    produits_gardes_avec_historique: Number(keptProducts[0]?.n || 0),
    fichiers_storage_supprimes: deletedFiles,
  };
}