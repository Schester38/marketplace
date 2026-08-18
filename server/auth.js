import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error('ERREUR: la variable JWT_SECRET (au moins 32 caractères) doit être définie.');
  process.exit(1);
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    SECRET,
    { expiresIn: '24h' }
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  try {
    req.user = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}

export function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès réservé aux ' + roles.join(' / ') });
    }
    next();
  };
}

export const SELLER_ACTIVATION_DAYS = Number(process.env.SELLER_ACTIVATION_DAYS || 31);

export function sellerActivationActive(u) {
  if (!u) return false;
  if (!u.activation_fee_paid) return false;
  if (!u.activation_fee_paid_at) return true; // payé avant le système de durée : actif sans expiration
  const start = new Date(u.activation_fee_paid_at).getTime();
  if (Number.isNaN(start)) return true;
  const periodMs = SELLER_ACTIVATION_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - start < periodMs;
}

export function sellerActivationExpiresAt(u) {
  if (!u || !u.activation_fee_paid || !u.activation_fee_paid_at) return null;
  const start = new Date(u.activation_fee_paid_at).getTime();
  if (Number.isNaN(start)) return null;
  return new Date(start + SELLER_ACTIVATION_DAYS * 24 * 60 * 60 * 1000);
}
