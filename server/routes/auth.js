import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { signToken } from '../auth.js';

const router = Router();

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at };
}

router.post('/register', async (req, res) => {
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
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe sont requis' });
  }
  const user = (
    await q('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()])
  )[0];
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', async (req, res) => {
  const user = (await q('SELECT * FROM users WHERE id = $1', [req.user.id]))[0];
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  res.json({ user: publicUser(user) });
});

export default router;
