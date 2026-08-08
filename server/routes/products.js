import { Router } from 'express';
import { q } from '../db.js';
import { authRequired, roleRequired } from '../auth.js';

const router = Router();

const MAX_PRODUCTS_PER_SHOP = 5;

function productRow(p) {
  let photos = [];
  try {
    photos = JSON.parse(p.photos || '[]');
  } catch {
    photos = [];
  }
  return {
    ...p,
    photos,
    image: photos[0] || p.image || null,
    price: Number(p.price),
    commission_percent: Number(p.commission_percent),
    commission: Math.round(Number(p.price) * (Number(p.commission_percent) / 100) * 100) / 100,
    delivery_fee: Number(p.delivery_fee || 0),
    quantity: Number(p.quantity || 1),
  };
}

const SELECT_PRODUCT = `
  SELECT p.*, u.name AS shop_name
  FROM products p
  JOIN users u ON u.id = p.shop_id
`;

router.get('/', async (req, res) => {
  const { search, shop } = req.query;
  let sql = SELECT_PRODUCT;
  const params = [];
  const where = [];
  if (search) {
    where.push('(p.name ILIKE $' + (params.length + 1) + ' OR p.description ILIKE $' + (params.length + 2) + ')');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (shop) {
    where.push('p.shop_id = $' + (params.length + 1));
    params.push(Number(shop));
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY p.created_at DESC';
  const products = (await q(sql, params)).map(productRow);
  res.json({ products });
});

router.get('/mine', authRequired, roleRequired('shop'), async (req, res) => {
  const products = (
    await q(SELECT_PRODUCT + ' WHERE p.shop_id = $1 ORDER BY p.created_at DESC', [req.user.id])
  ).map(productRow);
  res.json({ products, limit: MAX_PRODUCTS_PER_SHOP });
});

router.post('/', authRequired, roleRequired('shop'), async (req, res) => {
  const { name, description, price, commission_percent, photos, category, warranty, delivery_fee, contact, quantity } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Le nom et le prix sont requis' });
  }
  const priceNum = Number(price);
  const percentNum = Number(commission_percent ?? 0);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: 'Prix invalide' });
  }
  if (!Number.isFinite(percentNum) || percentNum < 0 || percentNum > 100) {
    return res.status(400).json({ error: 'La commission doit être entre 0 et 100 %' });
  }
  const feeNum = Number(delivery_fee ?? 0);
  if (!Number.isFinite(feeNum) || feeNum < 0) {
    return res.status(400).json({ error: 'Les frais de livraison sont invalides' });
  }
  const qtyNum = Number(quantity ?? 1);
  if (!Number.isInteger(qtyNum) || qtyNum < 1) {
    return res.status(400).json({ error: 'La quantité doit être un nombre entier positif' });
  }
  const warrantyNum = warranty === '' || warranty === null || warranty === undefined ? null : Number(warranty);
  if (warrantyNum !== null && (!Number.isInteger(warrantyNum) || warrantyNum < 0)) {
    return res.status(400).json({ error: 'La garantie doit être un nombre entier (en mois)' });
  }
  const photoList = Array.isArray(photos) ? photos.filter((p) => typeof p === 'string' && p.startsWith('data:image/')).slice(0, 3) : [];
  const count = (await q('SELECT COUNT(*) AS n FROM products WHERE shop_id = $1', [req.user.id]))[0];
  if (Number(count.n) >= MAX_PRODUCTS_PER_SHOP) {
    return res.status(400).json({
      error: `Limite atteinte : une boutique peut publier maximum ${MAX_PRODUCTS_PER_SHOP} produits`,
    });
  }
  const created = await q(
    `INSERT INTO products (shop_id, name, description, price, commission_percent, image, photos, category, warranty, delivery_fee, contact, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      req.user.id,
      String(name).trim(),
      description ? String(description).trim() : null,
      priceNum,
      percentNum,
      photoList[0] || null,
      JSON.stringify(photoList),
      category ? String(category).trim() : null,
      warrantyNum,
      feeNum,
      contact ? String(contact).trim() : null,
      qtyNum,
    ]
  );
  const product = productRow(
    (await q(SELECT_PRODUCT + ' WHERE p.id = $1', [created[0].id]))[0]
  );
  res.status(201).json({ product });
});

router.delete('/:id', authRequired, roleRequired('shop'), async (req, res) => {
  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: 'Ce produit ne vous appartient pas' });
  }
  await q('DELETE FROM products WHERE id = $1', [product.id]);
  res.json({ ok: true });
});

export default router;
