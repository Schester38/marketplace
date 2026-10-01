// MboppiStudio — outils créatifs IA du panneau d'administration.
//
// Onglet « MboppiStudio » : adaptation de l'application « Studio IA » au
// marché MboppiShop. Module ISOLÉ — aucune table métier touchée, aucune donnée
// du marketplace utilisée : le serveur ne fait que relayer des consignes vers
// l'IA déjà configurée (Gemini, GEMINI_API_KEY — voir chat.js) et renvoyer un
// résultat borné.
//
// Règle de sécurité du Studio : les clés des fournisseurs ne quittent JAMAIS
// le serveur (contrairement au prototype d'origine qui les stockait dans le
// navigateur) ; le client n'envoie que la consigne et n'affiche que le texte
// généré. Toute la portée est admin (jeton du panneau, admin virtuel id 0
// compris).
//
// Endpoints (préfixe /api/studio) :
//   GET  /       → état du module (IA configurée ?, outils disponibles)
//   POST /hooks  → générateur de hooks viraux { topic, platform, tone, count }
//
// Les prochains outils (Tendances 317, Podcast 304, Résumé 305, Avatar 301,
// Voix 302) viendront s'ajouter ici avec le même schéma : validation stricte
// des entrées, budget d'appel court (timeout Vercel), réponse bornée, piste
// d'audit (studio.*).

import { Router } from "express";
import { authRequired, roleRequired } from "../auth.js";
import { logAudit } from "../security.js";
import { askAI } from "./chat.js";

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Résultat IA = toujours unique : aucun cache (ni CDN, ni navigateur).
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// Réservé au panneau d'administration (jeton admin).
router.use(authRequired, roleRequired("admin"));

// ─── Référentiels de l'outil Hooks (miroir du prototype Studio IA) ───────────
const HOOKS_PLATFORMS = {
  tiktok: "TikTok (3 s max, énergie brute)",
  reels: "Instagram Reels",
  shorts: "YouTube Shorts",
  linkedin: "LinkedIn (ton professionnel)",
};
const HOOKS_TONES = {
  choc: "Ton choc, surprenant",
  curiosite: "Ton curieux (question ouverte, teaser)",
  autorite: "Ton expert autoritaire",
  storytelling: "Ton narratif personnel",
  controversial: "Ton provocateur, sans être offensant",
  humour: "Ton drôle",
  mix: "Varie les tons d'un hook à l'autre",
};
const HOOKS_COUNTS = [5, 10, 20, 50];
const HOOK_MAX_CHARS = 200; // longueur maximale acceptée pour un hook

// Extraction JSON tolérante (l'IA entoure parfois l'objet de Markdown).
function aiJson(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ""));
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// Repli : une ligne = un hook (numérotation, puces et guillemets retirés).
function hooksFromLines(text, count) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^[\s>*\-–—•\d.)\]"'«]+/, "")
        .replace(/["'»]+$/, "")
        .trim()
    )
    .filter((l) => l.length >= 5 && l.length <= HOOK_MAX_CHARS)
    .slice(0, count);
}

// GET /api/studio — état du module : le client affiche « IA active » ou
// l'alerte de configuration (clé Gemini absente) sans jamais recevoir de clé.
router.get(
  "/",
  ah(async (req, res) => {
    res.json({
      ok: true,
      ai_configured: Boolean(process.env.GEMINI_API_KEY),
      tools: ["hooks"],
    });
  })
);

// POST /api/studio/hooks — { topic, platform?, tone?, count? }
router.post(
  "/hooks",
  ah(async (req, res) => {
    // Sans clé Gemini, l'outil est simplement absent (message clair, pas de 500).
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "L'IA n'est pas configurée sur cette installation (GEMINI_API_KEY absente).",
        code: "AI_NOT_CONFIGURED",
      });
    }
    const body = req.body || {};
    const topic = String(body.topic || "").trim().slice(0, 300);
    if (topic.length < 3) {
      const err = new Error("Décrivez d'abord le sujet de la vidéo (3 caractères minimum).");
      err.statusCode = 422;
      throw err;
    }
    const platform = HOOKS_PLATFORMS[body.platform] ? body.platform : "tiktok";
    const tone = HOOKS_TONES[body.tone] ? body.tone : "mix";
    const count = HOOKS_COUNTS.includes(Number(body.count)) ? Number(body.count) : 10;

    const message = [
      `Génère exactement ${count} hooks (accroches) pour des vidéos ${HOOKS_PLATFORMS[platform]} sur le sujet : « ${topic} ».`,
      `${HOOKS_TONES[tone]}.`,
      "Contraintes : moins de 15 mots par hook, en français, prêts à être dits face caméra.",
      'Réponds UNIQUEMENT en JSON valide, sans texte autour : {"hooks":["hook 1","hook 2"]}',
    ].join("\n");

    // Budget court sous le timeout Vercel (même réglage que le Générateur) :
    // pas de catalogue produit, modèles flash uniquement.
    const reply = await askAI(
      message,
      [],
      "Tu es un expert en copywriting viral pour les réseaux sociaux. Tu réponds toujours par un objet JSON strict.",
      "fr",
      {
        maxInputChars: 2000,
        maxOutputTokens: 4096,
        includeCatalog: false,
        models: [
          "gemini-3.5-flash-lite",
          process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
          "gemini-3.1-flash-lite",
        ].filter((m, i, a) => a.indexOf(m) === i),
        perModelMs: 7000,
        totalBudgetMs: 12000,
      }
    );
    const out = String(reply || "").trim();
    if (
      !out ||
      /je ne peux pas répondre|can't answer|no puedo responder|لا أستطيع الإجابة/.test(out)
    ) {
      const err = new Error("L'IA est momentanément indisponible. Réessayez dans un instant.");
      err.statusCode = 502;
      throw err;
    }

    let hooks = [];
    const parsed = aiJson(out);
    if (parsed && Array.isArray(parsed.hooks)) {
      hooks = parsed.hooks.map((h) => String(h ?? "").trim());
    }
    if (!hooks.length) hooks = hooksFromLines(out, count);
    hooks = hooks
      .map((h) =>
        h
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, HOOK_MAX_CHARS)
      )
      .filter((h) => h.length >= 5)
      .slice(0, count);
    if (!hooks.length) {
      const err = new Error(
        "Aucun hook exploitable n'a été généré. Reformulez le sujet et réessayez."
      );
      err.statusCode = 502;
      throw err;
    }

    logAudit(req.user.id, "studio.hooks", `${count} hooks — ${topic}`.slice(0, 120), req.ip);
    res.json({ hooks, provider: "gemini", count: hooks.length });
  })
);

export default router;
