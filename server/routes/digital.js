// Produits digitaux — TÉLÉCHARGEMENT des fichiers payants.
//
// Le fichier vit dans le bucket PRIVÉ `digital-products` (Supabase Storage) :
// il n'existe AUCUNE URL publique. L'acheteur reçoit une URL SIGNÉE à durée
// courte (10 min), générée ici après vérification de son droit d'accès :
//   — il est l'acheteur de la vente (sale.buyer_id), OU
//   — il détient le code de confirmation de la vente (achat sans compte), OU
//   — il est le propriétaire du produit (boutique / créateur : contrôle).
//
// Chaque téléchargement d'acheteur est journalisé (digital_downloads) et
// compté : le quota `products.digital_download_limit` (5 par défaut) protège
// le vendeur contre la diffusion en boucle d'un lien de téléchargement.
//
// Aucun fallback « manuel » (email/WhatsApp) : le client télécharge
// directement sur son appareil, l'URL signée étant le seul moyen d'accès.
//
// UPLOAD (créateur / boutique) : `POST /upload-url` délivre une URL d'upload
// signée — le navigateur téléverse le fichier DIRECTEMENT vers Supabase (PUT),
// sans passer par l'API Vercel (dont le corps est plafonné à 4,5 Mo). Les
// fichiers digitaux peuvent ainsi peser jusqu'à 20 Mo.
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

// Durée de vie de l'URL signée : courte par nature (le temps du téléchargement).
const SIGNED_TTL_SECONDS = 600;

// Durée de vie de l'URL d'UPLOAD signée : le temps de téléverser un gros
// fichier (50 Mo sur une connexion lente d'Afrique centrale ≈ quelques minutes).
const UPLOAD_TTL_SECONDS = 3600;

// Quota de STOCKAGE par compte créateur/boutique (somme des fichiers digitaux
// rattachés à ses produits publiés). Protège le quota Supabase : sans ce
// plafond, un compte pourrait accumuler des dizaines de fichiers de 50 Mo.
// Réglable via la variable d'environnement DIGITAL_USER_QUOTA_MB (défaut 500).
const DIGITAL_USER_QUOTA_BYTES =
  Math.max(50, Number(process.env.DIGITAL_USER_QUOTA_MB) || 500) * 1024 * 1024;


// Le téléchargement est ouvert dès que la BOUTIQUE a confirmé le paiement
// (bouton « Confirmer » de son espace, qui pose `shop_confirmed_at`) ou que la
// commande est livrée. C'est le garde-fou qui empêche un acheteur de récupérer
// le fichier sans payer — le paiement MboppiShop étant manuel (Mobile Money /
// espèces). Pour livrer immédiatement à l'achat, passer cette constante à
// `false` : c'est le seul réglage à changer.
const DIGITAL_REQUIRE_CONFIRMATION = true;

const DEFAULT_DOWNLOAD_LIMIT = 5;

const OWNER_ROLES = ["shop", "creator"];

/**
 * POST /api/digital/upload-url — prépare le téléversement DIRECT d'un fichier
 * digital vers le bucket PRIVÉ (navigateur → Supabase, sans passer par l'API).
 * Le client fournit : name, size, hash (SHA-256 hex calculé dans le navigateur).
 * La clé Storage est contrainte au dossier de l'utilisateur, ce qui garantit
 * qu'un compte ne peut jamais téléverser dans le dossier d'un autre.
 * Le fichier n'est réellement vérifié (existence + taille) qu'au moment où le
 * produit est enregistré (products.js), via digitalObjectMeta.
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
        error: `Type de fichier non pris en charge (.${ext}). Formats acceptés : PDF, ZIP, EPUB, Office, TXT/CSV, MP3, MP4, images…`,
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
        .json({ error: "Empreinte de fichier invalide : réessayez (recalcul du hash)." });
    }
    // Quota de stockage par compte : somme des fichiers digitaux déjà publiés
    // + ce nouveau fichier. (Le remplacement d'un fichier libère sa place
    // après la sauvegarde du produit — le quota reste volontairement strict.)
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
          error: `Quota de stockage atteint : ${mb(usedBytes)} Mo utilisés sur ${mb(
            DIGITAL_USER_QUOTA_BYTES
          )} Mo. Remplacez ou supprimez un fichier existant pour libérer de la place.`,
        });
      }
    } catch (err) {
      // Table/colonne indisponible : on n'empêche pas l'upload pour autant.
      console.warn("[digital] quota stockage non vérifié :", err.message);
    }
    const key = digitalObjectKey(req.user.id, hex, fileName);
    try {
      const signed = await createDigitalUploadUrl(key, UPLOAD_TTL_SECONDS);
      if (!signed || !signed.uploadUrl) {
        return res
          .status(503)
          .json({ error: "Stockage des fichiers indisponible pour le moment. Réessayez plus tard." });
      }
      return res.json({ key: signed.path, uploadUrl: signed.uploadUrl, token: signed.token });
    } catch (err) {
      console.error("[digital] URL d'upload signée échouée :", err.message);
      return res
        .status(502)
        .json({ error: "Stockage des fichiers indisponible pour le moment. Réessayez plus tard." });
    }
  })
);

// Authentification FACULTATIVE : un achat peut avoir été fait sans compte
// (le code de confirmation fait alors office de preuve, comme pour la remise
// d'un colis par le livreur).
const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {
      /* jeton invalide/expiré : accès en tant qu'invité (code requis) */
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

// Compteur de TÉLÉCHARGEMENTS uniquement : les visionnages vidéo (action
// 'video') sont journalisés à part et ne consomment PAS ce quota.
async function usedDownloads(saleId) {
  const [row] = await q(
    "SELECT COUNT(*)::int AS n FROM digital_downloads WHERE sale_id = $1 AND action = 'download'",
    [saleId]
  );
  return Number(row?.n || 0);
}

// Le téléchargement s'ouvre automatiquement dès que la vente est confirmée
// (shop_confirmed_at posé par la boutique OU par le webhook iKeePay pour un
// achat en ligne). Le client sonde GET /:saleId : le garde-fou s'ouvre seul.
// Si le webhook a été perdu (crash serverless, réseau), le sondage rattrape
// la confirmation via reconcileDigitalSale (logs de webhooks non rattachés,
// cooldown 5 s — même mécanisme que l'adhésion).
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

// Ventes payées EN LIGNE (iKeePay) : le client ne fait qu'UN téléchargement.
// Fenêtre de grâce de 10 min après le 1er téléchargement pour réessayer en cas
// d'échec (réseau interrompu, page fermée trop tôt), puis le quota tombe à 1.
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

// Le contenu PROTÉGÉ d'une vente est accessible pendant `access_days` jours
// après la confirmation du paiement (shop_confirmed_at ou livraison). NULL =
// illimité (comportement historique — aucune régression pour l'existant).
// `access_days_extra` (colonne sales) ajoute une prolongation PAR ACHETEUR,
// décidée par le créateur ou l'admin, sans toucher à la fiche du produit.
function accessExpiryOf(sale) {
  const base = Number(sale.access_days);
  // Durée illimitée (ou non définie) : aucune prolongation ne doit restreindre
  // l'accès — on ne calcule une échéance que sur une durée finie du produit.
  if (!Number.isFinite(base) || base <= 0) return null;
  const extra = Number(sale.access_days_extra) || 0;
  const days = base + Math.max(0, extra);
  const ref = sale.shop_confirmed_at || sale.delivered_at;
  if (!ref) return null;
  return new Date(new Date(ref).getTime() + days * 24 * 3600 * 1000);
}

// L'état d'accès du contenu protégé (vidéo) pour un appelant autorisé.
// Révocation (bouton créateur/admin) = accès coupé définitivement ; expiration
// = accès coupé automatiquement après `access_days` jours.
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
    // L'ID de la vidéo n'est JAMAIS envoyé ici — il ne part que par la route
    // `/video` (droit + expiration + révocation vérifiés).
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

/** État du téléchargement pour l'appelant (le droit est déjà vérifié). */
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

// GET /api/digital/mine — mes produits digitaux (boutique / créateur) avec le
// nombre de téléchargements par fichier. Déclaré AVANT /:saleId (sinon Express
// interpréterait « mine » comme un identifiant de vente).
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

// GET /api/digital/:saleId — état du téléchargement (bouton + explication).
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
      return res.status(403).json({ error: "Ce téléchargement ne concerne pas votre compte" });
    }
    let state = await digitalState(sale, req.user);
    // Sondage client : si la vente attend toujours le paiement, on tente la
    // réconciliation (webhook perdu). Idempotent + cooldown 5 s.
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
      return res.status(403).json({ error: "Ce téléchargement ne concerne pas votre compte" });
    }
    // Paiement déjà confirmé : rien à faire.
    const state = await digitalState(sale, req.user);
    if (!state.waiting_confirmation) {
      return res.json({ ok: true, digital: state });
    }
    // Filet : complète le paiement à partir des logs de webhooks non rattachés
    // (même principe que /api/payments/membership-status). Cooldown global 5 s.
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

// GET /api/digital/:saleId/video — déverrouille la vidéo protégée.
// Même grille de droit que le téléchargement (acheteur connecté, code de
// confirmation pour un achat invité, ou propriétaire), PLUS les garde-fous du
// contenu protégé : révocation, expiration (access_days). La vidéo est
// renvoyée en iframe YouTube « privacy-enhanced » — l'ID ne quitte le serveur
// QUE pour un appelant autorisé, et chaque lecture est journalisée
// (digital_downloads, action='video') sans consommer le quota de téléchargement.
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
      return res.status(400).json({ error: "Ce produit n'est pas une vidéo protégée" });
    const code = req.query?.code;
    const owner = isOwnerCaller(sale, req.user);
    if (!owner && !isBuyerCaller(sale, req.user, code)) {
      return res.status(403).json({ error: "Ce contenu ne concerne pas votre compte" });
    }
    // Réconciliation webhook (filet auto-réparateur) si le paiement n'est pas
    // encore confirmé — même mécanisme que le téléchargement.
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
      return res.status(409).json({ error: "Cette commande a été annulée", access: state });
    if (state.protected_video && state.waiting_confirmation) {
      return res.status(409).json({
        error: "La vidéo sera accessible dès que le paiement est confirmé.",
        access: state,
      });
    }
    if (state.protected_video && state.revoked)
      return res.status(403).json({
        error: "L'accès à cette vidéo a été révoqué. Contactez le créateur.",
        access: state,
      });
    if (state.protected_video && state.expired)
      return res.status(403).json({
        error: "La durée d'accès à cette vidéo est écoulée. Contactez le créateur pour la prolonger.",
        access: state,
      });

    // Journal du visionnage (action 'video' : ne consomme PAS le quota de
    // téléchargement — usedDownloads ne compte que action='download').
    if (!owner) {
      try {
        await q(
          "INSERT INTO digital_downloads (sale_id, product_id, user_id, ip, action) VALUES ($1, $2, $3, $4, 'video')",
          [sale.sale_id, sale.product_id, req.user?.id || null, req.ip || null]
        );
      } catch (err) {
        console.error("[digital] journal de visionnage échoué :", err.message);
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

// POST /api/digital/:saleId/download — délivre l'URL signée (10 min).
// Le fichier ne transite JAMAIS par notre API : le navigateur télécharge
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
    // Une vidéo protégée n'a pas de fichier : la lecture passe par /video.
    if (sale.digital_kind === "youtube")
      return res.status(400).json({
        error: "Ce contenu est une vidéo protégée : utilisez le bouton « Regarder la vidéo ».",
      });

    const code = req.body?.code;
    const owner = isOwnerCaller(sale, req.user);
    if (!owner && !isBuyerCaller(sale, req.user, code)) {
      return res.status(403).json({ error: "Ce téléchargement ne concerne pas votre compte" });
    }

    const state = await digitalState(sale, req.user);
    if (state.cancelled)
      return res.status(409).json({ error: "Cette commande a été annulée", digital: state });
    if (state.waiting_confirmation) {
      // Filet de sécurité : si le webhook a déjà confirmé le paiement mais que
      // la confirmation de la vente a été interrompue (serverless arrêté après
      // la réponse), on la rattrape ici. Idempotent.
      const reconciliation = await reconcileDigitalSale(sale.sale_id).catch(() => null);
      if (reconciliation && reconciliation.ok) {
        return res.json({ reconciled: true, digital: await digitalState(await loadSale(saleId), req.user) });
      }
      return res.status(409).json({
        error:
          "Le téléchargement sera disponible dès que le paiement est confirmé (quelques secondes après le paiement iKeePay).",
        code: "AWAITING_CONFIRMATION",
        digital: state,
      });
    }
    if (!state.owner && state.used >= state.limit) {
      return res.status(429).json({
        error: `Limite de ${state.limit} téléchargements atteinte pour cette commande. Contactez la boutique pour une nouvelle autorisation.`,
        code: "DOWNLOAD_LIMIT",
        digital: state,
      });
    }
    // Garde-fous du contenu protégé (les fichiers partagent la même grille) :
    // révocation → bloquée pour tous ; expiration (access_days) → bloquée pour
    // l'acheteur (le propriétaire garde l'aperçu pour ses contrôles).
    if (sale.access_revoked === true) {
      return res.status(403).json({
        error: "L'accès à ce contenu a été révoqué. Contactez le créateur.",
        code: "ACCESS_REVOKED",
        digital: state,
      });
    }
    if (!state.owner) {
      const expiry = accessExpiryOf(sale);
      if (expiry && expiry.getTime() <= Date.now()) {
        return res.status(403).json({
          error: "La durée d'accès à ce contenu est écoulée. Contactez le créateur pour la prolonger.",
          code: "ACCESS_EXPIRED",
          digital: state,
        });
      }
    }

    const signed = await signedDigitalUrl(sale.digital_path, SIGNED_TTL_SECONDS);
    if (!signed) {
      return res
        .status(503)
        .json({ error: "Fichier momentanément indisponible. Réessayez dans quelques instants." });
    }
    // `download=<nom>` force le navigateur à ENREGISTRER le fichier au lieu de
    // l'ouvrir dans un onglet (les PDF notamment). Supabase honore ce paramètre
    // sur une URL signée — c'est l'équivalent de l'option `{ download }` de
    // createSignedUrl. Le nom du fichier d'origine est ainsi préservé.
    const url = `${signed}${signed.includes("?") ? "&" : "?"}download=${encodeURIComponent(
      state.file_name || "fichier"
    )}`;

    // Journal + compteur : uniquement les téléchargements d'ACHETEUR (le
    // propriétaire qui teste son propre fichier ne consomme pas le quota).
    let used = state.used;
    if (!state.owner) {
      try {
        await q(
          "INSERT INTO digital_downloads (sale_id, product_id, user_id, ip) VALUES ($1, $2, $3, $4)",
          [sale.sale_id, sale.product_id, req.user?.id || null, req.ip || null]
        );
        used += 1;
      } catch (err) {
        console.error("[digital] journal de téléchargement échoué :", err.message);
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

// ─── Gestion des accès d'un produit vidéo (créateur propriétaire / admin) ───
// Le vendeur ne touche à rien : il vend via son code, il ne modifie aucun
// produit (règle métier — le créateur est le seul gestionnaire du contenu).

/** Charge le produit et vérifie que l'appelant peut gérer ses accès. */
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
    res.status(400).json({ error: "Ce produit n'est pas une vidéo protégée" });
    return null;
  }
  return product;
}

// GET /api/digital/product/:productId/accesses — liste des acheteurs + état
// de leur accès (révocation, expiration, visionnages, téléchargements).
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

// PATCH /api/digital/product/:productId/accesses/:saleId — action du créateur
// (propriétaire) ou de l'admin sur l'accès d'UN acheteur :
//   • { revoked: true|false }  → coupe / rétablit l'accès immédiatement ;
//   • { extend_days: n }       → prolonge l'accès de n jours (1 à 3650) ;
//   • { extend_days: 0 }       → annule la prolongation (retour à la durée du
//                                produit).
// Les deux champs peuvent être envoyés ensemble. La prolongation est stockée
// sur la VENTE (sales.access_days_extra) : elle ne modifie ni la fiche produit
// ni l'accès des autres acheteurs.
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
          error: "Durée de prolongation invalide (0 à 3650 jours).",
        });
      // La prolongation exige une durée de départ finie : sans access_days, le
      // contenu est illimité et rien ne justifie une prolongation.
      const base = Number(product.access_days);
      if (n > 0 && (!Number.isFinite(base) || base <= 0))
        return res.status(400).json({
          error:
            "Ce contenu est en accès illimité : définissez d'abord une durée d'accès sur le produit.",
        });
      // `extend_days` s'AJOUTE à la prolongation déjà accordée (0 = annuler).
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
// Si le webhook a été manqué (serverless arrêté, référence non reconnue), on
// tente la réconciliation depuis les logs de webhooks non rattachés — même
// mécanisme auto-réparateur que l'adhésion (cooldown 5 s, budget 4 s).
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
      return res.status(403).json({ error: "Ce téléchargement ne concerne pas votre compte" });

    let confirmed = Boolean(sale.shop_confirmed_at || sale.delivered_at);
    if (!confirmed && !owner) {
      await reconcileDigitalSale(saleId).catch((err) =>
        console.error("[digital] réconciliation impossible :", err.message)
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
