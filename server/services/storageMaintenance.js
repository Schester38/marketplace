// Maintenance Storage ponctuelle (egress Supabase), exécutée PAS À PAS :
//  1. applique un cache-control immutable (secondes pures) sur tous les objets
//     du bucket `photos` — les objets uploadés avant le correctif sont en
//     no-cache et chaque visiteur re-télécharge chaque image à chaque vue ;
//  2. migre les photos stockées inline (data: URIs base64) vers Storage —
//     un produit inline est renvoyé en entier dans chaque réponse catalogue.
//
// POURQUOI PAS À PAS : sur Vercel, une tâche de fond lancée au démarrage à
// froid est tuée dès que la première réponse part. Chaque « step » fait donc
// une petite tranche (~2-4 s) et sauvegarde sa progression dans
// platform_settings : le step suivant (requête entrante ou démarrage suivant)
// reprend là où le précédent s'est arrêté. Garde finale :
// `storage_maintenance_done`.
import { getSetting, setSetting } from "./ikeepay.js";
import { listBucketKeys, fixObjectCacheControl, migrateInlinePhotos } from "../storage.js";

const BUCKET = "photos";
const SECONDS = "31536000";
const KEYS_KEY = "storage_fix_keys";
const CURSOR_KEY = "storage_fix_cursor";
const FAILED_KEY = "storage_fix_failed";
const LOG_KEY = "storage_maintenance_log";
const DONE_KEY = "storage_maintenance_done";

// Budget par step : 12 objets en mode metadata / 3 en mode ré-upload.
const BATCH_META = 12;
const BATCH_REUPLOAD = 3;
const MAX_TRIES = 3;

let running = false; // verrou par instance
let lastRun = 0;
const MIN_INTERVAL_MS = 8000;

async function writeLog(entry) {
  try {
    await setSetting(LOG_KEY, JSON.stringify({ at: new Date().toISOString(), ...entry }));
  } catch {
    /* log best-effort */
  }
}

/**
 * Traite une tranche de maintenance. Appelé au démarrage et à chaque requête
 * (borné par MIN_INTERVAL_MS) ; ne lève jamais : tous les échecs sont loggés.
 */
export async function runStorageMaintenanceStep() {
  if (running) return;
  const now = Date.now();
  if (now - lastRun < MIN_INTERVAL_MS) return;
  running = true;
  lastRun = now;
  try {
    if (await getSetting(DONE_KEY)) return;
    if (!(await ensureKeysList())) return;
    await stepFailedQueue();
    await stepMainQueue();
  } catch (err) {
    console.warn("[maintenance storage] step échoué (retenté) :", err.message);
    await writeLog({ step: "error", error: err.message });
  } finally {
    running = false;
  }
}

// Prépare la liste des clés (une seule fois) ; false si Storage indisponible.
async function ensureKeysList() {
  const existing = await getSetting(KEYS_KEY);
  if (existing) return true;
  let keys;
  try {
    keys = await listBucketKeys(BUCKET);
  } catch (err) {
    await writeLog({ step: "list", error: err.message });
    return false;
  }
  await setSetting(KEYS_KEY, JSON.stringify(keys));
  await setSetting(CURSOR_KEY, "0");
  await writeLog({ step: "start", total: keys.length });
  return true;
}

// Reprise des objets en échec : ré-upload (3 par step), max MAX_TRIES chacun.
async function stepFailedQueue() {
  const raw = await getSetting(FAILED_KEY);
  if (!raw) return;
  let failed;
  try {
    failed = JSON.parse(raw);
  } catch {
    await setSetting(FAILED_KEY, "");
    return;
  }
  if (!Array.isArray(failed) || !failed.length) return;
  const still = [];
  let fixed = 0;
  for (const item of failed.slice(0, BATCH_REUPLOAD)) {
    const tries = (item.tries || 0) + 1;
    const status = await fixObjectCacheControl(BUCKET, item.key, SECONDS);
    if (status === "skipped" || status.startsWith("fixed")) fixed += 1;
    else if (tries < MAX_TRIES) still.push({ key: item.key, tries });
  }
  const remaining = failed.slice(BATCH_REUPLOAD).concat(still);
  await setSetting(FAILED_KEY, remaining.length ? JSON.stringify(remaining) : "");
  await writeLog({ step: "reupload", fixed, remaining: remaining.length });
}

// File principale : 12 objets par step (metadata d'abord, ré-upload si échec).
async function stepMainQueue() {
  const rawFailed = await getSetting(FAILED_KEY);
  let previousFailed = [];
  try {
    previousFailed = JSON.parse(rawFailed || "[]");
  } catch {
    previousFailed = [];
  }
  if (previousFailed.length) return; // la file d'échec a la priorité
  const keys = JSON.parse((await getSetting(KEYS_KEY)) || "[]");
  const cursor = Number((await getSetting(CURSOR_KEY)) || 0);
  if (cursor >= keys.length) {
    await finish();
    return;
  }
  const batch = keys.slice(cursor, cursor + BATCH_META);
  const failed = [];
  let skipped = 0;
  let fixed = 0;
  for (const key of batch) {
    const status = await fixObjectCacheControl(BUCKET, key, SECONDS);
    if (status === "skipped") skipped += 1;
    else if (status.startsWith("fixed")) fixed += 1;
    else failed.push({ key, tries: 1 });
  }
  const next = cursor + batch.length;
  await setSetting(CURSOR_KEY, String(next));
  const allFailed = previousFailed.concat(failed);
  if (allFailed.length) await setSetting(FAILED_KEY, JSON.stringify(allFailed));
  await writeLog({ step: "main", cursor: next, total: keys.length, skipped, fixed, failed: failed.length });
  if (next >= keys.length) await finish();
}

// Fin : migration des photos inline puis garde définitive.
async function finish() {
  const migRes = await migrateInlinePhotos().catch((e) => ({ error: e.message }));
  console.warn("[maintenance storage] migration inline :", JSON.stringify(migRes));
  if (migRes.error) {
    await writeLog({ step: "finish", inline_error: migRes.error });
    return; // la garde n'est pas posée : reprise au prochain step
  }
  await setSetting(DONE_KEY, new Date().toISOString());
  await writeLog({ step: "done", productsFixed: migRes.productsFixed, offersFixed: migRes.offersFixed });
  console.warn("[maintenance storage] terminée ✓");
}

// Version « tout d'un coup » (admin / local) — complète la version pas à pas.
export async function runStorageMaintenanceNow() {
  let keys;
  try {
    keys = await listBucketKeys(BUCKET);
  } catch (err) {
    return { error: err.message };
  }
  let fixed = 0;
  let skipped = 0;
  const failedKeys = [];
  for (const key of keys) {
    const status = await fixObjectCacheControl(BUCKET, key, SECONDS);
    if (status === "skipped") skipped += 1;
    else if (status.startsWith("fixed")) fixed += 1;
    else failedKeys.push(key);
  }
  const migRes = await migrateInlinePhotos().catch((e) => ({ error: e.message }));
  const result = { total: keys.length, fixed, skipped, failed: failedKeys, inline: migRes };
  await writeLog({ step: "manual", ...result });
  if (!failedKeys.length && !migRes.error) await setSetting(DONE_KEY, new Date().toISOString());
  return result;
}
