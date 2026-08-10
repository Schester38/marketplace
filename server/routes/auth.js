import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { signToken, authRequired, roleRequired } from '../auth.js';
import { googleConfigured, googleAuthUrl, getGoogleProfile } from '../google.js';
import { sendOtp } from '../whatsapp.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at, has_password: !!u.password, location: u.location || null, country: u.country || null, phone: u.phone || null, seller_code: u.seller_code || null };
}

function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s.-]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (p.length >= 9 && p.length <= 15 && /^\+?[0-9]+$/.test(p)) return p;
  return null;
}

const VALID_ROLES = ['shop', 'seller', 'client', 'creator'];

router.post('/register', ah(async (req, res) => {
  const { name, email, password, role, country } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nom, email et mot de passe sont requis' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Le rôle doit être "shop" (boutique), "seller" (vendeur), "client" ou "creator" (créateur)' });
  }  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  const exists = await q('SELECT id FROM users WHERE email = $1', [emailNorm]);
  if (exists.length) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const created = await q(
    'INSERT INTO users (name, email, password, role, country) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [String(name).trim(), emailNorm, hash, role, country ? String(country).trim() : null]
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

router.post('/otp/request', ah(async (req, res) => {
  const { phone, purpose, name, role, country } = req.body || {};
  const clean = normalizePhone(phone);
  if (!clean) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide (format international, ex : +237 6 90 00 00 00)' });
  }
  const cleanPurpose = purpose === 'register' ? 'register' : 'login';
  await q('DELETE FROM otp_codes WHERE expires_at < now()');
  const existing = cleanPurpose === 'register'
    ? (await q('SELECT id FROM users WHERE phone = $1', [clean]))[0]
    : null;
  if (existing) {
    return res.status(409).json({ error: 'Un compte existe déjà avec ce numéro. Connectez-vous à la place.' });
  }
  if (cleanPurpose === 'login') {
    const u = (await q('SELECT id FROM users WHERE phone = $1', [clean]))[0];
    if (!u) {
      return res.status(404).json({ error: 'Aucun compte lié à ce numéro. Créez un compte à la place.' });
    }
  }
  const recent = (
    await q('SELECT id FROM otp_codes WHERE phone = $1 AND used = FALSE AND expires_at > now() - interval \'50 seconds\'', [clean])
  )[0];
  if (recent) {
    return res.status(429).json({ error: 'Un code a déjà été envoyé. Attendez un peu avant de renvoyer.' });
  }
  if (cleanPurpose === 'register' && role && !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Le rôle doit être "shop", "seller", "client" ou "creator"' });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = bcrypt.hashSync(code, 10);
  await q(
    `INSERT INTO otp_codes (phone, purpose, code_hash, name, role, country, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + interval '5 minutes')`,
    [clean, cleanPurpose, hash, name ? String(name).trim() : null, role || null, country ? String(country).trim() : null]
  );
  let sent;
  try {
    sent = await sendOtp(clean, code);
  } catch (err) {
    return res.status(502).json({ error: 'Échec de l\'envoi du code. Réessayez dans un instant.' });
  }
  res.json({ ok: true, dev_code: sent && sent.dev ? sent.code : undefined });
}));

router.post('/otp/verify', ah(async (req, res) => {
  const { phone, code, name, role, country } = req.body || {};
  const clean = normalizePhone(phone);
  if (!clean || !code) {
    return res.status(400).json({ error: 'Numéro et code sont requis' });
  }
  const codeStr = String(code).trim();
  const otp = (
    await q(
      `SELECT * FROM otp_codes WHERE phone = $1 AND used = FALSE AND expires_at > now()
       ORDER BY id DESC LIMIT 1`,
      [clean]
    )
  )[0];
  if (!otp) {
    return res.status(401).json({ error: 'Code invalide ou expiré. Demandez un nouveau code.' });
  }
  if (otp.attempts >= 5) {
    await q('UPDATE otp_codes SET used = TRUE WHERE id = $1', [otp.id]);
    return res.status(401).json({ error: 'Trop de tentatives. Demandez un nouveau code.' });
  }
  if (!bcrypt.compareSync(codeStr, otp.code_hash)) {
    await q('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    return res.status(401).json({ error: 'Code incorrect. Vérifiez le code reçu.' });
  }
  await q('UPDATE otp_codes SET used = TRUE WHERE id = $1', [otp.id]);
  let user = (await q('SELECT * FROM users WHERE phone = $1', [clean]))[0];
  if (!user) {
    const finalName = (name || otp.name || 'Utilisateur').trim();
    const finalRole = VALID_ROLES.includes(role) ? role : VALID_ROLES.includes(otp.role) ? otp.role : 'client';
    const finalCountry = (country || otp.country || null);
    const created = await q(
      'INSERT INTO users (name, email, password, provider, role, country, phone) VALUES ($1, $2, NULL, \'otp\', $3, $4, $5) RETURNING id',
      [finalName, `otp_${clean.replace(/[^0-9]/g, '')}@mboppi.app`, finalRole, finalCountry, clean]
    );
    user = (await q('SELECT * FROM users WHERE id = $1', [created[0].id]))[0];
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get('/google', (req, res) => {
  if (!googleConfigured()) {
    const msg = encodeURIComponent('La connexion Google n\'est pas encore configurée');
    return res.redirect(`/auth-google?error=${msg}`);
  }
  const role = VALID_ROLES.includes(req.query.role) ? req.query.role : 'seller';
  res.redirect(googleAuthUrl(role, req.query.country, req));
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
      const [role, country] = String(state || '').split('|');
      const cleanRole = VALID_ROLES.includes(role) ? role : 'seller';
      const cleanCountry = country && country.length <= 60 ? country : null;
      const created = await q(
        'INSERT INTO users (name, email, password, provider, role, country) VALUES ($1, $2, NULL, \'google\', $3, $4) RETURNING id',
        [profile.name, profile.email, cleanRole, cleanCountry]
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

router.put('/me', authRequired, ah(async (req, res) => {
  const { name, email, location, country } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Le nom ne peut pas être vide' });
  }
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'L\'email ne peut pas être vide' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  const dup = await q('SELECT id FROM users WHERE email = $1 AND id <> $2', [emailNorm, req.user.id]);
  if (dup.length) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }
  const updated = await q(
    'UPDATE users SET name = $1, email = $2, location = $3, country = $4 WHERE id = $5 RETURNING *',
    [String(name).trim(), emailNorm, location ? String(location).trim() : null, country ? String(country).trim() : null, req.user.id]
  );
  if (!updated.length) return res.status(404).json({ error: 'Compte introuvable' });
  res.json({ user: publicUser(updated[0]) });
}));

router.put('/password', authRequired, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  }
  const user = (await q('SELECT * FROM users WHERE id = $1', [req.user.id]))[0];
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  if (user.password) {
    if (!currentPassword || !bcrypt.compareSync(String(currentPassword), user.password)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
  }
  const hash = bcrypt.hashSync(String(newPassword), 10);
  await q('UPDATE users SET password = $1 WHERE id = $2', [hash, user.id]);
  res.json({ ok: true });
}));

router.delete('/me', authRequired, ah(async (req, res) => {
  const { password } = req.body || {};
  const user = (await q('SELECT * FROM users WHERE id = $1', [req.user.id]))[0];
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  if (user.password && (!password || !bcrypt.compareSync(String(password), user.password))) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  await q('DELETE FROM users WHERE id = $1', [user.id]);
  res.json({ ok: true });
}));

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomSellerCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

router.get('/seller-code', authRequired, roleRequired('seller'), ah(async (req, res) => {
  const user = (await q('SELECT seller_code FROM users WHERE id = $1', [req.user.id]))[0];
  res.json({ seller_code: user?.seller_code || null });
}));

router.post('/seller-code', authRequired, roleRequired('seller'), ah(async (req, res) => {
  const existing = (await q('SELECT seller_code FROM users WHERE id = $1', [req.user.id]))[0];
  if (existing && existing.seller_code) {
    return res.json({ seller_code: existing.seller_code });
  }
  let code = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomSellerCode();
    const taken = (await q('SELECT id FROM users WHERE seller_code = $1', [candidate]))[0];
    if (!taken) { code = candidate; break; }
  }
  if (!code) return res.status(500).json({ error: 'Impossible de générer un code, réessayez' });
  await q('UPDATE users SET seller_code = $1 WHERE id = $2', [code, req.user.id]);
  res.json({ seller_code: code });
}));

export default router;
