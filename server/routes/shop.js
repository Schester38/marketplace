import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomShopCode() {
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

router.get('/code', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const user = (await q('SELECT shop_code FROM users WHERE id = $1', [req.user.id]))[0];
  res.json({ shop_code: user?.shop_code || null });
}));

router.post('/code', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const existing = (await q('SELECT shop_code FROM users WHERE id = $1', [req.user.id]))[0];
  if (existing && existing.shop_code) {
    return res.json({ shop_code: existing.shop_code });
  }
  let code = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomShopCode();
    const taken = (await q('SELECT id FROM users WHERE shop_code = $1', [candidate]))[0];
    if (!taken) { code = candidate; break; }
  }
  if (!code) return res.status(500).json({ error: 'Impossible de générer un code, réessayez' });
  await q('UPDATE users SET shop_code = $1 WHERE id = $2', [code, req.user.id]);
  res.json({ shop_code: code });
}));

export default router;
