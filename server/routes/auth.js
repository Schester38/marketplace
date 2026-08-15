import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { signToken, authRequired, roleRequired } from '../auth.js';
import { googleConfigured, googleAuthUrl, getGoogleProfile } from '../google.js';
import { logAudit } from '../security.js';
import { sendMail, verificationEmailHtml } from '../mailer.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const SITE_URL = process.env.SITE_URL || 'https://mboppi-mboppi.vercel.app';
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

function verifyToken() {
  return crypto.randomBytes(32).toString('hex');
}

function verifyLink(token, email) {
  return `${SITE_URL}/verifier-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

async function sendVerification(user) {
  const token = verifyToken();
  await q(
    'UPDATE users SET email_verify_token = $1, email_verify_expires = now() + interval \'24 hours\', email_verified = FALSE WHERE id = $2',
    [token, user.id]
  );
  const link = verifyLink(token, user.email);
  await sendMail({
    to: user.email,
    subject: 'Confirmez votre inscription — Mboppi',
    text: `Bonjour ${user.name},\n\nBienvenue sur Mboppi ! Confirmez votre adresse email pour valider votre inscription :\n\n${link}\n\nCe lien est valable 24 heures.`,
    html: verificationEmailHtml({ name: user.name, link }),
  });
  return link;
}

function validEmail(v) {
  return typeof v === 'string' && v.length <= 120 && EMAIL_RE.test(v.trim());
}

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

async function verifyRecaptcha(token) {
  if (!RECAPTCHA_SECRET) return true;
  if (!token) return false;
  try {
    const params = new URLSearchParams({ secret: RECAPTCHA_SECRET, response: String(token) });
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      body: params,
    });
    const data = await res.json();
    if (!(data && data.success === true)) {
      console.error('reCAPTCHA refusé:', JSON.stringify(data));
      return false;
    }
    return true;
  } catch (err) {
    console.error('reCAPTCHA erreur:', err.message);
    return false;
  }
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at, has_password: !!u.password, location: u.location || null, city: u.city || null, country: u.country || null, phone: u.phone || null, seller_code: u.seller_code || null, email_verified: !!u.email_verified };
}

const VALID_ROLES = ['shop', 'seller', 'client', 'creator'];

router.post('/register', ah(async (req, res) => {
  const { name, email, password, role, country, ref, recaptchaToken, acceptedTerms } = req.body || {};
  if (!(await verifyRecaptcha(recaptchaToken))) {
    return res.status(400).json({ error: 'Vérification anti-robot échouée, réessayez' });
  }
  if (acceptedTerms !== true) {
    return res.status(400).json({ error: 'Vous devez accepter les Conditions Générales d\'Utilisation pour vous inscrire' });
  }
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nom, email et mot de passe sont requis' });
  }
  let referredBy = null;
  let finalRole = role;
  if (ref && String(ref).trim()) {
    const referrer = (
      await q('SELECT id, role FROM users WHERE seller_code = $1', [String(ref).trim().toUpperCase()])
    )[0];
    if (!referrer || referrer.role !== 'seller') {
      return res.status(400).json({ error: 'Code de vendeur (parrainage) invalide' });
    }
    referredBy = referrer.id;
    finalRole = 'client';
  }
  if (!VALID_ROLES.includes(finalRole)) {
    return res.status(400).json({ error: 'Le rôle doit être "shop" (boutique), "seller" (vendeur), "client" ou "creator" (créateur)' });
  }
  if (String(password).length < MIN_PASSWORD) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins ' + MIN_PASSWORD + ' caractères' });
  }
  if (String(name).trim().length > 100) {
    return res.status(400).json({ error: 'Le nom est trop long' });
  }
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  const exists = await q('SELECT id FROM users WHERE email = $1', [emailNorm]);
  if (exists.length) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }
  const hash = bcrypt.hashSync(String(password), 12);
  const created = await q(
    'INSERT INTO users (name, email, password, role, country, referred_by, accepted_terms_at, email_verified) VALUES ($1, $2, $3, $4, $5, $6, now(), FALSE) RETURNING id',
    [String(name).trim(), emailNorm, hash, finalRole, country ? String(country).trim() : null, referredBy]
  );
  const user = (await q('SELECT * FROM users WHERE id = $1', [created[0].id]))[0];
  try {
    await sendVerification(user);
  } catch (err) {
    console.error('Envoi de confirmation échoué:', err.message);
  }
  res.status(201).json({ needs_confirmation: true, email: emailNorm });
}));

router.post('/login', ah(async (req, res) => {
  const { email, password, recaptchaToken } = req.body || {};
  if (!(await verifyRecaptcha(recaptchaToken))) {
    return res.status(400).json({ error: 'Vérification anti-robot échouée, réessayez' });
  }
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe sont requis' });
  }
  const user = (
    await q('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()])
  )[0];
  if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(429).json({ error: 'Trop de tentatives, compte verrouillé. Réessayez dans 15 minutes' });
  }
  const valid = user && user.password && bcrypt.compareSync(String(password), user.password);
  if (!valid) {
    if (user && user.password) {
      const attempts = (user.failed_attempts || 0) + 1;
      if (attempts >= 5) {
        await q(
          'UPDATE users SET failed_attempts = 0, locked_until = now() + interval \'15 minutes\' WHERE id = $1',
          [user.id]
        );
      } else {
        await q('UPDATE users SET failed_attempts = $1 WHERE id = $2', [attempts, user.id]);
      }
    }
    if (user && user.role === 'admin') {
      await logAudit(user.id, 'admin.login_failed', String(email).trim().toLowerCase(), req.ip);
    }
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  await q('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  if (!user.email_verified) {
    return res.status(403).json({ error: 'Veuillez confirmer votre adresse email avant de vous connecter', code: 'EMAIL_NOT_VERIFIED', email: user.email });
  }
  if (user.role === 'admin') {
    await logAudit(user.id, 'admin.login', req.ip, null);
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/verify', ah(async (req, res) => {
  const { token } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Lien de confirmation invalide' });
  }
  const user = (await q('SELECT * FROM users WHERE email_verify_token = $1', [String(token)]))[0];
  if (!user) {
    return res.status(400).json({ error: 'Lien de confirmation invalide ou déjà utilisé' });
  }
  if (user.email_verified) {
    await q('UPDATE users SET email_verify_token = NULL, email_verify_expires = NULL WHERE id = $1', [user.id]);
    return res.json({ ok: true, verified: true, user: publicUser(user), token: signToken(user) });
  }
  if (user.email_verify_expires && new Date(user.email_verify_expires) < new Date()) {
    return res.status(410).json({ error: 'Ce lien a expiré. Demandez un nouveau lien de confirmation.', code: 'LINK_EXPIRED', email: user.email });
  }
  await q('UPDATE users SET email_verified = TRUE, email_verified_at = now(), email_verify_token = NULL, email_verify_expires = NULL WHERE id = $1', [user.id]);
  const updated = (await q('SELECT * FROM users WHERE id = $1', [user.id]))[0];
  res.json({ ok: true, verified: true, user: publicUser(updated), token: signToken(updated) });
}));

router.post('/resend', ah(async (req, res) => {
  const { email } = req.body || {};
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  const user = (await q('SELECT * FROM users WHERE email = $1', [emailNorm]))[0];
  if (!user) {
    return res.status(404).json({ error: 'Aucun compte trouvé avec cet email' });
  }
  if (user.email_verified) {
    return res.status(409).json({ error: 'Cet email est déjà confirmé' });
  }
  try {
    await sendVerification(user);
  } catch (err) {
    console.error('Résend de confirmation échoué:', err.message);
    return res.status(500).json({ error: 'Impossible d\'envoyer le lien, réessayez plus tard' });
  }
  res.json({ ok: true, email: user.email });
}));

router.get('/google', (req, res) => {
  if (!googleConfigured()) {
    const msg = encodeURIComponent('La connexion Google n\'est pas encore configurée');
    return res.redirect(`/auth-google?error=${msg}`);
  }
  const ref = String(req.query.ref || '').trim().toUpperCase();
  const role = VALID_ROLES.includes(req.query.role) ? req.query.role : ref ? 'client' : 'seller';
  const accepted = req.query.accepted === '1' ? '1' : '';
  res.redirect(googleAuthUrl(ref ? 'client' : role, req.query.country, ref, accepted, req));
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
      const [role, country, ref, accepted] = String(state || '').split('|');
      if (accepted !== '1') {
        const msg = encodeURIComponent('Vous devez accepter les Conditions Générales d\'Utilisation pour vous inscrire');
        return res.redirect(`/auth-google?error=${msg}`);
      }
      let cleanRole = VALID_ROLES.includes(role) ? role : 'seller';
      const cleanCountry = country && country.length <= 60 ? country : null;
      let referredBy = null;
      const cleanRef = ref ? String(ref).trim().toUpperCase() : '';
      if (cleanRef) {
        const referrer = (
          await q('SELECT id, seller_code FROM users WHERE role = \'seller\' AND seller_code = $1', [cleanRef])
        )[0];
        if (referrer) {
          referredBy = referrer.id;
          cleanRole = 'client';
        }
      }
      const created = await q(
        'INSERT INTO users (name, email, password, provider, role, country, referred_by, accepted_terms_at, email_verified, email_verified_at) VALUES ($1, $2, NULL, \'google\', $3, $4, $5, now(), TRUE, now()) RETURNING id',
        [profile.name, profile.email, cleanRole, cleanCountry, referredBy]
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
  const { name, email, location, city, country, phone } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Le nom ne peut pas être vide' });
  }
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'L\'email ne peut pas être vide' });
  }
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (String(name).trim().length > 100 || String(location || '').length > 150 || String(city || '').length > 60 || String(country || '').length > 60 || String(phone || '').length > 30) {
    return res.status(400).json({ error: 'Des champs sont trop longs' });
  }
  const emailNorm = String(email).trim().toLowerCase();
  const dup = await q('SELECT id FROM users WHERE email = $1 AND id <> $2', [emailNorm, req.user.id]);
  if (dup.length) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }
  const phoneClean = String(phone || '').trim().replace(/[^\d+ ]/g, '');
  const prev = (await q('SELECT email, email_verified FROM users WHERE id = $1', [req.user.id]))[0];
  const emailChanged = prev && prev.email !== emailNorm;
  const updated = await q(
    'UPDATE users SET name = $1, email = $2, location = $3, city = $4, country = $5, phone = $6' + (emailChanged ? ', email_verified = FALSE' : '') + ' WHERE id = $7 RETURNING *',
    [String(name).trim(), emailNorm, location ? String(location).trim() : null, city ? String(city).trim() : null, country ? String(country).trim() : null, phoneClean || null, req.user.id]
  );
  if (!updated.length) return res.status(404).json({ error: 'Compte introuvable' });
  if (emailChanged) {
    try {
      await sendVerification(updated[0]);
    } catch (err) {
      console.error('Confirmation de nouvel email échouée:', err.message);
    }
  }
  res.json({ user: publicUser(updated[0]), email_changed: emailChanged });
}));

router.put('/password', authRequired, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < MIN_PASSWORD) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins ' + MIN_PASSWORD + ' caractères' });
  }
  const user = (await q('SELECT * FROM users WHERE id = $1', [req.user.id]))[0];
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  if (user.password) {
    if (!currentPassword || !bcrypt.compareSync(String(currentPassword), user.password)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
  }
  const hash = bcrypt.hashSync(String(newPassword), 12);
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
