// Tunnel de vente « formation flash » (/f/:id).
//
// Route PUBLIQUE de la page de vente : elle ne renvoie que des données
// éditoriales curatées. Deux secrets ne sortent JAMAIS d'ici sans paiement :
//   • le lien du groupe WhatsApp privé (funnel_group_url) — remis uniquement à
//     l'acheteur dans le reçu, après vérification de sa vente ;
//   • les coordonnées des autres acheteurs (aucune liste publique).
//
// Preuve d'accès : le code de confirmation de la vente (achat invité) OU le
// compte acheteur connecté (sales.buyer_id) — même logique que digital.js.
import { Router } from "express";
import { q } from "../db.js";
import { authOptional } from "../auth.js";
import { reconcileDigitalSale } from "../services/ikeepay.js";
import { proxyPhotoUrl } from "../photoProxy.js";
import { fullPhotos } from "../photo.js";
import { SITE_URL } from "../urls.js";
import { DEFAULT_FUNNEL_GROUP_URL } from "./products.js";

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const CONFIRM_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomReceiptCode() {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CONFIRM_CHARS[Math.floor(Math.random() * CONFIRM_CHARS.length)];
  }
  return `MBP-${code}`;
}

const PAID_SQL =
  "(s.paid_online_at IS NOT NULL OR s.shop_confirmed_at IS NOT NULL OR s.delivered_at IS NOT NULL)";

function paidAt(sale) {
  return sale.paid_online_at || sale.shop_confirmed_at || sale.delivered_at || null;
}

function isPaid(sale) {
  return Boolean(paidAt(sale));
}

/** L'appelant justifie-t-il cette vente ? (acheteur connecté, admin, ou code) */
function callerOwnsSale(sale, req) {
  if (req.user && Number(req.user.id) === Number(sale.buyer_id)) return true;
  if (req.user && req.user.role === "admin") return true;
  const code = String(req.query.code || req.body?.code || "").trim().toUpperCase();
  return Boolean(code && sale.confirm_code && code === String(sale.confirm_code).toUpperCase());
}

const SALE_SELECT = `
  SELECT s.id, s.product_id, s.quantity, s.total_price, s.currency, s.buyer_id,
         s.buyer_name, s.buyer_phone, s.buyer_email, s.buyer_city,
         s.buyer_first_name, s.buyer_last_name, s.buyer_reason,
         s.confirm_code, s.receipt_code, s.receipt_downloaded_at,
         s.paid_online_at, s.shop_confirmed_at, s.delivered_at, s.created_at, s.status,
         p.name AS product_name, p.funnel_enabled, p.funnel_group_url,
         u.name AS shop_name, u.phone AS shop_phone
    FROM sales s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN users u ON u.id = p.shop_id
`;

async function loadSaleById(saleId) {
  return (await q(`${SALE_SELECT} WHERE s.id = $1`, [saleId]))[0];
}

/**
 * Code de reçu garanti : les ventes funnel créées après la migration en ont
 * déjà un ; une vente historique (ou une création interrompue) en reçoit un ici.
 */
async function ensureReceiptCode(sale) {
  if (sale.receipt_code) return sale.receipt_code;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomReceiptCode();
    const rows = await q(
      "UPDATE sales SET receipt_code = $2 WHERE id = $1 AND receipt_code IS NULL RETURNING receipt_code",
      [sale.id, candidate]
    );
    if (rows[0]?.receipt_code) return rows[0].receipt_code;
    const fresh = (await q("SELECT receipt_code FROM sales WHERE id = $1", [sale.id]))[0];
    if (fresh?.receipt_code) return fresh.receipt_code;
  }
  return `MBP-${String(sale.id).padStart(6, "0")}`;
}

function receiptPayload(sale, receiptCode) {
  return {
    sale_id: Number(sale.id),
    receipt_code: receiptCode,
    amount: Number(sale.total_price),
    currency: sale.currency || "XAF",
    quantity: Number(sale.quantity || 1),
    paid_at: paidAt(sale),
    created_at: sale.created_at,
    product: { id: Number(sale.product_id), name: sale.product_name },
    shop: { name: sale.shop_name || "MboppiShop", phone: sale.shop_phone || null },
    buyer: {
      first_name: sale.buyer_first_name || null,
      last_name: sale.buyer_last_name || null,
      name: sale.buyer_name || null,
      email: sale.buyer_email || null,
      phone: sale.buyer_phone || null,
      city: sale.buyer_city || null,
      reason: sale.buyer_reason || null,
    },
    // Le lien du groupe privé n'est communiqué QU'APRÈS le téléchargement du
    // reçu (marqueur `receipt_downloaded_at`) — pas avant, même à l'acheteur.
    group_url: sale.receipt_downloaded_at
      ? sale.funnel_group_url || DEFAULT_FUNNEL_GROUP_URL
      : null,
    receipt_downloaded_at: sale.receipt_downloaded_at || null,
    site_url: SITE_URL,
  };
}

// ─── Reçu (authentifié par le code de confirmation) ────────────────────────
router.get(
  "/receipt/:saleId",
  authOptional,
  ah(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const sale = await loadSaleById(saleId);
    // Un reçu déjà généré reste consultable même si le tunnel est désactivé
    // après coup : l'acheteur a payé, son accès ne peut pas disparaître.
    if (!sale || (!sale.funnel_enabled && !sale.receipt_code))
      return res.status(404).json({ error: "Reçu introuvable" });
    if (!callerOwnsSale(sale, req))
      return res.status(403).json({ error: "Code de confirmation invalide" });
    if (!isPaid(sale)) {
      return res.status(409).json({
        error: "Le paiement n'est pas encore confirmé.",
        code: "PAYMENT_PENDING",
      });
    }
    const receiptCode = await ensureReceiptCode(sale);
    res.json({ receipt: receiptPayload(sale, receiptCode) });
  })
);

// Marque le reçu comme TÉLÉCHARGÉ : c'est ce signal qui débloque le bouton
// « Rejoindre le Groupe » côté client (et il reste consultable côté admin).
router.post(
  "/receipt/:saleId/downloaded",
  authOptional,
  ah(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const sale = await loadSaleById(saleId);
    if (!sale || (!sale.funnel_enabled && !sale.receipt_code))
      return res.status(404).json({ error: "Reçu introuvable" });
    if (!callerOwnsSale(sale, req))
      return res.status(403).json({ error: "Code de confirmation invalide" });
    if (!isPaid(sale)) return res.status(409).json({ error: "Paiement non confirmé." });
    const updated = (
      await q(
        `UPDATE sales SET receipt_downloaded_at = COALESCE(receipt_downloaded_at, now())
          WHERE id = $1 RETURNING receipt_downloaded_at`,
        [sale.id]
      )
    )[0];
    res.json({
      ok: true,
      receipt_downloaded_at: updated?.receipt_downloaded_at || null,
      group_url: sale.funnel_group_url || DEFAULT_FUNNEL_GROUP_URL,
    });
  })
);

// ─── Statut de paiement (sonde du tunnel) ──────────────────────────────────
router.get(
  "/status/:saleId",
  authOptional,
  ah(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const saleId = Number(req.params.saleId);
    if (!Number.isInteger(saleId) || saleId < 1)
      return res.status(400).json({ error: "Vente invalide" });
    const sale = await loadSaleById(saleId);
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (!callerOwnsSale(sale, req))
      return res.status(403).json({ error: "Code de confirmation invalide" });
    let paid = isPaid(sale);
    if (!paid) {
      await reconcileDigitalSale(sale.id).catch(() => null);
      const fresh = await loadSaleById(sale.id);
      paid = fresh ? isPaid(fresh) : false;
    }
    res.json({
      paid,
      sale_id: sale.id,
      confirm_code: sale.confirm_code,
      receipt_code: sale.receipt_code || null,
    });
  })
);

// ─── Page de vente publique ────────────────────────────────────────────────
router.get(
  "/:productId",
  ah(async (req, res) => {
    res.set(
      "Cache-Control",
      "public, s-maxage=20, max-age=10, stale-while-revalidate=40"
    );
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId < 1)
      return res.status(400).json({ error: "Produit invalide" });
    const product = (
      await q(
        `SELECT p.id, p.name, p.description, p.price, p.old_price, p.currency,
                p.image, p.photos, p.modules, p.funnel_enabled, p.funnel_headline,
                p.funnel_bonuses, p.funnel_seats_total, p.funnel_countdown_minutes,
                u.name AS shop_name, u.phone AS shop_phone, u.city AS shop_city,
                u.avatar AS shop_avatar, u.verified AS shop_verified
           FROM products p
           JOIN users u ON u.id = p.shop_id
          WHERE p.id = $1 AND p.funnel_enabled = TRUE`,
        [productId]
      )
    )[0];
    if (!product) return res.status(404).json({ error: "Page de vente introuvable" });

    const [count] = await q(
      `SELECT COUNT(*)::int AS n FROM sales s
        WHERE s.product_id = $1 AND s.status <> 'cancelled' AND ${PAID_SQL}`,
      [productId]
    );
    const seatsTotal = Math.max(1, Number(product.funnel_seats_total) || 30);
    const seatsTaken = Math.max(0, Number(count?.n || 0));
    const gallery = fullPhotos(product.photos).map((u) => proxyPhotoUrl(u));
    const bonuses = (Array.isArray(product.funnel_bonuses) ? product.funnel_bonuses : []).map(
      (b) => ({
        title: b?.title || "",
        description: b?.description || "",
        image: proxyPhotoUrl(b?.image) || null,
      })
    );
    res.json({
      funnel: {
        product_id: Number(product.id),
        name: product.name,
        description: product.description || "",
        headline: product.funnel_headline || "",
        price: Number(product.price),
        old_price:
          product.old_price === null || product.old_price === undefined
            ? null
            : Number(product.old_price),
        currency: product.currency || "XAF",
        image: proxyPhotoUrl(product.image) || gallery[0] || null,
        gallery,
        modules: Array.isArray(product.modules) ? product.modules : [],
        bonuses,
        seats_total: seatsTotal,
        seats_taken: seatsTaken,
        seats_left: Math.max(0, seatsTotal - seatsTaken),
        countdown_minutes: Number(product.funnel_countdown_minutes) || 90,
        shop: {
          name: product.shop_name || "MboppiShop",
          phone: product.shop_phone || null,
          city: product.shop_city || null,
          avatar: proxyPhotoUrl(product.shop_avatar) || null,
          verified: product.shop_verified === true,
        },
      },
    });
  })
);

export default router;
