import { Router } from 'express';
import { q } from '../db.js';

const router = Router();
const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE = 1500000;
const ADMIN_PASSWORD = process.env.OFFER_ADMIN_PASSWORD || 'mboppi-verone-admin';

function offerRow(o) {
  let photos = [];
  try {
    photos = JSON.parse(o.photos || '[]');
  } catch {
    photos = [];
  }
  return {
    ...o,
    original_price: Number(o.original_price),
    promo_price: Number(o.promo_price),
    quantity: Number(o.quantity),
    photos,
  };
}

router.get('/', async (req, res) => {
  const offers = (
    await q('SELECT * FROM offers ORDER BY created_at DESC')
  ).map(offerRow);
  res.json({ offers });
});

router.get('/:id', async (req, res) => {
  const offer = (await q('SELECT * FROM offers WHERE id = $1', [Number(req.params.id)]))[0];
  if (!offer) return res.status(404).json({ error: 'Offre introuvable' });
  res.json({ offer: offerRow(offer) });
});

router.post('/', async (req, res) => {
  const { name, category, description, warranty, original_price, promo_price, phone, quantity, photos } =
    req.body || {};

  if (!name || original_price === undefined || promo_price === undefined) {
    return res.status(400).json({ error: 'Le nom et les prix sont requis' });
  }

  const originalNum = Number(original_price);
  const promoNum = Number(promo_price);
  if (!Number.isFinite(originalNum) || originalNum < 0) {
    return res.status(400).json({ error: 'Prix de vente invalide' });
  }
  if (!Number.isFinite(promoNum) || promoNum < 0) {
    return res.status(400).json({ error: 'Prix promotionnel invalide' });
  }

  const qtyNum = Number(quantity ?? 0);
  if (!Number.isInteger(qtyNum) || qtyNum < 0) {
    return res.status(400).json({ error: 'Quantité invalide' });
  }

  if (!Array.isArray(photos) || photos.length > MAX_PHOTOS) {
    return res.status(400).json({ error: `Maximum ${MAX_PHOTOS} photos par offre` });
  }
  for (const photo of photos) {
    if (typeof photo !== 'string' || !photo.startsWith('data:image/') || photo.length > MAX_PHOTO_SIZE) {
      return res.status(400).json({ error: 'Photo invalide ou trop volumineuse' });
    }
  }

  const created = await q(
    `INSERT INTO offers (name, category, description, warranty, original_price, promo_price, phone, quantity, photos)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      String(name).trim(),
      category ? String(category).trim() : null,
      description ? String(description).trim() : null,
      warranty ? String(warranty).trim() : null,
      originalNum,
      promoNum,
      phone ? String(phone).trim() : null,
      qtyNum,
      JSON.stringify(photos),
    ]
  );

  const offer = offerRow((await q('SELECT * FROM offers WHERE id = $1', [created[0].id]))[0]);
  res.status(201).json({ offer });
});

router.delete('/:id', async (req, res) => {
  const { password } = req.body || {};
  if (String(password || '') !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Mot de passe de gestion incorrect' });
  }
  const offer = (await q('SELECT * FROM offers WHERE id = $1', [Number(req.params.id)]))[0];
  if (!offer) return res.status(404).json({ error: 'Offre introuvable' });
  await q('DELETE FROM offers WHERE id = $1', [offer.id]);
  res.json({ ok: true });
});

export default router;
