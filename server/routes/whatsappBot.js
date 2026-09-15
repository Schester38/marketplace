// ─── Webhook du robot WhatsApp (Meta Cloud API) ────────────────────────────
// Deux endpoints exigés par Meta :
//   GET  /api/whatsapp/webhook  → vérification d'abonnement (hub.challenge)
//   POST /api/whatsapp/webhook  → notifications de messages (toujours 200)
// Sécurité : le verify_token est défini dans l'environnement Vercel
// (WHATSAPP_VERIFY_TOKEN) et recopié à l'identique dans la configuration du
// webhook dans le dashboard Meta. La comparaison est en temps constant.
// Monté AVANT originCheck dans app.js (serveurs Meta, pas un navigateur).
import { Router } from "express";
import crypto from "crypto";
import { handleBotWebhook } from "../services/whatsappBot.js";
import { q } from "../db.js";

const router = Router();

function timingSafeEq(a, b) {
  const A = Buffer.from(String(a || ""));
  const B = Buffer.from(String(b || ""));
  if (A.length !== B.length || A.length === 0) return false;
  return crypto.timingSafeEqual(A, B);
}

async function expectedToken() {
  // Priorité à l'environnement (stable), repli sur platform_settings.
  if (process.env.WHATSAPP_VERIFY_TOKEN) return process.env.WHATSAPP_VERIFY_TOKEN;
  try {
    const r = await q(`SELECT value FROM platform_settings WHERE key = 'wa_bot_verify_token' LIMIT 1`);
    return r?.[0]?.value || "";
  } catch {
    return "";
  }
}

router.get("/webhook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = await expectedToken();
  if (mode === "subscribe" && token && expected && timingSafeEq(token, expected)) {
    return res.status(200).send(challenge || "");
  }
  return res.status(403).send("verification failed");
});

router.post("/webhook", async (req, res) => {
  // Meta exige une réponse rapide : le traitement (IA + envoi) est poussé
  // après la réponse pour ne jamais dépasser le délai du webhook.
  res.status(200).send("EVENT_RECEIVED");
  try {
    await handleBotWebhook(req.body);
  } catch (err) {
    console.log("[wa-bot-webhook] erreur :", err.message);
  }
});

export default router;
