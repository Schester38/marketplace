// Produits digitaux â€” TÃ‰LÃ‰CHARGEMENT des fichiers payants.
//
// Le fichier vit dans le bucket PRIVÃ‰ `digital-products` (Supabase Storage) :
// il n'existe AUCUNE URL publique. L'acheteur reÃ§oit une URL SIGNÃ‰E Ã  durÃ©e
// courte (10 min), gÃ©nÃ©rÃ©e ici aprÃ¨s vÃ©rification de son droit d'accÃ¨s :
//   â€” il est l'acheteur de la vente (sale.buyer_id), OU
//   â€” il dÃ©tient le code de confirmation de la vente (achat sans compte), OU
//   â€” il est le propriÃ©taire du produit (boutique / crÃ©ateur : contrÃ´le).
//
// Chaque tÃ©lÃ©chargement d'acheteur est journalisÃ© (digital_downloads) et
// comptÃ© : le quota `products.digital_download_limit` (5 par dÃ©faut) protÃ¨ge
// le vendeur contre la diffusion en boucle d'un lien de tÃ©lÃ©chargement.
//
// Aucun fallback Â« manuel Â» (email/WhatsApp) : le client tÃ©lÃ©charge
// directement sur son appareil, l'URL signÃ©e Ã©tant le seul moyen d'accÃ¨s.
//
// UPLOAD (crÃ©ateur / boutique) : `POST /upload-url` dÃ©livre une URL d'upload
// signÃ©e â€” le navigateur tÃ©lÃ©verse le fichier DIRECTEMENT vers Supabase (PUT),
// sans passer par l'API Vercel (dont le corps est plafonnÃ© Ã  4,5 Mo). Les
// fichiers digitaux peuvent ainsi peser jusqu'Ã  20 Mo.
import { Router } from "express";
import jwt from "jsonwebtoken";
import { q } from "../db.js";
import { roleRequired, authRequired, authOptional } from "../auth.js";
import {
  signedDigitalUrl,
  createDigitalUploadUrl,
  digitalObjectKey,
  DIGITAL_MAX_BYTES,
  DIGITAL_EXT_ALLOWED,
  safeFileExt,
} from "../storage.js";
import { reconcileDigitalSale } from "../services/ikeepay.js";
import { logAudit } from "../security.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// DurÃ©e de vie de l'URL signÃ©e : courte par nature (le temps du tÃ©lÃ©chargement).
const SIGNED_TTL_SECONDS = 600;

// DurÃ©e de vie de l'URL d'UPLOAD signÃ©e : le temps de tÃ©lÃ©verser un gros
// fichier (50 Mo sur une connexion lente d'Afrique centrale â‰ˆ quelques minutes).
const UPLOAD_TTL_SECONDS = 3600;

// Quota de STOCKAGE par compte crÃ©ateur/boutique (somme des fichiers digitaux
// rattachÃ©s Ã  ses produits publiÃ©s). ProtÃ¨ge le quota Supabase : sans ce
// plafond, un compte pourrait accumuler des dizaines de fichiers de 50 Mo.
// RÃ©glable via la variable d'environnement DIGITAL_USER_QUOTA_MB (dÃ©faut 500).
const DIGITAL_USER_QUOTA_BYTES =
  Math.max(50, Number(process.env.DIGITAL_USER_QUOTA_MB) || 500) * 1024 * 1024;


// Le tÃ©lÃ©chargement est ouvert dÃ¨s que la BOUTIQUE a confirmÃ© le paiement
// (bouton Â« Confirmer Â» de son espace, qui pose `shop_confirmed_at`) ou que la
// commande est livrÃ©e. C'est le garde-fou qui empÃªche un acheteur de rÃ©cupÃ©rer
// le fichier sans payer â€” le paiement MboppiShop Ã©tant manuel (Mobile Money /
// espÃ¨ces). Pour livrer immÃ©diatement Ã  l'achat, passer cette constante Ã 
// `false` : c'est le seul rÃ©glage Ã  changer.
const DIGITAL_REQUIRE_CONFIRMATION = true;

const DEFAULT_DOWNLOAD_LIMIT = 5;

const OWNER_ROLES = ["shop", "creator"];

/**
 * POST /api/digital/upload-url â€” prÃ©pare le tÃ©lÃ©versement DIRECT d'un fichier
 * digital vers le bucket PRIVÃ‰ (navigateur â†’ Supabase, sans passer par l'API).
 * Le client fournit : name, size, hash (SHA-256 hex calculÃ© dans le navigateur).
 * La clÃ© Storage est contrainte au dossier de l'utilisateur, ce qui garantit
 * qu'un compte ne peut jamais tÃ©lÃ©verser dans le dossier d'un autre.
 * Le fichier n'est rÃ©ellement vÃ©rifiÃ© (existence + taille) qu'au moment oÃ¹ le
 * produit est enregistrÃ© (products.js), via digitalObjectMeta.
 */
router.post(
  "/upload-url",
  authRequired,
  roleRequired(...OWNER_ROLES),
  ah(async (req, res) => {
    const { name, size, hash } = req.body || {};
    const fileName = String(name || "fichier").trim().slice(0, 160);
    if (!fileName || fileName === "fichier") {
      return res.status(400).json({ error: "Nom de fichier requis." });
    }
    const ext = safeFileExt(fileName);
    if (!DIGITAL_EXT_ALLOWED.has(ext)) {
      return res.status(400).json({
        error: `Type de fichier non pris en charge (.${ext}). Formats acceptÃ©s : PDF, ZIP, EPUB, Office, TXT/CSV, MP3, MP4, imagesâ€¦`,
      });
    }
    const bytes = Number(size || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return res.status(400).json({ error: "Fichier illisible ou vide." });
    }
    if (bytes > DIGITAL_MAX_BYTES) {
      return res.status(400).json({
        error: `Fichier trop volumineux (${(bytes / 1024 / 1024).toFixed(1)} Mo). Maximum ${Math.round(
          DIGITAL_MAX_BYTES / 1024 / 1024
        )} Mo.`,
      });
    }
    const hex = String(hash || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      return res
        .status(400)
        .json({ error: "Empreinte de fichier invalide : rÃ©essayez (recalcul du hash)." });
    }
    // Quota de stockage par compte : somme des fichiers digitaux dÃ©jÃ  publiÃ©s
    // + ce nouveau fichier. (Le remplacement d'un fichier libÃ¨re sa place
    // aprÃ¨s la sauvegarde du produit â€” le quota reste volontairement strict.)
    try {
      const [used] = await q(
        `SELECT COALESCE(SUM(digital_size), 0)::bigint AS used
           FROM products
          WHERE shop_id = $1 AND is_digital = TRUE AND digital_path IS NOT NULL`,
        [req.user.id]
      );
      const usedBytes = Number(used?.used || 0);
      if (usedBytes + bytes > DIGITAL_USER_QUOTA_BYTES) {
        const mb = (n) => (n / 1024 / 1024).toFixed(0);
        return res.status(413).json({
          error: `Quota de stockage atteint : ${mb(usedBytes)} Mo utilisÃ©s sur ${mb(
            DIGITAL_USER_QUOTA_BYTES
          )} Mo. Remplacez ou supprimez un fichier existant pour libÃ©rer de la place.`,
        });
      }
    } catch (err) {
      // Table/colonne indisponible : on n'empÃªche pas l'upload pour autant.
      console.warn("[digital] quota stockage non vÃ©rifiÃ© :", err.message);
    }
    const key = digitalObjectKey(req.user.id, hex, fileName);
    try {
      const signed = await createDigitalUploadUrl(key, UPLOAD_TTL_SECONDS);
      if (!signed || !signed.uploadUrl) {
        return res
          .status(503)
          .json({ error: "Stockage des fichiers indisponible pour le moment. RÃ©essayez plus tard." });
      }
      return res.json({ key: signed.path, uploadUrl: signed.uploadUrl, token: signed.token });
    } catch (err) {
      console.error("[digital] URL d'upload signÃ©e Ã©chouÃ©e :", err.message);
      return res
        .status(502)
        .json({ error: "Stockage des fichiers indisponible pour le moment. RÃ©essayez plus tard." });
    }
  })
);

// Authentification FACULTATIVE : un achat peut avoir Ã©tÃ© fait sans compte
// (le code de confirmation fait alors office de preuve, comme pour la remise
// d'un colis par le livreur).
const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {
      /* jeton invalide/expirÃ© : accÃ¨s en tant qu'invitÃ© (code requis) */
    }
  }
  next();
};

const SALE_COLUMNS = `s.id AS sale_id, s.buyer_id, s.confirm_code, s.status, s.quantity,
  s.shop_confirmed_at, s.delivered_at, s.access_revoked, s.access_revoked_at,
  COALESCE(s.access_days_extra, 0) AS access_days_extra,
  p.id AS product_id, p.shop_id, p.name AS product_name, p.is_digital,
  p.digital_path, p.digital_name, p.digital_mime, p.digital_size, p.digital_download_limit,
  p.digital_kind, p.youtube_id, p.access_days`;

async function loadSale(saleId) {
  const rows = await q(
    `SELECT ${SALE_COLUMNS}, shop.name AS shop_name
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     WHERE s.id = $1`,
    [saleId]
  );
  return rows[0] || null;
}

// Compteur de TÃ‰LÃ‰CHARGEMENTS uniquement : les visionnages vidÃ©o (action
// 'video') sont journalisÃ©s Ã  part et ne consomment PAS ce quota.
async function usedDownloads(saleId) {
  const [row] = await q(
    "SELECT COUNT(*)::int AS n FROM digital_downloads WHERE sale_id = $1 AND action = 'download'",
    [saleId]
  );
  return Number(row?.n || 0);
}

// Le tÃ©lÃ©chargement s'ouvre automatiquement dÃ¨s que la vente est confirmÃ©e
// (shop_confirmed_at posÃ© par la boutique OU par le webhook iKeePay pour un
// achat en ligne). Le client sonde GET /:saleId : le garde-fou s'ouvre seul.
// Si le webhook a Ã©tÃ© perdu (crash serverless, rÃ©seau), le sondage rattrape
// la confirmation via reconcileDigitalSale (logs de webhooks non rattachÃ©s,
// cooldown 5 s â€” mÃªme mÃ©canisme que l'adhÃ©sion).
const isOwnerCaller = (sale, user) =>
  Boolean(user) && Number(user.id) === Number(sale.shop_id);

const isBuyerCaller = (sale, user, code) => {
  if (user && sale.buyer_id && Number(user.id) === Number(sale.buyer_id)) return true;
  const given = String(code || "").trim().toUpperCase();
  const expected = String(sale.confirm_code || "").trim().toUpperCase();
  return Boolean(given) && Boolean(expected) && given === expected;
};

const downloadLimitOf = (sale) => {
  const n = Number(sale.digital_download_limit);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DOWNLOAD_LIMIT;
};

// Ventes payÃ©es EN LIGNE (iKeePay) : le client ne fait qu'UN tÃ©lÃ©chargement.
// FenÃªtre de grÃ¢ce de 10 min aprÃ¨s le 1er tÃ©lÃ©chargement pour rÃ©essayer en cas
// d'Ã©chec (rÃ©seau interrompu, page fermÃ©e trop tÃ´t), puis le quota tombe Ã  1.
const ONLINE_GRACE_MS = 10 * 60 * 1000;
async function effectiveLimitOf(sale, now = Date.now()) {
  const base = downloadLimitOf(sale);
  const online = (
    await q(
      `SELECT id, completed_at FROM digital_payments
        WHERE sale_id = $1 AND status = 'completed' LIMIT 1`,
      [sale.sale_id]
    ).catch(() => [])
  )[0];
  if (!online) return base; // vente classique (confirmation manuelle boutique)
  const completedAt = online.completed_at ? new Date(online.completed_at).getTime() : 0;
  const inGrace = completedAt && now - completedAt < ONLINE_GRACE_MS;
  return inGrace ? Math.max(base, 2) : 1;
}

// Le contenu PROTÃ‰GÃ‰ d'une vente est accessible pendant `access_days` jours
// aprÃ¨s la confirmation du paiement (shop_confirmed_at ou livraison). NULL =
// illimitÃ© (comportement historique â€” aucune rÃ©gression pour l'existant).
// `access_days_extra` (colonne sales) ajoute une prolongation PAR ACHETEUR,
// dÃ©cidÃ©e par le crÃ©ateur ou l'admin, sans toucher Ã  la fiche du produit.
function accessExpiryOf(sale) {
  const base = Number(sale.access_days);
  // DurÃ©e illimitÃ©e (ou non dÃ©finie) : aucune prolongation ne doit restreindre
  // l'accÃ¨s â€” on ne calcule une Ã©chÃ©ance que sur une durÃ©e finie du produit.
  if (!Number.isFinite(base) || base <= 0) return null;
  const extra = Number(sale.access_days_extra) || 0;
  const days = base + Math.max(0, extra);
  const ref = sale.shop_confirmed_at || sale.delivered_at;
  if (!ref) return null;
  return new Date(new Date(ref).getTime() + days * 24 * 3600 * 1000);
}

// L'Ã©tat d'accÃ¨s du contenu protÃ©gÃ© (vidÃ©o) pour un appelant autorisÃ©.
// RÃ©vocation (bouton crÃ©ateur/admin) = accÃ¨s coupÃ© dÃ©finitivement ; expiration
// = accÃ¨s coupÃ© automatiquement aprÃ¨s `access_days` jours.
function protectedState(sale, { owner }) {
  if (sale.digital_kind !== "youtube") {
    return { protected_video: false };
  }
  const revoked = sale.access_revoked === true;
  const expiry = accessExpiryOf(sale);
  const expired = Boolean(expiry && expiry.getTime() <= Date.now());
  const confirmed = Boolean(sale.shop_confirmed_at || sale.delivered_at);
  const waiting = DIGITAL_REQUIRE_CONFIRMATION && !confirmed && !owner;
  return {
    protected_video: true,
    // L'ID de la vidÃ©o n'est JAMAIS envoyÃ© ici â€” il ne part que par la route
    // `/video` (droit + expiration + rÃ©vocation vÃ©rifiÃ©s).
    has_video: Boolean(sale.youtube_id),
    revoked,
    expired,
    expires_at: expiry ? expiry.toISOString() : null,
    access_days: Number(sale.access_days) || null,
    confirmed,
    waiting_confirmation: waiting,
    ready: !revoked && !expired && !waiting,
  };
}

/** Ã‰tat du tÃ©lÃ©chargement pour l'appelant (le droit est dÃ©jÃ  vÃ©rifiÃ©). */
async function digitalState(sale, user) {
  const limit = await effectiveLimitOf(sale);
  const used = await usedDownloads(sale.sale_id);
  const owner = isOwnerCaller(sale, user);
  const confirmed = Boolean(sale.shop_confirmed_at || sale.delivered_at);
  const waiting = DIGITAL_REQUIRE_CONFIRMATION && !confirmed && !owner;
  const exhausted = !owner && used >= limit;
  const cancelled = sale.status === "cancelled";
  return {
    sale_id: Number(sale.sale_id),
    product_id: Number(sale.product_id),
    product_name: sale.product_name,
    shop_name: sale.shop_name,
    file_name: sale.digital_name || sale.product_name,
    file_size: Number(sale.digital_size || 0),
    mime: sale.digital_mime || null,
    digital_kind: sale.digital_kind || "file",
    cancelled,
    confirmed,
    owner,
    waiting_confirmation: waiting,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    ready: !cancelled && !waiting && !exhausted,
    can_download: !cancelled && !waiting && !exhausted,
    ...protectedState(sale, { owner }),
  };
}

// GET /api/digital/mine â€” mes produits digitaux (boutique / crÃ©ateur) avec le
// nombre de tÃ©lÃ©chargements par fichier. DÃ©clarÃ© AVANT /:saleId (sinon Express
// interprÃ©terait Â« mine Â» comme un identifiant de vente).
router.get(
  "/mine",
  optionalAuth,
  roleRequired(...OWNER_ROLES),
  ah(async (req, res) => {
    const items = await q(
      `SELECT p.id, p.name, p.price, p.currency, p.digital_name, p.digital_size,
              p.digital_mime, p.digital_download_limit, p.digital_kind, p.access_days, p.created_at,
              (SELECT COUNT(*)::int FROM digital_downloads d WHERE d.product_id = p.id) AS downloads,
              (SELECT COUNT(*)::int FROM sales s2 WHERE s2.product_id = p.id AND s2.status <> 'cancelled') AS sales_count
       FROM products p
       WHERE p.shop_id = $1 AND p.is_digital = TRUE
       ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json({
      items: items.map((it) => ({ ...it, digital_size: Number(it.digital_size || 0) })),
    });
  })
);

// GET /api/digital/:saleId â€” Ã©tat du tÃ©lÃ©chargement (bouton + explication).
router.get(
  "/:saleId",
  optionalAuth,
  ah(async (req, res) => {
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const sale = await loadSale(saleId);
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (!sale.is_digital)
      return res.status(400).json({ error: "Ce produit n'est pas un produit digital" });
    if (!isOwnerCaller(sale, req.user) && !isBuyerCaller(sale, req.user, req.query.code)) {
      return res.status(403).json({ error: "Ce tÃ©lÃ©chargement ne concerne pas votre compte" });
    }
    let state = await digitalState(sale, req.user);
    // Sondage client : si la vente attend toujours le paiement, on tente la
    // rÃ©conciliation (webhook perdu). Idempotent + cooldown 5 s.
    if (state.waiting_confirmation) {
      await reconcileDigitalSale(saleId).catch(() => {});
      const fresh = await loadSale(saleId);
      if (fresh) {
        state = await digitalState(fresh, req.user);
      }
    }
    res.json({ digital: state });
  })
);

router.post(
  "/:saleId/reconcile",
  optionalAuth,
  ah(async (req, res) => {
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const sale = await loadSale(saleId);
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (!sale.is_digital || (!sale.digital_path && sale.digital_kind !== "youtube"))
      return res.status(400).json({ error: "Ce produit n'est pas un produit digital" });
    const code = req.body?.code;
    const owner = isOwnerCaller(sale, req.user);
    if (!owner && !isBuyerCaller(sale, req.user, code)) {
      return res.status(403).json({ error: "Ce tÃ©lÃ©chargement ne concerne pas votre compte" });
    }
    // Paiement dÃ©jÃ  confirmÃ© : rien Ã  faire.
    const state = await digitalState(sale, req.user);
    if (!state.waiting_confirmation) {
      return res.json({ ok: true, digital: state });
    }
    // Filet : complÃ¨te le paiement Ã  partir des logs de webhooks non rattachÃ©s
    // (mÃªme principe que /api/payments/membership-status). Cooldown global 5 s.
    const ok = await reconcileDigitalSale(saleId);
    const fresh = await loadSale(saleId);
    const freshState = await digitalState(fresh, req.user);
    res.json({
      ok: Boolean(ok?.ok) || !freshState.waiting_confirmation,
      reconciled: Boolean(ok?.reconciled || ok?.settled),
      digital: freshState,
    });
  })
);

// GET /api/digital/:saleId/video â€” dÃ©verrouille la vidÃ©o protÃ©gÃ©e.
// MÃªme grille de droit que le tÃ©lÃ©chargement (acheteur connectÃ©, code de
// confirmation pour un achat invitÃ©, ou propriÃ©taire), PLUS les garde-fous du
// contenu protÃ©gÃ© : rÃ©vocation, expiration (access_days). La vidÃ©o est
// renvoyÃ©e en iframe YouTube Â« privacy-enhanced Â» â€” l'ID ne quitte le serveur
// QUE pour un appelant autorisÃ©, et chaque lecture est journalisÃ©e
// (digital_downloads, action='video') sans consommer le quota de tÃ©lÃ©chargement.
router.get(
  "/:saleId/video",
  optionalAuth,
  ah(async (req, res) => {
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const sale = await loadSale(saleId);
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (!sale.is_digital || sale.digital_kind !== "youtube" || !sale.youtube_id)
      return res.status(400).json({ error: "Ce produit n'est pas une vidÃ©o protÃ©gÃ©e" });
    const code = req.query?.code;
    const owner = isOwnerCaller(sale, req.user);
    if (!owner && !isBuyerCaller(sale, req.user, code)) {
      return res.status(403).json({ error: "Ce contenu ne concerne pas votre compte" });
    }
    // RÃ©conciliation webhook (filet auto-rÃ©parateur) si le paiement n'est pas
    // encore confirmÃ© â€” mÃªme mÃ©canisme que le tÃ©lÃ©chargement.
    let state = await digitalState(sale, req.user);
    if (state.protected_video && state.waiting_confirmation) {
      await reconcileDigitalSale(saleId).catch(() => {});
      const fresh = await loadSale(saleId);
      if (fresh) {
        sale.shop_confirmed_at = fresh.shop_confirmed_at;
        sale.delivered_at = fresh.delivered_at;
        state = await digitalState(sale, req.user);
      }
    }
    if (state.cancelled)
      return res.status(409).json({ error: "Cette commande a Ã©tÃ© annulÃ©e", access: state });
    if (state.protected_video && state.waiting_confirmation) {
      return res.status(409).json({
        error: "La vidÃ©o sera accessible dÃ¨s que le paiement est confirmÃ©.",
        access: state,
      });
    }
    if (state.protected_video && state.revoked)
      return res.status(403).json({
        error: "L'accÃ¨s Ã  cette vidÃ©o a Ã©tÃ© rÃ©voquÃ©. Contactez le crÃ©ateur.",
        access: state,
      });
    if (state.protected_video && state.expired)
      return res.status(403).json({
        error: "La durÃ©e d'accÃ¨s Ã  cette vidÃ©o est Ã©coulÃ©e. Contactez le crÃ©ateur pour la prolonger.",
        access: state,
      });

    // Journal du visionnage (action 'video' : ne consomme PAS le quota de
    // tÃ©lÃ©chargement â€” usedDownloads ne compte que action='download').
    if (!owner) {
      try {
        await q(
          "INSERT INTO digital_downloads (sale_id, product_id, user_id, ip, action) VALUES ($1, $2, $3, $4, 'video')",
          [sale.sale_id, sale.product_id, req.user?.id || null, req.ip || null]
        );
      } catch (err) {
        console.error("[digital] journal de visionnage Ã©chouÃ© :", err.message);
      }
    }
    return res.json({
      ok: true,
      embed_src: `https://www.youtube-nocookie.com/embed/${sale.youtube_id}?rel=0&autoplay=1`,
      expires_at: state.expires_at || null,
      access: state,
    });
  })
);

// POST /api/digital/:saleId/download â€” dÃ©livre l'URL signÃ©e (10 min).
// Le fichier ne transite JAMAIS par notre API : le navigateur tÃ©lÃ©charge
// directement chez Supabase (pas de limite de 4,5 Mo de Vercel, aucun egress
// inutile sur nos fonctions serverless).
router.post(
  "/:saleId/download",
  optionalAuth,
  ah(async (req, res) => {
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const sale = await loadSale(saleId);
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (!sale.is_digital || !sale.digital_path)
      return res.status(400).json({ error: "Ce produit n'est pas un produit digital" });
    // Une vidÃ©o protÃ©gÃ©e n'a pas de fichier : la lecture passe par /video.
    if (sale.digital_kind === "youtube")
      return res.status(400).json({
        error: "Ce contenu est une vidÃ©o protÃ©gÃ©e : utilisez le bouton Â« Regarder la vidÃ©o Â».",
      });

    const code = req.body?.code;
    const owner = isOwnerCaller(sale, req.user);
    if (!owner && !isBuyerCaller(sale, req.user, code)) {
      return res.status(403).json({ error: "Ce tÃ©lÃ©chargement ne concerne pas votre compte" });
    }

    const state = await digitalState(sale, req.user);
    if (state.cancelled)
      return res.status(409).json({ error: "Cette commande a Ã©tÃ© annulÃ©e", digital: state });
    if (state.waiting_confirmation) {
      // Filet de sÃ©curitÃ© : si le webhook a dÃ©jÃ  confirmÃ© le paiement mais que
      // la confirmation de la vente a Ã©tÃ© interrompue (serverless arrÃªtÃ© aprÃ¨s
      // la rÃ©ponse), on la rattrape ici. Idempotent.
      const reconciliation = await reconcileDigitalSale(sale.sale_id).catch(() => null);
      if (reconciliation && reconciliation.ok) {
        return res.json({ reconciled: true, digital: await digitalState(await loadSale(saleId), req.user) });
      }
      return res.status(409).json({
        error:
          "Le tÃ©lÃ©chargement sera disponible dÃ¨s que le paiement est confirmÃ© (quelques secondes aprÃ¨s le paiement iKeePay).",
        code: "AWAITING_CONFIRMATION",
        digital: state,
      });
    }
    if (!state.owner && state.used >= state.limit) {
      return res.status(429).json({
        error: `Limite de ${state.limit} tÃ©lÃ©chargements atteinte pour cette commande. Contactez la boutique pour une nouvelle autorisation.`,
        code: "DOWNLOAD_LIMIT",
        digital: state,
      });
    }
    // Garde-fous du contenu protÃ©gÃ© (les fichiers partagent la mÃªme grille) :
    // rÃ©vocation â†’ bloquÃ©e pour tous ; expiration (access_days) â†’ bloquÃ©e pour
    // l'acheteur (le propriÃ©taire garde l'aperÃ§u pour ses contrÃ´les).
    if (sale.access_revoked === true) {
      return res.status(403).json({
        error: "L'accÃ¨s Ã  ce contenu a Ã©tÃ© rÃ©voquÃ©. Contactez le crÃ©ateur.",
        code: "ACCESS_REVOKED",
        digital: state,
      });
    }
    if (!state.owner) {
      const expiry = accessExpiryOf(sale);
      if (expiry && expiry.getTime() <= Date.now()) {
        return res.status(403).json({
          error: "La durÃ©e d'accÃ¨s Ã  ce contenu est Ã©coulÃ©e. Contactez le crÃ©ateur pour la prolonger.",
          code: "ACCESS_EXPIRED",
          digital: state,
        });
      }
    }

    const signed = await signedDigitalUrl(sale.digital_path, SIGNED_TTL_SECONDS);
    if (!signed) {
      return res
        .status(503)
        .json({ error: "Fichier momentanÃ©ment indisponible. RÃ©essayez dans quelques instants." });
    }
    // `download=<nom>` force le navigateur Ã  ENREGISTRER le fichier au lieu de
    // l'ouvrir dans un onglet (les PDF notamment). Supabase honore ce paramÃ¨tre
    // sur une URL signÃ©e â€” c'est l'Ã©quivalent de l'option `{ download }` de
    // createSignedUrl. Le nom du fichier d'origine est ainsi prÃ©servÃ©.
    const url = `${signed}${signed.includes("?") ? "&" : "?"}download=${encodeURIComponent(
      state.file_name || "fichier"
    )}`;

    // Journal + compteur : uniquement les tÃ©lÃ©chargements d'ACHETEUR (le
    // propriÃ©taire qui teste son propre fichier ne consomme pas le quota).
    let used = state.used;
    if (!state.owner) {
      try {
        await q(
          "INSERT INTO digital_downloads (sale_id, product_id, user_id, ip) VALUES ($1, $2, $3, $4)",
          [sale.sale_id, sale.product_id, req.user?.id || null, req.ip || null]
        );
        used += 1;
      } catch (err) {
        console.error("[digital] journal de tÃ©lÃ©chargement Ã©chouÃ© :", err.message);
      }
    }

    res.json({
      ok: true,
      url,
      expires_in: SIGNED_TTL_SECONDS,
      file_name: state.file_name,
      mime: state.mime,
      file_size: state.file_size,
      used,
      limit: state.limit,
      remaining: Math.max(0, state.limit - used),
    });
  })
);

export default router;

// â”€â”€â”€ Gestion des accÃ¨s d'un produit vidÃ©o (crÃ©ateur propriÃ©taire / admin) â”€â”€â”€
// Le vendeur ne touche Ã  rien : il vend via son code, il ne modifie aucun
// produit (rÃ¨gle mÃ©tier â€” le crÃ©ateur est le seul gestionnaire du contenu).

/** Charge le produit et vÃ©rifie que l'appelant peut gÃ©rer ses accÃ¨s. */
async function loadManagedProduct(req, res) {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId < 1) {
    res.status(400).json({ error: "Produit invalide" });
    return null;
  }
  const product = (await q("SELECT * FROM products WHERE id = $1", [productId]))[0];
  if (!product) {
    res.status(404).json({ error: "Produit introuvable" });
    return null;
  }
  const isAdmin = req.user?.role === "admin";
  if (!isAdmin && Number(product.shop_id) !== Number(req.user?.id)) {
    res.status(403).json({ error: "Ce produit ne vous appartient pas" });
    return null;
  }
  if (!product.is_digital || product.digital_kind !== "youtube") {
    res.status(400).json({ error: "Ce produit n'est pas une vidÃ©o protÃ©gÃ©e" });
    return null;
  }
  return product;
}

// GET /api/digital/product/:productId/access - acces direct (sans achat) pour
// l administrateur et le proprietaire reel du produit (boutique / createur).
router.get(
  "/product/:productId/access",
  authRequired,
  ah(async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId < 1)
      return res.status(400).json({ error: "Produit invalide" });
    const product = (
      await q(
        `SELECT id, name, is_digital, digital_kind, digital_path, digital_name,
                digital_mime, digital_size, youtube_id, shop_id
           FROM products WHERE id = $1`,
        [productId]
      )
    )[0];
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    if (!product.is_digital)
      return res.status(400).json({ error: "Ce produit n est pas un produit digital" });
    const admin = req.user?.role === "admin";
    const owner = Number(req.user?.id) === Number(product.shop_id);
    if (!admin && !owner)
      return res.status(403).json({ error: "Ce produit ne vous appartient pas" });
    if (product.digital_kind === "youtube") {
      if (!product.youtube_id)
        return res.status(404).json({ error: "Contenu introuvable" });
      return res.json({
        kind: "youtube",
        title: product.name,
        embed_src: `https://www.youtube-nocookie.com/embed/${product.youtube_id}?rel=0&modestbranding=1`,
      });
    }
    if (!product.digital_path)
      return res.status(404).json({ error: "Fichier introuvable" });
    const url = await signedDigitalUrl(product.digital_path, SIGNED_TTL_SECONDS);
    return res.json({
      kind: "file",
      url,
      name: product.digital_name,
      mime: product.digital_mime,
      size: product.digital_size,
    });
  })
);

// GET /api/digital/product/:productId/accesses â€” liste des acheteurs + Ã©tat
// de leur accÃ¨s (rÃ©vocation, expiration, visionnages, tÃ©lÃ©chargements).
router.get(
  "/product/:productId/accesses",
  authRequired,
  ah(async (req, res) => {
    const product = await loadManagedProduct(req, res);
    if (!product) return;
    const sales = await q(
      `SELECT s.id, s.buyer_id, s.buyer_name, s.buyer_phone, s.confirm_code, s.status,
              s.quantity, s.total_price, s.created_at, s.shop_confirmed_at, s.delivered_at,
              s.access_revoked, s.access_revoked_at, COALESCE(s.access_days_extra, 0) AS access_days_extra,
              (SELECT COUNT(*)::int FROM digital_downloads d WHERE d.sale_id = s.id AND d.action = 'video') AS video_views,
              (SELECT COUNT(*)::int FROM digital_downloads d WHERE d.sale_id = s.id AND d.action = 'download') AS downloads
         FROM sales s
        WHERE s.product_id = $1 AND s.status <> 'cancelled'
        ORDER BY s.created_at DESC
        LIMIT 200`,
      [product.id]
    );
    res.json({
      product: {
        id: product.id,
        name: product.name,
        digital_name: product.digital_name,
        access_days: product.access_days === null ? null : Number(product.access_days) || null,
      },
      sales: sales.map((s) => {
        const expiry = accessExpiryOf({
          access_days: product.access_days,
          shop_confirmed_at: s.shop_confirmed_at,
          delivered_at: s.delivered_at,
          access_days_extra: s.access_days_extra,
        });
        return {
          id: Number(s.id),
          buyer_name: s.buyer_name,
          buyer_phone: s.buyer_phone,
          buyer_id: s.buyer_id === null ? null : Number(s.buyer_id),
          confirm_code: s.confirm_code,
          status: s.status,
          quantity: Number(s.quantity || 1),
          total_price: Number(s.total_price || 0),
          created_at: s.created_at,
          confirmed: Boolean(s.shop_confirmed_at || s.delivered_at),
          revoked: s.access_revoked === true,
          revoked_at: s.access_revoked_at,
          access_days_extra: Number(s.access_days_extra) || 0,
          expires_at: expiry ? expiry.toISOString() : null,
          expired: Boolean(expiry && expiry.getTime() <= Date.now()),
          video_views: Number(s.video_views || 0),
          downloads: Number(s.downloads || 0),
        };
      }),
    });
  })
);

// PATCH /api/digital/product/:productId/accesses/:saleId â€” action du crÃ©ateur
// (propriÃ©taire) ou de l'admin sur l'accÃ¨s d'UN acheteur :
//   â€¢ { revoked: true|false }  â†’ coupe / rÃ©tablit l'accÃ¨s immÃ©diatement ;
//   â€¢ { extend_days: n }       â†’ prolonge l'accÃ¨s de n jours (1 Ã  3650) ;
//   â€¢ { extend_days: 0 }       â†’ annule la prolongation (retour Ã  la durÃ©e du
//                                produit).
// Les deux champs peuvent Ãªtre envoyÃ©s ensemble. La prolongation est stockÃ©e
// sur la VENTE (sales.access_days_extra) : elle ne modifie ni la fiche produit
// ni l'accÃ¨s des autres acheteurs.
router.patch(
  "/product/:productId/accesses/:saleId",
  authRequired,
  ah(async (req, res) => {
    const product = await loadManagedProduct(req, res);
    if (!product) return;
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const [sale] = await q(
      `SELECT id, product_id, shop_confirmed_at, delivered_at,
              COALESCE(access_days_extra, 0) AS access_days_extra
         FROM sales WHERE id = $1`,
      [saleId]
    );
    if (!sale || Number(sale.product_id) !== Number(product.id))
      return res.status(404).json({ error: "Vente introuvable pour ce produit" });

    let revoked = null;
    if (req.body?.revoked !== undefined) revoked = req.body.revoked === true;

    let extraAfter = Number(sale.access_days_extra) || 0;
    let extraTouched = false;
    if (req.body?.extend_days !== undefined) {
      const raw = req.body.extend_days;
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 3650)
        return res.status(400).json({
          error: "DurÃ©e de prolongation invalide (0 Ã  3650 jours).",
        });
      // La prolongation exige une durÃ©e de dÃ©part finie : sans access_days, le
      // contenu est illimitÃ© et rien ne justifie une prolongation.
      const base = Number(product.access_days);
      if (n > 0 && (!Number.isFinite(base) || base <= 0))
        return res.status(400).json({
          error:
            "Ce contenu est en accÃ¨s illimitÃ© : dÃ©finissez d'abord une durÃ©e d'accÃ¨s sur le produit.",
        });
      // `extend_days` s'AJOUTE Ã  la prolongation dÃ©jÃ  accordÃ©e (0 = annuler).
      extraAfter = n === 0 ? 0 : extraAfter + n;
      extraTouched = true;
    }

    const updated = await q(
      `UPDATE sales
          SET access_revoked = COALESCE($2, access_revoked),
              access_revoked_at = CASE
                WHEN $2 IS NULL THEN access_revoked_at
                WHEN $2 THEN now()
                ELSE NULL
              END,
              access_days_extra = $3
        WHERE id = $1
        RETURNING access_revoked, access_revoked_at, COALESCE(access_days_extra, 0) AS access_days_extra`,
      [saleId, revoked, extraAfter]
    );

    const row = { ...sale, ...(updated[0] || {}) };
    const expiry = accessExpiryOf({
      access_days: product.access_days,
      shop_confirmed_at: row.shop_confirmed_at,
      delivered_at: row.delivered_at,
      access_days_extra: row.access_days_extra,
    });

    if (revoked !== null || (extraTouched && extraAfter !== Number(sale.access_days_extra))) {
      logAudit(
        req.user?.id,
        "digital.access.update",
        {
          product_id: product.id,
          sale_id: saleId,
          revoked,
          access_days_extra: extraTouched ? extraAfter : undefined,
        },
        req.ip
      );
    }

    res.json({
      ok: true,
      sale: {
        id: saleId,
        revoked: row.access_revoked === true,
        revoked_at: row.access_revoked_at || null,
        access_days_extra: Number(row.access_days_extra) || 0,
        expires_at: expiry ? expiry.toISOString() : null,
        expired: Boolean(expiry && expiry.getTime() <= Date.now()),
      },
    });
  })
);

// Sondage du client pendant l'attente du paiement en ligne (toutes les 4 s).
// Si le webhook a Ã©tÃ© manquÃ© (serverless arrÃªtÃ©, rÃ©fÃ©rence non reconnue), on
// tente la rÃ©conciliation depuis les logs de webhooks non rattachÃ©s â€” mÃªme
// mÃ©canisme auto-rÃ©parateur que l'adhÃ©sion (cooldown 5 s, budget 4 s).
router.get(
  "/:saleId/wait-online",
  optionalAuth,
  ah(async (req, res) => {
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const sale = await loadSale(saleId);
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    const code = req.query?.code;
    const owner = isOwnerCaller(sale, req.user);
    if (!owner && !isBuyerCaller(sale, req.user, code))
      return res.status(403).json({ error: "Ce tÃ©lÃ©chargement ne concerne pas votre compte" });

    let confirmed = Boolean(sale.shop_confirmed_at || sale.delivered_at);
    if (!confirmed && !owner) {
      await reconcileDigitalSale(saleId).catch((err) =>
        console.error("[digital] rÃ©conciliation impossible :", err.message)
      );
      const fresh = await loadSale(saleId);
      if (fresh) {
        confirmed = Boolean(fresh.shop_confirmed_at || fresh.delivered_at);
        if (confirmed) Object.assign(sale, fresh);
      }
    }
    const state = await digitalState(sale, req.user);
    res.json({ confirmed, digital: state });
  })
);
