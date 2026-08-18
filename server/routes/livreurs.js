import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const NORMALIZE_TEXT = (col) =>
  `regexp_replace(translate(lower(${col}), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn'), '[^a-z0-9]', '', 'g')`;

router.get('/', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const { city, quartier } = req.query;
  const where = ["role = 'livreur'", "NULLIF(phone, '') IS NOT NULL"];
  const params = [];
  if (city) {
    const norm = String(city).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    where.push(NORMALIZE_TEXT('COALESCE(city, \'\')') + ` ILIKE '%' || $${params.length + 1} || '%'`);
    params.push(norm);
  }
  if (quartier) {
    const norm = String(quartier).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    where.push(NORMALIZE_TEXT(`COALESCE(quartier, '') || ' ' || COALESCE(location, '')`) + ` ILIKE '%' || $${params.length + 1} || '%'`);
    params.push(norm);
  }
  const livreurs = await q(
    `SELECT id, name, city, quartier, location, country, phone, verified, created_at
     FROM users
     WHERE ${where.join(' AND ')}
     ORDER BY name ASC`,
    params
  );
  res.json({ livreurs });
}));

export default router;
