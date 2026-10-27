// Cron des campagnes programmées : appelé UNE fois par jour par Vercel Cron
// (ou un service externe type cron-job.org). Envoie la campagne due du jour.
// Authentification : header `Authorization: Bearer $CRON_SECRET` (posé
// automatiquement par Vercel Cron quand la variable d'environnement existe)
// OU paramètre `?k=<secret>` (secret stocké dans platform_settings, affiché
// dans le panneau Admin pour un cron externe).
import { Router } from "express";
import { cronTokenOk, getCronSecret, runDueCampaigns } from "../services/campaigns.js";
import { setSetting } from "../services/ikeepay.js";
import {
  syncSmmOrders,
  dispatchPaidSmmOrders,
  cleanupSmmOrders,
} from "../services/smmFulfillment.js";
import { purgeDigitalOrphans, purgePhotoOrphans } from "../cleanup.js";

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function cronAuthorized(req, res) {
  const header = String(req.headers.authorization || "");
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const provided = bearer || String(req.query.k || "");
  const envSecret = process.env.CRON_SECRET;
  if (envSecret && cronTokenOk(provided, envSecret)) return true;
  try {
    const ok = cronTokenOk(provided, await getCronSecret());
    if (!ok) res.status(403).json({ error: "invalid_cron_token" });
    return ok;
  } catch (err) {
    console.error("[cron] lecture du secret impossible :", err.message);
    res.status(503).json({ error: "cron_secret_unavailable" });
    return false;
  }
}

router.get(
  "/campaigns",
  ah(async (req, res) => {
    const header = String(req.headers.authorization || "");
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const provided = bearer || String(req.query.k || "");

    let ok = false;
    const envSecret = process.env.CRON_SECRET;
    if (envSecret && cronTokenOk(provided, envSecret)) {
      ok = true;
    } else {
      try {
        ok = cronTokenOk(provided, await getCronSecret());
      } catch (err) {
        console.error("[cron] lecture du secret impossible :", err.message);
        return res.status(503).json({ error: "cron_secret_unavailable" });
      }
    }
    if (!ok) {
      return res.status(403).json({ error: "invalid_cron_token" });
    }

    const dry = req.query.dry === "1";
    const report = await runDueCampaigns({ dry });
    try {
      await setSetting("campaign_cron_last_run", new Date().toISOString());
    } catch {
      /* non bloquant : juste l'affichage « dernière exécution » */
    }
    res.json(report);
  })
);

// Purge quotidienne Vercel : uniquement les objets de plus de 24 h non
// rattachés. Les fichiers de produits, avatars, commandes et preuves de
// paiement sont vérifiés en base avant toute suppression.
router.get(
  "/storage-cleanup",
  ah(async (req, res) => {
    const header = String(req.headers.authorization || "");
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const provided = bearer || String(req.query.k || "");
    let ok = false;
    const envSecret = process.env.CRON_SECRET;
    if (envSecret && cronTokenOk(provided, envSecret)) {
      ok = true;
    } else {
      try {
        ok = cronTokenOk(provided, await getCronSecret());
      } catch (err) {
        return res.status(503).json({ error: "cron_secret_unavailable" });
      }
    }
    if (!ok) return res.status(403).json({ error: "invalid_cron_token" });

    const dry = req.query.dry === "1";
    const [photos, digital] = await Promise.all([
      purgePhotoOrphans({ dryRun: dry, minAgeHours: 24 }),
      purgeDigitalOrphans({ dryRun: dry, minAgeHours: 24 }),
    ]);
    try {
      await setSetting("storage_cleanup_last_run", new Date().toISOString());
    } catch {
      /* le ménage a déjà été effectué */
    }
    res.json({ ok: !photos.erreur && !digital.erreur, dry_run: dry, photos, digital });
  })
);

// Synchronisation MboppiBoost : met à jour les commandes transmises depuis le
// fournisseur, puis tente la transmission des commandes payées en attente.
router.get(
  "/smm-sync",
  ah(async (req, res) => {
    if (!(await cronAuthorized(req, res))) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const sync = await syncSmmOrders(limit);
    const dispatch =
      req.query.dispatch === "0"
        ? { checked: 0, dispatched: 0, results: [], skipped: true }
        : await dispatchPaidSmmOrders(Math.min(limit, 10));
    if (sync.ok) {
      try {
        await setSetting("smm_sync_last_run", new Date().toISOString());
      } catch {
        /* non bloquant */
      }
    }
    res.json({ ok: sync.ok, sync, dispatch });
  })
);

// Purge des commandes MboppiBoost impayées trop anciennes. Les commandes
// payées, en cours ou terminées ne sont jamais touchées.
router.get(
  "/smm-cleanup",
  ah(async (req, res) => {
    if (!(await cronAuthorized(req, res))) return;
    const dry = req.query.dry === "1";
    const hours = Number(req.query.hours) || 48;
    const limit = Number(req.query.limit) || 200;
    const result = await cleanupSmmOrders({ olderThanHours: hours, dryRun: dry, limit });
    if (!dry) {
      try {
        await setSetting("smm_cleanup_last_run", new Date().toISOString());
      } catch {
        /* non bloquant */
      }
    }
    res.json({ ok: true, ...result });
  })
);

export default router;
