import { Router } from "express";
import { q, withTransaction } from "../db.js";
import { authRequired, roleRequired, authOptional } from "../auth.js";
import { sendPush } from "../push.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function saleRow(s) {
  return {
    ...s,
    total_price: Number(s.total_price),
    commission: Number(s.commission),
    delivery_fee: Number(s.delivery_fee || 0),
    purchase_price: s.purchase_price != null ? Number(s.purchase_price) : null,
    product_price: Math.round((Number(s.total_price) / Number(s.quantity)) * 100) / 100,
  };
}

router.post(
  "/",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const { product_id, quantity } = req.body || {};
    const productId = Number(product_id);
    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ error: "Produit requis" });
    }
    const qty = Number(quantity ?? 1);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: "Quantité invalide" });
    }

    const result = await withTransaction(async (tx) => {
      const product = (
        await tx.query("SELECT * FROM products WHERE id = $1 FOR UPDATE", [productId])
      )[0];
      if (!product) {
        const error = new Error("Produit introuvable");
        error.statusCode = 404;
        throw error;
      }

      const pending = (
        await tx.query(
          "SELECT id FROM sales WHERE product_id = $1 AND seller_id = $2 AND status = $3",
          [product.id, req.user.id, "pending"]
        )
      )[0];
      if (pending) {
        const error = new Error("Une vente est déjà en attente pour ce produit");
        error.statusCode = 409;
        throw error;
      }

      const reserved = (
        await tx.query(
          `UPDATE products SET quantity = quantity - $1, reserved_quantity = COALESCE(reserved_quantity, 0) + $1
       WHERE id = $2 AND quantity >= $1 RETURNING id`,
          [qty, product.id]
        )
      )[0];
      if (!reserved) {
        const error = new Error("Stock insuffisant");
        error.statusCode = 409;
        throw error;
      }

      const total = Math.round(Number(product.price) * qty * 100) / 100;
      const commission =
        Math.round(Number(product.price) * (Number(product.commission_percent) / 100) * qty * 100) /
        100;
      const created = (
        await tx.query(
          `INSERT INTO sales (product_id, seller_id, quantity, total_price, commission, stock_reserved)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
          [product.id, req.user.id, qty, total, commission]
        )
      )[0];
      return { id: created.id };
    });

    const sale = saleRow(
      (
        await q(
          `SELECT s.*, p.name AS product_name, p.price, p.commission_percent, p.contact AS shop_contact,
            u.name AS seller_name, u.phone AS seller_phone
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users u ON u.id = s.seller_id
     WHERE s.id = $1`,
          [result.id]
        )
      )[0]
    );
    res.status(201).json({ sale });
  })
);

router.get(
  "/recent",
  ah(async (req, res) => {
    const rows = await q(
      `SELECT p.name AS product_name, u.name AS shop_name, s.buyer_city, s.created_at
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users u ON u.id = p.shop_id
     WHERE s.status <> 'cancelled'
     ORDER BY s.created_at DESC
     LIMIT 10`
    );
    res.json({
      recent: rows.map((r) => ({
        product_name: r.product_name,
        shop_name: r.shop_name,
        buyer_city: r.buyer_city || "",
        created_at: r.created_at,
      })),
    });
  })
);

router.get(
  "/my",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const sales = (
      await q(
        `SELECT s.*, p.name AS product_name, p.commission_percent, p.shop_id, p.contact AS shop_contact,
              u.name AS shop_name, u.country AS shop_country,
              u2.seller_code AS seller_code, u2.phone AS seller_phone
FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = p.shop_id
       JOIN users u2 ON u2.id = s.seller_id
       WHERE s.seller_id = $1 AND NOT ($1 = ANY(s.hidden_for))
       ORDER BY s.created_at DESC`,
        [req.user.id]
      )
    ).map(saleRow);
    const stats = (
      await q(
        `SELECT
         COUNT(*) AS total_sales,
         COALESCE(SUM(commission + referral_commission), 0) AS total_commission,
         COALESCE(SUM(CASE WHEN paid THEN commission + referral_commission ELSE 0 END), 0) AS earned_commission,
         COALESCE(SUM(CASE WHEN status = 'delivered' AND NOT paid THEN commission + referral_commission ELSE 0 END), 0) AS pending_commission
       FROM sales WHERE seller_id = $1 AND NOT ($1 = ANY(hidden_for))`,
        [req.user.id]
      )
    )[0];
    const referralStats = (
      await q(
        `SELECT
         COALESCE(SUM(CASE WHEN NOT referral_paid THEN referral_commission ELSE 0 END), 0) AS referral_pending,
         COALESCE(SUM(CASE WHEN referral_paid THEN referral_commission ELSE 0 END), 0) AS referral_earned
       FROM sales WHERE referred_by = $1 AND status = 'delivered' AND NOT ($1 = ANY(hidden_for))`,
        [req.user.id]
      )
    )[0];
    const referred = (
      await q(
        `SELECT s.id, s.status, s.buyer_name, s.created_at, s.delivered_at, s.referral_commission,
              s.referral_paid, s.referral_claimed_at, p.shop_id, p.name AS product_name, p.contact AS shop_contact,
              shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.referred_by = $1 AND NOT ($1 = ANY(s.hidden_for))
       ORDER BY s.created_at DESC`,
        [req.user.id]
      )
    ).map(saleRow);
    // Parrainage d'activation vendeur : vendeurs/créateurs inscrits via le
    // `seller_code` du vendeur courant (`ref_seller` → `users.referred_by`).
    // Quand l'un d'eux paie son adhésion, le parrain reçoit 1 000 XAF versés
    // manuellement par l'administration (aucun reversement automatique).
    // Liste purement informative — aucune dépendance à iKeePay.
    let activationReferrals = [];
    try {
      activationReferrals = (
        await q(
          `SELECT u.id AS user_id, u.name, u.role, u.phone, u.reference_number,
                 u.membership_paid_at, u.membership_expires_at, u.created_at
           FROM users u
           WHERE u.referred_by = $1 AND u.role IN ('seller', 'creator')
           ORDER BY u.created_at DESC`,
          [req.user.id]
        )
      ).map((r) => ({
        user_id: Number(r.user_id),
        name: r.name,
        role: r.role,
        phone: r.phone,
        reference_number: r.reference_number,
        membership_paid_at: r.membership_paid_at,
        membership_expires_at: r.membership_expires_at,
        created_at: r.created_at,
        commission_amount: 1000,
        commission_currency: "XAF",
      }));
    } catch (err) {
      console.error("[sales/my] commissions de parrainage vendeur indisponibles :", err.message);
    }
    res.json({
      sales,
      stats: {
        total_sales: Number(stats.total_sales),
        total_commission: Number(stats.total_commission),
        earned_commission: Number(stats.earned_commission),
        pending_commission: Number(stats.pending_commission),
        referral_pending: Number(referralStats.referral_pending),
        referral_earned: Number(referralStats.referral_earned),
      },
      referred,
      activationReferrals,
    });
  })
);

router.get(
  "/shop/:shopId",
  authRequired,
  roleRequired("shop", "creator"),
  ah(async (req, res) => {
    if (Number(req.params.shopId) !== req.user.id) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    const sales = (
      await q(
        `SELECT s.*, p.name AS product_name, p.commission_percent, p.contact AS shop_contact, u.name AS seller_name, u.phone AS seller_phone, u.seller_code, parrain.name AS parrain_name, shop.country AS shop_country
FROM sales s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN users u ON u.id = s.seller_id
       LEFT JOIN users parrain ON parrain.id = s.referred_by
       JOIN users shop ON shop.id = p.shop_id
       WHERE p.shop_id = $1 AND NOT ($1 = ANY(s.hidden_for))
       ORDER BY s.created_at DESC`,
        [req.user.id]
      )
    ).map(saleRow);
    const stats = (
      await q(
        `SELECT
         COUNT(*) AS total_sales,
         COALESCE(SUM(s.total_price), 0) AS revenue,
         COALESCE(SUM(s.delivery_fee), 0) AS delivery_revenue,
         COALESCE(SUM(CASE WHEN s.seller_id IS NOT NULL THEN s.commission ELSE 0 END) + SUM(CASE WHEN s.referred_by IS NOT NULL THEN s.referral_commission ELSE 0 END), 0) AS total_commission,
         COALESCE(SUM(CASE WHEN s.paid AND s.seller_id IS NOT NULL THEN s.commission ELSE 0 END) + SUM(CASE WHEN s.referral_paid AND s.referred_by IS NOT NULL THEN s.referral_commission ELSE 0 END), 0) AS paid_commission,
         COALESCE(SUM(CASE WHEN s.status = 'delivered' AND NOT s.paid AND s.seller_id IS NOT NULL THEN s.commission ELSE 0 END) + SUM(CASE WHEN s.status = 'delivered' AND NOT s.referral_paid AND s.referred_by IS NOT NULL THEN s.referral_commission ELSE 0 END), 0) AS owed_commission
       FROM sales s
       JOIN products p ON p.id = s.product_id
       WHERE p.shop_id = $1 AND NOT ($1 = ANY(s.hidden_for))`,
        [req.user.id]
      )
    )[0];
    const series = (
      await q(
        `SELECT to_char(date_trunc('day', s.created_at), 'YYYY-MM-DD') AS day,
              COUNT(*) AS cnt, COALESCE(SUM(s.total_price), 0) AS rev
       FROM sales s
       JOIN products p ON p.id = s.product_id
       WHERE p.shop_id = $1 AND s.created_at >= now() - interval '13 days' AND NOT ($1 = ANY(s.hidden_for))
       GROUP BY 1 ORDER BY 1`,
        [req.user.id]
      )
    ).map((r) => ({ day: r.day, cnt: Number(r.cnt), rev: Number(r.rev) }));
    const topProducts = (
      await q(
        `SELECT p.name, COUNT(*) AS cnt, COALESCE(SUM(s.total_price), 0) AS rev
       FROM sales s
       JOIN products p ON p.id = s.product_id
       WHERE p.shop_id = $1 AND NOT ($1 = ANY(s.hidden_for))
       GROUP BY p.id, p.name
       ORDER BY rev DESC, cnt DESC
       LIMIT 5`,
        [req.user.id]
      )
    ).map((r) => ({ name: r.name, cnt: Number(r.cnt), rev: Number(r.rev) }));
    res.json({
      sales,
      stats: {
        total_sales: Number(stats.total_sales),
        revenue: Number(stats.revenue),
        delivery_revenue: Number(stats.delivery_revenue),
        total_commission: Number(stats.total_commission),
        paid_commission: Number(stats.paid_commission),
        owed_commission: Number(stats.owed_commission),
      },
      series,
      topProducts,
    });
  })
);

router.patch(
  "/:id/status",
  authRequired,
  roleRequired("shop"),
  ah(async (req, res) => {
    const { status } = req.body || {};
    if (!["confirmed", "cancelled", "pending"].includes(status)) {
      return res.status(400).json({ error: "Statut invalide" });
    }
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
    if (product.shop_id !== req.user.id) {
      return res.status(403).json({ error: "Cette vente ne concerne pas votre boutique" });
    }
    const previous = sale.status;
    if (["delivered", "cancelled"].includes(sale.status) && status !== sale.status) {
      return res.status(409).json({ error: "Cette vente ne peut plus changer de statut" });
    }
    if (status === "cancelled" && sale.stock_reserved) {
      await q(
        "UPDATE products SET quantity = quantity + $1, reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - $1, 0) WHERE id = $2",
        [sale.quantity, sale.product_id]
      );
    }
    if (status === "confirmed") {
      // La boutique ne fait que confirmer avoir vu la commande : le client est informé
      // sur son suivi, mais le statut reste 'pending' pour que le livreur puisse la livrer
      // et que le vendeur garde sa commission.
      await q(
        "UPDATE sales SET shop_confirmed_at = COALESCE(shop_confirmed_at, now()) WHERE id = $1",
        [sale.id]
      );
    } else {
      await q(
        "UPDATE sales SET status = $1, stock_reserved = CASE WHEN $1 = 'cancelled' THEN FALSE ELSE stock_reserved END WHERE id = $2",
        [status, sale.id]
      );
    }

    const type = status === "cancelled" ? "sale_cancelled" : "sale_confirmed";
    const buyers = sale.buyer_id ? [sale.buyer_id] : [];
    const userIds = [...new Set([sale.seller_id, product.shop_id, ...buyers].filter(Boolean))];
    if (userIds.length) {
      const values = userIds.map((uid) => `(${Number(uid)}, '${type}', ${sale.id})`).join(", ");
      await q(`INSERT INTO notifications (user_id, type, sale_id) VALUES ${values}`);
    }

    const info = (await q("SELECT name FROM products WHERE id = $1", [sale.product_id]))[0];
    const productName = info ? String(info.name) : "article";
    const buyerName = String(sale.buyer_name || "client");
    const clientUrl = `/suivi/${sale.id}?code=${encodeURIComponent(sale.confirm_code || sale.buyer_code || "")}`;
    if (status === "cancelled") {
      if (sale.seller_id) {
        await sendPush(sale.seller_id, {
          title: "Commande annulée ❌",
          body: `${productName} — la commande de ${buyerName} a été annulée par la boutique.`,
          url: "/seller",
        });
      }
      if (sale.buyer_id) {
        await sendPush(sale.buyer_id, {
          title: "Commande annulée ❌",
          body: `${productName} — votre commande a été annulée. Contactez le vendeur si besoin.`,
          url: clientUrl,
        });
      }
    } else if (status === "confirmed") {
      if (sale.seller_id) {
        await sendPush(sale.seller_id, {
          title: "Commande confirmée ✅",
          body: `${productName} — la boutique a confirmé la commande de ${buyerName}.`,
          url: "/seller",
        });
      }
      if (sale.buyer_id) {
        await sendPush(sale.buyer_id, {
          title: "Commande confirmée ✅",
          body: `${productName} — votre commande a été confirmée par la boutique.`,
          url: clientUrl,
        });
      }
    }
    if (previous !== status) {
      res.json({ ok: true, previous_status: previous });
    } else {
      res.json({ ok: true });
    }
  })
);

router.delete(
  "/:id",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (sale.seller_id !== req.user.id) {
      return res.status(403).json({ error: "Cette vente ne vous appartient pas" });
    }
    if (sale.status === "delivered") {
      const isAlsoReferrer = Number(sale.referred_by || 0) === req.user.id;
      const pendingSeller = Number(sale.commission || 0) > 0 && !sale.paid;
      const pendingOwnReferral =
        isAlsoReferrer && Number(sale.referral_commission || 0) > 0 && !sale.referral_paid;
      if (pendingSeller || pendingOwnReferral) {
        return res.status(409).json({
          error:
            "Vous ne pouvez pas retirer cette vente tant que sa commission (vendeur ou parrainage) n'a pas été payée.",
        });
      }
      await q(
        "UPDATE sales SET hidden_for = array_append(array_remove(hidden_for, $1), $1) WHERE id = $2",
        [req.user.id, sale.id]
      );
      return res.json({ ok: true });
    }
    await q("DELETE FROM sales WHERE id = $1", [sale.id]);
    res.json({ ok: true });
  })
);

router.delete(
  "/:id/referral",
  authRequired,
  ah(async (req, res) => {
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (Number(sale.referred_by || 0) !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Cette commission de parrainage ne vous appartient pas" });
    }
    if (sale.status !== "delivered") {
      return res
        .status(409)
        .json({ error: "La commande doit être livrée avant de pouvoir la retirer" });
    }
    if (sale.referral_paid !== true || Number(sale.referral_commission || 0) <= 0) {
      return res.status(409).json({
        error:
          "Vous ne pouvez pas retirer cette commission tant que le paiement du parrainage n'a pas été effectué.",
      });
    }
    await q(
      "UPDATE sales SET hidden_for = array_append(array_remove(hidden_for, $1), $1) WHERE id = $2",
      [req.user.id, sale.id]
    );
    res.json({ ok: true });
  })
);

router.get(
  "/livreur",
  // Route publique (un livreur peut livrer sans être connecté) mais si le
  // livreur est connecté, on filtre ses livraisons ET on calcule ses stats.
  authOptional,
  ah(async (req, res) => {
    const shopCode = req.query.shop_code ? String(req.query.shop_code).trim().toUpperCase() : "";
    if (!shopCode) return res.status(400).json({ error: "Code boutique requis" });
    const shop = (await q("SELECT id, name, country FROM users WHERE shop_code = $1", [shopCode]))[0];
    if (!shop) return res.status(404).json({ error: "Code boutique invalide" });
    const pending = (
      await q(
        `SELECT s.*, p.name AS product_name, p.commission_percent, p.shop_id, p.contact AS shop_contact,
              u.name AS seller_name, u.phone AS seller_phone, u.seller_code,
              shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.status IN ('pending', 'confirmed') AND p.shop_id = $1
       ORDER BY s.created_at DESC`,
        [shop.id]
      )
    ).map(saleRow);
    // Livraisons du livreur connecté uniquement (session présente + rôle
    // livreur), sinon (visiteur non connecté) on garde l'historique complet
    // de la boutique.
    const me = req.user && req.user.role === "livreur" ? req.user.id : null;
    const deliveredFilter = me
      ? "s.status = 'delivered' AND s.delivered_by = $1 AND p.shop_id = $2 AND NOT ($1 = ANY(s.hidden_for))"
      : "s.status = 'delivered' AND p.shop_id = $1";
    const deliveredParams = me ? [me, shop.id] : [shop.id];
    const delivered = (
      await q(
        `SELECT s.*, p.name AS product_name, p.commission_percent, p.shop_id, p.contact AS shop_contact,
              u.name AS seller_name, u.phone AS seller_phone, u.seller_code,
              shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE ${deliveredFilter}
       ORDER BY s.delivered_at DESC`,
        deliveredParams
      )
    ).map(saleRow);
        // Statistiques des frais de livraison du livreur — le livreur ne gagne que
    // la delivery_fee, encaissée directement en espèces / mobile.
    let stats = null;
    let series = [];
    if (me) {
      const srow = (
        await q(
          `SELECT
             COUNT(*) AS total_deliveries,
             COALESCE(SUM(s.delivery_fee), 0) AS delivery_earned
           FROM sales s
           JOIN products p ON p.id = s.product_id
           WHERE ${deliveredFilter}`,
          deliveredParams
        )
      )[0];
      stats = {
        total_deliveries: Number(srow.total_deliveries),
        delivery_earned: Number(srow.delivery_earned),
      };
      series = (
        await q(
          `SELECT to_char(date_trunc('day', s.delivered_at), 'YYYY-MM-DD') AS day,
                  COUNT(*) AS cnt,
                  COALESCE(SUM(s.delivery_fee), 0) AS rev
           FROM sales s
           JOIN products p ON p.id = s.product_id
           WHERE ${deliveredFilter} AND s.delivered_at >= now() - interval '13 days'
           GROUP BY 1 ORDER BY 1`,
          deliveredParams
        )
      ).map((r) => ({ day: r.day, cnt: Number(r.cnt), rev: Number(r.rev) }));
    }
    res.json({
      pending,
      delivered,
      shop_name: shop.name,
      shop_country: shop.country,
      authenticated: Boolean(me),
      stats,
      series,
    });
  })
);

router.delete(
  "/:id/delivered",
  authRequired,
  ah(async (req, res) => {
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (sale.status !== "delivered") {
      return res.status(409).json({ error: "Cette vente n'est pas une livraison effectuée" });
    }
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
    const isShop = product && Number(product.shop_id) === Number(req.user.id);
    const isDeliverer = sale.delivered_by && Number(sale.delivered_by) === Number(req.user.id);
    if (!isShop && !isDeliverer) {
      return res.status(403).json({ error: "Vous ne pouvez supprimer que vos propres livraisons" });
    }
    if (isShop) {
      const unpaidCommission =
        (sale.seller_id && Number(sale.commission || 0) > 0 && !sale.paid) ||
        (sale.referred_by && Number(sale.referral_commission || 0) > 0 && !sale.referral_paid);
      if (unpaidCommission) {
        return res.status(409).json({
          error:
            "Impossible de retirer cette vente : la commission n'a pas encore été payée au vendeur ou au parrain.",
        });
      }
    }
    await q(
      "UPDATE sales SET hidden_for = array_append(array_remove(hidden_for, $1), $1) WHERE id = $2",
      [req.user.id, sale.id]
    );
    res.json({ ok: true });
  })
);

router.post(
  "/:id/cancel",
  ah(async (req, res) => {
    const typed = req.body && req.body.code ? String(req.body.code).trim().toUpperCase() : "";
    if (!typed) return res.status(400).json({ error: "Code client requis" });
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Commande introuvable" });
    if (
      typed !==
      String(sale.confirm_code || sale.buyer_code || "")
        .trim()
        .toUpperCase()
    ) {
      return res
        .status(403)
        .json({ error: "Code incorrect. Vous ne pouvez annuler que votre propre commande." });
    }
    if (sale.status === "delivered") {
      return res.status(409).json({ error: "Une commande livrée ne peut plus être annulée." });
    }
    if (sale.status === "cancelled") {
      return res.status(409).json({ error: "Cette commande est déjà annulée." });
    }
    if (!["pending", "bought", "confirmed"].includes(sale.status)) {
      return res.status(409).json({ error: "Cette commande ne peut plus être annulée." });
    }
    if (sale.stock_reserved) {
      await q(
        "UPDATE products SET quantity = quantity + $1, reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - $1, 0) WHERE id = $2",
        [sale.quantity, sale.product_id]
      );
    }
    const product = (
      await q("SELECT shop_id, name FROM products WHERE id = $1", [sale.product_id])
    )[0];
    const hiddenIds = [
      ...new Set(
        [
          product.shop_id,
          sale.seller_id,
          sale.referred_by,
          sale.buyer_id,
          sale.delivered_by,
        ].filter(Boolean)
      ),
    ];
    const current = (await q("SELECT hidden_for FROM sales WHERE id = $1", [sale.id]))[0]
      .hidden_for;
    const merged = [...new Set([...(Array.isArray(current) ? current : []), ...hiddenIds])];
    await q(
      "UPDATE sales SET status = $1, stock_reserved = FALSE, hidden_for = $2::int[] WHERE id = $3",
      ["cancelled", merged, sale.id]
    );

    const notifyIds = [
      ...new Set(
        [product.shop_id, sale.seller_id, sale.referred_by, sale.buyer_id].filter(Boolean)
      ),
    ];
    if (notifyIds.length) {
      const values = notifyIds
        .map((uid) => `(${Number(uid)}, 'sale_cancelled_client', ${sale.id})`)
        .join(", ");
      await q(`INSERT INTO notifications (user_id, type, sale_id) VALUES ${values}`);
    }

    const productName = product ? String(product.name) : "article";
    const buyerName = String(sale.buyer_name || "client");
    if (sale.seller_id) {
      await sendPush(sale.seller_id, {
        title: "Commande annulée par le client ❌",
        body: `${productName} — la commande de ${buyerName} a été annulée par le client.`,
        url: "/seller",
      });
    }
    if (sale.referred_by) {
      await sendPush(sale.referred_by, {
        title: "Commande annulée par le client ❌",
        body: `${productName} — la commande de ${buyerName} a été annulée par le client.`,
        url: "/seller",
      });
    }
    await sendPush(product.shop_id, {
      title: "Commande annulée par le client ❌",
      body: `${productName} — la commande de ${buyerName} a été annulée par le client.`,
      url: "/shop",
    });
    if (sale.buyer_id) {
      await sendPush(sale.buyer_id, {
        title: "Commande annulée ✅",
        body: `Votre commande « ${productName} » a bien été annulée.`,
        url: `/suivi/${sale.id}?code=${encodeURIComponent(sale.confirm_code || sale.buyer_code || "")}`,
      });
    }
    res.json({ ok: true });
  })
);

router.get(
  "/:id/proof",
  authRequired,
  ah(async (req, res) => {
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
    const isSeller = sale.seller_id && Number(sale.seller_id) === Number(req.user.id);
    const isShop = product && Number(product.shop_id) === Number(req.user.id);
    const isReferrer = sale.referred_by && Number(sale.referred_by) === Number(req.user.id);
    if (!isSeller && !isShop && !isReferrer) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    if (sale.status !== "delivered") {
      return res
        .status(409)
        .json({ error: "Le produit doit être livré avant de consulter une preuve" });
    }
    res.json({
      proof: isShop || isSeller ? (sale.paid ? sale.payment_proof || null : null) : null,
      referral_proof:
        isShop || isReferrer
          ? sale.referral_paid
            ? sale.referral_payment_proof || null
            : null
          : null,
    });
  })
);

router.post(
  "/:id/deliver",
  authRequired,
  roleRequired("livreur"),
  ah(async (req, res) => {
    const { delivery_fee, payment_method, client_code, shop_code, signature } = req.body || {};
    const shopCode = String(shop_code || "")
      .trim()
      .toUpperCase();
    if (!shopCode) return res.status(400).json({ error: "Code boutique requis" });
    const fee = Number(delivery_fee || 0);
    if (!Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({ error: "Frais de livraison invalides" });
    }
    // Paiement exclusivement manuel : espèce ou mobile (iKeePay supprimé).
    const lowerMethod = String(payment_method || "")
      .trim()
      .toLowerCase();
    if (!["espèce", "espece", "espe", "mobile", "mobile_money"].includes(lowerMethod)) {
      return res
        .status(400)
        .json({ error: "Type de paiement invalide (espèce ou mobile)" });
    }
    const cleanMethod = lowerMethod.startsWith("m") ? "mobile" : "espèce";

    // Signature du client (optionnelle) : PNG data URI capturé sur l'écran
    // du livreur à la livraison, réaffiché sur la facture PDF.
    let cleanSignature = null;
    if (signature != null && signature !== "") {
      if (typeof signature !== "string" || !signature.startsWith("data:image/png;base64,")) {
        return res.status(400).json({ error: "Signature invalide (image PNG attendue)" });
      }
      if (signature.length > 300000) {
        return res.status(400).json({ error: "Signature trop volumineuse" });
      }
      cleanSignature = signature;
    }

    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (!["pending", "confirmed"].includes(sale.status)) {
      return res.status(409).json({ error: "Cette vente n'est plus en attente" });
    }

    if (sale.confirm_code) {
      const typed = String(client_code || "")
        .trim()
        .toUpperCase();
      if (typed !== sale.confirm_code) {
        return res.status(400).json({
          error: "Code de confirmation du client incorrect. Demandez le code à l'acheteur.",
        });
      }
    }

    const result = await withTransaction(async (tx) => {
      const lockedSale = (
        await tx.query("SELECT * FROM sales WHERE id = $1 FOR UPDATE", [sale.id])
      )[0];
      if (!lockedSale || !["pending", "confirmed"].includes(lockedSale.status)) {
        const error = new Error("Cette vente n'est plus en attente");
        error.statusCode = 409;
        throw error;
      }
      const product = (
        await tx.query("SELECT shop_id FROM products WHERE id = $1 FOR SHARE", [
          lockedSale.product_id,
        ])
      )[0];
      if (!product) {
        const error = new Error("Produit introuvable");
        error.statusCode = 404;
        throw error;
      }
      const assignedShop = (
        await tx.query("SELECT id FROM users WHERE id = $1", [product.shop_id])
      )[0];
      if (!assignedShop) {
        const error = new Error("Boutique introuvable");
        error.statusCode = 404;
        throw error;
      }
      // Le livreur doit avoir présenté le code de la boutique ; l'accès est limité à cette boutique.
      const shopByCode = (
        await tx.query("SELECT id FROM users WHERE shop_code = $1", [shopCode])
      )[0];
      if (!shopByCode || Number(shopByCode.id) !== Number(product.shop_id)) {
        const error = new Error("Code boutique non autorisé pour cette commande");
        error.statusCode = 403;
        throw error;
      }
      const updated = (
        await tx.query(
          `UPDATE sales SET status = 'delivered', delivery_fee = $1, payment_method = $2, delivered_at = now(), delivered_by = $3,
        payment_status = CASE WHEN payment_status = 'paid' THEN payment_status ELSE 'pending' END,
        signature = COALESCE($5, signature)
        WHERE id = $4 RETURNING id`,
          [fee, cleanMethod, req.user ? req.user.id : null, lockedSale.id, cleanSignature]
        )
      )[0];
      // Les nouvelles ventes ont déjà réservé leur stock. Pour les anciennes ventes,
      // on décrémente encore la quantité disponible afin de préserver la compatibilité.
      if (lockedSale.stock_reserved) {
        await tx.query(
          "UPDATE products SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - $1, 0) WHERE id = $2",
          [lockedSale.quantity, lockedSale.product_id]
        );
      } else {
        const consumed = (
          await tx.query(
            "UPDATE products SET quantity = GREATEST(quantity - $1, 0) WHERE id = $2 AND quantity >= $1 RETURNING id",
            [lockedSale.quantity, lockedSale.product_id]
          )
        )[0];
        if (!consumed) {
          const error = new Error("Stock insuffisant pour finaliser cette livraison");
          error.statusCode = 409;
          throw error;
        }
      }
      return { id: updated.id, shopId: product.shop_id };
    });

    const updated = [{ id: result.id }];
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];

    const notifyIds = [];
    if (sale.seller_id) notifyIds.push(sale.seller_id);
    notifyIds.push(product.shop_id);
    if (sale.buyer_id) notifyIds.push(sale.buyer_id);
    await q(
      `INSERT INTO notifications (user_id, type, sale_id) VALUES ${notifyIds.map((uid) => `(${Number(uid)}, 'sale_delivered', ${sale.id})`).join(", ")}`
    );

    const deliveredProduct = (
      await q("SELECT name FROM products WHERE id = $1", [sale.product_id])
    )[0];
    const deliveredName = deliveredProduct ? String(deliveredProduct.name) : "article";
    const buyerName = String(sale.buyer_name || "client");
    if (sale.seller_id) {
      await sendPush(sale.seller_id, {
        title: "Vente livrée ✅",
        body: `${deliveredName} livré à ${buyerName}.`,
        url: "/seller",
      });
    }
    await sendPush(product.shop_id, {
      title: "Vente livrée ✅",
      body: `${deliveredName} livré — client : ${buyerName}.`,
      url: "/shop",
    });
    if (sale.buyer_id) {
      await sendPush(sale.buyer_id, {
        title: "Commande livrée 🎉",
        body: `${deliveredName} vous a été livré. Merci d\'avoir commandé sur Mboppi !`,
        url: `/suivi/${sale.id}?code=${encodeURIComponent(sale.confirm_code || sale.buyer_code || "")}`,
      });
    }

    const full = (
      await q(
        `SELECT s.*, p.name AS product_name, p.commission_percent, p.contact AS shop_contact, u.name AS seller_name, u.phone AS seller_phone, u.seller_code,
              shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.id = $1`,
        [updated[0].id]
      )
    )[0];

    // NOTE : l'appel à markSalePaid (reversement automatique iKeePay) a été
    // supprimé. Les commissions sont payées manuellement par la boutique
    // (POST /api/sales/:id/pay avec preuve) et le parrain via /pay-referral.

    res.json({ sale: saleRow(full), ok: true });
  })
);

router.get(
  "/:id/payment-methods",
  authRequired,
  roleRequired("shop"),
  ah(async (req, res) => {
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
    if (product.shop_id !== req.user.id) {
      return res.status(403).json({ error: "Cette vente ne concerne pas votre boutique" });
    }
    const m = (
      await q(
        "SELECT full_name, wallets, updated_at FROM seller_payment_methods WHERE seller_id = $1",
        [sale.seller_id]
      )
    )[0];
    if (req.query.target === "referral") {
      if (!sale.referred_by) {
        return res.status(409).json({ error: "Cette vente n'a pas de parrain à payer" });
      }
      const r = (
        await q(
          "SELECT full_name, wallets, updated_at FROM seller_payment_methods WHERE seller_id = $1",
          [sale.referred_by]
        )
      )[0];
      return res.json({
        methods: r
          ? { full_name: r.full_name, wallets: Array.isArray(r.wallets) ? r.wallets : [] }
          : null,
      });
    }
    res.json({
      methods: m
        ? { full_name: m.full_name, wallets: Array.isArray(m.wallets) ? m.wallets : [] }
        : null,
    });
  })
);

router.post(
  "/:id/pay",
  authRequired,
  roleRequired("shop"),
  ah(async (req, res) => {
    const { proof } = req.body || {};
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
    if (sale.seller_id && product.shop_id !== req.user.id) {
      return res.status(403).json({ error: "Cette vente ne concerne pas votre boutique" });
    }
    if (!sale.seller_id) {
      return res.status(409).json({ error: "Cette commande en direct n'a pas de vendeur à payer" });
    }
    if (sale.status !== "delivered") {
      return res
        .status(409)
        .json({ error: "Le produit doit être livré avant de payer le vendeur" });
    }
    if (sale.paid) {
      return res.status(409).json({ error: "Le vendeur a déjà été payé pour cette vente" });
    }
    if (!proof || !String(proof).startsWith("data:")) {
      return res
        .status(400)
        .json({ error: "Joignez une photo ou une vidéo de preuve du paiement" });
    }
    const updated = await withTransaction(async (tx) => {
      const changed = await tx.query(
        `UPDATE sales SET paid = TRUE, paid_at = now(), payment_proof = $1, commission_claimed_at = NULL
       WHERE id = $2 AND paid = FALSE RETURNING id, commission`,
        [String(proof).slice(0, 12000000), sale.id]
      );
      if (!changed.length) {
        const error = new Error("Le vendeur a déjà été payé pour cette vente");
        error.statusCode = 409;
        throw error;
      }
      await tx.query(
        `INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = now()`,
        [sale.seller_id]
      );
      await tx.query(
        `INSERT INTO wallet_transactions (user_id, amount, transaction_type, reference_type, reference_id, description)
       VALUES ($1, $2, 'commission_credit', 'sale', $3, $4)
       ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
        [
          sale.seller_id,
          Number(changed[0].commission),
          sale.id,
          "Commission de vente payée par la boutique",
        ]
      );
      return changed;
    });
    await q(`INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'sale_paid', $2)`, [
      sale.seller_id,
      sale.id,
    ]);

    const paidProduct = (await q("SELECT name FROM products WHERE id = $1", [sale.product_id]))[0];
    const paidTotal = Number(sale.commission || 0);
    await sendPush(sale.seller_id, {
      title: "Commission payée 💰",
      body: `${paidProduct ? paidProduct.name : "Votre vente"} — vos commissions (${paidTotal} F) ont été versées par la boutique.`,
      url: "/seller",
    });
    const full = (
      await q(
        `SELECT s.*, p.name AS product_name, p.commission_percent, p.contact AS shop_contact, u.name AS seller_name, u.phone AS seller_phone, u.seller_code,
              shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.id = $1`,
        [updated[0].id]
      )
    )[0];
    res.json({ sale: saleRow(full), ok: true });
  })
);

router.post(
  "/:id/claim",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (Number(sale.seller_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Cette vente ne vous appartient pas" });
    }
    if (sale.status !== "delivered") {
      return res
        .status(409)
        .json({ error: "Le produit doit être livré avant de réclamer le paiement" });
    }
    if (sale.paid) {
      return res.status(409).json({ error: "Cette commission a déjà été payée" });
    }
    if (sale.commission_claimed_at) {
      return res.status(409).json({ error: "Paiement déjà réclamé, la boutique a été notifiée" });
    }
    await q("UPDATE sales SET commission_claimed_at = now() WHERE id = $1", [sale.id]);
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
    await q(
      `INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'commission_claimed', $2)`,
      [product.shop_id, sale.id]
    );
    const info = (await q("SELECT name FROM products WHERE id = $1", [sale.product_id]))[0];
    const total = Number(sale.commission || 0) + Number(sale.referral_commission || 0);
    await sendPush(product.shop_id, {
      title: "Commission réclamée 💰",
      body: `${info ? info.name : "Vente"} — le vendeur réclame ${total} F de commissions.`,
      url: "/shop",
    });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/claim-referral",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (!sale.referred_by || Number(sale.referred_by) !== Number(req.user.id)) {
      return res
        .status(403)
        .json({ error: "Cette commission de parrainage ne vous appartient pas" });
    }
    if (sale.status !== "delivered") {
      return res
        .status(409)
        .json({ error: "Le produit doit être livré avant de réclamer le paiement" });
    }
    if (sale.referral_paid) {
      return res.status(409).json({ error: "Cette commission a déjà été payée" });
    }
    if (sale.referral_claimed_at) {
      return res.status(409).json({ error: "Paiement déjà réclamé, la boutique a été notifiée" });
    }
    await q("UPDATE sales SET referral_claimed_at = now() WHERE id = $1", [sale.id]);
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
    await q(
      `INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'referral_claimed', $2)`,
      [product.shop_id, sale.id]
    );
    const info = (await q("SELECT name FROM products WHERE id = $1", [sale.product_id]))[0];
    await sendPush(product.shop_id, {
      title: "Parrainage réclamé 💰",
      body: `${info ? info.name : "Vente"} — le parrain ${req.user.name} réclame ${Number(sale.referral_commission || 0)} F de commission.`,
      url: "/shop",
    });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/pay-referral",
  authRequired,
  roleRequired("shop"),
  ah(async (req, res) => {
    const { proof } = req.body || {};
    const sale = (await q("SELECT * FROM sales WHERE id = $1", [Number(req.params.id)]))[0];
    if (!sale) return res.status(404).json({ error: "Vente introuvable" });
    if (!sale.referred_by) {
      return res.status(409).json({ error: "Cette vente n'a pas de parrain à payer" });
    }
    const product = (await q("SELECT shop_id FROM products WHERE id = $1", [sale.product_id]))[0];
    if (product.shop_id !== req.user.id) {
      return res.status(403).json({ error: "Cette vente ne concerne pas votre boutique" });
    }
    if (sale.status !== "delivered") {
      return res
        .status(409)
        .json({ error: "Le produit doit être livré avant de payer le parrain" });
    }
    if (sale.referral_paid) {
      return res.status(409).json({ error: "Le parrain a déjà été payé pour cette vente" });
    }
    if (!proof || !String(proof).startsWith("data:")) {
      return res
        .status(400)
        .json({ error: "Joignez une photo ou une vidéo de preuve du paiement" });
    }
    await withTransaction(async (tx) => {
      const changed = await tx.query(
        `UPDATE sales SET referral_paid = TRUE, referral_paid_at = now(), referral_payment_proof = $1, referral_claimed_at = NULL
       WHERE id = $2 AND referral_paid = FALSE RETURNING id, referral_commission`,
        [String(proof).slice(0, 12000000), sale.id]
      );
      if (!changed.length) {
        const error = new Error("Le parrain a déjà été payé pour cette vente");
        error.statusCode = 409;
        throw error;
      }
      await tx.query(
        `INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = now()`,
        [sale.referred_by]
      );
      await tx.query(
        `INSERT INTO wallet_transactions (user_id, amount, transaction_type, reference_type, reference_id, description)
       VALUES ($1, $2, 'referral_credit', 'sale', $3, $4)
       ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
        [
          sale.referred_by,
          Number(changed[0].referral_commission),
          sale.id,
          "Commission de parrainage payée par la boutique",
        ]
      );
    });
    await q(`INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'referral_paid', $2)`, [
      sale.referred_by,
      sale.id,
    ]);
    const paidProduct = (await q("SELECT name FROM products WHERE id = $1", [sale.product_id]))[0];
    await sendPush(sale.referred_by, {
      title: "Parrainage payé 💰",
      body: `${paidProduct ? paidProduct.name : "Votre filleul"} — votre commission de parrainage (${Number(sale.referral_commission || 0)} F) a été versée par la boutique.`,
      url: "/seller",
    });
    const full = (
      await q(
        `SELECT s.*, p.name AS product_name, p.commission_percent, p.contact AS shop_contact, u.name AS seller_name, u.phone AS seller_phone, u.seller_code,
              shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.id = $1`,
        [sale.id]
      )
    )[0];
    res.json({ sale: saleRow(full), ok: true });
  })
);

router.post(
  "/grouped-claim",
  authRequired,
  roleRequired("seller"),
  ah(async (req, res) => {
    const { kind, shop_id } = req.body || {};
    if (!["sale", "referral"].includes(kind)) {
      return res.status(400).json({ error: "Type invalide" });
    }
    const shopId = Number(shop_id);
    if (!Number.isInteger(shopId)) {
      return res.status(400).json({ error: "Boutique invalide" });
    }
    const isSale = kind === "sale";
    const target = isSale ? "s.seller_id" : "s.referred_by";
    const col = isSale ? "commission_claimed_at" : "referral_claimed_at";
    const sold = isSale ? "NOT s.paid" : "NOT s.referral_paid";
    const amountCol = isSale ? "s.commission" : "s.referral_commission";
    const rows = await q(
      `SELECT s.id, ${amountCol} AS amt
       FROM sales s
       JOIN products p ON p.id = s.product_id
      WHERE ${target} = $1 AND p.shop_id = $2 AND s.status = 'delivered' AND ${sold} AND s.${col} IS NULL
      ORDER BY s.created_at DESC`,
      [req.user.id, shopId]
    );
    if (!rows.length) {
      return res.status(409).json({ error: "Aucune commission à réclamer chez cette boutique" });
    }
    const total = Math.round(rows.reduce((a, r) => a + Number(r.amt || 0), 0) * 100) / 100;
    await q(
      `UPDATE sales s SET ${col} = now()
       FROM products p
      WHERE p.id = s.product_id AND ${target} = $1 AND p.shop_id = $2 AND s.status = 'delivered' AND ${sold} AND s.${col} IS NULL`,
      [req.user.id, shopId]
    );
    const me = (await q("SELECT name FROM users WHERE id = $1", [req.user.id]))[0];
    const type = isSale ? "commission_claimed_group" : "referral_claimed_group";
    await q(`INSERT INTO notifications (user_id, type, sale_id, amount) VALUES ($1, $2, $3, $4)`, [
      shopId,
      type,
      rows[0].id,
      total,
    ]);
    await sendPush(shopId, {
      title: "Commissions réclamées 💰",
      body: `${isSale ? "Le vendeur" : "Le parrain"} ${me ? me.name : "—"} réclame ${total} F de commissions (${rows.length} vente${rows.length > 1 ? "s" : ""}).`,
      url: "/shop",
    });
    res.json({ ok: true, count: rows.length, amount: total });
  })
);

router.post(
  "/grouped-pay",
  authRequired,
  roleRequired("shop"),
  ah(async (req, res) => {
    const { kind, seller_id, proof } = req.body || {};
    if (!["seller", "referral"].includes(kind)) {
      return res.status(400).json({ error: "Type invalide" });
    }
    const sellerId = Number(seller_id);
    if (!Number.isInteger(sellerId)) {
      return res.status(400).json({ error: "Vendeur invalide" });
    }
    if (!proof || !String(proof).startsWith("data:")) {
      return res
        .status(400)
        .json({ error: "Joignez une photo ou une vidéo de preuve du paiement" });
    }
    const isSeller = kind === "seller";
    const target = isSeller ? "s.seller_id" : "s.referred_by";
    const sold = isSeller ? "NOT s.paid" : "NOT s.referral_paid";
    const amountCol = isSeller ? "s.commission" : "s.referral_commission";
    const rows = await q(
      `SELECT s.id, ${amountCol} AS amt
       FROM sales s
       JOIN products p ON p.id = s.product_id
      WHERE ${target} = $1 AND p.shop_id = $2 AND s.status = 'delivered' AND ${sold}
      ORDER BY s.created_at DESC`,
      [sellerId, req.user.id]
    );
    if (!rows.length) {
      return res.status(409).json({ error: "Aucune commission à payer" });
    }
    const total = Math.round(rows.reduce((a, r) => a + Number(r.amt || 0), 0) * 100) / 100;
    const proofShort = String(proof).slice(0, 12000000);
    await withTransaction(async (tx) => {
      if (isSeller) {
        await tx.query(
          `UPDATE sales s SET paid = TRUE, paid_at = now(), payment_proof = $1, commission_claimed_at = NULL
         FROM products p
        WHERE p.id = s.product_id AND s.seller_id = $2 AND p.shop_id = $3 AND s.status = 'delivered' AND NOT s.paid`,
          [proofShort, sellerId, req.user.id]
        );
      } else {
        await tx.query(
          `UPDATE sales s SET referral_paid = TRUE, referral_paid_at = now(), referral_payment_proof = $1, referral_claimed_at = NULL
         FROM products p
        WHERE p.id = s.product_id AND s.referred_by = $2 AND p.shop_id = $3 AND s.status = 'delivered' AND NOT s.referral_paid`,
          [proofShort, sellerId, req.user.id]
        );
      }
      await tx.query(
        `INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO UPDATE SET updated_at = now()`,
        [sellerId]
      );
      for (const row of rows) {
        await tx.query(
          `INSERT INTO wallet_transactions (user_id, amount, transaction_type, reference_type, reference_id, description)
         VALUES ($1, $2, $3, 'sale', $4, $5) ON CONFLICT (user_id, transaction_type, reference_type, reference_id) DO NOTHING`,
          [
            sellerId,
            Number(row.amt),
            isSeller ? "commission_credit" : "referral_credit",
            Number(row.id),
            isSeller
              ? "Commission groupée payée par la boutique"
              : "Commission de parrainage groupée payée par la boutique",
          ]
        );
      }
    });
    const me = (await q("SELECT name FROM users WHERE id = $1", [req.user.id]))[0];
    const payee = (await q("SELECT name FROM users WHERE id = $1", [sellerId]))[0];
    await q(`INSERT INTO notifications (user_id, type, sale_id, amount) VALUES ($1, $2, $3, $4)`, [
      sellerId,
      isSeller ? "commission_paid_group" : "referral_paid_group",
      rows[0].id,
      total,
    ]);
    await sendPush(sellerId, {
      title: isSeller ? "Commissions payées 💰" : "Parrainage payé 💰",
      body: `${isSeller ? "Vos commissions" : "Votre commission de parrainage"} (${total} F) pour ${rows.length} vente${rows.length > 1 ? "s" : ""} chez ${me ? me.name : "la boutique"} ont été versées.`,
      url: "/seller",
    });
    res.json({ ok: true, count: rows.length, amount: total, payee: payee ? payee.name : null });
  })
);

router.get(
  "/track/:id",
  ah(async (req, res) => {
    const code = req.query.code ? String(req.query.code).trim().toUpperCase() : "";
    if (!code) return res.status(400).json({ error: "Code client requis" });
    const sale = (
      await q(
        `SELECT s.id, s.status, s.quantity, s.buyer_name, s.buyer_code, s.confirm_code, s.buyer_city, s.created_at,
              s.delivered_at, s.paid_at, s.shop_confirmed_at,
              p.name AS product_name, p.price, p.shop_id,
              u.name AS seller_name, u.phone AS seller_phone,
              shop.name AS shop_name, shop.country AS shop_country, shop.location AS shop_location, p.contact AS shop_contact
       FROM sales s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.id = $1 AND (s.buyer_code = $2 OR s.confirm_code = $2)`,
        [Number(req.params.id), code]
      )
    )[0];
    if (!sale) return res.status(404).json({ error: "Commande introuvable ou code incorrect" });
    res.json({
      sale: {
        ...sale,
        quantity: Number(sale.quantity),
        price: Number(sale.price),
        total_price: Math.round(Number(sale.price) * Number(sale.quantity) * 100) / 100,
      },
    });
  })
);

router.get(
  "/export",
  authRequired,
  roleRequired("seller", "shop", "creator"),
  ah(async (req, res) => {
    const isSeller = req.user.role === "seller";
    const sales = await q(
      `SELECT s.id, s.created_at, s.status, s.buyer_name, s.buyer_city, s.quantity,
            s.total_price, s.commission, s.purchase_price, s.delivery_fee, s.paid_at, s.delivered_at,
            p.name AS product_name, shop.name AS shop_name, shop.country AS shop_country,
            COALESCE(u.name, '—') AS seller_name
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     LEFT JOIN users u ON u.id = s.seller_id
     WHERE ${isSeller ? "s.seller_id = $1" : "p.shop_id = $1"}
     ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json({ sales });
  })
);

export default router;
