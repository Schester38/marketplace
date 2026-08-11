import { q } from './db.js';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.ALLOWED_ORIGIN,
  'https://mboppi-mboppi.vercel.app',
].filter(Boolean);

const CSP =
  "default-src 'self' data: blob:; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; " +
  "font-src 'self' data:; " +
  "connect-src 'self'; " +
  "frame-src 'self'; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "form-action 'self'";

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP);
  next();
}

export function originCheck(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  if (ALLOWED_ORIGINS.includes(origin)) return next();
  return res.status(403).json({ error: 'Origine non autorisée' });
}

export function logAudit(userId, action, detail, ip) {
  return q(
    'INSERT INTO audit_log (user_id, action, detail, ip) VALUES ($1, $2, $3, $4)',
    [userId, action, detail || null, ip || null]
  ).catch(() => {});
}