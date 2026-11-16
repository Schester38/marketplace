// Service campagnes programmées : l'admin prépare une file d'attente de
// campagnes (UNE PAR JOUR, garanti par un index UNIQUE sur send_date) et un
// cron quotidien (Vercel Cron ou cron-job.org) appelle /api/cron/campaigns
// pour envoyer automatiquement la campagne du jour.
import { q } from "../db.js";
import { getSetting, setSetting } from "./ikeepay.js";
import { askAI } from "../routes/chat.js";
import { SITE_URL, absoluteUrl, canonicalizeText } from "../urls.js";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const CAMPAIGN_AUDIENCES = {
  all: null,
  clients: ["client"],
  sellers: ["seller", "creator"],
  shops: ["shop"],
  livreurs: ["livreur"],
  newsletter: null,
};
export const CAMPAIGN_EMAIL_CAP = 500;

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS scheduled_campaigns (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '/',
  audience TEXT NOT NULL DEFAULT 'all',
  channels TEXT[] NOT NULL DEFAULT ARRAY['push','email']::text[],
  send_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'manual',
  result JSONB,
  created_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
)`;

// Historique : la table a d'abord été créée avec une contrainte UNIQUE sur
// send_date (1 campagne/jour). Le quota est désormais configurable (1 ou 2
// par jour) : on supprime la contrainte si elle existe encore.
export async function ensureScheduledCampaignsTable() {
  await q(TABLE_SQL);
  try {
    await q(`ALTER TABLE scheduled_campaigns DROP CONSTRAINT IF EXISTS scheduled_campaigns_send_date_key`);
    await q(`ALTER TABLE scheduled_campaigns ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'`);
    // Une seule campagne IA par jour : garde-fou si deux appels du cron se
    // chevauchent (le second insert est ignoré).
    await q(
      `CREATE UNIQUE INDEX IF NOT EXISTS scheduled_campaigns_ai_day
         ON scheduled_campaigns (send_date) WHERE source = 'ai'`
    );
  } catch (err) {
    console.error("[campaigns] migration impossible :", err.message);
  }
}

// Quota de campagnes par jour, configurable dans le panneau Admin (1 par
// défaut, jusqu'à 3). Chaque créneau du cron envoie UNE campagne.
export async function getDailyLimit() {
  const v = parseInt(await getSetting("campaign_daily_limit"), 10);
  return Number.isInteger(v) && v >= 1 ? Math.min(v, 3) : 1;
}

export async function setDailyLimit(n) {
  const v = Math.max(1, Math.min(3, Number(n) || 1));
  await setSetting("campaign_daily_limit", String(v));
  return v;
}

// Secret du cron : auto-généré une seule fois puis STABLE (l'URL peut être
// enregistrée chez un service de cron externe — ne jamais la régénérer).
export async function getCronSecret() {
  const existing = await getSetting("campaign_cron_secret");
  if (existing) return existing;
  const secret = randomBytes(16).toString("hex");
  await setSetting("campaign_cron_secret", secret);
  return secret;
}

// Comparaison à temps constant de deux chaînes hexadécimales.
export function cronTokenOk(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Date du jour au Cameroun (UTC+1, pas d'heure d'été) au format YYYY-MM-DD.
export function todayDouala() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
}

// ==================== CAMPAGNES IA AUTOMATIQUES ====================
// L'admin active la génération : chaque jour ciblé, le cron demande à Gemini
// un titre + un message, les enregistre (source='ai') puis les envoie avec le
// circuit habituel. Fréquence : N campagnes par semaine (1 à 7), réparties sur
// les jours de la semaine ; 7 = une campagne chaque jour.

const AI_SETTINGS_KEY = "campaign_ai_settings";

export const AI_CAMPAIGN_DEFAULTS = {
  enabled: false,
  per_week: 7,
  audience: "all",
  channels: ["push", "email"],
  lang: "fr",
  notes: "",
};

const AI_LANGS = { fr: "français", en: "English", es: "español", ar: "العربية" };
const AI_TONES = ["chaleureux", "direct", "enthousiaste", "informatif", "inspirant"];

const AI_THEMES = [
  { theme: "nouveaux produits digitaux (ebooks, formations, vidéos)", url: "/?type=digital" },
  { theme: "produits physiques et boutiques partenaires", url: "/?type=physical" },
  { theme: "formations et contenus pour apprendre", url: "/formations" },
  { theme: "créateurs et leurs contenus exclusifs", url: "/createurs" },
  { theme: "suivi de commande et livraison", url: "/suivi" },
  { theme: "communauté, aide et contact", url: "/contact" },
  { theme: "soutenir la plateforme", url: "/soutien" },
  { theme: "questions fréquentes et découverte du site", url: "/faq" },
];

const AI_ALLOWED_URLS = ["/", "/?type=digital", "/?type=physical", "/formations", "/createurs", "/suivi", "/contact", "/soutien", "/faq"];

function cleanText(v) {
  return String(v || "")
    .replace(/^["'«»\s]+|["'«»\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getAiCampaignSettings() {
  let raw = null;
  try {
    raw = await getSetting(AI_SETTINGS_KEY);
  } catch {
    /* table indisponible : valeurs par défaut */
  }
  let saved = {};
  if (raw) {
    try {
      saved = JSON.parse(raw) || {};
    } catch {
      saved = {};
    }
  }
  const merged = { ...AI_CAMPAIGN_DEFAULTS, ...saved };
  merged.enabled = merged.enabled === true || merged.enabled === "true";
  merged.per_week = Math.min(7, Math.max(1, parseInt(merged.per_week, 10) || 7));
  if (!Object.prototype.hasOwnProperty.call(CAMPAIGN_AUDIENCES, merged.audience)) merged.audience = "all";
  merged.channels = Array.isArray(merged.channels)
    ? merged.channels.filter((c) => c === "push" || c === "email")
    : AI_CAMPAIGN_DEFAULTS.channels.slice();
  if (!merged.channels.length) merged.channels = AI_CAMPAIGN_DEFAULTS.channels.slice();
  if (!Object.prototype.hasOwnProperty.call(AI_LANGS, merged.lang)) merged.lang = "fr";
  merged.notes = String(merged.notes || "").slice(0, 500);
  return merged;
}

export async function setAiCampaignSettings(input = {}) {
  const current = await getAiCampaignSettings();
  const next = { ...current };
  if (input.enabled !== undefined) next.enabled = input.enabled === true || input.enabled === "true";
  if (input.per_week !== undefined) next.per_week = Math.min(7, Math.max(1, parseInt(input.per_week, 10) || 7));
  if (input.audience !== undefined && Object.prototype.hasOwnProperty.call(CAMPAIGN_AUDIENCES, input.audience)) {
    next.audience = String(input.audience);
  }
  if (Array.isArray(input.channels)) {
    const channels = input.channels.filter((c) => c === "push" || c === "email");
    if (channels.length) next.channels = channels;
  }
  if (input.lang !== undefined && Object.prototype.hasOwnProperty.call(AI_LANGS, input.lang)) {
    next.lang = String(input.lang);
  }
  if (input.notes !== undefined) next.notes = String(input.notes || "").slice(0, 500);
  await setSetting(AI_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// Index du jour dans la semaine, lundi = 0 (heures du Cameroun).
export function doualaWeekdayIndex(dateStr = todayDouala()) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

// Lundi de la semaine du jour donné (YYYY-MM-DD), heures du Cameroun.
export function doualaMonday(dateStr = todayDouala()) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - doualaWeekdayIndex(dateStr));
  return d.toISOString().slice(0, 10);
}

// Jours ciblés pour N campagnes/semaine : répartition régulière
// (7 → tous les jours ; 3 → lundi, mercredi, vendredi ; 1 → lundi).
export function aiCampaignWeekdays(perWeek) {
  const n = Math.min(7, Math.max(1, parseInt(perWeek, 10) || 7));
  return [...new Set(Array.from({ length: n }, (_, i) => Math.floor((i * 7) / n)))];
}

function parseAiCampaign(reply) {
  const text = String(reply || "").trim();
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      const title = cleanText(obj.title || obj.titre);
      const message = cleanText(obj.message || obj.texte || obj.body);
      if (title && message) {
        return { title, message, url: String(obj.url || obj.lien || "/") };
      }
    } catch {
      /* repli ligne à ligne ci-dessous */
    }
  }
  const pick = (labels) => {
    const re = new RegExp(`(?:${labels.join("|")})\\s*[:：-]\\s*(.+)`, "i");
    const m = text.match(re);
    return m ? cleanText(m[1]) : "";
  };
  const title = pick(["title", "titre"]);
  const message = pick(["message", "texte", "body"]);
  if (!title || !message) return null;
  return { title, message, url: pick(["url", "lien"]) || "/" };
}

function normalizeAiCampaignUrl(raw, fallback = "/") {
  let url = String(raw || fallback || "/").trim();
  if (!url.startsWith("/")) {
    try {
      const parsed = new URL(url);
      url = `${parsed.pathname}${parsed.search}`;
    } catch {
      url = fallback || "/";
    }
  }
  if (!AI_ALLOWED_URLS.includes(url)) url = fallback && AI_ALLOWED_URLS.includes(fallback) ? fallback : "/";
  return url.slice(0, 200);
}

export async function generateAiCampaign(settings) {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error("Génération IA indisponible : GEMINI_API_KEY manquante");
    err.statusCode = 503;
    throw err;
  }
  const s = settings || (await getAiCampaignSettings());
  const theme = AI_THEMES[Math.floor(Math.random() * AI_THEMES.length)];
  const tone = AI_TONES[Math.floor(Math.random() * AI_TONES.length)];
  const langName = AI_LANGS[s.lang] || AI_LANGS.fr;
  const notes = s.notes ? `\nConsignes de l'administrateur : ${s.notes}` : "";

  const prompt = [
    "Rédige UNE campagne de notification push + email pour aujourd'hui.",
    `Thème imposé : ${theme.theme}.`,
    `Ton : ${tone}.`,
    `Langue de rédaction : ${langName}.`,
    notes,
    "",
    "Contraintes strictes :",
    "- Titre accrocheur de 60 caractères maximum, sans guillemets.",
    "- Message de 1 à 3 phrases, 220 caractères maximum, concret et honnête.",
    "- N'invente aucun prix, aucune promotion, aucune remise et aucune promesse de gain.",
    "- Termine par un appel à l'action court.",
    `- URL interne choisie EXACTEMENT dans cette liste : ${AI_ALLOWED_URLS.join(", ")}.`,
    "",
    'Réponds STRICTEMENT en JSON valide, sans texte autour : {"title":"...","message":"...","url":"..."}',
  ]
    .filter(Boolean)
    .join("\n");

  const reply = await askAI(
    prompt,
    [],
    "Tu es rédacteur marketing pour MboppiShop, marketplace camerounaise (produits physiques, produits digitaux, vendeurs, boutiques, créateurs, livraison, paiement Mobile Money, formations). Tu écris des campagnes courtes, vraies et sans exagération. Tu réponds uniquement en JSON valide.",
    s.lang,
    {
      maxInputChars: 3000,
      maxOutputTokens: 500,
      includeCatalog: true,
      temperature: 0.95,
      perModelMs: 4500,
      totalBudgetMs: 9000,
    }
  );

  const parsed = parseAiCampaign(reply);
  if (!parsed) {
    const err = new Error("Réponse de l'IA illisible");
    err.statusCode = 502;
    throw err;
  }
  const title = canonicalizeText(parsed.title).slice(0, 120);
  const message = canonicalizeText(parsed.message).slice(0, 900);
  if (!title || !message) {
    const err = new Error("Réponse de l'IA incomplète");
    err.statusCode = 502;
    throw err;
  }
  return { title, message, url: normalizeAiCampaignUrl(parsed.url, theme.url), theme: theme.theme, lang: s.lang };
}

// Génère et met en file la campagne IA du jour si nécessaire. Ne lève jamais :
// le cron doit continuer à envoyer les campagnes existantes.
export async function maybeGenerateAiCampaign({ today = todayDouala() } = {}) {
  try {
    const settings = await getAiCampaignSettings();
    if (!settings.enabled) return { generated: false, reason: "disabled" };
    if (!process.env.GEMINI_API_KEY) return { generated: false, reason: "ai_not_configured" };
    if (!aiCampaignWeekdays(settings.per_week).includes(doualaWeekdayIndex(today))) {
      return { generated: false, reason: "not_scheduled_today", per_week: settings.per_week };
    }
    const monday = doualaMonday(today);
    const weekCount =
      (
        await q(
          `SELECT COUNT(*)::int AS n FROM scheduled_campaigns
           WHERE source = 'ai'
             AND (created_at AT TIME ZONE 'Africa/Douala')::date >= $1::date
             AND (created_at AT TIME ZONE 'Africa/Douala')::date <= $2::date`,
          [monday, today]
        )
      )[0]?.n || 0;
    if (weekCount >= settings.per_week) {
      return { generated: false, reason: "weekly_limit_reached", per_week: settings.per_week, this_week: weekCount };
    }
    const todayRow = (
      await q(
        `SELECT id FROM scheduled_campaigns
         WHERE send_date = $1::date
           AND (source = 'ai' OR status = 'pending')
         LIMIT 1`,
        [today]
      )
    )[0];
    if (todayRow) return { generated: false, reason: "campaign_today_exists", id: todayRow.id };
    const backlog = (
      await q(`SELECT id FROM scheduled_campaigns WHERE status = 'pending' AND send_date < $1::date LIMIT 1`, [today])
    )[0];
    if (backlog) return { generated: false, reason: "pending_backlog", id: backlog.id };

    const draft = await generateAiCampaign(settings);
    const inserted = (
      await q(
        `INSERT INTO scheduled_campaigns (title, message, url, audience, channels, send_date, source)
         VALUES ($1, $2, $3, $4, $5, $6::date, 'ai')
         ON CONFLICT DO NOTHING
         RETURNING id, title, send_date`,
        [draft.title, draft.message, draft.url, settings.audience, settings.channels, today]
      )
    )[0];
    if (!inserted) return { generated: false, reason: "already_generated_today" };
    try {
      await setSetting("campaign_ai_last_generated_at", new Date().toISOString());
    } catch {
      /* non bloquant */
    }
    console.log(`[campaigns] campagne IA générée (#${inserted.id}, ${today}) : ${inserted.title}`);
    return {
      generated: true,
      id: inserted.id,
      title: inserted.title,
      send_date: inserted.send_date,
      theme: draft.theme,
      lang: draft.lang,
      per_week: settings.per_week,
    };
  } catch (err) {
    console.error("[campaigns] génération IA échouée :", err.message);
    return { generated: false, reason: "ai_error", error: err.message };
  }
}

// Envoi réel d'une campagne (push + email). Mutualisé entre l'envoi manuel
// (panneau Admin) et l'envoi automatique (cron) pour un comportement identique.
export async function dispatchCampaign({ title, message, url = "/", audience = "all", channels = ["push", "email"] }) {
  // Textes et lien normalisés : une campagne enregistrée avant la bascule du
  // domaine peut citer l'ancienne adresse — le push et l'e-mail envoyés
  // affichent donc toujours le domaine officiel.
  title = canonicalizeText(title);
  message = canonicalizeText(message);
  const link = absoluteUrl(url);
  const doPush = channels.includes("push");
  const doEmail = channels.includes("email");
  const roles = Object.prototype.hasOwnProperty.call(CAMPAIGN_AUDIENCES, audience)
    ? CAMPAIGN_AUDIENCES[audience]
    : null;
  const result = {
    push_sent: 0,
    email_sent: 0,
    email_failed: 0,
    email_simulated: false,
    audience,
    channels: { push: doPush, email: doEmail },
  };

  if (doPush) {
    try {
      const { sendPushToAll } = await import("../push.js");
      result.push_sent = await sendPushToAll(
        {
          title: `📣 ${title}`,
          body: message,
          url: link,
          tag: `campaign-${Date.now()}`,
        },
        { roles: roles || undefined, channel: "messages" }
      );
    } catch (err) {
      console.error("[campaign] push échoué :", err.message);
    }
  }

  if (doEmail) {
    let recipients = [];
    try {
      if (audience === "newsletter") {
        recipients = (await q("SELECT email FROM newsletter_subscribers")).map((r) => ({
          email: r.email,
          name: "",
        }));
      } else {
        // NB : $1/$2 doivent être référencés dans le SQL même pour l'audience
        // « all », sinon Postgres rejette le paramètre non typé.
        const roleClause = roles ? " AND role = ANY($2::text[])" : "";
        recipients = await q(
          `SELECT email, name FROM users WHERE email_verified = $1${roleClause} LIMIT ${CAMPAIGN_EMAIL_CAP}`,
          roles ? [true, roles] : [true]
        );
      }
      const { sendMail, mailConfigured, newsletterEmailHtml } = await import("../mailer.js");
      result.email_simulated = !mailConfigured();
      const unsubscribeUrl = `${SITE_URL}/`;
      for (const r of recipients) {
        try {
          await sendMail({
            to: r.email,
            subject: `${title} — MboppiShop`,
            text: `${message}\n\n— MboppiShop`,
            html: newsletterEmailHtml({ title, body: message, unsubscribeUrl }),
          });
          result.email_sent += 1;
        } catch (err) {
          result.email_failed += 1;
          console.warn(`[campaign] email échoué vers ${r.email} :`, err.message);
        }
      }
      result.email_total = Math.min(recipients.length, CAMPAIGN_EMAIL_CAP);
    } catch (err) {
      console.error("[campaign] sélection des destinataires email impossible :", err.message);
    }
  }

  return result;
}

// Exécution du cron : envoie UNE campagne due par appel (la plus ancienne).
// Le nombre d'envois autorisés par jour est configurable (campaign_daily_limit,
// défaut 1). Si le quota du jour est atteint (heure du Cameroun), on attend le
// prochain créneau du cron.
export async function runDueCampaigns({ dry = false } = {}) {
  await ensureScheduledCampaignsTable();
  const today = todayDouala();
  const limit = await getDailyLimit();

  const sentToday = await q(
    `SELECT id, title FROM scheduled_campaigns
     WHERE status = 'sent' AND (sent_at AT TIME ZONE 'Africa/Douala')::date = $1::date
     ORDER BY sent_at ASC`,
    [today]
  );
  if (sentToday.length >= limit) {
    return {
      ok: true,
      sent: 0,
      reason: limit > 1 ? "daily_limit_reached" : "already_sent_today",
      today,
      limit,
      sent_today: sentToday.length,
    };
  }

  // Campagnes IA automatiques : si activées et qu'aucune campagne n'est déjà
  // prévue aujourd'hui, l'IA rédige la campagne du jour et la met en file.
  // Le dry-run (test admin) ne génère jamais rien.
  const ai = dry ? { generated: false, reason: "dry_run" } : await maybeGenerateAiCampaign({ today });

  const due = (
    await q(
      `SELECT * FROM scheduled_campaigns
       WHERE status = 'pending' AND send_date <= $1::date
       ORDER BY send_date ASC, id ASC
       LIMIT 1`,
      [today]
    )
  )[0];
  if (!due) {
    return { ok: true, sent: 0, reason: "none_due", today, ai };
  }

  if (dry) {
    return {
      ok: true,
      sent: 0,
      dry: true,
      reason: "would_send",
      today,
      ai,
      campaign: { id: due.id, title: due.title, audience: due.audience, channels: due.channels, send_date: due.send_date },
    };
  }

  const result = await dispatchCampaign({
    title: due.title,
    message: due.message,
    url: due.url,
    audience: due.audience,
    channels: due.channels,
  });
  await q(`UPDATE scheduled_campaigns SET status = 'sent', sent_at = now(), result = $2 WHERE id = $1`, [
    due.id,
    JSON.stringify(result),
  ]);
  return { ok: true, sent: 1, today, ai, campaign: { id: due.id, title: due.title, source: due.source }, result };
}