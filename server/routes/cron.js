// Cron des campagnes programmées : appelé UNE fois par jour par Vercel Cron
// (ou un service externe type cron-job.org). Envoie la campagne due du jour.
// Authentification : header `Authorization: Bearer $CRON_SECRET` (posé
// automatiquement par Vercel Cron quand la variable d'environnement existe)
// OU paramètre `?k=<secret>` (secret stocké dans platform_settings, affiché
// dans le panneau Admin pour un cron externe).
import { Router } from "express";
import { cronTokenOk, getCronSecret, runDueCampaigns } from "../services/campaigns.js";
import { setSetting } from "../services/ikeepay.js";
import { purgeDigitalOrphans, purgePhotoOrphans } from "../cleanup.js";

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

export default router;
