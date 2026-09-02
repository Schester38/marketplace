import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { rateLimit } from "express-rate-limit";
import { q } from "./db.js";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import saleRoutes from "./routes/sales.js";
import offerRoutes from "./routes/offers.js";
import orderRoutes from "./routes/orders.js";
import purchaseRoutes from "./routes/purchases.js";
import notificationRoutes from "./routes/notifications.js";
import messageRoutes from "./routes/messages.js";
import sellerRoutes from "./routes/seller.js";
import shopRoutes from "./routes/shop.js";
import livreurRoutes from "./routes/livreur.js";
import pushRoutes from "./routes/push.js";
import activityRoutes from "./routes/activity.js";
import reviewRoutes from "./routes/reviews.js";
import newsletterRoutes from "./routes/newsletter.js";
import adminRoutes from "./routes/admin.js";
import chatRoutes from "./routes/chat.js";
import walletRoutes from "./routes/wallet.js";
import flashPromoRoutes from "./routes/flashPromotions.js";
import metricsRoutes from "./routes/metrics.js";
import donationsRoutes from "./routes/donations.js";
import activationWithdrawalRoutes from "./routes/activationWithdrawals.js";
import logRoutes from "./routes/logs.js";
import seoRoutes from "./routes/seo.js";
import paymentsRouter, { webhookRouter } from "./routes/payments.js";
import presentationRoutes, { pageRouter, imageRouter } from "./routes/presentation.js";
import { authRequired } from "./auth.js";
import { securityHeaders, originCheck } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let SentryModule = null;

if (process.env.SENTRY_DSN) {
  import("@sentry/node")
    .then(({ default: Sentry }) => {
      Sentry.init?.({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || "production",
        tracesSampleRate: 0.1,
      });
      SentryModule = Sentry;
    })
    .catch(() => {});
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4173",
  process.env.ALLOWED_ORIGIN,
  "https://mboppi-mboppi.vercel.app",
  "https://ikeepay.com",
  "https://www.ikeepay.com",
].filter(Boolean);

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(securityHeaders);
app.use(
  express.json({
    limit: "12mb",
    // Conserve le corps brut (Buffer) pour le webhook iKeePay : certains
    // clients l'envoient avec un content-type non reconnu par express.json.
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Webhook iKeePay : monté AVANT originCheck car iKeePay (serveur) peut envoyer
// un header Origin non navigateur. La vérification se fait par correspondance
// de référence + montant (processWebhook), pas par l'origine.
app.use("/api/ikeepay", webhookRouter);

app.use(originCheck);

const limiter = (windowMs, max) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de requêtes, réessayez plus tard" },
  });

app.use("/api/auth/login", limiter(15 * 60 * 1000, 20));
app.use("/api/newsletter/subscribe", limiter(10 * 60 * 1000, 10));
app.use("/api/auth/register", limiter(60 * 60 * 1000, 15));
app.use("/api/auth/verify", limiter(60 * 60 * 1000, 20));
app.use("/api/auth/resend", limiter(10 * 60 * 1000, 6));
app.use("/api/auth/seller-code", limiter(10 * 60 * 1000, 5));
app.use("/api/shop/code", limiter(10 * 60 * 1000, 5));
app.use("/api/purchases", limiter(10 * 60 * 1000, 30));
app.use("/api/orders", limiter(10 * 60 * 1000, 30));
app.use("/api/reviews", limiter(10 * 60 * 1000, 15));
app.use("/api/chat", limiter(15 * 60 * 1000, 30));
app.use("/api/sales/livreur", limiter(5 * 60 * 1000, 60));
app.use("/api/admin/pass", limiter(60 * 1000, 5));
app.use("/api/admin", limiter(5 * 60 * 1000, 60));
app.use("/api", limiter(60 * 1000, 300));

app.get("/", (req, res, next) => {
  const wantsHtml = /text\/html|application\/xhtml\+xml/i.test(req.headers.accept || "");
  if (wantsHtml) return next();
  res.json({ name: "Mboppi API", version: "1.0.0" });
});

app.get("/api/health", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    await q("SELECT 1");
    res.json({ ok: true, db: "up", time: new Date().toISOString() });
  } catch (err) {
    console.error("Health check failed:", err);
    res
      .status(503)
      .json({ ok: false, db: "down", time: new Date().toISOString(), error: err?.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/shops", shopRoutes);
app.use("/api/livreur", livreurRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/flash-promotions", flashPromoRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/donations", donationsRoutes);
app.use("/api/activation-withdrawals", activationWithdrawalRoutes);
app.use("/api/payments", paymentsRouter);
app.use("/api/logs", limiter(60 * 1000, 8));
app.use("/api/logs", logRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/img", imageRouter);
app.use("/p", pageRouter);
app.use(seoRoutes);
app.get("/api/me", authRequired, (req, res) => res.json({ user: req.user }));

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, req, res, next) => {
  if (err) {
    if (SentryModule) {
      try {
        SentryModule.withScope((scope) => {
          scope.setTag("route", req.path);
          if (req.user?.id) scope.setUser({ id: String(req.user.id) });
          SentryModule.captureException(err);
        });
      } catch {
        /* best effort */
      }
    }
    console.error(err);
  }
  const status =
    Number(err?.statusCode) >= 400 && Number(err?.statusCode) < 600 ? Number(err.statusCode) : 500;
  res.status(status).json({
    error: status === 500 ? "Erreur interne du serveur" : err.message || "Requête invalide",
  });
});

export default app;
