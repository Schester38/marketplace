// Service campagnes programmées : l'admin prépare une file d'attente de
// campagnes (UNE PAR JOUR, garanti par un index UNIQUE sur send_date) et un
// cron quotidien (Vercel Cron ou cron-job.org) appelle /api/cron/campaigns
// pour envoyer automatiquement la campagne du jour.
import { q } from "../db.js";
import { getSetting, setSetting } from "./ikeepay.js";
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
  send_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  created_by INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
)`;

export async function ensureScheduledCampaignsTable() {
  await q(TABLE_SQL);
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

// Envoi réel d'une campagne (push + email). Mutualisé entre l'envoi manuel
// (panneau Admin) et l'envoi automatique (cron) pour un comportement identique.
export async function dispatchCampaign({ title, message, url = "/", audience = "all", channels = ["push", "email"] }) {
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
          url,
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
      const unsubscribeUrl = `${process.env.SITE_URL || "https://mboppi-mboppi.vercel.app"}/`;
      for (const r of recipients) {
        try {
          await sendMail({
            to: r.email,
            subject: `${title} — Mboppi`,
            text: `${message}\n\n— Mboppi`,
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

// Exécution du cron : envoie la campagne due du jour (maximum UNE par jour).
// Priorité : la plus ancienne programmée non encore envoyée. Si une campagne a
// déjà été envoyée aujourd'hui (heure du Cameroun), on attend demain.
export async function runDueCampaigns({ dry = false } = {}) {
  await ensureScheduledCampaignsTable();
  const today = todayDouala();

  const sentToday = (
    await q(
      `SELECT id, title FROM scheduled_campaigns
       WHERE status = 'sent' AND (sent_at AT TIME ZONE 'Africa/Douala')::date = $1::date
       LIMIT 1`,
      [today]
    )
  )[0];
  if (sentToday) {
    return { ok: true, sent: 0, reason: "already_sent_today", today, campaign: sentToday };
  }

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
    return { ok: true, sent: 0, reason: "none_due", today };
  }

  if (dry) {
    return {
      ok: true,
      sent: 0,
      dry: true,
      reason: "would_send",
      today,
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
  return { ok: true, sent: 1, today, campaign: { id: due.id, title: due.title }, result };
}