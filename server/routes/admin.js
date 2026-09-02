import { Router } from "express";
import { q, ensureColumn, withTransaction } from "../db.js";
import { authRequired, roleRequired, signToken } from "../auth.js";
import { logAudit } from "../security.js";
import { migrateImages } from "../migrate-images.js";
import { cleanupOutOfStock, cleanupOldStats, dbUsageReport } from "../cleanup.js";
import { storageUsage } from "../storage.js";
import { notifyActivationReferralPaid } from "../services/activationReferral.js";
import {
  getPaymentMode,
  setPaymentMode,
  setSetting,
  getIkeepayKeys,
  isIkeepayConfigured,
  getPublicPaymentSettings,
  purgePendingPayments,
} from "../services/ikeepay.js";

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
    await ensureColumn("users", "admin_approved", "BOOLEAN NOT NULL DEFAULT FALSE");
    const search = req.query.search ? String(req.query.search).trim().slice(0, 60) : "";
    const users = await q(
      `SELECT id, name, email, role, country, location, phone, verified, admin_approved, seller_code, shop_code, reference_number, membership_fee, membership_paid_at, membership_expires_at, created_at
     FROM users
     WHERE $1 = '' OR name ILIKE $2 OR email ILIKE $2
        OR reference_number ILIKE $2 OR seller_code ILIKE $2 OR shop_code ILIKE $2
     ORDER BY created_at DESC LIMIT 100`,
      [search, `%${search}%`]
    );
    res.json({ users });
  })
);

router.patch(
  "/users/:id/verify",
  ah(async (req, res) => {
    await ensureColumn("users", "verified", "BOOLEAN NOT NULL DEFAULT FALSE");
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

router.patch(
  "/users/:id/admin-approved",
  ah(async (req, res) => {
    await ensureColumn("users", "admin_approved", "BOOLEAN NOT NULL DEFAULT FALSE");
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const admin_approved = Boolean(req.body && req.body.admin_approved);
    const before = (
      await q(
        "SELECT id, name, role, referred_by, membership_paid_at FROM users WHERE id = $1",
        [id]
      )
    )[0];
    if (!before) return res.status(404).json({ error: "Utilisateur introuvable" });
    const updated = await q(
      `UPDATE users
       SET admin_approved = $1,
           membership_paid_at = CASE
             WHEN $1 THEN COALESCE(membership_paid_at, now())
             ELSE membership_paid_at
           END,
           membership_expires_at = CASE
             WHEN $1 THEN now() + interval '30 days'
             ELSE membership_expires_at
           END
       WHERE id = $2
       RETURNING id, membership_expires_at`,
      [admin_approved, id]
    );
    // Approbation d'un parrainé dont l'adhésion n'était pas encore payée →
    // la balance d'activation du parrain augmente de 1 000 F → le prévenir.
    if (admin_approved && !before.membership_paid_at && before.referred_by) {
      try {
        await notifyActivationReferralPaid(before);
      } catch (err) {
        console.error("[admin] notification commission d'activation impossible :", err.message);
      }
    }
    await logAudit(
      req.user.id,
      "admin.set_admin_approved",
      `user=${id} admin_approved=${admin_approved} membership_expires_at=${updated[0].membership_expires_at || "null"}`,
      req.ip
    );
    res.json({ ok: true, admin_approved, membership_expires_at: updated[0].membership_expires_at });
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

router.get(
  "/transactions",
  ah(async (req, res) => {
    const rows = await q(
      `SELECT s.id, s.status, s.created_at, s.quantity, s.total_price, s.commission,
            s.referral_commission, s.paid, s.referral_paid, s.delivered_at, s.payment_method,
            s.payment_status, s.online_payment,
            s.buyer_name, s.buyer_city,
            p.name AS product_name, p.shop_id,
            shop.name AS shop_name, shop.country AS shop_country,
            COALESCE(u.name, '—') AS seller_name, u.seller_code,
            COALESCE(parrain.name, '—') AS parrain_name
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     LEFT JOIN users u ON u.id = s.seller_id
     LEFT JOIN users parrain ON parrain.id = s.referred_by
     ORDER BY s.created_at DESC
     LIMIT 300`
    );
    const byStatus = await q(
      `SELECT s.status, COUNT(*) AS cnt, COALESCE(SUM(s.total_price), 0) AS total
     FROM sales s GROUP BY s.status ORDER BY cnt DESC`
    );
    const byShop = await q(
      `SELECT shop.id AS shop_id, shop.name AS shop_name, shop.country AS shop_country, COUNT(*) AS cnt,
            COALESCE(SUM(s.total_price), 0) AS revenue,
            COALESCE(SUM(s.commission), 0) + COALESCE(SUM(s.referral_commission), 0) AS commission
     FROM sales s
     JOIN products p ON p.id = s.product_id
     JOIN users shop ON shop.id = p.shop_id
     GROUP BY shop.id, shop.name, shop.country
     ORDER BY revenue DESC LIMIT 20`
    );
    const bySeller = await q(
      `SELECT COALESCE(u.id, 0) AS seller_id, COALESCE(u.name, '—') AS seller_name, u.seller_code, COUNT(*) AS cnt,
            COALESCE(SUM(s.commission), 0) AS commission,
            COALESCE(SUM(CASE WHEN s.paid THEN s.commission ELSE 0 END), 0) AS paid
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
        total_price: Number(r.total_price),
        commission: Number(r.commission),
        referral_commission: Number(r.referral_commission),
      })),
      by_status: byStatus.map((r) => ({
        status: r.status,
        count: Number(r.cnt),
        total: Number(r.total),
      })),
      by_shop: byShop.map((r) => ({
        shop_id: Number(r.shop_id),
        shop_name: r.shop_name,
        country: r.shop_country,
        count: Number(r.cnt),
        revenue: Number(r.revenue),
        commission: Number(r.commission),
      })),
      by_seller: bySeller.map((r) => ({
        seller_id: Number(r.seller_id),
        seller_name: r.seller_name,
        seller_code: r.seller_code,
        count: Number(r.cnt),
        commission: Number(r.commission),
        paid: Number(r.paid),
      })),
      direct: { count: Number(direct.cnt), total: Number(direct.total) },
      with_seller: { count: Number(withSeller.cnt), total: Number(withSeller.total) },
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

const MSG_TARGETS = ["all", "user", "shop", "seller", "client", "creator"];

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

// NB : les boutons « Supprimer » de l'admin ne doivent pas affecter les
// utilisateurs — seule la suppression des produits publiés est autorisée.
// La suppression de comptes est donc désactivée (aucun compte n'est effacé).
router.delete(
  "/users/:id",
  ah(async (req, res) => {
    await logAudit(req.user.id, "admin.delete_user_refused", `user=${req.params.id}`, req.ip);
    return res.status(403).json({
      error:
        "La suppression des comptes utilisateurs est désactivée. Utilisez « Fermer » pour couper l'accès.",
    });
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

// Commission d'activation (1 000 F) : prévient le parrain (notification +
// push) quand l'adhésion d'un parrainé vient d'être marquée payée, c'est-à-dire
// exactement au moment où sa balance d'activation augmente de 1 000 F.
// Implémentation partagée avec le webhook iKeePay (voir
// services/activationReferral.js) — la fonction notifyActivationReferralPaid
// est importée en tête de fichier.

// Parrainages d'activation : vendeurs inscrits via le code d'un vendeur
// (`ref_seller` → `referred_by`, rôle forcé à `seller`). L'admin voit chaque
// parrainé, son parrain, les numéros des deux, et si le parrainé a payé son
// adhésion (payé / non payé). Recherche par numéro de référence (du parrainé
// OU du parrain).
router.get(
  "/referrals",
  ah(async (req, res) => {
    const rawSearch = String(req.query.search || "").trim();
    const search = rawSearch ? rawSearch.toUpperCase() : "";
    const rows = await q(
      `SELECT
        p.id AS parraine_id,
        p.name AS parraine_name,
        p.email AS parraine_email,
        p.phone AS parraine_phone,
        p.reference_number AS parraine_ref,
        p.role AS parraine_role,
        p.created_at AS parraine_created_at,
        p.membership_paid_at AS parraine_membership_paid,
        p.membership_expires_at AS parraine_membership_expires,
        par.id AS parrain_id,
        par.name AS parrain_name,
        par.email AS parrain_email,
        par.phone AS parrain_phone,
        par.reference_number AS parrain_ref
       FROM users p
       JOIN users par ON par.id = p.referred_by
       WHERE p.referred_by IS NOT NULL
         AND p.role IN ('seller', 'creator')
         AND ($1 = '' OR UPPER(p.reference_number) = $1 OR UPPER(par.reference_number) = $1)
       ORDER BY p.created_at DESC
       LIMIT 300`,
      [search]
    );
    await logAudit(
      req.user.id,
      "admin.referrals",
      search ? `recherche=${search}` : "liste parrainages",
      req.ip
    );
    res.json({
      referrals: rows.map((r) => ({
        parraine: {
          id: Number(r.parraine_id),
          name: r.parraine_name,
          email: r.parraine_email,
          phone: r.parraine_phone,
          reference_number: r.parraine_ref,
          role: r.parraine_role,
          created_at: r.parraine_created_at,
          membership_paid: !!r.parraine_membership_paid,
          membership_paid_at: r.parraine_membership_paid,
          membership_expires_at: r.parraine_membership_expires,
        },
        parrain: {
          id: Number(r.parrain_id),
          name: r.parrain_name,
          email: r.parrain_email,
          phone: r.parrain_phone,
          reference_number: r.parrain_ref,
        },
      })),
    });
  })
);

// Marque l'adhésion d'un parrainé comme payée, active son compte et informe
// son parrain. La commission d'activation (1 000 F) reste versée manuellement
// par l'administration à son initiative.
router.post(
  "/referrals/:id/pay",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const user = (
      await q(
        "SELECT id, name, role, referred_by, membership_paid_at FROM users WHERE id = $1",
        [id]
      )
    )[0];
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (!user.referred_by) {
      return res
        .status(400)
        .json({ error: "Cet utilisateur n'a pas de parrain (parrainage introuvable)" });
    }
    if (user.referred_by === user.id) {
      return res.status(400).json({ error: "Parrain invalide" });
    }
    // Adhésion payée → le parrainé est également activé (accès accordé) :
    // admin_approved + 30 jours d'adhésion.
    const updated = await q(
      `UPDATE users
       SET membership_paid_at = COALESCE(membership_paid_at, now()),
           admin_approved = TRUE,
           membership_expires_at = now() + interval '30 days'
       WHERE id = $1
       RETURNING membership_paid_at, membership_expires_at`,
      [id]
    );
    // Notification au parrain uniquement si la balance augmente (adhésion pas
    // encore marquée payée) — pas de doublon en cas de re-clic.
    if (!user.membership_paid_at) {
      try {
        await notifyActivationReferralPaid(user);
      } catch (err) {
        console.error("[admin] notification commission d'activation impossible :", err.message);
      }
    }
    await logAudit(
      req.user.id,
      "admin.referral_paid",
      `parrainé=${id} (${user.name}) parrain=${user.referred_by} adhésion marquée payée, compte activé`,
      req.ip
    );
    res.json({
      ok: true,
      membership_paid_at: updated[0].membership_paid_at,
      membership_expires_at: updated[0].membership_expires_at,
    });
  })
);

// Demande de retrait des commissions d'activation : l'admin voit la demande,
// le parrain, les références des parrainés et l'état de leurs adhésions.
router.get(
  "/activation-withdrawals",
  ah(async (req, res) => {
    const rows = await q(
      `SELECT w.id, w.amount, w.status, w.comment, w.email, w.created_at, w.paid_at,
              u.id AS seller_id, u.name AS seller_name,
              u.reference_number AS seller_ref, u.phone AS seller_phone
         FROM activation_withdrawals w
         JOIN users u ON u.id = w.seller_id
         ORDER BY w.created_at DESC
         LIMIT 300`
    );
    const withdrawals = [];
    for (const w of rows) {
      const items = await q(
        `SELECT u.id AS member_id, u.name AS member_name, u.role AS member_role,
                u.reference_number AS member_ref, u.membership_paid_at
           FROM activation_withdrawal_items wi
           JOIN users u ON u.id = wi.member_id
           WHERE wi.withdrawal_id = $1
           ORDER BY wi.id`,
        [w.id]
      );
      // Moyens de paiement configurés par le parrain (transfert direct).
      const pm = (
        await q(
          `SELECT full_name, wallets FROM seller_payment_methods WHERE seller_id = $1`,
          [w.seller_id]
        )
      )[0];
      withdrawals.push({
        id: Number(w.id),
        amount: Number(w.amount),
        status: w.status,
        comment: w.comment,
        email: w.email,
        created_at: w.created_at,
        paid_at: w.paid_at,
        seller: {
          id: Number(w.seller_id),
          name: w.seller_name,
          reference_number: w.seller_ref,
          phone: w.seller_phone,
          paymentMethods: pm
            ? {
                full_name: pm.full_name,
                wallets: Array.isArray(pm.wallets) ? pm.wallets : [],
              }
            : null,
        },
        items: items.map((i) => ({
          member_id: Number(i.member_id),
          name: i.member_name,
          role: i.member_role,
          reference_number: i.member_ref,
          membership_paid_at: i.membership_paid_at,
          membership_paid: !!i.membership_paid_at,
        })),
      });
    }
    res.json({ withdrawals });
  })
);

// Payer une demande de retrait : crédit annulé (montant retiré du solde via
// wallet_transactions), notification + push + email au vendeur parrain.
router.post(
  "/activation-withdrawals/:id/pay",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return res.status(400).json({ error: "Identifiant invalide" });
    const w = (
      await q(
        `SELECT w.*, u.name AS seller_name, u.email AS seller_email, u.phone AS seller_phone
           FROM activation_withdrawals w
           JOIN users u ON u.id = w.seller_id
           WHERE w.id = $1`,
        [id]
      )
    )[0];
    if (!w) return res.status(404).json({ error: "Demande introuvable" });
    if (w.status === "paid") {
      return res.status(409).json({ error: "Cette demande a déjà été payée" });
    }
    const amount = Number(w.amount);
    await withTransaction(async (tx) => {
      await tx.query(
        `UPDATE activation_withdrawals SET status = 'paid', paid_at = now(), paid_by = $2
         WHERE id = $1`,
        [id, req.user.id]
      );
      await tx.query(
        `INSERT INTO wallet_transactions
           (user_id, amount, transaction_type, reference_type, reference_id, description)
         VALUES ($1, $2, 'payout_debit', 'activation_withdrawal', $3, $4)`,
        [
          w.seller_id,
          -amount,
          id,
          "Retrait commissions d'activation (adhésions parrainées)",
        ]
      );
    });
    await q(
      `INSERT INTO notifications (user_id, type, amount) VALUES ($1, 'activation_withdrawal_paid', $2)`,
      [w.seller_id, amount]
    );
    try {
      const { sendPush } = await import("../push.js");
      await sendPush(w.seller_id, {
        title: "Retrait payé 💰",
        body: `Votre demande de retrait de ${amount} F a été payée.`,
        url: "/seller",
      });
    } catch (err) {
      console.error("[admin] push activation_withdrawal_paid impossible :", err.message);
    }
    const mailTo = (w.email || w.seller_email || "").trim();
    if (mailTo) {
      try {
        const { sendMail } = await import("../mailer.js");
        await sendMail({
          to: mailTo,
          subject: "Votre retrait a été payé — Mboppi",
          text:
            `Bonjour ${w.seller_name},\n\n` +
            `Votre demande de retrait de ${amount} F a été traitée et payée par l'équipe Mboppi.\n` +
            `Le montant a été retiré de vos statistiques et la transaction a été enregistrée.\n\n` +
            `Merci de votre confiance,\nL'équipe Mboppi`,
        });
      } catch (err) {
        console.error("[admin] email activation_withdrawal_paid impossible :", err.message);
      }
    }
    await logAudit(
      req.user.id,
      "admin.activation_withdrawal_paid",
      `withdrawal=${id} seller=${w.seller_id} (${w.seller_name}) amount=${amount}`,
      req.ip
    );
    res.json({ ok: true });
  })
);


// Basculer entre les deux systèmes de paiement (manuel ↔ automatique) et
// configurer les clés iKeePay. En automatique, seuls les PAYIN (adhésion, don)
// passent par iKeePay ; les versements (retraits d'activation, commissions)
// restent manuels, quel que soit le mode.
router.get(
  "/settings/payments",
  ah(async (req, res) => {
    const [mode, keys, configured, publicSettings] = await Promise.all([
      getPaymentMode(),
      getIkeepayKeys(),
      isIkeepayConfigured(),
      getPublicPaymentSettings(),
    ]);
    res.json({
      mode,
      currency: publicSettings.currency,
      ikeepay_configured: configured,
      ikeepay: {
        public_key: keys.publicKey,
        secret_key_set: Boolean(keys.secretKey),
      },
    });
  })
);

router.post(
  "/settings/payments",
  ah(async (req, res) => {
    const body = req.body || {};
    let mode;
    if (body.mode) {
      mode = await setPaymentMode(body.mode);
    } else {
      mode = await getPaymentMode();
    }
    if (
      body.ikeepay_public_key !== undefined ||
      body.ikeepay_secret_key !== undefined
    ) {
      const current = await getIkeepayKeys();
      const publicKey =
        body.ikeepay_public_key !== undefined
          ? String(body.ikeepay_public_key).trim()
          : current.publicKey;
      const secretKey =
        body.ikeepay_secret_key !== undefined
          ? String(body.ikeepay_secret_key).trim()
          : current.secretKey;
      // setSetting est auto-réparant : il crée la table platform_settings si
      // elle n'existe pas encore en base (initDb pas forcément abouti en prod).
      await setSetting("ikeepay_public_key", publicKey);
      await setSetting("ikeepay_secret_key", secretKey);
    }
    await logAudit(
      req.user.id,
      "admin.payment_settings",
      `mode=${mode} ikeepay_configured=${await isIkeepayConfigured()}`,
      req.ip
    );
    res.json({ ok: true, mode });
  })
);

// Liste des paiements en ligne (adhésions + dons) pour le suivi admin.
router.get(
  "/payments",
  ah(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    // La colonne donor_email peut ne pas exister si initDb n'a pas abouti.
    await ensureColumn("donations", "donor_email", "TEXT");
    // Supprime automatiquement les paiements « en attente » depuis plus de 30 min.
    await purgePendingPayments().catch(() => {});
    const [memberships, donations] = await Promise.all([
      q(
        `SELECT mp.id, mp.amount, mp.currency, mp.status, mp.external_reference,
                mp.provider_reference, mp.created_at, mp.completed_at,
                u.name AS user_name, u.email AS user_email, u.role AS user_role
           FROM membership_payments mp
           JOIN users u ON u.id = mp.user_id
           ORDER BY mp.created_at DESC LIMIT $1`,
        [limit]
      ),
      q(
        `SELECT id, amount, currency, status, external_reference, provider_reference,
                donor_email, donor_phone, operator, created_at, completed_at
           FROM donations ORDER BY created_at DESC LIMIT $1`,
        [limit]
      ),
    ]);
    res.json({
      memberships: memberships.map((m) => ({
        ...m,
        amount: Number(m.amount),
      })),
      donations: donations.map((d) => ({
        ...d,
        amount: Number(d.amount),
      })),
    });
  })
);

// Journal des webhooks iKeePay reçus (diagnostic d'un paiement resté en attente).
router.get(
  "/payments/webhooks",
  ah(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const rows = await q(
      `SELECT id, provider, provider_transaction_id, provider_order_id, event,
              payload, status, handled, error, created_at
         FROM payment_webhook_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({
      webhooks: rows.map((r) => ({
        id: Number(r.id),
        provider: r.provider,
        provider_transaction_id: r.provider_transaction_id,
        provider_order_id: r.provider_order_id,
        event: r.event,
        payload: r.payload,
        status: r.status,
        handled: Boolean(r.handled),
        error: r.error,
        created_at: r.created_at,
      })),
    });
  })
);

// Secours manuel : marquer un don complété (webhook perdu / non arrivé). Réservé
// à l'admin. Ne crée PAS d'adhésion (uniquement les dons restés en attente).
router.post(
  "/payments/donations/:id/complete",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Identifiant invalide" });
    }
    const donation = (
      await q("SELECT id FROM donations WHERE id = $1", [id])
    )[0];
    if (!donation) return res.status(404).json({ error: "Don introuvable" });
    await q(
      `UPDATE donations SET status = 'completed', completed_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [id]
    );
    await logAudit(
      req.user.id,
      "admin.donation_complete_manual",
      `donation=${id} marquée complétée manuellement`,
      req.ip
    );
    res.json({ ok: true });
  })
);

// Supprimer une ligne de paiement (don) sur demande de l'admin.
router.delete(
  "/payments/donations/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Identifiant invalide" });
    }
    const donation = (await q("SELECT id FROM donations WHERE id = $1", [id]))[0];
    if (!donation) return res.status(404).json({ error: "Don introuvable" });
    await q("DELETE FROM donations WHERE id = $1", [id]);
    await logAudit(req.user.id, "admin.payment_donation_delete", `donation=${id}`, req.ip);
    res.json({ ok: true });
  })
);

// Supprimer une ligne de paiement (adhésion) sur demande de l'admin.
router.delete(
  "/payments/memberships/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Identifiant invalide" });
    }
    const mp = (
      await q("SELECT id FROM membership_payments WHERE id = $1", [id])
    )[0];
    if (!mp) return res.status(404).json({ error: "Paiement d'adhésion introuvable" });
    await q("DELETE FROM membership_payments WHERE id = $1", [id]);
    await logAudit(req.user.id, "admin.payment_membership_delete", `membership=${id}`, req.ip);
    res.json({ ok: true });
  })
);

// NOTE : les endpoints de réconciliation des reversements iKeePay
// (GET /payouts, POST /payouts/:ref/resolve, POST /payouts/:ref/retry) ont été
// supprimés avec le système iKeePay. La table `automatic_payouts` est conservée
// pour l'historique financier, mais n'est plus alimentée ni pilotée.

export default router;
