import { Router } from "express";
import { q } from "../db.js";
import { authRequired, roleRequired, signToken } from "../auth.js";
import { logAudit } from "../security.js";
import { migrateImages } from "../migrate-images.js";
import { cleanupOutOfStock, cleanupOldStats, dbUsageReport } from "../cleanup.js";
import { storageUsage } from "../storage.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const isId = (v) => Number.isInteger(v) && v > 0;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

router.post(
  "/pass",
  ah(async (req, res) => {
    if (!ADMIN_PASSWORD) {
      return res.status(503).json({ error: "Accès admin non configuré" });
    }
    const { password } = req.body || {};
    if (!password || password.length > 200) {
      return res.status(400).json({ error: "Mot de passe manquant" });
    }
    if (password !== ADMIN_PASSWORD) {
      logAudit(null, "admin.pass_failed", null, req.ip);
      return res.status(401).json({ error: "Mot de passe incorrect" });
    }
    const admin = { id: 0, email: "admin@mboppi.local", role: "admin", name: "Administrateur" };
    const token = signToken(admin);
    logAudit(null, "admin.pass_ok", "Connexion admin par mot de passe", req.ip);
    res.json({
      token,
      user: { id: admin.id, name: admin.name, role: "admin", email: admin.email },
    });
  })
);

router.use(authRequired, roleRequired("admin"));

router.get(
  "/stats",
  ah(async (req, res) => {
    const [users] = await q(
      "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE role = 'shop') AS shops, COUNT(*) FILTER (WHERE role = 'creator') AS creators, COUNT(*) FILTER (WHERE role = 'seller') AS sellers, COUNT(*) FILTER (WHERE role = 'client') AS clients, COUNT(*) FILTER (WHERE role = 'livreur') AS livreurs FROM users"
    );
    const [products] = await q("SELECT COUNT(*) AS total FROM products");
    const [sales] = await q(
      "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'delivered') AS delivered, COALESCE(SUM(total_price) FILTER (WHERE status = 'delivered'), 0) AS revenue FROM sales"
    );
    const [reviews] = await q(
      "SELECT COUNT(*) AS total, COALESCE(AVG(rating), 0)::numeric(3, 2) AS avg FROM reviews"
    );
    const [today] = await q(
      "SELECT COUNT(*) AS users_today FROM users WHERE created_at >= CURRENT_DATE"
    );
    const [newsletter] = await q("SELECT COUNT(*) AS total FROM newsletter_subscribers");
    res.json({
      stats: {
        users: Number(users.total),
        shops: Number(users.shops),
        creators: Number(users.creators),
        sellers: Number(users.sellers),
        clients: Number(users.clients),
        livreurs: Number(users.livreurs),
        products: Number(products.total),
        sales: Number(sales.total),
        pending_sales: Number(sales.pending),
        delivered_sales: Number(sales.delivered),
        revenue: Number(sales.revenue),
        reviews: Number(reviews.total),
        rating_avg: Number(reviews.avg),
        users_today: Number(today.users_today),
        newsletter_subscribers: Number(newsletter.total),
      },
    });
  })
);

router.get(
  "/visits",
  ah(async (req, res) => {
    const days = [1, 7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const country = String(req.query.country || "")
      .trim()
      .slice(0, 40);
    const countryClause = country ? " AND country = $1" : "";
    const paramsFor = () => (country ? [country] : []);
    const windowQ = `
    SELECT COUNT(*) AS days,
           COUNT(DISTINCT seen_on) AS active_days,
           SUM(total) AS page_views,
           COUNT(DISTINCT visitor_id) AS unique_visitors
      FROM (SELECT seen_on, visitor_id, COUNT(*) AS total
            FROM daily_visits
            WHERE seen_on >= CURRENT_DATE - ${days - 1}${countryClause}
            GROUP BY seen_on, visitor_id) w`;
    const dailyQ = `
    SELECT seen_on,
           COUNT(DISTINCT visitor_id) AS visitors,
           COUNT(*) AS views
    FROM daily_visits
    WHERE seen_on >= CURRENT_DATE - ${days - 1}${countryClause}
    GROUP BY seen_on
    ORDER BY seen_on DESC`;
    const topPagesQ = `
    SELECT path, COUNT(*) AS views, COUNT(DISTINCT visitor_id) AS visitors
    FROM daily_visits
    WHERE seen_on >= CURRENT_DATE - ${days - 1}${countryClause}
    GROUP BY path
    ORDER BY views DESC
    LIMIT 10`;
    const topItemsQ = `
    SELECT item_type, item_id, SUM(count) AS views
    FROM item_views
    WHERE seen_on >= CURRENT_DATE - ${days - 1}${countryClause}
    GROUP BY item_type, item_id
    ORDER BY views DESC
    LIMIT 10`;
    const [window] = await q(windowQ, paramsFor());
    const daily = (await q(dailyQ, paramsFor())).map((r) => ({
      date: r.seen_on,
      visitors: Number(r.visitors),
      views: Number(r.views),
    }));
    const topPages = (await q(topPagesQ, paramsFor())).map((r) => ({
      path: r.path,
      views: Number(r.views),
      visitors: Number(r.visitors),
    }));
    const topItems = (await q(topItemsQ, paramsFor())).map((r) => ({
      type: r.item_type,
      id: Number(r.item_id),
      views: Number(r.views),
    }));
    const countries = (
      await q(
        `SELECT country, COUNT(DISTINCT visitor_id) AS visitor_count, COUNT(*) AS views
     FROM daily_visits
     WHERE seen_on >= CURRENT_DATE - 29
     GROUP BY country
     ORDER BY views DESC`
      )
    ).map((r) => ({
      country: r.country,
      visitor_count: Number(r.visitor_count),
      views: Number(r.views),
    }));
    res.json({
      visits: {
        page_views: Number(window.page_views),
        unique_visitors: Number(window.unique_visitors),
        active_days: Number(window.active_days),
        daily,
        top_pages: topPages,
        top_items: topItems,
        countries,
      },
    });
  })
);

router.post(
  "/visits/reset",
  ah(async (req, res) => {
    await q("DELETE FROM daily_visits");
    await q("DELETE FROM item_views");
    await logAudit(
      req.user.id,
      "admin.visits_reset",
      "Réinitialisation des compteurs de visites",
      req.ip
    );
    res.json({ ok: true });
  })
);

router.get(
  "/backup",
  ah(async (req, res) => {
    const tables = [
      "users",
      "products",
      "sales",
      "offers",
      "orders",
      "notifications",
      "reviews",
      "audit_log",
      "client_logs",
      "admin_messages",
      "admin_message_reads",
      "seller_payment_methods",
      "shop_payment_methods",
      "wallet_accounts",
      "wallet_transactions",
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    res.set("Content-Type", "application/x-ndjson");
    res.set("Content-Disposition", `attachment; filename="mboppi-backup-${stamp}.ndjson"`);
    res.set("Cache-Control", "no-store");
    logAudit(req.user.id, "admin.backup", `Sauvegarde complète (${tables.length} tables)`, req.ip);
    for (const t of tables) {
      const rows = await q(`SELECT * FROM ${t}`);
      res.write(`${JSON.stringify({ table: t, exported_at: new Date().toISOString(), rows })}\n`);
    }
    res.end();
  })
);

router.get(
  "/users",
  ah(async (req, res) => {
    const search = req.query.search ? String(req.query.search).trim().slice(0, 60) : "";
    const users = await q(
      `SELECT id, name, email, role, country, location, phone, verified, seller_code, shop_code, reference_number, membership_fee, membership_paid_at, membership_expires_at, created_at
     FROM users
     WHERE $1 = '' OR name ILIKE $2 OR email ILIKE $2
     ORDER BY created_at DESC LIMIT 100`,
      [search, `%${search}%`]
    );
    res.json({ users });
  })
);

router.patch(
  "/users/:id/verified",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const verified = Boolean(req.body && req.body.verified);
    const updated = await q("UPDATE users SET verified = $1 WHERE id = $2 RETURNING id", [
      verified,
      id,
    ]);
    if (!updated.length) return res.status(404).json({ error: "Utilisateur introuvable" });
    await logAudit(req.user.id, "admin.set_verified", `user=${id} verified=${verified}`, req.ip);
    res.json({ ok: true, verified });
  })
);

router.get(
  "/products",
  ah(async (req, res) => {
    const products = (
      await q(
        `SELECT p.id, p.name, p.price, p.category, p.created_at, p.shop_id,
              u.name AS shop_name, u.verified AS shop_verified
       FROM products p JOIN users u ON u.id = p.shop_id
       ORDER BY p.created_at DESC LIMIT 100`
      )
    ).map((p) => ({ ...p, price: Number(p.price) }));
    res.json({ products });
  })
);

router.delete(
  "/products/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const product = (await q("SELECT id, name, shop_id FROM products WHERE id = $1", [id]))[0];
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    await q("DELETE FROM products WHERE id = $1", [product.id]);
    if (product.shop_id) {
      await q(
        `INSERT INTO notifications (user_id, type, product_name) VALUES ($1, 'product_deleted', $2)`,
        [product.shop_id, product.name]
      );
      const { sendPush } = await import("../push.js");
      await sendPush(product.shop_id, {
        title: "Produit supprimé",
        body: `Votre produit « ${product.name} » a été supprimé : il ne respectait pas les CGU.`,
        url: "/shop",
      });
    }
    await logAudit(
      req.user.id,
      "admin.delete_product",
      `product=${product.id} "${product.name}"`,
      req.ip
    );
    res.json({ ok: true });
  })
);

router.delete(
  "/sales/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const sale = (await q("SELECT id FROM sales WHERE id = $1", [id]))[0];
    if (!sale) return res.status(404).json({ error: "Transaction introuvable" });
    await q(
      "INSERT INTO admin_hidden_sales (sale_id, hidden_by) VALUES ($1, $2) ON CONFLICT (sale_id) DO NOTHING",
      [id, req.user.id]
    );
    await logAudit(
      req.user.id,
      "admin.hide_sale",
      `sale=${id} masquee de la vue admin (utilisateurs non affectes)`,
      req.ip
    );
    res.json({ ok: true });
  })
);

router.post(
  "/sales/:id/restore",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    await q("DELETE FROM admin_hidden_sales WHERE sale_id = $1", [id]);
    await logAudit(
      req.user.id,
      "admin.restore_sale",
      `sale=${id} restauree dans la vue admin`,
      req.ip
    );
    res.json({ ok: true });
  })
);

const SALE_STATUSES = ["pending", "bought", "confirmed", "delivered", "cancelled"];

router.delete(
  "/statuses/:status",
  ah(async (req, res) => {
    const status = String(req.params.status || "");
    if (!SALE_STATUSES.includes(status)) return res.status(400).json({ error: "Statut invalide" });
    await q(
      "INSERT INTO admin_hidden_statuses (status, hidden_by) VALUES ($1, $2) ON CONFLICT (status) DO NOTHING",
      [status, req.user.id]
    );
    await logAudit(
      req.user.id,
      "admin.hide_status",
      `status=${status} masque de la vue admin`,
      req.ip
    );
    res.json({ ok: true });
  })
);

router.post(
  "/statuses/:status/restore",
  ah(async (req, res) => {
    const status = String(req.params.status || "");
    if (!SALE_STATUSES.includes(status)) return res.status(400).json({ error: "Statut invalide" });
    await q("DELETE FROM admin_hidden_statuses WHERE status = $1", [status]);
    await logAudit(
      req.user.id,
      "admin.restore_status",
      `status=${status} restauree dans la vue admin`,
      req.ip
    );
    res.json({ ok: true });
  })
);

router.delete(
  "/shops/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const shop = (await q("SELECT id FROM users WHERE id = $1", [id]))[0];
    if (!shop) return res.status(404).json({ error: "Boutique introuvable" });
    await q(
      "INSERT INTO admin_hidden_shops (shop_id, hidden_by) VALUES ($1, $2) ON CONFLICT (shop_id) DO NOTHING",
      [id, req.user.id]
    );
    await logAudit(req.user.id, "admin.hide_shop", `shop=${id} masquee de la vue admin`, req.ip);
    res.json({ ok: true });
  })
);

router.post(
  "/shops/:id/restore",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    await q("DELETE FROM admin_hidden_shops WHERE shop_id = $1", [id]);
    await logAudit(
      req.user.id,
      "admin.restore_shop",
      `shop=${id} restauree dans la vue admin`,
      req.ip
    );
    res.json({ ok: true });
  })
);

router.delete(
  "/sellers/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const seller = id === 0 ? true : (await q("SELECT id FROM users WHERE id = $1", [id]))[0];
    if (!seller) return res.status(404).json({ error: "Vendeur introuvable" });
    await q(
      "INSERT INTO admin_hidden_sellers (seller_id, hidden_by) VALUES ($1, $2) ON CONFLICT (seller_id) DO NOTHING",
      [id, req.user.id]
    );
    await logAudit(req.user.id, "admin.hide_seller", `seller=${id} masque de la vue admin`, req.ip);
    res.json({ ok: true });
  })
);

router.post(
  "/sellers/:id/restore",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    await q("DELETE FROM admin_hidden_sellers WHERE seller_id = $1", [id]);
    await logAudit(
      req.user.id,
      "admin.restore_seller",
      `seller=${id} restaure dans la vue admin`,
      req.ip
    );
    res.json({ ok: true });
  })
);

router.get(
  "/transactions",
  ah(async (req, res) => {
    const rows = await q(
      `SELECT s.id, s.status, s.created_at, s.quantity, s.total_price, s.commission,
            s.referral_commission, s.paid, s.referral_paid, s.delivered_at, s.payment_method,
            s.buyer_name, s.buyer_city,
            p.name AS product_name, p.shop_id,
            shop.name AS shop_name, shop.country AS shop_country,
            COALESCE(u.name, '—') AS seller_name, u.seller_code,
            COALESCE(parrain.name, '—') AS parrain_name,
            EXISTS (SELECT 1 FROM admin_hidden_sales h WHERE h.sale_id = s.id) AS hidden
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     LEFT JOIN users u ON u.id = s.seller_id
     LEFT JOIN users parrain ON parrain.id = s.referred_by
     ORDER BY s.created_at DESC
     LIMIT 300`
    );
    const [hiddenCount] = await q("SELECT COUNT(*) AS cnt FROM admin_hidden_sales");
    const byStatus = await q(
      `SELECT s.status, COUNT(*) AS cnt, COALESCE(SUM(s.total_price), 0) AS total,
            EXISTS (SELECT 1 FROM admin_hidden_statuses hs WHERE hs.status = s.status) AS hidden
     FROM sales s GROUP BY s.status ORDER BY cnt DESC`
    );
    const byShop = await q(
      `SELECT shop.id AS shop_id, shop.name AS shop_name, shop.country AS shop_country, COUNT(*) AS cnt,
            COALESCE(SUM(s.total_price), 0) AS revenue,
            COALESCE(SUM(s.commission), 0) + COALESCE(SUM(s.referral_commission), 0) AS commission,
            EXISTS (SELECT 1 FROM admin_hidden_shops hs WHERE hs.shop_id = shop.id) AS hidden
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     GROUP BY shop.id, shop.name, shop.country
     ORDER BY revenue DESC LIMIT 20`
    );
    const bySeller = await q(
      `SELECT COALESCE(u.id, 0) AS seller_id, COALESCE(u.name, '—') AS seller_name, u.seller_code, COUNT(*) AS cnt,
            COALESCE(SUM(s.commission), 0) AS commission,
            COALESCE(SUM(CASE WHEN s.paid THEN s.commission ELSE 0 END), 0) AS paid,
            EXISTS (SELECT 1 FROM admin_hidden_sellers hs WHERE hs.seller_id = COALESCE(u.id, 0)) AS hidden
     FROM sales s
     LEFT JOIN users u ON u.id = s.seller_id
     GROUP BY u.id, u.name, u.seller_code
     ORDER BY commission DESC LIMIT 20`
    );
    const [direct] = await q(
      "SELECT COUNT(*) AS cnt, COALESCE(SUM(total_price), 0) AS total FROM sales WHERE seller_id IS NULL"
    );
    const [withSeller] = await q(
      "SELECT COUNT(*) AS cnt, COALESCE(SUM(total_price), 0) AS total FROM sales WHERE seller_id IS NOT NULL"
    );
    res.json({
      rows: rows.map((r) => ({
        ...r,
        hidden: Boolean(r.hidden),
        total_price: Number(r.total_price),
        commission: Number(r.commission),
        referral_commission: Number(r.referral_commission),
      })),
      by_status: byStatus.map((r) => ({
        status: r.status,
        count: Number(r.cnt),
        total: Number(r.total),
        hidden: Boolean(r.hidden),
      })),
      by_shop: byShop.map((r) => ({
        shop_id: Number(r.shop_id),
        shop_name: r.shop_name,
        country: r.shop_country,
        count: Number(r.cnt),
        revenue: Number(r.revenue),
        commission: Number(r.commission),
        hidden: Boolean(r.hidden),
      })),
      by_seller: bySeller.map((r) => ({
        seller_id: Number(r.seller_id),
        seller_name: r.seller_name,
        seller_code: r.seller_code,
        count: Number(r.cnt),
        commission: Number(r.commission),
        paid: Number(r.paid),
        hidden: Boolean(r.hidden),
      })),
      direct: { count: Number(direct.cnt), total: Number(direct.total) },
      with_seller: { count: Number(withSeller.cnt), total: Number(withSeller.total) },
      hidden_count: Number(hiddenCount.cnt),
    });
  })
);

router.get(
  "/activity",
  ah(async (req, res) => {
    const rows = await q(
      `SELECT s.id, s.status, s.total_price, s.created_at,
            p.name AS product_name, shop.name AS shop_name, u.name AS seller_name
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     JOIN users u ON u.id = s.seller_id
     ORDER BY s.created_at DESC LIMIT 50`
    );
    res.json({
      rows: rows.map((r) => ({ ...r, total_price: Number(r.total_price) })),
    });
  })
);

const MSG_TARGETS = ["all", "user", "shop", "seller", "client"];

router.post(
  "/messages",
  ah(async (req, res) => {
    const { message, target, userId } = req.body || {};
    const text = String(message || "")
      .trim()
      .slice(0, 2000);
    if (!text) return res.status(400).json({ error: "Message vide" });
    const kind = MSG_TARGETS.includes(target) ? target : "all";
    let uid = null;
    if (kind === "user") {
      uid = Number(userId);
      if (!isId(uid)) return res.status(400).json({ error: "Utilisateur invalide" });
      const user = (await q("SELECT id FROM users WHERE id = $1", [uid]))[0];
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    }
    const created = await q(
      `INSERT INTO admin_messages (message, target, user_id)
     VALUES ($1, $2, $3) RETURNING id`,
      [text, kind, uid]
    );
    await logAudit(req.user.id, "admin.send_message", `target=${kind} user=${uid}`, req.ip);
    res.json({ ok: true, id: created[0].id });
  })
);

router.get(
  "/messages",
  ah(async (req, res) => {
    const rows = await q(
      `SELECT m.id, m.message, m.target, m.user_id, u.name AS user_name, m.created_at
      FROM admin_messages m
      LEFT JOIN users u ON u.id = m.user_id
      ORDER BY m.id DESC LIMIT 50`
    );
    res.json({ messages: rows });
  })
);

router.delete(
  "/messages/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Message invalide" });
    const deleted = await q("DELETE FROM admin_messages WHERE id = $1 RETURNING id", [id]);
    if (!deleted.length) return res.status(404).json({ error: "Message introuvable" });
    await logAudit(req.user.id, "admin.delete_message", `message=${id}`, req.ip);
    res.json({ ok: true });
  })
);

router.post(
  "/messages/:id/resend",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Message invalide" });
    const msg = (await q("SELECT id FROM admin_messages WHERE id = $1", [id]))[0];
    if (!msg) return res.status(404).json({ error: "Message introuvable" });
    await q("DELETE FROM admin_message_reads WHERE message_id = $1", [id]);
    await logAudit(req.user.id, "admin.resend_message", `message=${id}`, req.ip);
    res.json({ ok: true });
  })
);

router.post(
  "/migrate-images",
  ah(async (req, res) => {
    const summary = await migrateImages();
    await logAudit(req.user.id, "admin.migrate_images", JSON.stringify(summary), req.ip);
    res.json({ ok: true, ...summary });
  })
);

router.post(
  "/cleanup-stockout",
  ah(async (req, res) => {
    const dryRun = req.query.dry_run === "1" || req.body?.dry_run === true;
    const summary = await cleanupOutOfStock({ dryRun });
    const stats = dryRun ? [] : await cleanupOldStats();
    await logAudit(req.user.id, "admin.cleanup_stockout", JSON.stringify(summary), req.ip);
    res.json({ ok: true, ...summary, purge_statistiques: stats });
  })
);

router.get(
  "/usage",
  ah(async (req, res) => {
    const [base, storage] = await Promise.allSettled([dbUsageReport(), storageUsage()]);
    await logAudit(req.user.id, "admin.usage", "Rapport d’usage consulté", req.ip);
    res.json({
      ok: true,
      date: new Date().toISOString(),
      base: base.status === "fulfilled" ? base.value : { erreur: base.reason?.message },
      storage: storage.status === "fulfilled" ? storage.value : { erreur: storage.reason?.message },
    });
  })
);

export default router;
