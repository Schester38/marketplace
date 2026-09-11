import { Router } from "express";
import { q } from "../db.js";
import { listPhotos } from "../photo.js";

const router = Router();
const MAX_BATCH = 50;
const MAX_PATH = 200;

// ---------------------------------------------------------------------------
// Fiabilisation des métriques (sans rien casser : mêmes routes, mêmes
// réponses, aucun changement de schéma de table).
//
// 1) Filtre anti-bot serveur : les crawlers (Googlebot, Bing, curl, scripts,
//    frameworks, pré-rendering…) font gonfler les vues côté admin SANS être
//    de vrais visiteurs. On les ignore silencieusement : réponses { ok:true }
//    conservées → aucun client n'est cassé, ne cessent d'exister.
// 2) Déduplication par vibration visiteur : évite qu'une même vue soit
//    remontée 20× par un client qui boucle sur une page (cache mémoire court).
// 3) Plafond de vues par jour et par article : un boucle de refresh ne peut
//    plus faire croître indéfiniment item_views.count le même jour.
// ---------------------------------------------------------------------------

const BOT_UA =
  /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|go-http|okhttp|axios|python-urllib|python-requests|curl\/|wget|libwww|scrapy|nutch|java\/|node-fetch|postmanruntime|insomnia|guzzle|httpie|ruby|lighthouse|pingdom|uptimerobot|statuscake|monitor|vercel-cron|prerender|feedfetcher|wp-?robots|search\b|yandex|baiduspider|duckduckgo|mediapartners|adsbot)/i;

const MAX_ITEM_VIEWS_PER_DAY = 200; // plafond anti-boucle par (type,id,jour)

// Cache mémoire court (par instance Vercel) : clé `visitor|type|id` → minute.
// Simple approche « au moins une fois par visiteur et par minute » : réduit le
// double-comptage d'une même vue sans jamais bloquer un vrai utilisateur.
const recentViews = new Map(); // clé -> timestamp (ms)
const VIEW_WINDOW_MS = 60_000;
const MAX_RECENT_KEYS = 2000;

function viewKey(visitorId, type, id) {
  return `${String(visitorId || "?")}|${type}|${id}`;
}

function isBotRequest(req) {
  const ua = String(req.get("user-agent") || "");
  return ua.length > 0 && BOT_UA.test(ua);
}

function throttleView(visitorId, type, id) {
  const key = viewKey(visitorId, type, id);
  const now = Date.now();
  const last = recentViews.get(key) || 0;
  if (now - last < VIEW_WINDOW_MS) return true; // déjà vue récemment → ignorer
  recentViews.set(key, now);
  if (recentViews.size > MAX_RECENT_KEYS) {
    const oldestKey = [...recentViews.entries()].sort((a, b) => a[1] - b[1])[0][0];
    if (oldestKey) recentViews.delete(oldestKey);
  }
  return false;
}

router.post("/views", async (req, res) => {
  // Bots ignorés (réponses identiques).
  if (isBotRequest(req)) return res.json({ ok: true, counted: 0, ignored: "bot" });
  const visitorId = String(req.get("X-Visitor-Id") || "").slice(0, 100);
  const raw = Array.isArray(req.body?.views) ? req.body.views.slice(0, MAX_BATCH) : [];
  const views = [];
  for (const item of raw) {
    const type = String(item?.type || "").trim();
    const id = Number(item?.id);
    if ((type === "product" || type === "offer") && Number.isInteger(id) && id > 0) {
      views.push([type, id]);
    }
  }
  if (!views.length) return res.status(400).json({ error: "Requête invalide" });
  let counted = 0;
  for (const [type, id] of views) {
    if (throttleView(visitorId, type, id)) continue;
    counted += 1;
    await q(
      `INSERT INTO item_views (item_type, item_id, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (item_type, item_id, seen_on)
       DO UPDATE SET count = LEAST(item_views.count + 1, $3)`,
      [type, id, MAX_ITEM_VIEWS_PER_DAY]
    );
  }
  res.json({ ok: true, counted });
});

router.post("/visit", async (req, res) => {
  // Bots ignorés (réponses identiques).
  if (isBotRequest(req)) return res.json({ ok: true, ignored: "bot" });
  const path = String((req.body && req.body.path) || req.path || "/").slice(0, MAX_PATH);
  const visitorId = String(req.get("X-Visitor-Id") || "").slice(0, 100);
  if (!visitorId) return res.status(400).json({ error: "Identifiant visiteur manquant" });
  const country =
    String((req.body && req.body.country) || "CM")
      .trim()
      .slice(0, 40) || "CM";
  await q(
    `INSERT INTO daily_visits (visitor_id, path, country)
     VALUES ($1, $2, $3)
     ON CONFLICT (seen_on, visitor_id, path) DO NOTHING`,
    [visitorId, path, country]
  );
  res.json({ ok: true });
});

// Mesure d'ouverture des notifications push (envoyé par le service worker au
// clic sur une notification) : journalisé dans client_logs pour mesurer
// l'efficacité des campagnes (flash, digest, messages).
router.post("/push-open", async (req, res) => {
  const tag = String((req.body && req.body.tag) || "").slice(0, 120);
  await q(`INSERT INTO client_logs (message, url) VALUES ($1, $2)`, [
    `push_open${tag ? `: ${tag}` : ""}`,
    "/",
  ]);
  res.json({ ok: true });
});

router.get("/trending", async (req, res) => {
  res.set("Cache-Control", "public, s-maxage=120, max-age=60, stale-while-revalidate=30");
  const rows = await q(
    `SELECT p.id, p.name, p.price, p.commission_percent, p.currency, p.quantity, p.shop_id, u.name AS shop_name,
            u.country AS shop_country,
            COALESCE(v.w1_views, 0) AS w1_views, COALESCE(s.n, 0) AS sold
     FROM products p
     JOIN users u ON u.id = p.shop_id
     LEFT JOIN (SELECT item_id, SUM(count) AS w1_views
                FROM item_views
                WHERE item_type = 'product' AND seen_on >= CURRENT_DATE - 6
                GROUP BY item_id) v ON v.item_id = p.id
     LEFT JOIN (SELECT product_id, SUM(quantity) AS n
                FROM sales WHERE status = 'delivered' GROUP BY product_id) s ON s.product_id = p.id
     WHERE p.quantity > 0
       AND NOT EXISTS (SELECT 1 FROM flash_promotions fp WHERE fp.product_id = p.id AND fp.ends_at > now())
       AND (COALESCE(v.w1_views, 0) > 0 OR COALESCE(s.n, 0) > 0)
     ORDER BY (COALESCE(v.w1_views, 0) + COALESCE(s.n, 0) * 3) DESC, p.created_at DESC
     LIMIT 6`
  );
  const products = rows.map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    commission_percent: Number(p.commission_percent),
    commission: Math.round(Number(p.price) * (Number(p.commission_percent) / 100) * 100) / 100,
    currency: p.currency,
    shop_id: p.shop_id,
    shop_name: p.shop_name,
    shop_country: p.shop_country,
    quantity: Number(p.quantity),
    image: null,
    w1_views: Number(p.w1_views),
    sold: Number(p.sold),
  }));
  if (products.length) {
    const ids = products.map((p) => p.id);
    const imgs = await q(`SELECT id, photos FROM products WHERE id = ANY($1::int[])`, [ids]);
    const byId = new Map(imgs.map((r) => [r.id, r]));
    for (const p of products) {
      p.image = (listPhotos(byId.get(p.id)?.photos) || [])[0] || null;
    }
  }
  res.json({ products });
});

export default router;
