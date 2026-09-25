import { q } from "./db.js";
import {
  collectStorageKeys,
  deleteStorageKeys,
  listDigitalObjects,
  listBucketObjects,
  photoBucketName,
  deleteDigitalFile,
} from "./storage.js";

// Purge des statistiques datant de plus de 6 mois : daily_visits, item_views,
// client_logs et audit_log. Ces tables grossissent chaque jour sans servir au-delà
// de quelques mois (les tendances/vues affichées sont calculées sur 7 jours).
const STATS_TABLES = [
  { table: "daily_visits", col: "seen_on" },
  { table: "item_views", col: "seen_on" },
  { table: "client_logs", col: "created_at" },
  { table: "audit_log", col: "created_at" },
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
  "users",
  "products",
  "sales",
  "offers",
  "orders",
  "notifications",
  "reviews",
  "item_views",
  "daily_visits",
  "audit_log",
  "client_logs",
  "wallet_transactions",
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
        console.error("[cleanup] suppression des images produits échouée :", err.message);
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
        console.error("[cleanup] suppression des images offres échouée :", err.message);
      }
    }
  } else if (dryRun) {
    removedOffers = offers.length;
  }

  return {
    mode: dryRun ? "dry-run" : "effectif",
    stockage_configure: canStorage,
    produits_supprimes: removedProducts,
    offres_supprimees: removedOffers,
    produits_gardes_avec_historique: Number(keptProducts[0]?.n || 0),
    fichiers_storage_supprimes: deletedFiles,
  };
}

// Purge des fichiers digitaux ORPHELINS du bucket privé `digital-products` :
// objets présents dans le Storage mais rattachés à AUCUN produit (upload
// abandonné avant l'enregistrement du produit, crash entre upload et INSERT…).
// Sécurité : les objets de moins de `minAgeHours` heures sont toujours
// conservés (un créateur peut être en train de remplir son formulaire).
// Retourne aussi les totaux en mode dry-run (aucune suppression).
export async function purgeDigitalOrphans({ dryRun = false, minAgeHours = 24, maxDeletes = 200 } = {}) {
  const objects = await listDigitalObjects();
  if (!objects) {
    return { erreur: "Stockage non configuré (SUPABASE_URL / SUPABASE_SERVICE_KEY absents)" };
  }
  const rows = await q(`SELECT digital_path FROM products WHERE digital_path IS NOT NULL`);
  const referenced = new Set(rows.map((r) => r.digital_path));
  const cutoff = Date.now() - Math.max(1, minAgeHours) * 3600 * 1000;
  const orphans = objects.filter(
    (o) => !referenced.has(o.key) && o.updatedAt > 0 && o.updatedAt < cutoff
  );
  const orphansBytes = orphans.reduce((s, o) => s + Number(o.size || 0), 0);
  const selected = orphans.slice(0, Math.max(1, maxDeletes));
  let deleted = 0;
  if (!dryRun) {
    for (const o of selected) {
      try {
        if (await deleteDigitalFile(o.key)) deleted += 1;
      } catch (err) {
        console.error("[cleanup] purge orphelin digital échouée :", o.key, err.message);
      }
    }
  }
  return {
    mode: dryRun ? "dry-run" : "effectif",
    min_age_heures: Math.max(1, minAgeHours),
    objets_total: objects.length,
    objets_references: referenced.size,
    orphelins: orphans.length,
    orphelins_octets: orphansBytes,
    supprimes: dryRun ? 0 : deleted,
    restants: Math.max(0, orphans.length - selected.length),
  };
}

function canonicalPhotoEntry(entry) {
  if (typeof entry === "string") return /^https?:\/\//i.test(entry) ? entry : null;
  if (!entry || typeof entry !== "object") return null;
  const source = entry.full || entry.large || entry.medium || entry.thumb || null;
  // Une data-URI doit rester à migrateInlinePhotos ; elle ne doit jamais être
  // choisie comme "canonique" puis réinjectée dans la table par la purge.
  return source && /^https?:\/\//i.test(source) ? source : null;
}

// Consolide les anciennes entrées {thumb, medium, large, full} vers une seule
// URL canonique. La base est mise à jour avant le DELETE ; deleteStorageKeys
// revérifie aussi les commandes historiques avant de supprimer un ancien objet.
export async function consolidatePhotoVariants({ dryRun = false, maxRows = 200 } = {}) {
  const products = await q("SELECT id, photos, image FROM products ORDER BY id LIMIT $1", [maxRows]);
  const offers = await q("SELECT id, photos FROM offers ORDER BY id LIMIT $1", [maxRows]).catch(() => []);
  let candidates = 0;
  let staleKeys = 0;
  let deleted = 0;

  for (const row of products) {
    let entries = [];
    try { entries = JSON.parse(row.photos || "[]"); } catch { entries = []; }
    if (!Array.isArray(entries) || !entries.length) continue;
    const next = entries.map(canonicalPhotoEntry).filter(Boolean);
    if (!next.length) continue;
    const serialized = JSON.stringify(next.map((url) => ({
      thumb: url, medium: url, large: url, full: url,
    })));
    const oldKeys = collectStorageKeys(row.photos);
    if (row.image) oldKeys.push(...collectStorageKeys(JSON.stringify([row.image])));
    const nextKeys = collectStorageKeys(serialized);
    const obsolete = [...new Set(oldKeys)].filter((key) => !nextKeys.includes(key));
    if (!obsolete.length) continue;
    candidates += 1;
    staleKeys += obsolete.length;
    if (dryRun) continue;
    await q("UPDATE products SET photos = $2, image = $3 WHERE id = $1", [row.id, serialized, next[0]]);
    deleted += await deleteStorageKeys(obsolete, { excludeProductId: row.id });
  }

  for (const row of offers) {
    let entries = [];
    try { entries = JSON.parse(row.photos || "[]"); } catch { entries = []; }
    if (!Array.isArray(entries) || !entries.length) continue;
    const next = entries.map(canonicalPhotoEntry).filter(Boolean);
    if (!next.length) continue;
    const oldKeys = collectStorageKeys(row.photos);
    const nextKeys = collectStorageKeys(JSON.stringify(next));
    const obsolete = [...new Set(oldKeys)].filter((key) => !nextKeys.includes(key));
    if (!obsolete.length) continue;
    candidates += 1;
    staleKeys += obsolete.length;
    if (dryRun) continue;
    await q("UPDATE offers SET photos = $2 WHERE id = $1", [row.id, JSON.stringify(next)]);
    deleted += await deleteStorageKeys(obsolete);
  }
  return { Candidats: candidates, variantes_obsoletes: staleKeys, supprimes: deleted };
}

// Purge les images publiques orphelines (upload terminé mais ligne produit/offre
// jamais créée, avatar historique, version de photo remplacée). Les objets de
// moins de minAgeHours heures sont toujours conservés. Chaque suppression repasse
// par deleteStorageKeys(), qui revérifie les références en base juste avant le DELETE.
export async function purgePhotoOrphans({ dryRun = false, minAgeHours = 24, maxDeletes = 200 } = {}) {
  const consolidation = await consolidatePhotoVariants({ dryRun, maxRows: 200 });
  const objects = await listBucketObjects(photoBucketName());
  if (!objects) return { erreur: "Stockage non configuré" };
  const [products, offers, users, orders] = await Promise.all([
    q("SELECT photos, image FROM products"),
    q("SELECT photos FROM offers").catch(() => []),
    q("SELECT avatar FROM users WHERE avatar IS NOT NULL").catch(() => []),
    q("SELECT items FROM orders").catch(() => []),
  ]);
  const referenced = new Set();
  const add = (value) => {
    const json = typeof value === "string" ? value : JSON.stringify(value || []);
    for (const key of collectStorageKeys(json)) referenced.add(key);
  };
  for (const row of products) {
    add(row.photos);
    if (row.image) add(JSON.stringify([row.image]));
  }
  for (const row of offers) add(row.photos);
  for (const row of users) add(JSON.stringify([row.avatar]));
  for (const row of orders) add(JSON.stringify(row.items || []));

  const cutoff = Date.now() - Math.max(1, minAgeHours) * 3600 * 1000;
  const orphans = objects.filter(
    (o) => !referenced.has(o.key) && o.updatedAt > 0 && o.updatedAt < cutoff
  );
  const orphanBytes = orphans.reduce((sum, o) => sum + Number(o.size || 0), 0);
  const selected = orphans.slice(0, Math.max(1, maxDeletes));
  const deleted = dryRun
    ? 0
    : await deleteStorageKeys(selected.map((o) => o.key));
  return {
    mode: dryRun ? "dry-run" : "effectif",
    min_age_heures: Math.max(1, minAgeHours),
    objets_total: objects.length,
    objets_references: referenced.size,
    orphelins: orphans.length,
    orphelins_octets: orphanBytes,
    supprimes: deleted,
    restants: Math.max(0, orphans.length - selected.length),
    consolidation,
  };
}
