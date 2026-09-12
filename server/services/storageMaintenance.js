// Maintenance Storage ponctuelle (egress Supabase), exécutée PAS À PAS, en
// trois PHASES :
//  1. "meta"    : HEAD (skip si déjà correct) + POST metadata {cacheControl}
//     en secondes pures (format attendu par le Storage). Rapide : 2 appels
//     max par objet, SANS vérification à chaud.
//  2. "verify"  : re-HEAD des objets pour confirmer le cache servi ; les
//     objets toujours en no-cache partent dans la file de ré-upload.
//  3. re-upload : file d'échec — ré-upload x-upsert du même contenu (URL
//     inchangée), ~4-6 appels par objet, 2 par step.
// En fin de course : migration des photos inline (data: URIs base64 → Storage)
// puis garde `storage_maintenance_done`.
//
// POURQUOI PAS À PAS : sur Vercel, le travail de fond lancé après la réponse
// est tué dès que celle-ci part. Chaque step est court (~2 s) et sauvegarde sa
// progression dans platform_settings ; le step suivant (requête entrante ou
// démarrage) reprend là où le précédent s'est arrêté.
import { getSetting, setSetting } from "./ikeepay.js";
import { q } from "../db.js";
import {
  updateObjectCacheControl,
  fixObjectCacheControlHard,
  servedCacheControl,
  migrateInlinePhotos,
} from "../storage.js";

const BUCKET = "photos";
const SECONDS = "31536000";
const KEYS_KEY = "storage_fix_keys";
const CURSOR_KEY = "storage_fix_cursor";
const PHASE_KEY = "storage_fix_phase";
const FAILED_KEY = "storage_fix_failed";
const LOG_KEY = "storage_maintenance_log";
const DONE_KEY = "storage_maintenance_done";

const BATCH_META = 3; // ré-upload léger : 3 × (HEAD + GET + POST) ≈ 1,5-2,5 s
const BATCH_VERIFY = 12; // 12 × HEAD ≈ 1-1,5 s
const BATCH_HARD = 2; // 2 × (GET + POST + HEAD) ≈ 1,5-2,5 s
const MAX_TRIES = 3;

let running = false;
let lastRun = 0;
const MIN_INTERVAL_MS = 6000;

async function writeLog(entry) {
  try {
    await setSetting(LOG_KEY, JSON.stringify({ at: new Date().toISOString(), ...entry }));
  } catch {
    /* log best-effort */
  }
}

/** Traite une tranche (≤ ~2 s). Ne lève jamais. */
export async function runStorageMaintenanceStep() {
  if (running) return;
  const now = Date.now();
  if (now - lastRun < MIN_INTERVAL_MS) return;
  running = true;
  lastRun = now;
  try {
    if (await getSetting(DONE_KEY)) return;
    if (!(await ensureKeysList())) return;
    if (await stepReupload()) return; // la file d'échec a la priorité
    const phase = (await getSetting(PHASE_KEY)) || "fix";
    if (phase === "fix") await stepMeta();
    else if (phase === "verify") await stepVerify();
  } catch (err) {
    console.warn("[maintenance storage] step échoué (renté) :", err.message);
    await writeLog({ step: "error", error: err.message });
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — ré-upload léger (x-upsert), pas de vérification à chaud
// ---------------------------------------------------------------------------
async function stepMeta() {
  const { keys, page } = await keyPage(Number((await getSetting(CURSOR_KEY)) || 0), BATCH_META);
  if (!page.length) {
    await setSetting(PHASE_KEY, "verify");
    await setSetting(CURSOR_KEY, "0");
    await writeLog({ step: "fix-done", total: keys.length });
    return;
  }
  let fixed = 0;
  let skipped = 0;
  let failed = 0;
  for (const key of page) {
    const status = await updateObjectCacheControl(BUCKET, key, SECONDS).catch(() => "failed");
    if (status === "skipped") skipped += 1;
    else if (status === "fixed") fixed += 1;
    else failed += 1;
  }
  const next = Number((await getSetting(CURSOR_KEY)) || 0) + page.length;
  await setSetting(CURSOR_KEY, String(next));
  await writeLog({ step: "meta", cursor: next, total: keys.length, skipped, fixed, failed });
}

// ---------------------------------------------------------------------------
// Phase 2 — vérification
// ---------------------------------------------------------------------------
async function stepVerify() {
  const { keys, page } = await keyPage(Number((await getSetting(CURSOR_KEY)) || 0), BATCH_VERIFY);
  if (!page.length) {
    const failed = await readJson(FAILED_KEY);
    if (!failed.length) {
      await finish();
      return;
    }
    await writeLog({ step: "verify-done", failed: failed.length, wait_reupload: true });
    return;
  }
  const failed = await readJson(FAILED_KEY);
  let ok = 0;
  for (const key of page) {
    const cc = await servedCacheControl(BUCKET, key);
    if (cc.includes(`max-age=${SECONDS}`)) ok += 1;
    else failed.push({ key, tries: 0 });
  }
  const next = Number((await getSetting(CURSOR_KEY)) || 0) + page.length;
  await setSetting(CURSOR_KEY, String(next));
  if (failed.length) await setSetting(FAILED_KEY, JSON.stringify(failed));
  await writeLog({ step: "verify", cursor: next, total: keys.length, ok, moved_to_reupload: page.length - ok });
  if (next >= keys.length) {
    if (!failed.length) {
      await finish();
    } else {
      await writeLog({ step: "verify-done", wait_reupload: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — file d'échec (ré-upload x-upsert, URL inchangée)
// ---------------------------------------------------------------------------
async function stepReupload() {
  const failed = await readJson(FAILED_KEY);
  if (!failed.length) return false;
  const still = [];
  let fixed = 0;
  for (const item of failed.slice(0, BATCH_HARD)) {
    const tries = (item.tries || 0) + 1;
    const status = await fixObjectCacheControlHard(BUCKET, item.key, SECONDS).catch(() => "failed");
    if (status === "skipped" || status.startsWith("fixed")) fixed += 1;
    else if (tries < MAX_TRIES) still.push({ key: item.key, tries });
  }
  const remaining = failed.slice(BATCH_HARD).concat(still);
  await setSetting(FAILED_KEY, remaining.length ? JSON.stringify(remaining) : "");
  await writeLog({ step: "reupload", fixed, remaining: remaining.length });
  return remaining.length > 0;
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
async function ensureKeysList() {
  const existing = await getSetting(KEYS_KEY);
  if (existing) return true;
  let keys;
  try {
    keys = await referencedPhotoKeys();
  } catch (err) {
    await writeLog({ step: "list", error: err.message });
    return false;
  }
  if (!keys.length) {
    await setSetting(DONE_KEY, new Date().toISOString());
    await writeLog({ step: "done-empty" });
    return false;
  }
  await setSetting(KEYS_KEY, JSON.stringify(keys));
  await setSetting(CURSOR_KEY, "0");
  await setSetting(PHASE_KEY, "fix");
  await writeLog({ step: "start", total: keys.length });
  return true;
}

async function keyPage(cursor, batch) {
  const keys = JSON.parse((await getSetting(KEYS_KEY)) || "[]");
  return { keys, page: keys.slice(cursor, cursor + batch) };
}

async function readJson(key) {
  try {
    const v = await getSetting(key);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}

// Extrait les clés Storage des photos référencées en base (produits + offres).
async function referencedPhotoKeys() {
  const rows = await q(
    `SELECT photos::text AS photos, image FROM products WHERE photos IS NOT NULL
     UNION ALL
     SELECT photos::text AS photos, NULL FROM offers WHERE photos IS NOT NULL`
  );
  const keys = new Set();
  const MARK = "/storage/v1/object/public/photos/";
  for (const r of rows) {
    const text = `${r.photos || ""}\n${r.image || ""}`;
    for (const m of text.matchAll(/https?:\/\/[^"\\\s]+/g)) {
      const url = m[0];
      const i = url.indexOf(MARK);
      if (i >= 0) {
        try {
          keys.add(decodeURIComponent(url.slice(i + MARK.length)));
        } catch {
          /* clé encodée invalide : ignorée */
        }
      }
    }
  }
  return [...keys];
}

async function finish() {
  const failed = await readJson(FAILED_KEY);
  if (failed.length) {
    await writeLog({ step: "finish-deferred", failed: failed.length });
    return;
  }
  const migRes = await migrateInlinePhotos().catch((e) => ({ error: e.message }));
  console.warn("[maintenance storage] migration inline :", JSON.stringify(migRes));
  if (migRes.error) {
    await writeLog({ step: "finish", inline_error: migRes.error });
    return;
  }
  await setSetting(DONE_KEY, new Date().toISOString());
  await writeLog({ step: "done", productsFixed: migRes.productsFixed, offersFixed: migRes.offersFixed });
  console.warn("[maintenance storage] terminée ✓");
}

// Version « tout d'un coup » (admin / local) — complète la version pas à pas.
export async function runStorageMaintenanceNow() {
  let keys;
  try {
    keys = await referencedPhotoKeys();
  } catch (err) {
    return { error: err.message };
  }
  if (!keys.length) {
    await setSetting(DONE_KEY, new Date().toISOString());
    return { total: 0, fixed: 0, skipped: 0, failed: [], inline: { productsFixed: 0, offersFixed: 0 } };
  }
  let fixed = 0;
  let skipped = 0;
  let failedKeys = [];
  for (const key of keys) {
    const status = await updateObjectCacheControl(BUCKET, key, SECONDS).catch(() => "failed");
    if (status === "skipped") skipped += 1;
    else if (status === "fixed") fixed += 1;
    else failedKeys.push(key);
  }
  const reuploaded = [];
  for (const key of failedKeys) {
    const status = await fixObjectCacheControlHard(BUCKET, key, SECONDS).catch(() => "failed");
    if (status === "skipped" || status.startsWith("fixed")) reuploaded.push(key);
  }
  const stillFailed = failedKeys.filter((k) => !reuploaded.includes(k));
  const migRes = await migrateInlinePhotos().catch((e) => ({ error: e.message }));
  const result = { total: keys.length, fixed: fixed + reuploaded.length, skipped, failed: stillFailed, inline: migRes };
  await writeLog({ step: "manual", ...result });
  if (!stillFailed.length && !migRes.error) await setSetting(DONE_KEY, new Date().toISOString());
  return result;
}