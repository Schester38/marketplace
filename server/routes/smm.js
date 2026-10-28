import { Router } from "express";
import { q, withTransaction } from "../db.js";
import { rateLimit } from "express-rate-limit";
import { logAudit } from "../security.js";
import { authRequired, authOptional, roleRequired } from "../auth.js";
import { validate, validateQuery } from "../middlewares/validate.js";
import {
  smmCategorySchema,
  smmServiceSchema,
  smmServiceUpdateSchema,
  smmOrderSchema,
  smmOrderStatusSchema,
  smmPaymentDeclareSchema,
  smmPaymentConfirmSchema,
  smmPaymentInfoSchema,
  smmImportCatalogSchema,
  smmProviderConfigSchema,
  boostWalletTopupSchema,
  boostAdminWalletCreditSchema,
} from "../validators.js";
import { getActiveProviderConfig, logSmmCall, generateIdempotencyKey } from "../services/smmProvider.js";
import { notifyAdmins } from "../services/adminNotify.js";
import { SMM_CATEGORIES, SMM_SERVICES } from "../services/smmCatalog.js";
import { getSmmPaymentInfo, setSmmPaymentInfo } from "../services/smmPayment.js";
import {
  generatePublicToken,
  dispatchSmmOrder,
  dispatchSmmOrderNow,
  syncSmmOrders,
  addEvent,
  notifySmmUser,
  completeSmmPayment,
} from "../services/smmFulfillment.js";
import {
  addPublicKey,
  buildInlineCheckoutUrl,
  genExternalRef,
  getIkeepayKeys,
  getPaymentMode,
  PAYMENT_MODE_AUTO,
  reconcileSmmOrderPayment,
  reconcileBoostWalletTopup,
} from "../services/ikeepay.js";
import {
  BOOST_MAX_TOPUP_USD,
  BOOST_MIN_TOPUP_USD,
  adminCreditBoostWallet,
  creditBoostWalletTx,
  createBoostWalletTopup,
  debitBoostWalletTx,
  getBoostWallet,
  getBoostWalletSummary,
  getBoostWalletTopup,
} from "../services/boostWallet.js";
import {
  CURRENCY_DECIMALS,
  TOPUP_CURRENCIES,
  convertAmount,
  getUsdRates,
  normalizeCurrency,
  roundMoney,
  usableTopupCurrencies,
} from "../services/fxRates.js";
import {
  importProviderCatalog,
  previewProviderCatalogImport,
} from "../services/smmCatalogImport.js";
import { detectSmmPlatform, SMM_PLATFORM_KEYS } from "../services/smmPlatforms.js";
import {
  computeSmmTotal,
  decorateSmmService,
  minimumSmmQuantity,
  smmBillingUnit,
  SMM_MIN_ORDER_TOTAL_XAF,
  SMM_MAX_PUBLIC_PRICE_XAF,
} from "../services/smmPricing.js";

const router = Router();

// Limiteurs dédiés par utilisateur (anti-spam de commandes MboppiBoost).
// Clé = id utilisateur si authentifié, sinon IP (pour les endpoints authOptional).
function smmUserKey(req) {
  if (req?.user?.id) return `u:${req.user.id}`;
  return `ip:${req?.ip || req?.socket?.remoteAddress || "unknown"}`;
}
const smmOrderCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: smmUserKey,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Trop de commandes créées, réessayez dans une minute" },
});
const smmOrderCheckoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: smmUserKey,
  validate: { keyGeneratorIpFallback: false },
  message: { error: "Trop de tentatives de paiement, réessayez dans une minute" },
});

// Catalogue public MboppiBoost (source partagée avec l'amorçage initDb).
const DEFAULT_CATEGORIES = SMM_CATEGORIES;
const DEFAULT_SERVICES = SMM_SERVICES;
const SMM_PAGE_SIZE = 24;
const SMM_PAGE_MAX = 60;
const DEFAULT_CATEGORY_BY_ID = new Map(DEFAULT_CATEGORIES.map((category) => [category.id, category]));
const DEFAULT_SERVICES_WITH_CATEGORIES = DEFAULT_SERVICES.map((service) => {
  const category = DEFAULT_CATEGORY_BY_ID.get(service.category_id);
  return decorateSmmService({
    ...service,
    category_name: category?.name || "",
    category_slug: category?.slug || "",
    platform: category?.slug || detectSmmPlatform(service.name),
  });
});

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function canAccessSmmOrder(req, order) {
  if (!order) return false;
  if (req?.user?.id && order.user_id && Number(req.user.id) === Number(order.user_id)) return true;
  if (req?.user?.role === "admin") return true;
  const token = req?.query?.token || req?.body?.token;
  if (token && order.public_token && String(token) === String(order.public_token)) return true;
  return false;
}


function pageParam(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function fallbackCategories() {
  const counts = new Map();
  for (const service of DEFAULT_SERVICES_WITH_CATEGORIES) {
    counts.set(service.category_id, (counts.get(service.category_id) || 0) + 1);
  }
  return DEFAULT_CATEGORIES.map((category) => ({
    ...category,
    platform: category.slug || detectSmmPlatform(category.name),
    service_count: counts.get(category.id) || 0,
  }));
}

function fallbackServicesPage({ categoryId, platform, search, minPrice, maxPrice, page, limit }) {
  const needle = search.toLowerCase();
  const filtered = DEFAULT_SERVICES_WITH_CATEGORIES.filter((service) => {
    if (categoryId && Number(service.category_id) !== Number(categoryId)) return false;
    if (platform && service.platform !== platform) return false;
    if (
      needle &&
      !`${service.name} ${service.short_description || ""} ${service.category_name}`
        .toLowerCase()
        .includes(needle)
    ) {
      return false;
    }
    const price = Number(service.price);
    if (Number.isFinite(minPrice) && price < Number(minPrice)) return false;
    if (Number.isFinite(maxPrice) && price > Number(maxPrice)) return false;
    return true;
  });
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    services: filtered.slice((safePage - 1) * limit, safePage * limit),
    pagination: { page: safePage, limit, total, total_pages: totalPages },
  };
}

function publicServiceWhere({ categoryId, platform, search, minPrice, maxPrice }) {
  const where = [
    "s.status = 'active'",
    "c.is_active = TRUE",
    `s.price <= ${SMM_MAX_PUBLIC_PRICE_XAF}`,
  ];
  const params = [];
  if (categoryId) {
    params.push(categoryId);
    where.push(`s.category_id = $${params.length}`);
  }
  if (platform) {
    params.push(platform);
    where.push(`s.platform = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(
      `(s.name ILIKE $${params.length} OR c.name ILIKE $${params.length} OR COALESCE(s.short_description, '') ILIKE $${params.length} OR COALESCE(s.description, '') ILIKE $${params.length})`
    );
  }
  const minP = Number(minPrice);
  if (Number.isFinite(minP) && minP >= 0) {
    params.push(minP);
    where.push(`s.price >= $${params.length}`);
  }
  const maxP = Number(maxPrice);
  if (Number.isFinite(maxP) && maxP >= 0) {
    params.push(maxP);
    where.push(`s.price <= $${params.length}`);
  }
  return { where: where.join(" AND "), params };
}

/* ========================================================================
   1. ROUTES PUBLIQUES — Catalogue et commande
   ======================================================================== */

router.get(
  "/categories",
  ah(async (req, res) => {
    try {
      const rows = await q(
        `SELECT c.id, c.name, c.slug, c.description, c.icon, c.sort_order, c.is_active, c.created_at,
                COUNT(s.id)::int AS service_count,
                MODE() WITHIN GROUP (ORDER BY s.platform) AS platform
         FROM smm_categories c
         JOIN smm_services s ON s.category_id = c.id
           AND s.status = 'active'
           AND s.price <= ${SMM_MAX_PUBLIC_PRICE_XAF}
         WHERE c.is_active = TRUE
         GROUP BY c.id
         ORDER BY c.sort_order ASC, c.name ASC`
      );
      if (!rows.length) return res.json({ categories: fallbackCategories() });
      res.json({
        categories: rows.map((category) => ({
          ...category,
          platform: category.platform || detectSmmPlatform(category.name),
        })),
      });
    } catch (selectErr) {
      res.json({ categories: fallbackCategories() });
    }
  })
);

/* GET /api/smm/services — services actifs, pagination et filtres */
router.get(
  "/services",
  ah(async (req, res) => {
    const page = pageParam(req.query.page, 1, 100000);
    const limit = pageParam(req.query.limit, SMM_PAGE_SIZE, SMM_PAGE_MAX);
    const search = String(req.query.search || "").trim().slice(0, 100);
    const rawCategoryId = Number(req.query.category_id);
    const categoryId =
      Number.isFinite(rawCategoryId) && rawCategoryId > 0 ? Math.trunc(rawCategoryId) : null;
    const rawPlatform = String(req.query.platform || "").trim().toLowerCase();
    const platform = SMM_PLATFORM_KEYS.includes(rawPlatform) ? rawPlatform : null;
    const minPriceRaw = Number(req.query.min_price);
    const maxPriceRaw = Number(req.query.max_price);
    const minPrice = Number.isFinite(minPriceRaw) && minPriceRaw >= 0 ? minPriceRaw : undefined;
    const maxPrice = Number.isFinite(maxPriceRaw) && maxPriceRaw >= 0 ? maxPriceRaw : undefined;
    const filters = { categoryId, platform, search, minPrice, maxPrice, page, limit };
    const { where, params } = publicServiceWhere(filters);

    try {
      const countRows = await q(
        `SELECT COUNT(*)::int AS total
         FROM smm_services s
         JOIN smm_categories c ON c.id = s.category_id
         WHERE ${where}`,
        params
      );
      const total = Number(countRows[0]?.total) || 0;
      if (!total) {
        const anyRows = await q(
          `SELECT EXISTS(
             SELECT 1 FROM smm_services s
             JOIN smm_categories c ON c.id = s.category_id
             WHERE s.status = 'active' AND c.is_active = TRUE
           ) AS ok`
        );
        if (!anyRows[0]?.ok) {
          return res.json(fallbackServicesPage(filters));
        }
        return res.json({
          services: [],
          pagination: { page: 1, limit, total: 0, total_pages: 1 },
        });
      }

      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(Math.max(1, page), totalPages);
      const offset = (safePage - 1) * limit;
      const rows = await q(
        `         SELECT s.id, s.category_id, c.name AS category_name, c.slug AS category_slug,
                s.name, s.short_description, s.description, s.price, s.currency,
                s.billing_unit, s.status, s.is_automated, s.is_consulting, s.is_campaign,
                s.external_service_id, s.delivery_days, s.conditions, s.limits, s.platform,
                s.sort_order, s.created_at, s.updated_at,
                COUNT(*) OVER (PARTITION BY s.category_id)::int AS category_service_count
         FROM smm_services s
         JOIN smm_categories c ON c.id = s.category_id
         WHERE ${where}
         ORDER BY CASE s.platform
                    WHEN 'instagram' THEN 1
                    WHEN 'tiktok' THEN 2
                    WHEN 'youtube' THEN 3
                    WHEN 'telegram' THEN 4
                    WHEN 'facebook' THEN 5
                    WHEN 'twitter' THEN 6
                    WHEN 'spotify' THEN 7
                    WHEN 'soundcloud' THEN 8
                    WHEN 'twitch' THEN 9
                    WHEN 'shopee' THEN 10
                    ELSE 50
                  END,
                  category_service_count DESC, c.name ASC, s.sort_order ASC, s.name ASC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      res.json({
        services: rows.map(decorateSmmService),
        pagination: { page: safePage, limit, total, total_pages: totalPages },
      });
    } catch (dbErr) {
      res.json(fallbackServicesPage(filters));
    }
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
    let service;
    try {
      const rows = await q(
        `SELECT s.*, c.name AS category_name, c.slug AS category_slug
         FROM smm_services s
         JOIN smm_categories c ON c.id = s.category_id
         WHERE s.id = $1
           AND s.status = 'active'
           AND c.is_active = TRUE
           AND s.price <= ${SMM_MAX_PUBLIC_PRICE_XAF}`,
        [id]
      );
      if (rows.length) {
        service = rows[0];
      }
    } catch (dbErr) {
      // Base de données indisponible : chercher dans les services par défaut
      service = DEFAULT_SERVICES.find((s) => s.id === id);
      if (service) {
        const category = DEFAULT_CATEGORIES.find((c) => c.id === service.category_id);
        return res.json({
          service: decorateSmmService({
            ...service,
            category_name: category?.name || "",
            category_slug: category?.slug || "",
          }),
        });
      }
    }
    if (!service) {
      return res.status(404).json({ error: "Service introuvable" });
    }
    res.json({ service: decorateSmmService(service) });
  })
);

/* GET /api/smm/payment-info — coordonnées de paiement manuel (public) */
router.get(
  "/payment-info",
  ah(async (req, res) => {
    const [instructions, online] = await Promise.all([
      getSmmPaymentInfo(),
      smmOnlinePaymentConfig(),
    ]);
    res.json({
      payment_info: instructions,
      online_payment: {
        enabled: online.enabled,
        provider: online.provider,
        mode: online.mode,
      },
    });
  })
);

/* POST /api/smm/orders — passer une commande (auth optionnelle) */
const SMM_PAYMENT_REF_PREFIX = "MBP-BST";

async function smmOnlinePaymentConfig() {
  const [mode, { publicKey }] = await Promise.all([getPaymentMode(), getIkeepayKeys()]);
  return {
    mode,
    publicKey,
    provider: "ikeepay",
    enabled: mode === PAYMENT_MODE_AUTO && Boolean(publicKey),
  };
}

async function buildSmmCheckout(orderId) {
  const config = await smmOnlinePaymentConfig();
  if (!config.enabled) return { online: false, provider: "ikeepay", reason: "online_unavailable" };

  const order = (
    await q(
      `SELECT id, total, currency, status, payment_status, payment_external_reference,
              payment_provider, client_info
         FROM smm_orders WHERE id = $1`,
      [orderId]
    )
  )[0];
  if (!order) return { online: false, reason: "not_found" };
  if (order.payment_status === "paid" || order.status !== "pending_payment") {
    return { online: true, reason: "already_final", status: order.status };
  }

  let reference = order.payment_external_reference;
  if (!reference) {
    reference = genExternalRef(SMM_PAYMENT_REF_PREFIX);
    const updated = await q(
      `UPDATE smm_orders
          SET payment_external_reference = $1,
              payment_provider = 'ikeepay',
              payment_method = 'ikeepay',
              updated_at = now()
        WHERE id = $2 AND status = 'pending_payment'
          AND payment_external_reference IS NULL
        RETURNING id`,
      [reference, orderId]
    );
    if (!updated.length) {
      const current = (
        await q(`SELECT payment_external_reference FROM smm_orders WHERE id = $1`, [orderId])
      )[0];
      reference = current?.payment_external_reference || null;
    } else {
      await addEvent(
        orderId,
        "checkout_created",
        "pending_payment",
        "pending_payment",
        "Checkout iKeePay créé",
        { provider: "ikeepay", reference }
      );
    }
  }
  if (!reference) return { online: false, reason: "reference_unavailable" };

  const info = order.client_info && typeof order.client_info === "object" ? order.client_info : {};
  const checkoutUrl = addPublicKey(
    buildInlineCheckoutUrl({
      amount: order.total,
      currency: order.currency,
      orderId: reference,
      email: String(info.email || ""),
    }),
    config.publicKey
  );

  return {
    online: true,
    provider: "ikeepay",
    reference,
    checkout_url: String(checkoutUrl),
  };
}

/* GET /api/smm/fx-rates — taux USD utilisés pour les conversions Boost */
router.get(
  "/fx-rates",
  ah(async (req, res) => {
    const rates = await getUsdRates({ force: req.query.refresh === "1" });
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    res.json(rates);
  })
);

/* GET /api/smm/wallet — solde Boost, historique et conditions de recharge */
router.get(
  "/wallet",
  authRequired,
  ah(async (req, res) => {
    const [wallet, config] = await Promise.all([
      getBoostWalletSummary(req.user.id, 50),
      smmOnlinePaymentConfig(),
    ]);
    let ratesPayload = null;
    try {
      ratesPayload = await getUsdRates();
    } catch (err) {
      console.warn("[smm wallet] taux indisponibles :", err.message);
    }
    const rates = ratesPayload?.rates || null;
    const available = new Set(usableTopupCurrencies(rates));
    const topupCurrencies = TOPUP_CURRENCIES.map((code) => {
      const rate = code === "USD" ? 1 : Number(rates?.[code]);
      return {
        code,
        decimals: CURRENCY_DECIMALS[code] ?? 2,
        usd_rate: Number.isFinite(rate) && rate > 0 ? rate : null,
        min_amount: rate > 0 ? roundMoney(BOOST_MIN_TOPUP_USD * rate, code) : null,
        max_amount: rate > 0 ? roundMoney(BOOST_MAX_TOPUP_USD * rate, code) : null,
        enabled: available.has(code),
      };
    });
    res.set("Cache-Control", "no-store");
    res.json({
      wallet: {
        balance_usd: wallet.balance_usd,
        transactions: wallet.transactions,
        updated_at: wallet.updated_at,
      },
      fx: ratesPayload
        ? {
            available: true,
            base: ratesPayload.base,
            rates,
            stale: Boolean(ratesPayload.stale),
            fetched_at: ratesPayload.fetched_at,
            source: ratesPayload.source,
          }
        : { available: false, rates: null },
      topup: {
        enabled: Boolean(config.enabled && ratesPayload),
        reason: config.enabled ? (ratesPayload ? null : "fx_unavailable") : "online_unavailable",
        mode: config.mode,
        provider: "ikeepay",
        currencies: topupCurrencies,
        default_currency: "USD",
        min_usd: BOOST_MIN_TOPUP_USD,
        max_usd: BOOST_MAX_TOPUP_USD,
      },
    });
  })
);

/* POST /api/smm/wallet/topup — ouvrir le checkout iKeePay d'une recharge */
router.post(
  "/wallet/topup",
  authRequired,
  validate(boostWalletTopupSchema),
  ah(async (req, res) => {
    const config = await smmOnlinePaymentConfig();
    if (!config.enabled) {
      return res.status(409).json({
        error: "La recharge en ligne est indisponible. Passez par le paiement manuel.",
        code: "TOPUP_UNAVAILABLE",
      });
    }
    const currency = normalizeCurrency(req.body.currency);
    if (!TOPUP_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: "Devise non prise en charge.", code: "UNSUPPORTED_CURRENCY" });
    }
    const ratesPayload = await getUsdRates();
    const rate = currency === "USD" ? 1 : Number(ratesPayload.rates[currency]);
    if (!(rate > 0)) {
      return res.status(400).json({ error: "Devise non prise en charge.", code: "UNSUPPORTED_CURRENCY" });
    }
    const amount = roundMoney(req.body.amount, currency);
    const creditUsd = roundMoney(amount / rate, "USD");
    if (creditUsd < BOOST_MIN_TOPUP_USD) {
      return res.status(400).json({
        error: `Montant minimum : ${roundMoney(BOOST_MIN_TOPUP_USD * rate, currency)} ${currency}.`,
        code: "TOPUP_TOO_SMALL",
        min_amount: roundMoney(BOOST_MIN_TOPUP_USD * rate, currency),
      });
    }
    if (creditUsd > BOOST_MAX_TOPUP_USD) {
      return res.status(400).json({
        error: `Montant maximum : ${roundMoney(BOOST_MAX_TOPUP_USD * rate, currency)} ${currency}.`,
        code: "TOPUP_TOO_LARGE",
        max_amount: roundMoney(BOOST_MAX_TOPUP_USD * rate, currency),
      });
    }
    const topup = await createBoostWalletTopup({
      userId: req.user.id,
      amount,
      currency,
      fxRate: rate,
      creditUsd,
    });
    const checkoutUrl = addPublicKey(
      buildInlineCheckoutUrl({
        amount: topup.amount,
        currency: topup.currency,
        orderId: topup.external_reference,
        email: req.user.email || "",
      }),
      config.publicKey
    );
    res.status(201).json({
      ok: true,
      reference: topup.external_reference,
      amount: Number(topup.amount),
      currency: topup.currency,
      fx_rate: Number(topup.fx_rate),
      credit_usd: Number(topup.credit_usd),
      checkout_url: String(checkoutUrl),
      provider: "ikeepay",
    });
  })
);

/* GET /api/smm/wallet/topups/:reference — statut d'une recharge (polling) */
router.get(
  "/wallet/topups/:reference",
  authRequired,
  ah(async (req, res) => {
    const reference = String(req.params.reference || "").trim();
    const topup = await getBoostWalletTopup(req.user.id, reference);
    if (!topup) return res.status(404).json({ error: "Recharge introuvable." });
    let reconciliation = null;
    if (!["completed", "failed"].includes(topup.status)) {
      reconciliation = await reconcileBoostWalletTopup(reference).catch((err) => ({
        ok: false,
        reason: err.message,
      }));
    }
    const [fresh, wallet] = await Promise.all([
      getBoostWalletTopup(req.user.id, reference),
      getBoostWallet(req.user.id),
    ]);
    res.set("Cache-Control", "no-store");
    res.json({
      reference,
      status: fresh.status,
      amount: Number(fresh.amount),
      currency: fresh.currency,
      credit_usd: Number(fresh.credit_usd),
      created_at: fresh.created_at,
      completed_at: fresh.completed_at,
      balance_usd:
        reconciliation?.ok && reconciliation.balance_usd != null
          ? reconciliation.balance_usd
          : wallet.balance_usd,
      reconciled: Boolean(reconciliation?.reconciled),
    });
  })
);

router.post(
  "/orders",
  authRequired,
  smmOrderCreateLimiter,
  validate(smmOrderSchema),
  ah(async (req, res) => {
    const { service_id, quantity, client_info, payment_method, idempotency_key } = req.body;
    const userId = req.user.id;
    const info = client_info && typeof client_info === "object" ? { ...client_info } : {};

    let svc = null;
    let dbFailed = false;
    try {
      const serviceRows = await q(
        `SELECT s.id, s.name, s.price, s.currency, s.billing_unit, s.is_automated, s.is_campaign,
                s.limits, c.name AS category_name
         FROM smm_services s
         JOIN smm_categories c ON c.id = s.category_id
         WHERE s.id = $1
           AND s.status = 'active'
           AND c.is_active = TRUE
           AND s.price <= ${SMM_MAX_PUBLIC_PRICE_XAF}`,
        [service_id]
      );
      if (serviceRows.length) {
        svc = serviceRows[0];
      }
    } catch {
      dbFailed = true;
    }
    if (!svc) {
      if (dbFailed) svc = DEFAULT_SERVICES.find((s) => s.id === service_id);
      if (!svc) {
        return res.status(404).json({ error: "Service introuvable ou inactif" });
      }
    }

    const qty = Number(quantity || 1);
    // Quantité libre : minimum 1, maximum illimité (quel que soit le service).
    const minQty = 1;
    const maxQty = Infinity;

    // Quantité minimale de commande désactivée : la quantité est libre (min 1, max infini).
    const minimumQuantity = 1;

    if (svc.is_automated && !String(info.profile_url || info.link || "").trim()) {
      return res.status(400).json({
        error: "Le lien ou compte cible est requis pour ce service.",
      });
    }
    if (!String(info.name || "").trim() && !userId) {
      return res.status(400).json({ error: "Votre nom est requis." });
    }
    if (!String(info.phone || "").trim() && !userId) {
      return res.status(400).json({ error: "Votre numéro de téléphone est requis." });
    }
    if (!info.name && req.user?.name) info.name = req.user.name;
    if (!info.email && req.user?.email) info.email = req.user.email;
    if (!info.phone && req.user?.phone) info.phone = req.user.phone;
    const infoEmail = String(info.email || "").trim().toLowerCase();
    if (!infoEmail) {
      return res.status(400).json({ error: "Votre adresse e-mail est requise pour le suivi." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(infoEmail)) {
      return res.status(400).json({ error: "L'adresse e-mail saisie n'est pas valide." });
    }
    info.email = infoEmail;

    const unitPrice = Number(svc.price);
    const billingUnit = smmBillingUnit(svc.billing_unit);
    const total = computeSmmTotal(unitPrice, qty, billingUnit);
    const idemKey = idempotency_key || generateIdempotencyKey();
    if (payment_method !== "wallet") {
      return res.status(400).json({
        error:
          "Les commandes MboppiBoost se paient uniquement avec votre portefeuille Boost. Rechargez votre solde avant de commander.",
        code: "WALLET_ONLY",
        topup_url: "/mboppi-boost/portefeuille",
      });
    }
    if (idempotency_key) {
      const existing = await q(
        `SELECT id, status, public_token FROM smm_orders WHERE idempotency_key = $1`,
        [idempotency_key]
      );
      if (existing.length) {
        return res.status(409).json({
          error: "Une commande avec cette référence existe déjà",
          order_id: existing[0].id,
          public_token: existing[0].public_token,
          status: existing[0].status,
        });
      }
    }

    const publicToken = generatePublicToken();

    if (payment_method === "wallet") {
      const ratesPayload = await getUsdRates();
      const walletDebitUsd = convertAmount(total, svc.currency, "USD", ratesPayload.rates);
      if (!(walletDebitUsd > 0)) {
        return res.status(400).json({
          error: "Le montant de cette commande ne peut pas être payé avec le portefeuille.",
          code: "INVALID_WALLET_AMOUNT",
        });
      }
      let createdWalletOrder;
      try {
        createdWalletOrder = await withTransaction(async (tx) => {
          const [order] = await tx.query(
            `INSERT INTO smm_orders
              (user_id, service_id, service_name, service_price, currency, quantity,
               total, billing_unit, client_info, status, payment_status, payment_method,
               payment_provider, idempotency_key, public_token, paid_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'paid', 'paid', 'wallet',
                     'boost_wallet', $10, $11, now(), now(), now())
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
              JSON.stringify(info),
              idemKey,
              publicToken,
            ]
          );
          const debit = await debitBoostWalletTx(tx, {
            userId,
            amountUsd: walletDebitUsd,
            referenceType: "smm_order",
            referenceId: order.id,
            description: `Commande Boost #${order.id} — ${svc.name}`,
          });
          return { id: order.id, balance_usd: debit.balance_usd };
        });
      } catch (err) {
        if (err?.statusCode) {
          return res.status(err.statusCode).json({
            error: err.message,
            code: err.code,
            ...(err.details || {}),
          });
        }
        throw err;
      }

      await addEvent(
        createdWalletOrder.id,
        "created",
        null,
        "paid",
        `Commande créée — payée avec le solde Boost (${walletDebitUsd} USD)`,
        { payment_method: "wallet", debit_usd: walletDebitUsd }
      ).catch(() => {});

      notifyAdmins({
        title: "Commande MboppiBoost payée par wallet",
        body: `Commande #${createdWalletOrder.id} — ${svc.name} — ${total} ${svc.currency} (${walletDebitUsd} USD)`,
        amount: total,
      }).catch(() => {});
      notifySmmUser(
        userId,
        "Commande MboppiBoost payée",
        `Votre commande #${createdWalletOrder.id} (${svc.name}) a été payée avec votre portefeuille Boost (${walletDebitUsd} USD).`,
        { orderId: createdWalletOrder.id }
      ).catch(() => {});

      const dispatch = await dispatchSmmOrderNow(createdWalletOrder.id).catch((err) => ({
        ok: false,
        error: err.message,
      }));
      if (!dispatch.ok && !dispatch.already_in_progress) {
        console.warn(
          `[smm wallet] commande #${createdWalletOrder.id} payée mais non transmise :`,
          dispatch.error
        );
      }
      const finalStatus = (
        await q(`SELECT status FROM smm_orders WHERE id = $1`, [createdWalletOrder.id])
      )[0]?.status || "paid";

      return res.status(201).json({
        ok: true,
        order_id: createdWalletOrder.id,
        public_token: publicToken,
        status: finalStatus,
        paid: true,
        payment_status: "paid",
        service: svc.name,
        unit_price: unitPrice,
        quantity: qty,
        total,
        currency: svc.currency,
        billing_unit: billingUnit,
        minimum_quantity: minimumQuantity,
        minimum_total: SMM_MIN_ORDER_TOTAL_XAF,
        payment_method: "wallet",
        payment_provider: "boost_wallet",
        online_payment: { online: false, paid_with_wallet: true },
        checkout_url: null,
        payment_reference: null,
        payment_info: null,
        wallet_debit_usd: walletDebitUsd,
        wallet_balance_after_usd: createdWalletOrder.balance_usd,
        dispatched: Boolean(dispatch.ok),
        message: "Commande payée avec votre portefeuille Boost. Le traitement démarre immédiatement.",
      });
    }

  })
);

﻿/* GET /api/smm/orders — mes commandes (auth requise) */
router.get(
  "/orders",
  authRequired,
  ah(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const status = (req.query.status || "").toString().trim();
    const from = (req.query.from || "").toString().trim();
    const to = (req.query.to || "").toString().trim();
    const minTotal = (req.query.min_total || req.query.min_amount || "").toString().trim();
    const maxTotal = (req.query.max_total || req.query.max_amount || "").toString().trim();
    const sort = (req.query.sort || "date_desc").toString().trim();
    const cursorRaw = (req.query.cursor || "").toString().trim();

    const where = ["o.user_id = $1"];
    const params = [req.user.id];
    const add = (sql, val) => { params.push(val); where.push(sql.replace("?", `$${params.length}`)); };

    if (status && status !== "all") add("o.status = ?", status);
    if (from) add("o.created_at >= ?::timestamptz", from);
    if (to) {
      const toVal = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to} 23:59:59.999` : to;
      add("o.created_at <= ?::timestamptz", toVal);
    }
    if (minTotal && !isNaN(Number(minTotal))) add("o.total >= ?", Number(minTotal));
    if (maxTotal && !isNaN(Number(maxTotal))) add("o.total <= ?", Number(maxTotal));

    let useCursor = false;
    let cursorTs = null;
    let cursorId = null;
    if (cursorRaw) {
      try {
        const decoded = Buffer.from(cursorRaw, "base64").toString("utf8");
        const parts = decoded.split("|");
        if (parts.length === 2) {
          cursorTs = parts[0];
          cursorId = Number(parts[1]);
          if (Number.isFinite(cursorId)) useCursor = true;
        }
      } catch {}
    }
    if (useCursor) {
      params.push(cursorTs, cursorId);
      const tsIdx = params.length - 1;
      const idIdx = params.length;
      where.push(`(o.created_at < $${tsIdx}::timestamptz OR (o.created_at = $${tsIdx}::timestamptz AND o.id < $${idIdx}))`);
    }

    const orderBy =
      sort === "date_asc" ? "o.created_at ASC, o.id ASC" :
      sort === "total_desc" ? "o.total DESC, o.id DESC" :
      sort === "total_asc" ? "o.total ASC, o.id ASC" :
      "o.created_at DESC, o.id DESC";

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const countParams = [req.user.id];
    const countWhere = ["o.user_id = $1"];
    const addC = (sql, val) => { countParams.push(val); countWhere.push(sql.replace("?", `$${countParams.length}`)); };
    if (status && status !== "all") addC("o.status = ?", status);
    if (from) addC("o.created_at >= ?::timestamptz", from);
    if (to) {
      const toVal = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to} 23:59:59.999` : to;
      addC("o.created_at <= ?::timestamptz", toVal);
    }
    if (minTotal && !isNaN(Number(minTotal))) addC("o.total >= ?", Number(minTotal));
    if (maxTotal && !isNaN(Number(maxTotal))) addC("o.total <= ?", Number(maxTotal));
    const countRows = await q(`SELECT COUNT(*)::int AS c FROM smm_orders o ${countWhere.length ? "WHERE " + countWhere.join(" AND ") : ""}`, countParams);
    const total = countRows[0]?.c || 0;

    const fetchLimit = limit + 1;
    const mainParams = [...params];
    let paginationSql = `LIMIT $${mainParams.length + 1}`;
    mainParams.push(fetchLimit);
    if (!useCursor) {
      mainParams.push(offset);
      paginationSql += ` OFFSET $${mainParams.length}`;
    }

    const rows = await q(
      `SELECT o.id, o.service_id, o.service_name, o.service_price, o.currency,
              o.quantity, o.total, o.billing_unit, o.status, o.payment_status,
              o.provider_status, o.external_reference, o.payment_method,
              o.payment_provider, o.payment_external_reference, o.paid_at,
              o.created_at, o.updated_at, o.completed_at,
              c.name AS category_name
       FROM smm_orders o
       LEFT JOIN smm_services s ON s.id = o.service_id
       LEFT JOIN smm_categories c ON c.id = s.category_id
       ${whereSql}
       ORDER BY ${orderBy}
       ${paginationSql}`,
      mainParams
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    let nextCursor = null;
    if (hasMore && pageRows.length) {
      const last = pageRows[pageRows.length - 1];
      nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString("base64");
    }

    res.json({ orders: pageRows, limit, offset: useCursor ? null : offset, total, has_more: hasMore, next_cursor: nextCursor });
  })
);


/* POST /api/smm/orders/sync-mine */
router.post(
  "/orders/sync-mine",
  authRequired,
  ah(async (req, res) => {
    const userId = req.user.id;
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 50);
    try {
      const { syncSmmOrders } = await import("../services/smmFulfillment.js");
      const result = await syncSmmOrders(limit, userId);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || "sync_failed" });
    }
  })
);
/* GET /api/smm/orders/:id — détail d'une commande (propriétaire ou token invité) */
router.get(
  "/orders/:id",
  authOptional,
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
       WHERE o.id = $1`,
      [id]
    );
    if (!rows.length || !canAccessSmmOrder(req, rows[0])) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    const order = { ...rows[0] };
    const isOwner = !!(req?.user?.id && order.user_id && Number(req.user.id) === Number(order.user_id));
    const isAdmin = req?.user?.role === "admin";
    if (isOwner || isAdmin) order.tracking_token = rows[0].public_token;
    delete order.public_token;
    const events = await q(
      `SELECT event_type, old_status, new_status, message, created_at, provider_payload
       FROM smm_order_events
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    const TERMINAL = new Set(["completed", "failed", "cancelled", "refunded", "refund_pending"]);
    let terminalEvent = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      const status = ev.new_status || ev.event_type;
      if (TERMINAL.has(status) || TERMINAL.has(ev.event_type)) {
        terminalEvent = ev;
        break;
      }
    }
    let remains = null;
    let charge = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const p = events[i].provider_payload || {};
      if (remains === null && p.remains !== undefined && p.remains !== null) remains = p.remains;
      if (charge === null && p.charge !== undefined && p.charge !== null) charge = p.charge;
      if (remains !== null && charge !== null) break;
    }
    const finalOutcome = {
      status: terminalEvent
        ? (terminalEvent.new_status || terminalEvent.event_type)
        : order.status,
      remains,
      charge,
      completed_at: order.completed_at || null,
      is_terminal: TERMINAL.has(order.status) || !!terminalEvent,
    };

    res.json({ order, events, final_outcome: finalOutcome });
  })
);

/* POST /api/smm/orders/:id/payment — déclarer un paiement (propriétaire ou token invité) */
router.post(
  "/orders/:id/checkout",
  authOptional,
  smmOrderCheckoutLimiter,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID de commande invalide" });
    }
    const rows = await q(
      `SELECT id, user_id, status, payment_status FROM smm_orders WHERE id = $1`,
      [id]
    );
    if (!rows.length || !canAccessSmmOrder(req, rows[0])) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    if (rows[0].payment_status === "paid" || rows[0].status !== "pending_payment") {
      return res.status(409).json({
        error: "Cette commande n'attend plus de paiement.",
        status: rows[0].status,
      });
    }
    const checkout = await buildSmmCheckout(id);
    if (!checkout.online) {
      return res.status(200).json({
        ok: true,
        online: false,
        payment_info: await getSmmPaymentInfo(),
      });
    }
    res.json({ ok: true, online: true, ...checkout });
  })
);

router.get(
  "/orders/:id/payment-status",
  authOptional,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID de commande invalide" });
    }
    const rows = await q(`SELECT * FROM smm_orders WHERE id = $1`, [id]);
    if (!rows.length || !canAccessSmmOrder(req, rows[0])) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    let order = rows[0];
    let reconciled = null;
    if (
      order.payment_status !== "paid" &&
      ["pending_payment", "cancelled", "failed"].includes(order.status)
    ) {
      reconciled = await reconcileSmmOrderPayment(id).catch(() => null);
      if (reconciled?.ok) {
        order = (await q(`SELECT * FROM smm_orders WHERE id = $1`, [id]))[0] || order;
      }
    }
    const settled = order.payment_status === "paid" ||
      ["paid", "submitted", "processing", "completed", "refund_pending", "refunded"].includes(order.status);
    res.json({
      ok: true,
      order_id: id,
      status: order.status,
      payment_status: order.payment_status,
      paid: settled,
      reconciled: Boolean(reconciled?.reconciled),
    });
  })
);

router.post(
  "/orders/:id/payment",
  authOptional,
  validate(smmPaymentDeclareSchema),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID de commande invalide" });
    }
    const rows = await q(`SELECT * FROM smm_orders WHERE id = $1`, [id]);
    if (!rows.length || !canAccessSmmOrder(req, rows[0])) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    const order = rows[0];
    if (!["draft", "pending_payment"].includes(order.status)) {
      return res.status(409).json({
        error:
          order.status === "paid" || order.status === "submitted"
            ? "Le paiement de cette commande est déjà pris en compte."
            : "Cette commande ne peut plus recevoir de paiement.",
        status: order.status,
      });
    }

    const phone = String(req.body.phone || "").trim();
    await q(
      `UPDATE smm_orders
       SET status = 'pending_payment', payment_status = 'declared',
           payment_reference = $1, payment_method = $2, payment_declared_at = now(),
           client_info = COALESCE(client_info, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       WHERE id = $4`,
      [
        req.body.payment_reference,
        req.body.payment_method,
        JSON.stringify(phone ? { phone } : {}),
        id,
      ]
    );
    await addEvent(
      id,
      "payment_declared",
      order.status,
      "pending_payment",
      `Paiement déclaré (réf. ${req.body.payment_reference})`,
      { method: req.body.payment_method }
    );
    notifyAdmins({
      title: "Paiement MboppiBoost à vérifier",
      body: `Commande #${id} — ${order.service_name} — ${order.total} ${order.currency}`,
      amount: Number(order.total),
    }).catch(() => {});

    res.json({
      ok: true,
      order_id: id,
      status: "pending_payment",
      message: "Paiement déclaré. Notre équipe le vérifie puis transmet la commande au prestataire.",
    });
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
      const created = (await q(
        `INSERT INTO smm_categories (name, slug, description, icon, sort_order, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         RETURNING id, name, slug, description, icon, sort_order, is_active, created_at`,
        [name, slug, description || null, icon || null, sort_order, is_active]
      ))[0];
      res.status(201).json({ category: created });
      logAudit(req.user.id, "smm.category_created", `#${created.id} ${name}`, req.ip);
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
logAudit(req.user.id, "smm.category_updated", `#${id} ${name}`, req.ip);
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
    logAudit(req.user.id, "smm.category_deleted", `#${id}`, req.ip);
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
      const created = (await q(
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
      ))[0];
logAudit(req.user.id, "smm.service_created", `#${created.id} ${name || ""}`, req.ip);
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
    logAudit(req.user.id, "smm.service_updated", `#${id}`, req.ip);
    res.json({ service_id: updated[0].id });
  })
);

router.patch(
  "/admin/services/:id",
  authRequired,
  roleRequired("admin"),
  validate(smmServiceUpdateSchema),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID invalide" });
    }
    const fields = req.body || {};
    const allowed = [
      "category_id",
      "name",
      "description",
      "short_description",
      "price",
      "currency",
      "billing_unit",
      "status",
      "is_automated",
      "is_consulting",
      "is_campaign",
      "external_service_id",
      "delivery_days",
      "conditions",
      "limits",
      "sort_order",
    ];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        sets.push(`${key} = $${idx++}`);
        values.push(key === "limits" ? JSON.stringify(fields[key] || {}) : fields[key]);
      }
    }
    if (!sets.length) {
      return res.status(400).json({ error: "Aucun champ à mettre à jour" });
    }
    sets.push("updated_at = now()");
    values.push(id);
    const updated = await q(
      `UPDATE smm_services SET ${sets.join(", ")} WHERE id = $${idx} RETURNING id`,
      values
    );
    if (!updated.length) {
      return res.status(404).json({ error: "Service introuvable" });
    }
    logAudit(req.user.id, "smm.service_updated", `#${id}`, req.ip);
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
    try {
      const deleted = await q(`DELETE FROM smm_services WHERE id = $1 RETURNING id`, [id]);
      if (!deleted.length) {
        return res.status(404).json({ error: "Service introuvable" });
      }
      logAudit(req.user.id, "smm.service_deleted", `#${id}`, req.ip);
      res.json({ ok: true });
    } catch (err) {
      if (err.code === "23503") {
        return res.status(409).json({ error: "Impossible : des commandes utilisent ce service" });
      }
      throw err;
    }
  })
);

/* GET /api/admin/smm/wallet/:userId — portefeuille Boost d'un utilisateur */
router.get(
  "/admin/wallet/:userId",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: "Utilisateur invalide." });
    }
    const [user] = await q(
      `SELECT id, name, email, phone, role FROM users WHERE id = $1`,
      [userId]
    );
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
    const wallet = await getBoostWalletSummary(userId, 100);
    res.set("Cache-Control", "no-store");
    res.json({ user, wallet });
  })
);

/* POST /api/admin/smm/wallet/credit — créditer ou rembourser un portefeuille */
router.post(
  "/admin/wallet/credit",
  authRequired,
  roleRequired("admin"),
  validate(boostAdminWalletCreditSchema),
  ah(async (req, res) => {
    const { user_id, amount_usd, note, transaction_type } = req.body;
    const result = await adminCreditBoostWallet({
      userId: Number(user_id),
      amountUsd: Number(amount_usd),
      note: note || null,
      createdBy: req.user.id > 0 ? req.user.id : null,
      transactionType: transaction_type,
    });
    await notifySmmUser(
      Number(user_id),
      transaction_type === "refund" ? "Remboursement Boost reçu" : "Crédit Boost reçu",
      `${Number(amount_usd)} USD ont été ajoutés à votre portefeuille Boost.`,
      { orderId: null }
    ).catch(() => {});
    logAudit(req.user.id, "smm.wallet_credited", `user #${user_id} ${amount_usd} USD (${transaction_type})`, req.ip);
    res.status(201).json({
      balance_usd: result.balance_usd,
      transaction: result.transaction,
    });
  })
);

﻿/* GET /api/admin/smm/stats — tableau de bord MboppiBoost (admin) */
router.get(
  "/admin/stats",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let usdToXaf = 655.957;
    try {
      const settingsRows = await q(`SELECT value FROM platform_settings WHERE key = 'smm_usd_to_xaf'`);
      const v = Number(settingsRows?.[0]?.value);
      if (Number.isFinite(v) && v > 0) usdToXaf = v;
    } catch {}

    let rates = null;
    try {
      const payload = await getUsdRates();
      rates = payload?.rates || null;
    } catch {}

    const toUsd = (amount, currency) => {
      const cur = normalizeCurrency(currency || "XAF");
      const val = Number(amount) || 0;
      if (cur === "USD") return val;
      if (cur === "XAF" || cur === "XOF") return val / usdToXaf;
      try {
        return convertAmount(val, cur, "USD", rates || {});
      } catch {
        return 0;
      }
    };

    const statusRows = await q(`SELECT status, COUNT(*)::int AS c FROM smm_orders GROUP BY status`);
    const byStatus = {};
    let totalOrders = 0;
    for (const r of statusRows || []) {
      byStatus[r.status] = Number(r.c) || 0;
      totalOrders += Number(r.c) || 0;
    }

    const revRows = await q(
      `SELECT currency, COALESCE(SUM(total), 0)::numeric AS s
         FROM smm_orders
        WHERE status NOT IN ('draft', 'cancelled', 'refund_pending', 'refunded')
        GROUP BY currency`
    );
    let revenueUsd = 0;
    for (const r of revRows || []) revenueUsd += toUsd(r.s, r.currency);

    const completed = byStatus.completed || 0;
    const failed = byStatus.failed || 0;
    const cancelled = byStatus.cancelled || 0;
    const denom = completed + failed + cancelled;
    const successRate = denom > 0 ? completed / denom : 0;

    const topRows = await q(
      `SELECT service_name, COUNT(*)::int AS c, COALESCE(SUM(total), 0)::numeric AS revenue, currency
         FROM smm_orders
        GROUP BY service_name, currency
        ORDER BY c DESC
        LIMIT 50`
    );
    const topMap = new Map();
    for (const r of topRows || []) {
      const name = r.service_name || "—";
      const entry = topMap.get(name) || { service_name: name, count: 0, revenue_usd: 0 };
      entry.count += Number(r.c) || 0;
      entry.revenue_usd += toUsd(r.revenue, r.currency);
      topMap.set(name, entry);
    }
    const topServices = Array.from(topMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((s) => ({ service_name: s.service_name, count: s.count, revenue_usd: Math.round(s.revenue_usd * 100) / 100 }));

    const dailyRows = await q(
      `SELECT date_trunc('day', created_at)::date AS d,
              COUNT(*)::int AS c,
              COALESCE(SUM(total), 0)::numeric AS revenue,
              currency
         FROM smm_orders
        WHERE created_at >= $1::timestamptz
        GROUP BY d, currency
        ORDER BY d`,
      [since]
    );
    const dailyMap = new Map();
    for (const r of dailyRows || []) {
      const key = String(r.d).slice(0, 10);
      const entry = dailyMap.get(key) || { date: key, count: 0, revenue_usd: 0 };
      entry.count += Number(r.c) || 0;
      entry.revenue_usd += toUsd(r.revenue, r.currency);
      dailyMap.set(key, entry);
    }
    const daily = [];
    const cursor = new Date(since);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    for (let d = new Date(cursor); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const e = dailyMap.get(key) || { date: key, count: 0, revenue_usd: 0 };
      daily.push({ date: key, count: e.count, revenue_usd: Math.round(e.revenue_usd * 100) / 100 });
    }

    let periodRevenueUsd = 0;
    for (const e of daily) periodRevenueUsd += e.revenue_usd;

    const paidRows = await q(
      `SELECT COUNT(*)::int AS c FROM smm_orders WHERE payment_status = 'paid' AND created_at >= $1::timestamptz`,
      [since]
    );
    const paidCount = Number(paidRows?.[0]?.c) || 0;

    res.json({
      ok: true,
      days,
      total_orders: totalOrders,
      by_status: byStatus,
      revenue_usd: Math.round(revenueUsd * 100) / 100,
      period_revenue_usd: Math.round(periodRevenueUsd * 100) / 100,
      success_rate: Math.round(successRate * 1000) / 1000,
      paid_count: paidCount,
      top_services: topServices,
      daily,
    });
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
    const status = (req.query.status || "").toString().trim();
    const qterm = (req.query.q || "").toString().trim();
    const from = (req.query.from || "").toString().trim();
    const to = (req.query.to || "").toString().trim();
    const cursorRaw = (req.query.cursor || "").toString().trim();

    const where = [];
    const params = [];
    const add = (sql, val) => { params.push(val); where.push(sql.replace("?", `$${params.length}`)); };

    if (status && status !== "all") {
      add("o.status = ?", status);
    }
    if (qterm) {
      const like = `%${qterm}%`;
      const base = params.length;
      params.push(like, like, like, like, like, like, like);
      where.push(
        `(o.id::text ILIKE $${base + 1} OR o.external_reference ILIKE $${base + 2} OR o.payment_reference ILIKE $${base + 3} OR o.payment_external_reference ILIKE $${base + 4} OR o.service_name ILIKE $${base + 5} OR u.name ILIKE $${base + 6} OR u.email ILIKE $${base + 7})`
      );
    }
    if (from) {
      add("o.created_at >= ?::timestamptz", from);
    }
    if (to) {
      const toVal = /^\\d{4}-\\d{2}-\\d{2}$/.test(to) ? `${to} 23:59:59.999` : to;
      add("o.created_at <= ?::timestamptz", toVal);
    }

    let useCursor = false;
    let cursorTs = null;
    let cursorId = null;
    if (cursorRaw) {
      try {
        const decoded = Buffer.from(cursorRaw, "base64").toString("utf8");
        const parts = decoded.split("|");
        if (parts.length === 2) {
          cursorTs = parts[0];
          cursorId = Number(parts[1]);
          if (Number.isFinite(cursorId)) useCursor = true;
        }
      } catch {}
    }
    if (useCursor) {
      params.push(cursorTs, cursorId);
      const tsIdx = params.length - 1;
      const idIdx = params.length;
      where.push(`(o.created_at < $${tsIdx}::timestamptz OR (o.created_at = $${tsIdx}::timestamptz AND o.id < $${idIdx}))`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const cp = [];
    const cw = [];
    const addC2 = (sql, val) => { cp.push(val); cw.push(sql.replace("?", `$${cp.length}`)); };
    if (status && status !== "all") addC2("o.status = ?", status);
    if (qterm) {
      const like = `%${qterm}%`;
      const base = cp.length;
      cp.push(like, like, like, like, like, like, like);
      cw.push(`(o.id::text ILIKE $${base + 1} OR o.external_reference ILIKE $${base + 2} OR o.payment_reference ILIKE $${base + 3} OR o.payment_external_reference ILIKE $${base + 4} OR o.service_name ILIKE $${base + 5} OR u.name ILIKE $${base + 6} OR u.email ILIKE $${base + 7})`);
    }
    if (from) addC2("o.created_at >= ?::timestamptz", from);
    if (to) {
      const toVal = /^\\d{4}-\\d{2}-\\d{2}$/.test(to) ? `${to} 23:59:59.999` : to;
      addC2("o.created_at <= ?::timestamptz", toVal);
    }
    const countRows = await q(`SELECT COUNT(*)::int AS c FROM smm_orders o LEFT JOIN users u ON u.id = o.user_id ${cw.length ? "WHERE " + cw.join(" AND ") : ""}`, cp);
    const total = countRows[0]?.c || 0;

    const fetchLimit = limit + 1;
    const mainParams = [...params];
    let paginationSql = `LIMIT $${mainParams.length + 1}`;
    mainParams.push(fetchLimit);
    if (!useCursor) {
      mainParams.push(offset);
      paginationSql += ` OFFSET $${mainParams.length}`;
    }

    const rows = await q(
      `SELECT o.id, o.user_id, u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
              o.service_id, o.service_name, o.service_price, o.currency, o.quantity,
              o.total, o.billing_unit, o.status, o.payment_status, o.provider_status,
              o.external_reference, o.provider_reference, o.payment_method,
              o.payment_reference, o.payment_declared_at, o.paid_at,
              o.payment_external_reference, o.payment_provider, o.payment_fallback_at,
              o.client_info, o.created_at, o.updated_at, o.completed_at
       FROM smm_orders o
       LEFT JOIN users u ON u.id = o.user_id
       ${whereSql}
       ORDER BY o.created_at DESC, o.id DESC
       ${paginationSql}`,
      mainParams
    );

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    let nextCursor = null;
    if (hasMore && pageRows.length) {
      const last = pageRows[pageRows.length - 1];
      nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString("base64");
    }

    res.json({
      orders: pageRows,
      limit,
      offset: useCursor ? null : offset,
      total,
      has_more: hasMore,
      next_cursor: nextCursor,
    });
  })
);

/* GET /api/admin/smm/orders/:id — détail complet d'une commande (admin) : commande, timeline, résultat final */
router.get(
  "/admin/orders/:id",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID de commande invalide" });
    }
    const rows = await q(
      `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
              c.name AS category_name
       FROM smm_orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN smm_services s ON s.id = o.service_id
       LEFT JOIN smm_categories c ON c.id = s.category_id
       WHERE o.id = $1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    const order = { ...rows[0] };
    delete order.public_token;

    const events = await q(
      `SELECT id, event_type, old_status, new_status, message, provider_payload, created_at
       FROM smm_order_events
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    // Résultat final : dernier événement terminal + payload fournisseur consolidé.
    const TERMINAL = new Set(["completed", "failed", "cancelled", "refunded", "refund_pending"]);
    let terminalEvent = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      const status = ev.new_status || ev.event_type;
      if (TERMINAL.has(status) || TERMINAL.has(ev.event_type)) {
        terminalEvent = ev;
        break;
      }
    }
    // Consolidation du payload fournisseur (remains, charge) : dernier événement qui les porte.
    let remains = null;
    let charge = null;
    let providerStatus = order.provider_status || null;
    for (let i = events.length - 1; i >= 0; i--) {
      const p = events[i].provider_payload || {};
      if (remains === null && p.remains !== undefined && p.remains !== null) remains = p.remains;
      if (charge === null && p.charge !== undefined && p.charge !== null) charge = p.charge;
      if (remains !== null && charge !== null) break;
    }

    const finalOutcome = {
      status: terminalEvent
        ? (terminalEvent.new_status || terminalEvent.event_type)
        : order.status,
      terminal_event: terminalEvent || null,
      remains,
      charge,
      provider_status: providerStatus,
      completed_at: order.completed_at || null,
      is_terminal: TERMINAL.has(order.status) || !!terminalEvent,
    };

    res.json({ order, events, final_outcome: finalOutcome });
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
       SET status = $1, provider_status = COALESCE($2, provider_status),
           provider_reference = COALESCE($3, provider_reference),
           payment_status = CASE
             WHEN $1 = 'paid' THEN 'paid'
             WHEN $1 = 'refund_pending' THEN 'refund_pending'
             WHEN $1 = 'refunded' THEN 'refunded'
             ELSE payment_status
           END,
           paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
           updated_at = now(),
           completed_at = CASE WHEN $1 IN ('completed','refunded','cancelled')
                               THEN COALESCE(completed_at, now()) ELSE completed_at END
       WHERE id = $4
       RETURNING id, status`,
      [status, provider_status || null, provider_reference || null, id]
    );

    await addEvent(
      id,
      "status_change",
      oldStatus,
      status,
      admin_note || `Statut changé de ${oldStatus} vers ${status}`,
      { provider_status, provider_reference }
    );

    if (oldStatus !== status) {
      const labels = {
        paid: "paiement confirmé",
        submitted: "transmise au prestataire",
        processing: "en cours de traitement",
        completed: "terminée",
        failed: "échouée",
        cancelled: "annulée",
        refund_pending: "remboursement en attente",
        refunded: "remboursée",
      };
      const label = labels[status] || status;
      await notifySmmUser(
        orderRows[0].user_id,
        status === "completed" ? "Commande MboppiBoost terminée" : "Mise à jour de votre commande MboppiBoost",
        `Votre commande #${id} (${orderRows[0].service_name}) est ${label}.`,
        { orderId: id }
      );
    }

    if (status === "completed") {
      notifyAdmins({
        title: "Commande MboppiBoost terminée ✅",
        body: `Commande #${id} — ${orderRows[0].service_name} — ${orderRows[0].total} ${orderRows[0].currency}`,
        amount: Number(orderRows[0].total),
      }).catch(() => {});
    }

    logAudit(req.user.id, "smm.order_status_changed", `#${id} ${oldStatus} -> ${status}`, req.ip);
    res.json({ order_id: updated[0].id, status: updated[0].status });
  })
);

/* POST /api/admin/smm/orders/:id/confirm-payment — valider le paiement + dispatch */
router.post(
  "/admin/orders/:id/confirm-payment",
  authRequired,
  roleRequired("admin"),
  validate(smmPaymentConfirmSchema),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID invalide" });
    }
    const rows = await q(
      `SELECT id, user_id, service_name, total, currency, status, payment_reference FROM smm_orders WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Commande introuvable" });
    const order = rows[0];
    if (["cancelled", "refunded", "failed"].includes(order.status)) {
      return res.status(409).json({ error: `Commande ${order.status} : paiement impossible.` });
    }

    const payment = await completeSmmPayment(
      id,
      req.body.payment_reference || null,
      req.body.admin_note || "Paiement confirmé par l'administration"
    );
    if (!payment.ok) {
      return res.status(409).json({
        error: "Le paiement de cette commande ne peut plus être confirmé.",
        status: payment.order?.status || order.status,
      });
    }

    let dispatch = null;
    if (req.body.dispatch !== false) {
      dispatch = await dispatchSmmOrderNow(id);
    }

    const finalRows = await q(`SELECT status, provider_status, external_reference FROM smm_orders WHERE id = $1`, [
      id,
    ]);

    logAudit(req.user.id, "smm.order_payment_confirmed", `#${id}`, req.ip);
    res.json({
      ok: true,
      order_id: id,
      status: finalRows[0]?.status || "paid",
      provider_status: finalRows[0]?.provider_status || null,
      external_reference: finalRows[0]?.external_reference || null,
      dispatch,
    });
  })
);

/* POST /api/admin/smm/orders/:id/dispatch — (re)transmettre au fournisseur */
router.post(
  "/admin/orders/:id/dispatch",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalide" });
    const rows = await q(`SELECT id, status, payment_status, user_id, service_name FROM smm_orders WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: "Commande introuvable" });
    const order = rows[0];
    if (!["paid", "submitted", "processing", "failed", "cancelled"].includes(order.status)) {
      return res.status(409).json({
        error: "Confirmez d'abord le paiement avant de transmettre la commande.",
        status: order.status,
      });
    }
    if (order.payment_status !== "paid") {
      return res.status(409).json({ error: "Le paiement de cette commande n'est pas confirmé.", status: order.status });
    }
    if (["failed", "cancelled"].includes(order.status)) {
      await q(
        `UPDATE smm_orders
            SET status = 'paid', provider_status = NULL, external_reference = NULL,
                provider_reference = NULL, updated_at = now()
          WHERE id = $1`,
        [id]
      );
      await addEvent(id, "retry_dispatch", order.status, "paid", "Réessai de transmission demandé par l'administration", {}).catch(() => {});
    }
    const result = await dispatchSmmOrder(id);
    if (!result.ok) {
      return res.status(502).json({ error: result.error, order_id: id });
    }
    logAudit(req.user.id, "smm.order_dispatched", `#${id}`, req.ip);
    res.json({ ok: true, order_id: id, ...result });
  })
);
/* POST /api/admin/smm/orders/:id/refund — remboursement atomique (wallet + statut + événement + audit + notifs) */
router.post(
  "/admin/orders/:id/refund",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalide" });

    const amountUsdRaw = req.body?.amount_usd;
    const note = String(req.body?.note || "").trim().slice(0, 300) || null;
    const forceAmount = amountUsdRaw !== undefined && amountUsdRaw !== null && amountUsdRaw !== "";

    const orderRows = await q(
      `SELECT id, user_id, service_name, total, currency, status, payment_method, payment_status FROM smm_orders WHERE id = $1`,
      [id]
    );
    if (!orderRows.length) return res.status(404).json({ error: "Commande introuvable" });
    const order = orderRows[0];

    if (!order.user_id) {
      return res.status(409).json({ error: "Commande sans utilisateur : remboursement manuel hors plateforme." });
    }
    if (["refunded", "cancelled"].includes(order.status)) {
      return res.status(409).json({ error: `Commande déjà ${order.status}.` });
    }

    // Montant USD à créditer : override explicite ou montant débité à l'origine.
    let refundUsd = null;
    if (forceAmount) {
      const n = Number(amountUsdRaw);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: "Montant de remboursement invalide." });
      }
      refundUsd = n;
    } else {
      const debitRows = await q(
        `SELECT amount_usd FROM boost_wallet_transactions
          WHERE reference_type = 'smm_order' AND reference_id = $1 AND transaction_type = 'order_payment'
          ORDER BY id DESC LIMIT 1`,
        [id]
      );
      if (debitRows.length) {
        refundUsd = Number(debitRows[0].amount_usd);
      }
    }

    const result = await withTransaction(async (tx) => {
      // 1. Crédit wallet (si montant disponible)
      let credit = null;
      if (refundUsd && refundUsd > 0) {
        credit = await creditBoostWalletTx(tx, {
          userId: Number(order.user_id),
          amountUsd: refundUsd,
          transactionType: "refund",
          referenceType: "smm_order_refund",
          referenceId: id,
          description: note || `Remboursement commande Boost #${id} — ${order.service_name}`,
          createdBy: req.user.id > 0 ? req.user.id : null,
        });
      }
      // 2. Statut commande (garde atomique contre les remboursements concurrents)
      const updated = await tx.query(
        `UPDATE smm_orders
            SET status = 'refunded', payment_status = 'refunded', updated_at = now(),
                completed_at = COALESCE(completed_at, now())
          WHERE id = $1 AND status NOT IN ('refunded', 'cancelled')
          RETURNING id, status`,
        [id]
      );
      if (!updated.length) {
        const err = new Error("Commande déjà remboursée ou annulée.");
        err.statusCode = 409;
        throw err;
      }
      return { credit, updated: updated[0] };
    });

    // 3. Événement
    await addEvent(
      id,
      "refund",
      order.status,
      "refunded",
      note || `Remboursement administrateur${refundUsd ? ` (${refundUsd} USD)` : ""}`,
      { amount_usd: refundUsd, note }
    ).catch(() => {});

    // 4. Audit
      logAudit(req.user.id, "smm.order_refunded", `#${id} ${order.service_name}${refundUsd ? ` (${refundUsd} USD)` : ""}`, req.ip);

    // 5. Notifications
    await notifySmmUser(
      Number(order.user_id),
      "Remboursement Boost reçu",
      `Votre commande #${id} (${order.service_name}) a été remboursée${refundUsd ? ` : ${refundUsd} USD crédités sur votre portefeuille Boost.` : "."}`,
      { orderId: id }
    ).catch(() => {});
    notifyAdmins({
      title: "Remboursement Boost effectué",
      body: `Commande #${id} — ${order.service_name} — ${refundUsd || 0} USD remboursés`,
      amount: refundUsd || 0,
    }).catch(() => {});

    res.json({
      ok: true,
      order_id: id,
      status: "refunded",
      refunded_usd: refundUsd,
      balance_usd: result.credit?.balance_usd ?? null,
    });
  })
);



/* POST /api/admin/smm/sync — synchroniser les statuts fournisseur */
router.post(
  "/admin/sync",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const limit = Number(req.body?.limit) || 20;
    const result = await syncSmmOrders(limit);
    if (!result.ok) return res.status(400).json({ error: result.error });
    logAudit(req.user.id, "smm.sync", `limit ${limit}`, req.ip);
    res.json(result);
  })
);

/* GET /api/admin/smm/payment-info — instructions de paiement Boost */
router.get(
  "/admin/payment-info",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    res.json({ payment_info: await getSmmPaymentInfo() });
  })
);

/* POST /api/admin/smm/payment-info — enregistrer les instructions de paiement */
router.post(
  "/admin/payment-info",
  authRequired,
  roleRequired("admin"),
  validate(smmPaymentInfoSchema),
  ah(async (req, res) => {
    const current = await getSmmPaymentInfo();
    const saved = await setSmmPaymentInfo({ ...current, ...req.body });
    logAudit(req.user.id, "smm.payment_info_updated", null, req.ip);
    res.json({ ok: true, payment_info: saved });
  })
);

/* GET /api/admin/smm/providers — config fournisseur (admin, secrets masqués) */
router.get(
  "/admin/providers",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const rows = await q(`SELECT key, value FROM platform_settings WHERE key LIKE 'smm_%'`);
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    const providerKey = settings["smm_provider_key"] || "";
    res.json({
      provider: providerKey || null,
      provider_key: providerKey,
      enabled: settings["smm_provider_enabled"] === "true" && !!providerKey,
      has_api_key: !!settings["smm_api_key"],
      config: {
        baseUrl: settings["smm_api_base_url"] || "",
        timeoutMs: Number(settings["smm_api_timeout"]) || 30000,
      },
      markup: Number(settings["smm_markup"]) || 1.5,
      usd_to_xaf: Number(settings["smm_usd_to_xaf"]) || 655.957,
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
      smm_markup,
      smm_usd_to_xaf,
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
    if (smm_markup !== undefined) await upsert("smm_markup", String(smm_markup));
    if (smm_usd_to_xaf !== undefined) await upsert("smm_usd_to_xaf", String(smm_usd_to_xaf));
    if (smm_api_key !== undefined) await upsert("smm_api_key", smm_api_key || "");

    logAudit(req.user.id, "smm.provider_configured", null, req.ip);
    res.json({ ok: true, message: "Configuration fournisseur enregistrée" });
  })
);

/* GET /api/admin/smm/balance — solde fournisseur (admin) */
router.get(
  "/admin/balance",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    try {
      const { adapter, provider } = await getActiveProviderConfig();
      if (provider !== "smm_africa" || !adapter) {
        return res.status(400).json({ error: "Fournisseur SMM Africa non actif" });
      }
      const bal = await adapter.fetchBalance();
      res.json({ ok: true, ...bal });
    } catch (err) {
      res.status(502).json({ error: err.message || "Erreur fournisseur" });
    }
  })
);

/* POST /api/admin/smm/import-catalog — importe le catalogue SMM Africa (admin) */
router.post(
  "/admin/import-catalog",
  authRequired,
  roleRequired("admin"),
  validate(smmImportCatalogSchema),
  ah(async (req, res) => {
    try {
      const { adapter, provider } = await getActiveProviderConfig();
      if (provider !== "smm_africa" || !adapter) {
        return res.status(400).json({ error: "Fournisseur SMM Africa non actif" });
      }
      const markup = Number(req.body?.markup) > 0 ? Number(req.body.markup) : 1;
      const usdToXaf = Number(req.body?.usd_to_xaf) > 0 ? Number(req.body.usd_to_xaf) : 655.957;
      const categoryId = req.body?.category_id ? Number(req.body.category_id) : null;
      const types = req.body?.types?.length ? req.body.types : ["default"];
      const limit = Number(req.body?.limit) || 0;
      const dryRun = req.body?.dry_run === true;
      const options = {
        markup,
        usdToXaf,
        categoryId,
        types,
        providerKey: provider,
        providerName: adapter.name || "SMM Africa",
      };

      const catalog = await adapter.fetchCatalog();
      const items = limit > 0 ? catalog.slice(0, limit) : catalog;
      const result = dryRun
        ? previewProviderCatalogImport(items, options)
        : await importProviderCatalog(items, options);

      if (!dryRun) logAudit(req.user.id, "smm.catalog_imported", `items=${items.length} markup=${markup}`, req.ip);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[smm import-catalog]", err.message);
      res.status(502).json({ error: err.message || "Erreur import catalogue" });
    }
  })
);

/* POST /api/smm/orders/:id/report — signaler un problème sur une commande (utilisateur) */
router.post(
  "/orders/:id/report",
  authRequired,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalide" });

    const rows = await q(`SELECT * FROM smm_orders WHERE id = $1`, [id]);
    if (!rows.length || !canAccessSmmOrder(req, rows[0])) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    const order = rows[0];

    if (!order.user_id || Number(order.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Action réservée au propriétaire de la commande." });
    }

    const note = String(req.body?.message || req.body?.note || "").trim().slice(0, 1000);
    const reporterName = String(req.user?.name || req.user?.email || `utilisateur #${req.user.id}`).trim();

    await addEvent(id, "problem_reported", order.status, order.status, note || "Problème signalé par l'utilisateur", {
      reporter_id: req.user.id,
      reporter_name: reporterName,
    }).catch(() => {});

    notifyAdmins({
      title: "Problème signalé — commande MboppiBoost",
      body: `${reporterName} signale un problème sur la commande #${id} (${order.service_name})${note ? ` — ${note.slice(0, 180)}` : ""}.`,
      url: "/admin",
      type: "smm_problem",
      amount: Number(order.total),
    }).catch(() => {});

    try {
      await logAudit(req.user.id, "smm.order_problem_reported", `#${id} ${order.service_name}${note ? ` — ${note.slice(0, 120)}` : ""}`, req.ip);
    } catch {}

    res.json({ ok: true, order_id: id });
  })
);

/* POST /api/smm/orders/:id/cancel — annulation par l'utilisateur (commande non transmise) + remboursement auto */
router.post(
  "/orders/:id/cancel",
  authRequired,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalide" });

    const rows = await q(`SELECT * FROM smm_orders WHERE id = $1`, [id]);
    if (!rows.length || !canAccessSmmOrder(req, rows[0])) {
      return res.status(404).json({ error: "Commande introuvable" });
    }
    const order = rows[0];

    if (!order.user_id || Number(order.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Action réservée au propriétaire de la commande." });
    }
    if (!["pending_payment", "paid"].includes(order.status)) {
      return res.status(409).json({
        error: "Cette commande ne peut plus être annulée.",
        status: order.status,
      });
    }
    if (order.external_reference) {
      return res.status(409).json({
        error: "Commande déjà transmise au fournisseur : annulation impossible.",
        status: order.status,
      });
    }

    let refundUsd = null;
    const debitRows = await q(
      `SELECT amount_usd FROM boost_wallet_transactions
        WHERE reference_type = 'smm_order' AND reference_id = $1 AND transaction_type = 'order_payment'
        ORDER BY id DESC LIMIT 1`,
      [id]
    );
    if (debitRows.length) refundUsd = Number(debitRows[0].amount_usd);

    const result = await withTransaction(async (tx) => {
      let credit = null;
      if (refundUsd && refundUsd > 0) {
        credit = await creditBoostWalletTx(tx, {
          userId: Number(order.user_id),
          amountUsd: refundUsd,
          transactionType: "refund",
          referenceType: "smm_order_refund",
          referenceId: id,
          description: `Annulation par l'utilisateur — commande Boost #${id} — ${order.service_name}`,
          createdBy: req.user.id > 0 ? req.user.id : null,
        });
      }
      const updated = await tx.query(
        `UPDATE smm_orders
            SET status = 'cancelled', payment_status = 'cancelled', updated_at = now(),
                completed_at = COALESCE(completed_at, now())
          WHERE id = $1 AND status IN ('pending_payment', 'paid') AND external_reference IS NULL
          RETURNING id, status`,
        [id]
      );
      if (!updated.length) {
        const err = new Error("Commande déjà annulée ou transmise.");
        err.statusCode = 409;
        throw err;
      }
      return { credit, updated: updated[0] };
    });

    await addEvent(
      id,
      "cancelled",
      order.status,
      "cancelled",
      "Annulation par l'utilisateur",
      { amount_usd: refundUsd }
    ).catch(() => {});

    await notifySmmUser(
      Number(order.user_id),
      "Commande MboppiBoost annulée",
      `Votre commande #${id} (${order.service_name}) a été annulée${refundUsd ? ` : ${refundUsd} USD remboursés sur votre portefeuille Boost.` : "."}`,
      { orderId: id }
    ).catch(() => {});

    res.json({
      ok: true,
      order_id: id,
      status: "cancelled",
      refunded_usd: refundUsd,
      balance_usd: result.credit?.balance_usd ?? null,
    });
  })
);

/* POST /api/admin/smm/orders/:id/cancel — annuler une commande payée non transmise + remboursement auto */
router.post(
  "/admin/orders/:id/cancel",
  authRequired,
  roleRequired("admin"),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalide" });

    const orderRows = await q(
      `SELECT id, user_id, service_name, total, currency, status, payment_status, external_reference FROM smm_orders WHERE id = $1`,
      [id]
    );
    if (!orderRows.length) return res.status(404).json({ error: "Commande introuvable" });
    const order = orderRows[0];

    if (order.external_reference) {
      return res.status(409).json({
        error: "Commande déjà transmise au fournisseur : utilisez le remboursement manuel.",
        status: order.status,
      });
    }
    if (order.status !== "paid") {
      return res.status(409).json({
        error: "Seules les commandes payées non transmises peuvent être annulées.",
        status: order.status,
      });
    }
    if (!order.user_id) {
      return res.status(409).json({ error: "Commande sans utilisateur : annulation manuelle hors plateforme." });
    }

    const note = String(req.body?.note || "").trim().slice(0, 300) || null;

    let refundUsd = null;
    const debitRows = await q(
      `SELECT amount_usd FROM boost_wallet_transactions
        WHERE reference_type = 'smm_order' AND reference_id = $1 AND transaction_type = 'order_payment'
        ORDER BY id DESC LIMIT 1`,
      [id]
    );
    if (debitRows.length) refundUsd = Number(debitRows[0].amount_usd);

    const result = await withTransaction(async (tx) => {
      let credit = null;
      if (refundUsd && refundUsd > 0) {
        credit = await creditBoostWalletTx(tx, {
          userId: Number(order.user_id),
          amountUsd: refundUsd,
          transactionType: "refund",
          referenceType: "smm_order_refund",
          referenceId: id,
          description: note || `Annulation commande Boost #${id} — ${order.service_name}`,
          createdBy: req.user.id > 0 ? req.user.id : null,
        });
      }
      const updated = await tx.query(
        `UPDATE smm_orders
            SET status = 'cancelled', payment_status = 'cancelled', updated_at = now(),
                completed_at = COALESCE(completed_at, now())
          WHERE id = $1 AND status = 'paid' AND external_reference IS NULL
          RETURNING id, status`,
        [id]
      );
      if (!updated.length) {
        const err = new Error("Commande déjà annulée ou transmise.");
        err.statusCode = 409;
        throw err;
      }
      return { credit, updated: updated[0] };
    });

    await addEvent(id, "cancelled", order.status, "cancelled", note || "Annulation par l'administration (remboursement auto)", { amount_usd: refundUsd }).catch(() => {});

      logAudit(req.user.id, "smm.order_cancelled", `#${id} ${order.service_name}${refundUsd ? ` (${refundUsd} USD)` : ""}`, req.ip);

    await notifySmmUser(
      Number(order.user_id),
      "Commande MboppiBoost annulée",
      `Votre commande #${id} (${order.service_name}) a été annulée${refundUsd ? ` : ${refundUsd} USD remboursés sur votre portefeuille Boost.` : "."}`,
      { orderId: id }
    ).catch(() => {});

    res.json({
      ok: true,
      order_id: id,
      status: "cancelled",
      refunded_usd: refundUsd,
      balance_usd: result.credit?.balance_usd ?? null,
    });
  })
);

export default router;