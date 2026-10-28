import { Router } from "express";
import { q, withTransaction } from "../db.js";
import { authRequired, authOptional, roleRequired } from "../auth.js";
import { validate, validateQuery } from "../middlewares/validate.js";
import {
  smmCategorySchema,
  smmServiceSchema,
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

function fallbackServicesPage({ categoryId, platform, search, page, limit }) {
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

function publicServiceWhere({ categoryId, platform, search }) {
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
      `(s.name ILIKE $${params.length} OR c.name ILIKE $${params.length} OR COALESCE(s.short_description, '') ILIKE $${params.length})`
    );
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
    const filters = { categoryId, platform, search, page, limit };
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
    const limits = svc.limits && typeof svc.limits === "object" ? svc.limits : {};
    const minQty = Number(limits.min);
    const maxQty = Number(limits.max);
    if (Number.isFinite(minQty) && minQty > 0 && qty < minQty) {
      return res.status(400).json({ error: `Quantité minimale : ${minQty}` });
    }
    if (Number.isFinite(maxQty) && maxQty > 0 && qty > maxQty) {
      return res.status(400).json({ error: `Quantité maximale : ${maxQty}` });
    }

    const minimumQuantity = minimumSmmQuantity({
      price: svc.price,
      billingUnit: svc.billing_unit,
      min: minQty,
      currency: svc.currency,
    });
    if (minimumQuantity > qty) {
      return res.status(400).json({
        error: `Montant minimum de commande : ${SMM_MIN_ORDER_TOTAL_XAF} ${svc.currency}. Quantité minimale : ${minimumQuantity}.`,
        minimum_quantity: minimumQuantity,
        minimum_total: SMM_MIN_ORDER_TOTAL_XAF,
        currency: svc.currency,
      });
    }

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
              o.payment_provider, o.payment_external_reference, o.paid_at,
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

function smmCallerToken(req) {
  return (
    String(req.query?.token || req.body?.token || req.headers["x-smm-token"] || "").trim() || null
  );
}

function canAccessSmmOrder(req, order) {
  if (!order) return false;
  if (req.user?.id && Number(order.user_id) === Number(req.user.id)) return true;
  const token = smmCallerToken(req);
  return !!(token && order.public_token && token === order.public_token);
}

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
    delete order.public_token;
    const events = await q(
      `SELECT event_type, old_status, new_status, message, created_at
       FROM smm_order_events
       WHERE order_id = $1
       ORDER BY created_at DESC`,
      [id]
    );
    res.json({ order, events });
  })
);

/* POST /api/smm/orders/:id/payment — déclarer un paiement (propriétaire ou token invité) */
router.post(
  "/orders/:id/checkout",
  authOptional,
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
    res.status(201).json({
      ok: true,
      user_id: Number(user_id),
      balance_usd: result.balance_usd,
      transaction: result.transaction,
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
    const rows = await q(`SELECT id, status, user_id, service_name FROM smm_orders WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: "Commande introuvable" });
    if (!["paid", "submitted", "processing"].includes(rows[0].status)) {
      return res.status(409).json({
        error: "Confirmez d'abord le paiement avant de transmettre la commande.",
        status: rows[0].status,
      });
    }
    const result = await dispatchSmmOrder(id);
    if (!result.ok) {
      return res.status(502).json({ error: result.error, order_id: id });
    }
    res.json({ ok: true, order_id: id, ...result });
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

      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[smm import-catalog]", err.message);
      res.status(502).json({ error: err.message || "Erreur import catalogue" });
    }
  })
);

export default router;