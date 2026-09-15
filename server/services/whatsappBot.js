// ─── Robot WhatsApp Mboppi ────────────────────────────────────────────────
// Assistant conversationnel WhatsApp (Meta Cloud API) branché sur le même
// moteur IA que le chat du site (routes/chat.js) : mêmes prompts, mêmes
// données produits en stock, historique court par numéro.
import { q } from "../db.js";
import { askAI } from "../routes/chat.js";

const WA_BOT_PREFIX = "wa_bot_";
const WA_BOT_ENABLED = `${WA_BOT_PREFIX}enabled`;
const WA_BOT_GREETING = `${WA_BOT_PREFIX}greeting`;
const WA_BOT_FALLBACK = `${WA_BOT_PREFIX}fallback`;
const WA_BOT_SYSTEM = `${WA_BOT_PREFIX}system_prompt`;

// Par numéro (wa_id) : [{ role, content }] — miroir du chat site (12 max).
const sessions = new Map();
const HISTORY_MAX = 12;
// Anti-boucle : si la même réponse est sur le point d'être renvoyée à un
// même numéro, on répond par le repli (les webhooks Meta peuvent répéter
// un message non résolu → sans garde-fou, l'IA se répondrait à elle-même).
const lastReply = new Map();

async function getSetting(key) {
  try {
    const r = await q(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    return r?.[0]?.value ?? null;
  } catch {
    return null;
  }
}

// Réglages publics du robot (pour le panneau Admin).
export async function getBotSettings() {
  const [enabled, greeting, fallback, systemPrompt] = await Promise.all([
    getSetting(WA_BOT_ENABLED),
    getSetting(WA_BOT_GREETING),
    getSetting(WA_BOT_FALLBACK),
    getSetting(WA_BOT_SYSTEM),
  ]);
  return {
    enabled: enabled === "true",
    greeting: greeting || "",
    fallback:
      fallback ||
      "Je n'ai pas bien compris 🤔 — reformulez, ou contactez l'équipe Mboppi sur ce même numéro.",
    system_prompt: systemPrompt || "",
  };
}

export async function setBotSettings(patch = {}) {
  const map = {
    enabled: WA_BOT_ENABLED,
    greeting: WA_BOT_GREETING,
    fallback: WA_BOT_FALLBACK,
    system_prompt: WA_BOT_SYSTEM,
  };
  for (const [k, key] of Object.entries(map)) {
    if (patch[k] === undefined) continue;
    const value = k === "enabled" ? (patch[k] ? "true" : "false") : String(patch[k]);
    await q(
      `INSERT INTO platform_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value]
    );
  }
}

// Extrait le texte d'un message entrant (texte, légende, boutons, listes).
function extractText(msg) {
  if (!msg) return "";
  return (
    msg.text?.body ||
    msg.button?.text ||
    msg.interactive?.button_reply?.title ||
    msg.interactive?.list_reply?.title ||
    msg.image?.caption ||
    msg.video?.caption ||
    msg.document?.caption ||
    msg.audio?.caption ||
    msg.sticker?.caption ||
    ""
  )
    .toString()
    .slice(0, 2000);
}

// Envoi texte via la Cloud API déjà configurée (services/whatsapp.js).
async function sendText(to, body) {
  const mod = await import("./whatsapp.js");
  const fn = mod.sendWhatsAppText || mod.default;
  return fn(to, body);
}

// Point d'entrée du webhook : traite une notification Meta et répond au
// besoin. Toujours résolu (jamais de throw) : Meta exige une réponse 200.
export async function handleBotWebhook(payload) {
  try {
    const settings = await getBotSettings();
    if (!settings.enabled) return { skipped: "disabled" };

    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      for (const change of entry?.changes || []) {
        const value = change?.value;
        if (!value) continue;

        // Statuts de livraison (sent/delivered/read/failed) : à ignorer.
        if (Array.isArray(value.statuses) && value.statuses.length) {
          const failed = value.statuses.find((s) => s.status === "failed");
          if (failed) {
            console.log(
              `[wa-bot] message non livré (${failed.errors?.[0]?.title || "erreur"})`
            );
          }
          continue;
        }

        for (const msg of value.messages || []) {
          const from = msg.from || "";
          if (!from) continue;
          const text = extractText(msg);

          // Média sans légende : invitation à reformuler.
          if (!text && msg.type && msg.type !== "reaction") {
            await sendText(
              from,
              "Je ne peux lire que du texte pour l'instant 🙏 — écrivez votre question."
            );
            continue;
          }
          if (!text) continue;

          // Salutation simple → accueil (pas d'appel IA).
          if (/^\s*(hello|hi|bonjour|salut|mbote|bonsoir)\s*[!.?]?\s*$/i.test(text)) {
            const g = (settings.greeting || "").trim();
            await sendText(
              from,
              g ||
                "Bonjour 👋 Je suis l'assistant Mboppi. Posez votre question : produits, prix, livraison, devenir vendeur…"
            );
            continue;
          }

          const hist = sessions.get(from) || [];
          let answer;
          try {
            answer = await askAI(text, hist, settings.system_prompt || "");
          } catch (err) {
            console.log("[wa-bot] erreur IA:", err.message);
            answer = settings.fallback;
          }
          if (!answer || !String(answer).trim()) answer = settings.fallback;
          answer = String(answer);

          // Anti-boucle : même réponse que la précédente → variante.
          if (lastReply.get(from) === answer) {
            answer = "Avez-vous une autre question ? 😊 Tapez « aide » pour des exemples.";
          }
          lastReply.set(from, answer);
          await sendText(from, answer.slice(0, 3500));

          sessions.set(
            from,
            [
              ...hist,
              { role: "user", content: text },
              { role: "assistant", content: answer },
            ].slice(-HISTORY_MAX)
          );
          // Garde-fou RAM : au-delà de 500 sessions, on purge les plus anciennes.
          if (sessions.size > 500) {
            sessions.delete(sessions.keys().next().value);
          }
        }
      }
    }
    return { ok: true };
  } catch (err) {
    console.log("[wa-bot] erreur webhook:", err.message);
    return { ok: false, error: err.message };
  }
}
