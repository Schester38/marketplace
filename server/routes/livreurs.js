import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const NORMALIZE_TEXT = (col) =>
  `regexp_replace(translate(lower(${col}), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn'), '[^a-z0-9]', '', 'g')`;

router.get('/options', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const scope = "role = 'livreur' AND NULLIF(phone, '') IS NOT NULL";
  const cities = await q(
    `SELECT DISTINCT city FROM users WHERE ${scope} AND NULLIF(city, '') IS NOT NULL ORDER BY city ASC`
  );
  const quartiers = await q(
    `SELECT DISTINCT quartier FROM users WHERE ${scope} AND NULLIF(quartier, '') IS NOT NULL ORDER BY quartier ASC`
  );
  res.json({
    cities: cities.map((r) => r.city),
    quartiers: quartiers.map((r) => r.quartier),
  });
}));

router.get('/', authRequired, roleRequired('shop'), ah(async (req, res) => {
  const { city, quartier } = req.query;
  const where = ["role = 'livreur'", "NULLIF(phone, '') IS NOT NULL"];
  const params = [];
  if (city) {
    const norm = String(city)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    where.push(NORMALIZE_TEXT('COALESCE(city, \'\')') + ` ILIKE '%' || $${params.length + 1} || '%'`);
    params.push(norm);
  }
  if (quartier) {
    const norm = String(quartier)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
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
