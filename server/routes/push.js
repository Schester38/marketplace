import { Router } from 'express';
import { q } from '../db.js';
import { authRequired } from '../auth.js';
import { vapidPublicKey } from '../push.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/key', (req, res) => {
  res.json({ public_key: vapidPublicKey });
});

router.post('/subscribe', authRequired, ah(async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'Abonnement push invalide' });
  }
  await q(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys`,
    [req.user.id, String(endpoint), { p256dh: String(keys.p256dh), auth: String(keys.auth) }]
  );
  res.json({ ok: true });
}));

router.post('/unsubscribe', authRequired, ah(async (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) {
    await q('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.id, String(endpoint)]);
  }
  res.json({ ok: true });
}));

export default router;
