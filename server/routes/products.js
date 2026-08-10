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
  const { n, ...rest } = p;
  return {
    ...rest,
    photos,
    image: photos[0] || p.image || null,
    price: Number(p.price),
    old_price: p.old_price === null || p.old_price === undefined ? null : Number(p.old_price),
    commission_percent: Number(p.commission_percent),
    commission: Math.round(Number(p.price) * (Number(p.commission_percent) / 100) * 100) / 100,
    delivery_fee: Number(p.delivery_fee || 0),
    quantity: Number(p.quantity || 1),
    sold: Number(n || 0),
  };
}

const SELECT_PRODUCT = `
  SELECT p.*, u.name AS shop_name, u.location AS shop_location, u.country AS shop_country,
         s.n
  FROM products p
  JOIN users u ON u.id = p.shop_id
  LEFT JOIN (SELECT product_id, SUM(quantity) AS n FROM sales GROUP BY product_id) s ON s.product_id = p.id
`;

const SORTS = {
  recent: 'p.created_at DESC',
  popular: 'COALESCE(s.n, 0) DESC, p.created_at DESC',
  price_asc: 'p.price ASC, p.created_at DESC',
  price_desc: 'p.price DESC, p.created_at DESC',
};

router.get('/', async (req, res) => {
  const { search, shop, category, sort, scope } = req.query;
  let sql = SELECT_PRODUCT;
  const params = [];
  const where = [];
  if (search) {
    if (scope === 'shop') {
      where.push('u.name ILIKE $' + (params.length + 1));
      params.push(`%${search}%`);
    } else {
      where.push('(p.name ILIKE $' + (params.length + 1) + ' OR p.description ILIKE $' + (params.length + 2) + ')');
      params.push(`%${search}%`, `%${search}%`);
      if (scope === 'creation') {
        where.push("p.category = 'Arts & Artisanat'");
      }
    }
  }
  if (shop) {
    where.push('p.shop_id = $' + (params.length + 1));
    params.push(Number(shop));
  }
  if (category) {
    where.push('p.category = $' + (params.length + 1));
    params.push(String(category).trim());
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY ' + (SORTS[sort] || SORTS.recent);
  const products = (await q(sql, params)).map(productRow);
  res.json({ products });
});

router.get('/mine', authRequired, roleRequired('shop'), async (req, res) => {
  const products = (
    await q(SELECT_PRODUCT + ' WHERE p.shop_id = $1 ORDER BY p.created_at DESC', [req.user.id])
  ).map(productRow);
  res.json({ products, limit: MAX_PRODUCTS_PER_SHOP });
});

router.get('/:id', async (req, res) => {
  const product = productRow(
    (await q(SELECT_PRODUCT + ' WHERE p.id = $1', [Number(req.params.id)]))[0]
  );
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  res.json({ product });
});

router.post('/', authRequired, roleRequired('shop'), async (req, res) => {
  const { name, description, price, old_price, commission_percent, photos, category, warranty, delivery_fee, contact, quantity } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Le nom et le prix sont requis' });
  }
  const priceNum = Number(price);
  const percentNum = Number(commission_percent ?? 0);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: 'Prix invalide' });
  }
  let oldPriceNum = old_price === '' || old_price === null || old_price === undefined ? null : Number(old_price);
  if (oldPriceNum !== null && (!Number.isFinite(oldPriceNum) || oldPriceNum < 0)) {
    return res.status(400).json({ error: 'Le prix normal est invalide' });
  }
  if (oldPriceNum !== null && oldPriceNum <= priceNum) {
    oldPriceNum = null;
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
  const warrantyText = warranty === '' || warranty === null || warranty === undefined ? null : String(warranty).trim().slice(0, 60);
  const photoList = Array.isArray(photos) ? photos.filter((p) => typeof p === 'string' && p.startsWith('data:image/')).slice(0, 3) : [];
  const count = (await q('SELECT COUNT(*) AS n FROM products WHERE shop_id = $1', [req.user.id]))[0];
  if (Number(count.n) >= MAX_PRODUCTS_PER_SHOP) {
    return res.status(400).json({
      error: `Limite atteinte : une boutique peut publier maximum ${MAX_PRODUCTS_PER_SHOP} produits`,
    });
  }
  const created = await q(
    `INSERT INTO products (shop_id, name, description, price, old_price, commission_percent, image, photos, category, warranty, delivery_fee, contact, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [
      req.user.id,
      String(name).trim(),
      description ? String(description).trim() : null,
      priceNum,
      oldPriceNum,
      percentNum,
      photoList[0] || null,
      JSON.stringify(photoList),
      category ? String(category).trim() : null,
      warrantyText,
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

router.delete('/:id', authRequired, roleRequired('shop'), async (req, res) => {  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: 'Ce produit ne vous appartient pas' });
  }
  await q('DELETE FROM products WHERE id = $1', [product.id]);
  res.json({ ok: true });
});

router.put('/:id', authRequired, roleRequired('shop'), async (req, res) => {
  const product = (await q('SELECT * FROM products WHERE id = $1', [Number(req.params.id)]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });
  if (product.shop_id !== req.user.id) {
    return res.status(403).json({ error: 'Ce produit ne vous appartient pas' });
  }
  const { name, description, price, old_price, commission_percent, photos, category, warranty, delivery_fee, contact, quantity } = req.body || {};
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Le nom et le prix sont requis' });
  }
  const priceNum = Number(price);
  const percentNum = Number(commission_percent ?? 0);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: 'Prix invalide' });
  }
  let oldPriceNum = old_price === '' || old_price === null || old_price === undefined ? null : Number(old_price);
  if (oldPriceNum !== null && (!Number.isFinite(oldPriceNum) || oldPriceNum < 0)) {
    return res.status(400).json({ error: 'Le prix normal est invalide' });
  }
  if (oldPriceNum !== null && oldPriceNum <= priceNum) {
    oldPriceNum = null;
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
  const warrantyText = warranty === '' || warranty === null || warranty === undefined ? null : String(warranty).trim().slice(0, 60);
  const photoList = Array.isArray(photos) ? photos.filter((p) => typeof p === 'string' && p.startsWith('data:image/')).slice(0, 3) : [];
  const updated = await q(
    `UPDATE products SET
       name = $1, description = $2, price = $3, old_price = $4, commission_percent = $5,
       image = $6, photos = $7, category = $8, warranty = $9, delivery_fee = $10,
       contact = $11, quantity = $12
     WHERE id = $13 RETURNING id`,
    [
      String(name).trim(),
      description ? String(description).trim() : null,
      priceNum,
      oldPriceNum,
      percentNum,
      photoList[0] || null,
      JSON.stringify(photoList),
      category ? String(category).trim() : null,
      warrantyText,
      feeNum,
      contact ? String(contact).trim() : null,
      qtyNum,
      product.id,
    ]
  );
  const updatedProduct = productRow(
    (await q(SELECT_PRODUCT + ' WHERE p.id = $1', [updated[0].id]))[0]
  );
  res.json({ product: updatedProduct });
});

export default router;
