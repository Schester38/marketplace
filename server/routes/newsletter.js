import { Router } from 'express';
import crypto from 'crypto';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';
import { sendMail, newsletterEmailHtml } from '../mailer.js';
import { logAudit } from '../security.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const SITE_URL = process.env.SITE_URL || 'https://mboppi-mboppi.vercel.app';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 60;

router.post('/subscribe', ah(async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, MAX_LENGTH);
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  await q(
    `INSERT INTO newsletter_subscribers (email, unsubscribe_token)
     VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [email, token]
  );
  res.json({ ok: true });
}));

router.get('/unsubscribe', ah(async (req, res) => {
  const token = String(req.query.token || '').slice(0, 64);
  const removed = await q(
    'DELETE FROM newsletter_subscribers WHERE unsubscribe_token = $1 RETURNING id',
    [token]
  );
  const ok = Boolean(removed.length);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="robots" content="noindex"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Newsletter Mboppi</title>
</head>
<body style="margin:0;padding:40px 16px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;text-align:center;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e2e8f0;padding:32px 24px;">
    <p style="font-size:34px;margin:0 0 12px;">${ok ? '👋' : '⚠️'}</p>
    <h1 style="font-size:18px;color:#0f172a;margin:0 0 10px;">${ok ? 'Vous êtes bien désabonné(e)' : 'Lien invalide ou déjà utilisé'}</h1>
    <p style="font-size:14px;color:#64748b;line-height:1.6;margin:0 0 20px;">
      ${ok ? 'Vous ne recevrez plus la newsletter Mboppi. Merci de nous avoir suivis.' : 'Ce lien de désabonnement ne fonctionne plus.'}
    </p>
    <a href="${SITE_URL}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 26px;border-radius:10px;">Retour à Mboppi</a>
  </div>
</body>
</html>`);
}));

router.use(authRequired, roleRequired('admin'));

router.get('/', ah(async (req, res) => {
  const [count] = await q('SELECT COUNT(*) AS total FROM newsletter_subscribers');
  const subscribers = await q(
    'SELECT id, email, created_at, last_sent_at FROM newsletter_subscribers ORDER BY created_at DESC LIMIT 200'
  );
  res.json({ count: Number(count.total), subscribers });
}));

router.post('/send', ah(async (req, res) => {
  const subject = String((req.body && req.body.subject) || '').trim().slice(0, 140);
  const body = String((req.body && req.body.body) || '').trim().slice(0, 5000);
  if (!subject || !body) {
    return res.status(400).json({ error: 'Sujet et contenu requis' });
  }
  const subs = await q('SELECT id, email, unsubscribe_token FROM newsletter_subscribers ORDER BY id');
  if (!subs.length) {
    return res.json({ ok: true, sent: 0, failed: 0 });
  }
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      const unsubscribeUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${encodeURIComponent(s.unsubscribe_token)}`;
      await sendMail({
        to: s.email,
        subject,
        html: newsletterEmailHtml({ title: subject, body, unsubscribeUrl }),
      });
      sent++;
      await q('UPDATE newsletter_subscribers SET last_sent_at = now() WHERE id = $1', [s.id]);
    } catch {
      failed++;
    }
  }
  await logAudit(req.user.id, 'newsletter.send', `sujet=${subject} destinataires=${sent} echecs=${failed}`, req.ip);
  res.json({ ok: true, sent, failed });
}));

export default router;