import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { signToken, authRequired } from '../auth.js';
import { googleConfigured, googleAuthUrl, getGoogleProfile } from '../google.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at };
}

router.post('/register', ah(async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nom, email et mot de passe sont requis' });
  }
  if (!['shop', 'seller'].includes(role)) {
    return res.status(400).json({ error: 'Le rôle doit être "shop" (boutique) ou "seller" (vendeur)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  const exists = await q('SELECT id FROM users WHERE email = $1', [emailNorm]);
  if (exists.length) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const created = await q(
    'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
    [String(name).trim(), emailNorm, hash, role]
  );
  const user = (await q('SELECT * FROM users WHERE id = $1', [created[0].id]))[0];
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe sont requis' });
  }
  const user = (
    await q('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()])
  )[0];
  if (!user || !user.password || !bcrypt.compareSync(String(password), user.password)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/google', (req, res) => {
  if (!googleConfigured()) {
    const msg = encodeURIComponent('La connexion Google n\'est pas encore configurée');
    return res.redirect(`/auth-google?error=${msg}`);
  }
  const role = ['shop', 'seller'].includes(req.query.role) ? req.query.role : 'seller';
  res.redirect(googleAuthUrl(role, req));
});

router.get('/google/callback', ah(async (req, res) => {
  const { code, state } = req.query;
  if (!code) {
    return res.redirect(`/auth-google?error=${encodeURIComponent('Connexion Google annulée')}`);
  }
  try {
    const profile = await getGoogleProfile(code, req);
    let user = (await q('SELECT * FROM users WHERE email = $1', [profile.email]))[0];
    if (!user) {
      const role = ['shop', 'seller'].includes(state) ? state : 'seller';
      const created = await q(
        'INSERT INTO users (name, email, password, provider, role) VALUES ($1, $2, NULL, \'google\', $3) RETURNING id',
        [profile.name, profile.email, role]
      );
      user = (await q('SELECT * FROM users WHERE id = $1', [created[0].id]))[0];
    }
    res.redirect(`/auth-google?token=${signToken(user)}`);
  } catch (err) {
    res.redirect(`/auth-google?error=${encodeURIComponent(err.message)}`);
  }
}));

router.get('/me', authRequired, ah(async (req, res) => {
  const user = (await q('SELECT * FROM users WHERE id = $1', [req.user.id]))[0];
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  res.json({ user: publicUser(user) });
}));

export default router;
