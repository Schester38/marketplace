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
import { Router } from "express";
import jwt from "jsonwebtoken";
import { q } from "../db.js";
import { roleRequired, authOptional } from "../auth.js";
import { signedDigitalUrl } from "../storage.js";
import { reconcileDigitalSale } from "../services/ikeepay.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Durée de vie de l'URL signée : courte par nature (le temps du téléchargement).
const SIGNED_TTL_SECONDS = 600;

// Le téléchargement est ouvert dès que la BOUTIQUE a confirmé le paiement
// (bouton « Confirmer » de son espace, qui pose `shop_confirmed_at`) ou que la
// commande est livrée. C'est le garde-fou qui empêche un acheteur de récupérer
// le fichier sans payer — le paiement Mboppi étant manuel (Mobile Money /
// espèces). Pour livrer immédiatement à l'achat, passer cette constante à
// `false` : c'est le seul réglage à changer.
const DIGITAL_REQUIRE_CONFIRMATION = true;

const DEFAULT_DOWNLOAD_LIMIT = 5;

const OWNER_ROLES = ["shop", "creator"];

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
  s.shop_confirmed_at, s.delivered_at,
  p.id AS product_id, p.shop_id, p.name AS product_name, p.is_digital,
  p.digital_path, p.digital_name, p.digital_mime, p.digital_size, p.digital_download_limit`;

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

async function usedDownloads(saleId) {
  const [row] = await q(
    "SELECT COUNT(*)::int AS n FROM digital_downloads WHERE sale_id = $1",
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
    cancelled,
    confirmed,
    owner,
    waiting_confirmation: waiting,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    ready: !cancelled && !waiting && !exhausted,
    can_download: !cancelled && !waiting && !exhausted,
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
              p.digital_mime, p.digital_download_limit, p.created_at,
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
    if (!sale.is_digital || !sale.digital_path)
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
