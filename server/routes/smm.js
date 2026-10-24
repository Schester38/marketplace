import { Router } from "express";
import { q } from "../db.js";
import { authRequired, roleRequired } from "../auth.js";
import { validate, validateQuery } from "../middlewares/validate.js";
import {
  smmCategorySchema,
  smmServiceSchema,
  smmOrderSchema,
  smmOrderStatusSchema,
  smmProviderConfigSchema,
} from "../validators.js";
import {
  getActiveProviderConfig,
  getSmmSecret,
  logSmmCall,
  generateIdempotencyKey,
  NoProviderAdapter,
} from "../services/smmProvider.js";
import { notifyAdmins } from "../services/adminNotify.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ========================================================================
   1. ROUTES PUBLIQUES — Catalogue et commande
   ======================================================================== */

router.get(
  "/categories",
  ah(async (req, res) => {
    // Auto-réparation : créer les tables si initDb() n'a pas fonctionné
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS smm_categories (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          icon TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        INSERT INTO smm_categories (name, slug, description, icon, sort_order, is_active)
        VALUES
          ('Développement de l''audience', 'audience', 'Accroître votre visibilité numérique et développer votre communauté.', '📈', 1, TRUE),
          ('Création de contenus', 'contenus', 'Contenus attractifs pour communiquer et promouvoir votre activité.', '🎨', 2, TRUE),
          ('Gestion des réseaux sociaux', 'reseaux-sociaux', 'Animer votre communauté et développer une présence professionnelle.', '📱', 3, TRUE),
          ('Publicité digitale', 'publicite', 'Préparer et optimiser vos campagnes publicitaires.', '💰', 4, TRUE)
        ON CONFLICT (slug) DO NOTHING;
      `);
    } catch (initErr) {
      // ignore, la requête SELECT renverra l'erreur si vraiment cassé
    }
    const rows = await q(
      `SELECT id, name, slug, description, icon, sort_order, is_active, created_at
       FROM smm_categories
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, name ASC`
    );
    res.json({ categories: rows });
  })
);

/* GET /api/smm/services — services actifs, filtre optionnel par catégorie */
router.get(
  "/services",
  ah(async (req, res) => {
    // Auto-réparation : créer les tables si initDb() n'a pas fonctionné
    try {
      await q(`
        CREATE TABLE IF NOT EXISTS smm_categories (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          icon TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS smm_services (
          id SERIAL PRIMARY KEY,
          category_id INTEGER NOT NULL REFERENCES smm_categories(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          short_description TEXT,
          price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
          currency TEXT NOT NULL DEFAULT 'XAF',
          billing_unit TEXT NOT NULL DEFAULT 'service',
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
          is_automated BOOLEAN NOT NULL DEFAULT FALSE,
          is_consulting BOOLEAN NOT NULL DEFAULT FALSE,
          is_campaign BOOLEAN NOT NULL DEFAULT FALSE,
          external_service_id TEXT,
          delivery_days INTEGER,
          conditions TEXT,
          limits JSONB NOT NULL DEFAULT '{}'::jsonb,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      try {
        await q(`
          INSERT INTO smm_categories (name, slug, description, icon, sort_order, is_active)
          VALUES
            ('Développement de l''audience', 'audience', 'Accroître votre visibilité numérique et développer votre communauté.', '📈', 1, TRUE),
            ('Création de contenus', 'contenus', 'Contenus attractifs pour communiquer et promouvoir votre activité.', '🎨', 2, TRUE),
            ('Gestion des réseaux sociaux', 'reseaux-sociaux', 'Animer votre communauté et développer une présence professionnelle.', '📱', 3, TRUE),
            ('Publicité digitale', 'publicite', 'Préparer et optimiser vos campagnes publicitaires.', '💰', 4, TRUE)
          ON CONFLICT (slug) DO NOTHING;
          INSERT INTO smm_services (category_id, name, short_description, price, currency, billing_unit, status, is_automated, is_consulting, is_campaign, delivery_days, conditions, sort_order, created_at, updated_at)
          SELECT c.id, s.name, s.short_description, s.price, s.currency, s.billing_unit, s.status, s.is_automated, s.is_consulting, s.is_campaign, s.delivery_days, s.conditions, s.sort_order, now(), now()
          FROM (VALUES
            ('audience', 'Conseil en stratégie de croissance', 'Accompagnement pour définir votre stratégie de croissance numérique.', 0, 'XAF', 'service', false, false, false, 30, NULL, 1),
            ('audience', 'Optimisation des profils sociaux', 'Refonte et optimisation de vos profils sur les réseaux sociaux.', 0, 'XAF', 'service', false, false, false, 15, NULL, 2),
            ('audience', 'Analyse de l''audience', 'Analyse de votre audience actuelle et recommandations de ciblage.', 0, 'XAF', 'service', false, false, false, 7, NULL, 3),
            ('contenus', 'Création d''affiches publicitaires', 'Conception de visuels publicitaires pour vos campagnes.', 0, 'XAF', 'article', false, false, false, 5, NULL, 1),
            ('contenus', 'Création de vidéos courtes', 'Production de vidéos courtes (Reels, TikTok, Shorts) pour vos réseaux.', 0, 'XAF', 'article', false, false, false, 7, NULL, 2),
            ('contenus', 'Motion design', 'Animations graphiques et motion design pour vos contenus.', 0, 'XAF', 'article', false, false, false, 10, NULL, 3),
            ('reseaux-sociaux', 'Gestion de pages professionnelles', 'Gestion complète de vos pages professionnelles sur les réseaux sociaux.', 0, 'XAF', 'mois', false, false, false, 30, NULL, 1),
            ('reseaux-sociaux', 'Planification des publications', 'Calendrier éditorial et planification de vos publications.', 0, 'XAF', 'service', false, false, false, 5, NULL, 2),
            ('reseaux-sociaux', 'Modération des commentaires', 'Modération et animation de votre communauté (commentaires, messages).', 0, 'XAF', 'mois', false, false, false, 30, NULL, 3),
            ('publicite', 'Conception de publicités', 'Conception graphique de vos publicités digitales.', 0, 'XAF', 'article', false, false, false, 5, NULL, 1),
            ('publicite', 'Préparation de campagnes Meta Ads', 'Préparation et configuration de vos campagnes publicitaires Meta.', 0, 'XAF', 'campagne', false, false, true, 7, NULL, 2),
            ('publicite', 'Préparation de campagnes TikTok Ads', 'Préparation et configuration de vos campagnes publicitaires TikTok.', 0, 'XAF', 'campagne', false, false, true, 7, NULL, 3)
          ) AS s(cat_slug, name, short_description, price, currency, billing_unit, status, is_automated, is_consulting, is_campaign, delivery_days, conditions, sort_order)
          JOIN smm_categories c ON c.slug = s.cat_slug;
        `);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    const categoryId = req.query.category_id;
    let sql = `
      SELECT s.id, s.category_id, c.name AS category_name, c.slug AS category_slug,
             s.name, s.short_description, s.description, s.price, s.currency,
             s.billing_unit, s.status, s.is_automated, s.is_consulting, s.is_campaign,
             s.external_service_id, s.delivery_days, s.conditions, s.limits,
             s.sort_order, s.created_at, s.updated_at
      FROM smm_services s
      JOIN smm_categories c ON c.id = s.category_id
      WHERE s.status = 'active' AND c.is_active = TRUE`;
    const params = [];
    if (categoryId) {
      params.push(categoryId);
      sql += ` AND s.category_id = $${params.length}`;
    }
    sql += ` ORDER BY c.sort_order ASC, c.name ASC, s.sort_order ASC, s.name ASC`;
    const rows = await q(sql, params);
    res.json({ services: rows });
  })
);

/* GET /api/smm/services/:id — détail d'un service */
router.get(
  "/services/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID de service invalide" });
    }
    const rows = await q(
      `SELECT s.*, c.name AS category_name, c.slug AS category_slug
       FROM smm_services s
       JOIN smm_categories c ON c.id = s.category_id
       WHERE s.id = $1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Service introuvable" });
    }
    res.json({ service: rows[0] });
  })
);

/* POST /api/smm/orders — passer une commande (auth optionnelle) */
router.post(
  "/orders",
  validate(smmOrderSchema),
  ah(async (req, res) => {
    const { service_id, quantity, client_info, payment_method, idempotency_key } = req.body;
    const userId = req.user?.id || null;

    const serviceRows = await q(
      `SELECT s.id, s.name, s.price, s.currency, s.billing_unit, s.is_automated, s.is_campaign,
              c.name AS category_name
       FROM smm_services s
       JOIN smm_categories c ON c.id = s.category_id
       WHERE s.id = $1 AND s.status = 'active' AND c.is_active = TRUE`,
      [service_id]
    );
    if (!serviceRows.length) {
      return res.status(404).json({ error: "Service introuvable ou inactif" });
    }
    const svc = serviceRows[0];

    const unitPrice = Number(svc.price);
    const qty = Number(quantity || 1);
    const total = Math.round((unitPrice * qty) * 100) / 100;

    const idemKey = idempotency_key || generateIdempotencyKey();

    if (idempotency_key) {
      const existing = await q(
        `SELECT id, status FROM smm_orders WHERE idempotency_key = $1`,
        [idempotency_key]
      );
      if (existing.length) {
        return res.status(409).json({
          error: "Une commande avec cette référence existe déjà",
          order_id: existing[0].id,
          status: existing[0].status,
        });
      }
    }

    const created = await q(
      `INSERT INTO smm_orders
        (user_id, service_id, service_name, service_price, currency, quantity,
         total, billing_unit, client_info, status, payment_method, idempotency_key,
         created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11, now(), now())
       RETURNING id`,
      [
        userId,
        service_id,
        svc.name,
        unitPrice,
        svc.currency,
        qty,
        total,
        svc.billing_unit,
        JSON.stringify(client_info || {}),
        payment_method,
        idemKey,
      ]
    )[0];

    await q(
      `INSERT INTO smm_order_events (order_id, event_type, new_status, message, created_at)
       VALUES ($1, 'created', 'draft', 'Commande créée (brouillon, paiement en attente)', now())`,
      [created.id]
    );

    res.status(201).json({
      ok: true,
      order_id: created.id,
      status: "draft",
      service: svc.name,
      unit_price: unitPrice,
      quantity: qty,
      total,
      currency: svc.currency,
      billing_unit: svc.billing_unit,
      message:
        "Commande enregistrée. Procédez au paiement pour confirmer votre commande MboppiBoost.",
    });
  })
);

/* GET /api/smm/orders — mes commandes (auth requise) */
router.get(
  "/orders",
  authRequired,
  ah(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await q(
      `SELECT o.id, o.service_id, o.service_name, o.service_price, o.currency,
              o.quantity, o.total, o.billing_unit, o.status, o.payment_status,
              o.provider_status, o.external_reference, o.payment_method,
              o.created_at, o.updated_at, o.completed_at,
              c.name AS category_name
       FROM smm_orders o
       LEFT JOIN smm_services s ON s.id = o.service_id
       LEFT JOIN smm_categories c ON c.id = s.category_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ orders: rows, limit, offset });
  })
);

/* GET /api/smm/orders/:id — détail d'une commande (auth requise) */
router.get(
  "/orders/:id",
  authRequired,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID de commande invalide" });
    }
    const rows = await q(
      `SELECT o.*, c.name AS category_name
       FROM smm_orders o
       LEFT JOIN smm_services s ON s.id = o.service_id
       LEFT JOIN smm_categories c ON c.id = s.category_id
       WHERE o.id = $1 AND o.user_id = $2`,
      [id, req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    const events = await q(
      `SELECT event_type, old_status, new_status, message, created_at
       FROM smm_order_events
       WHERE order_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    res.json({ order: rows[0], events });
  })
);

/* ========================================================================
   2. ROUTES ADMIN — Gestion des catégories, services, fournisseurs, commandes
   ======================================================================== */

router.get(
  "/admin/categories",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const rows = await q(
      `SELECT id, name, slug, description, icon, sort_order, is_active, created_at
       FROM smm_categories
       ORDER BY sort_order ASC, name ASC`
    );
    res.json({ categories: rows });
  })
);

router.post(
  "/admin/categories",
  authRequired,
  roleRequired("admin"),
  validate(smmCategorySchema),
  ah(async (req, res) => {
    const { name, slug, description, icon, sort_order, is_active } = req.body;
    try {
      const created = await q(
        `INSERT INTO smm_categories (name, slug, description, icon, sort_order, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         RETURNING id, name, slug, description, icon, sort_order, is_active, created_at`,
        [name, slug, description || null, icon || null, sort_order, is_active]
      )[0];
      res.status(201).json({ category: created });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "Une catégorie avec ce nom ou ce slug existe déjà" });
      }
      throw err;
    }
  })
);

router.put(
  "/admin/categories/:id",
  authRequired,
  roleRequired("admin"),
  validate(smmCategorySchema),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID invalide" });
    }
    const { name, slug, description, icon, sort_order, is_active } = req.body;
    const updated = await q(
      `UPDATE smm_categories
       SET name = $1, slug = $2, description = $3, icon = $4, sort_order = $5, is_active = $6
       WHERE id = $7
       RETURNING id, name, slug, description, icon, sort_order, is_active`,
      [name, slug, description || null, icon || null, sort_order, is_active, id]
    );
    if (!updated.length) {
      return res.status(404).json({ error: "Catégorie introuvable" });
    }
    res.json({ category: updated[0] });
  })
);

router.delete(
  "/admin/categories/:id",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID invalide" });
    }
    const nbServices = await q(
      `SELECT COUNT(*)::int AS n FROM smm_services WHERE category_id = $1`,
      [id]
    );
    if (Number(nbServices[0].n) > 0) {
      return res.status(409).json({ error: "Impossible : des services utilisent cette catégorie" });
    }
    const deleted = await q(`DELETE FROM smm_categories WHERE id = $1 RETURNING id`, [id]);
    if (!deleted.length) {
      return res.status(404).json({ error: "Catégorie introuvable" });
    }
    res.json({ ok: true });
  })
);

router.get(
  "/admin/services",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const rows = await q(
      `SELECT s.id, s.category_id, c.name AS category_name, c.slug AS category_slug,
              s.name, s.short_description, s.price, s.currency, s.billing_unit,
              s.status, s.is_automated, s.is_consulting, s.is_campaign,
              s.delivery_days, s.sort_order, s.created_at, s.updated_at
       FROM smm_services s
       JOIN smm_categories c ON c.id = s.category_id
       ORDER BY c.sort_order ASC, c.name ASC, s.sort_order ASC, s.name ASC`
    );
    res.json({ services: rows });
  })
);

router.post(
  "/admin/services",
  authRequired,
  roleRequired("admin"),
  validate(smmServiceSchema),
  ah(async (req, res) => {
    const {
      category_id, name, description, short_description, price, currency,
      billing_unit, status, is_automated, is_consulting, is_campaign,
      external_service_id, delivery_days, conditions, limits, sort_order,
    } = req.body;
    try {
      const created = await q(
        `INSERT INTO smm_services
          (category_id, name, description, short_description, price, currency,
           billing_unit, status, is_automated, is_consulting, is_campaign,
           external_service_id, delivery_days, conditions, limits, sort_order,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), now())
         RETURNING id`,
        [
          category_id, name, description || null, short_description || null,
          price, currency, billing_unit, status, is_automated, is_consulting,
          is_campaign, external_service_id || null, delivery_days || null,
          conditions || null, JSON.stringify(limits || {}), sort_order,
        ]
      )[0];
      res.status(201).json({ service_id: created.id });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "Conflit d'unicité" });
      }
      throw err;
    }
  })
);

router.put(
  "/admin/services/:id",
  authRequired,
  roleRequired("admin"),
  validate(smmServiceSchema),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID invalide" });
    }
    const {
      category_id, name, description, short_description, price, currency,
      billing_unit, status, is_automated, is_consulting, is_campaign,
      external_service_id, delivery_days, conditions, limits, sort_order,
    } = req.body;
    const updated = await q(
      `UPDATE smm_services
       SET category_id = $1, name = $2, description = $3, short_description = $4,
           price = $5, currency = $6, billing_unit = $7, status = $8,
           is_automated = $9, is_consulting = $10, is_campaign = $11,
           external_service_id = $12, delivery_days = $13, conditions = $14,
           limits = $15, sort_order = $16, updated_at = now()
       WHERE id = $17
       RETURNING id`,
      [
        category_id, name, description || null, short_description || null,
        price, currency, billing_unit, status, is_automated, is_consulting,
        is_campaign, external_service_id || null, delivery_days || null,
        conditions || null, JSON.stringify(limits || {}), sort_order, id,
      ]
    );
    if (!updated.length) {
      return res.status(404).json({ error: "Service introuvable" });
    }
    res.json({ service_id: updated[0].id });
  })
);

router.delete(
  "/admin/services/:id",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID invalide" });
    }
    const deleted = await q(`DELETE FROM smm_services WHERE id = $1 RETURNING id`, [id]);
    if (!deleted.length) {
      return res.status(404).json({ error: "Service introuvable" });
    }
    res.json({ ok: true });
  })
);

/* GET /api/admin/smm/orders — toutes les commandes (admin) */
router.get(
  "/admin/orders",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await q(
      `SELECT o.id, o.user_id, u.name AS user_name, o.service_id, o.service_name,
              o.service_price, o.currency, o.quantity, o.total, o.billing_unit,
              o.status, o.payment_status, o.provider_status, o.external_reference,
              o.payment_method, o.created_at, o.updated_at, o.completed_at
       FROM smm_orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ orders: rows, limit, offset });
  })
);

/* PUT /api/admin/smm/orders/:id/status — changer le statut d'une commande (admin) */
router.put(
  "/admin/orders/:id/status",
  authRequired,
  roleRequired("admin"),
  validate(smmOrderStatusSchema),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID invalide" });
    }
    const { status, provider_status, provider_reference, admin_note } = req.body;

    const orderRows = await q(
      `SELECT id, status, user_id, service_name, total, currency FROM smm_orders WHERE id = $1`,
      [id]
    );
    if (!orderRows.length) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    const oldStatus = orderRows[0].status;

    const updated = await q(
      `UPDATE smm_orders
       SET status = $1, provider_status = $2, provider_reference = $3,
           updated_at = now(),
           completed_at = CASE WHEN $1 IN ('completed','refunded','cancelled') THEN now() ELSE completed_at END
       WHERE id = $4
       RETURNING id, status`,
      [status, provider_status || null, provider_reference || null, id]
    );

    await q(
      `INSERT INTO smm_order_events (order_id, event_type, old_status, new_status, message, provider_payload, created_at)
       VALUES ($1, 'status_change', $2, $3, $4, $5, now())`,
      [
        id,
        oldStatus,
        status,
        admin_note || `Statut changé de ${oldStatus} vers ${status}`,
        JSON.stringify({ provider_status, provider_reference }),
      ]
    );

    if (status === "completed" && oldStatus !== "completed") {
      notifyAdmins({
        title: "Commande MboppiBoost terminée ✅",
        body: `Commande #${id} — ${orderRows[0].service_name} — ${orderRows[0].total} ${orderRows[0].currency}`,
        amount: Number(orderRows[0].total),
      }).catch(() => {});
    }

    res.json({ order_id: updated[0].id, status: updated[0].status });
  })
);

/* GET /api/admin/smm/providers — config fournisseur (admin, secrets masqués) */
router.get(
  "/admin/providers",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const config = await getActiveProviderConfig();
    res.json({
      provider: config.provider,
      enabled: !!config.provider,
      config: {
        baseUrl: config.config.baseUrl || "",
        timeoutMs: config.config.timeoutMs || 10000,
      },
    });
  })
);

/* POST /api/admin/smm/providers — configurer le fournisseur (admin) */
router.post(
  "/admin/providers",
  authRequired,
  roleRequired("admin"),
  validate(smmProviderConfigSchema),
  ah(async (req, res) => {
    const {
      smm_provider_enabled,
      smm_provider_key,
      smm_api_base_url,
      smm_api_timeout,
      smm_provider_config,
      smm_api_key,
    } = req.body;

    const upsert = (key, value) =>
      q(
        `INSERT INTO platform_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, value]
      );

    await upsert("smm_provider_enabled", String(!!smm_provider_enabled));
    if (smm_provider_key !== undefined) await upsert("smm_provider_key", smm_provider_key || "");
    if (smm_api_base_url !== undefined) await upsert("smm_api_base_url", smm_api_base_url || "");
    if (smm_api_timeout !== undefined) await upsert("smm_api_timeout", String(smm_api_timeout));
    if (smm_provider_config !== undefined) await upsert("smm_provider_config", smm_provider_config || "");
    if (smm_api_key !== undefined) await upsert("smm_api_key", smm_api_key || "");

    res.json({ ok: true, message: "Configuration fournisseur enregistrée" });
  })
);

export default router;