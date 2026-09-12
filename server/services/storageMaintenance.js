// Maintenance Storage ponctuelle (egress Supabase) :
//  1. applique un cache-control immutable (secondes pures) sur tous les objets
//     du bucket `photos` — les objets uploadés avant le correctif sont en
//     no-cache et sont re-téléchargés par chaque visiteur à chaque vue ;
//  2. migre les photos stockées inline (data: URIs base64) vers Storage —
//     un produit inline est renvoyé en entier dans chaque réponse catalogue.
// Exécutée UNE fois : garde `storage_maintenance_done` dans platform_settings.
// Si des objets échouent, la garde n'est PAS posée → nouvelle tentative au
// prochain démarrage à froid (idempotent : les objets corrects sont sautés).
import { getSetting, setSetting } from "./ikeepay.js";
import { fixBucketCacheControl, migrateInlinePhotos } from "../storage.js";

let started = false;

export function runStorageMaintenanceOnce() {
  if (started) return;
  started = true;
  (async () => {
    try {
      const flag = await getSetting("storage_maintenance_done");
      if (flag) return;
      const cacheRes = await fixBucketCacheControl().catch((e) => ({ error: e.message }));
      console.warn("[maintenance storage] cache images :", JSON.stringify(cacheRes));
      if (cacheRes.error || cacheRes.failed > 0) return;
      const migRes = await migrateInlinePhotos().catch((e) => ({ error: e.message }));
      console.warn("[maintenance storage] migration inline :", JSON.stringify(migRes));
      if (migRes.error) return;
      await setSetting("storage_maintenance_done", new Date().toISOString());
      console.warn("[maintenance storage] terminée ✓");
    } catch (err) {
      console.warn("[maintenance storage] échec (retentée au prochain démarrage) :", err.message);
    }
  })();
}
