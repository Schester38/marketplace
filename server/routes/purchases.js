import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { q, withTransaction } from '../db.js';
import { authRequired } from '../auth.js';
import { sendPush } from '../push.js';
import { listPhotos } from '../photo.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    } catch {
      /* token invalide/expiré : achat en tant qu'invité */
    }
  }
  next();
};

const CONFIRM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomConfirmCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CONFIRM_CHARS[Math.floor(Math.random() * CONFIRM_CHARS.length)];
  }
  return code;
}

function saleRow(s) {
  return {
    ...s,
    total_price: Number(s.total_price),
    commission: Number(s.commission),
    purchase_price: s.purchase_price != null ? Number(s.purchase_price) : null,
    product_price: Math.round((Number(s.total_price) / Number(s.quantity)) * 100) / 100,
  };
}

router.post('/', optionalAuth, ah(async (req, res) => {
  const { product_id, seller_code, purchase_price, quantity, buyer_name, buyer_phone, buyer_city, buyer_address, payment_method } = req.body || {};
  if (!product_id || !seller_code) {
    return res.status(400).json({ error: 'Produit et code vendeur sont requis' });
  }

  const rawMethod = String(payment_method || '').trim().toLowerCase();
  const method = rawMethod === 'mobile' || rawMethod === 'mobile_money'
    ? 'mobile'
    : rawMethod === 'en ligne' || rawMethod === 'online' || rawMethod === 'en_ligne' || rawMethod === 'ikeepay' || rawMethod === 'h2h'
      ? 'en ligne'
      : 'espece';

  const code = String(seller_code).trim().toUpperCase();
  const seller = (await q('SELECT id, name, seller_code FROM users WHERE seller_code = $1', [code]))[0];
  if (!seller) {
    return res.status(400).json({ error: 'Code vendeur invalide' });
  }

  const productId = Number(product_id);
  if (!Number.isInteger(productId) || productId < 1) return res.status(400).json({ error: 'Produit invalide' });

  const product = (await q('SELECT * FROM products WHERE id = $1', [productId]))[0];
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  const qty = Number(quantity ?? 1);
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'Quantité invalide' });
  }

  // Le prix catalogue (ou le prix de la promotion éclair active) est la source de vérité.
  // Un prix client arbitraire ne doit pas modifier le calcul financier.
  const promo = (await q(
    'SELECT promo_price, commission_percent FROM flash_promotions WHERE product_id = $1 AND ends_at > now()',
    [product.id]
  ))[0];
  const price = promo ? Number(promo.promo_price) : Number(product.price);
  if (!Number.isFinite(price) || price < 0) return res.status(500).json({ error: 'Prix produit invalide' });

  const buyer = req.user || null;
  const name = (buyer_name && String(buyer_name).trim()) || (buyer ? buyer.name : '');
  const phone = buyer_phone ? String(buyer_phone).trim() : '';
  const city = buyer_city ? String(buyer_city).trim() : '';
  const address = buyer_address ? String(buyer_address).trim() : '';
  if (!name) {
    return res.status(400).json({ error: 'Le nom du client est requis' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'Le numéro de téléphone est requis' });
  }
  if (!city) {
    return res.status(400).json({ error: 'La ville est requise' });
  }
  if (!address) {
    return res.status(400).json({ error: 'L\'adresse de livraison est requise' });
  }
  const total = Math.round(price * qty * 100) / 100;
  const commissionPercent = promo ? Number(promo.commission_percent) : Number(product.commission_percent);
  const commission = Math.round(price * (commissionPercent / 100) * qty * 100) / 100;

  let referralCommission = 0;
  let referredBy = null;
  if (buyer) {
    const b = (await q('SELECT referred_by FROM users WHERE id = $1', [buyer.id]))[0];
    referredBy = b && b.referred_by ? Number(b.referred_by) : null;
    if (referredBy) {
      referralCommission = Math.round((price * qty * 2) / 100 * 100) / 100;
    }
  }

  const result = await withTransaction(async (tx) => {
    // Réserve le stock atomiquement au moment de la commande.
    const locked = (await tx.query(
      `UPDATE products
       SET quantity = quantity - $1, reserved_quantity = COALESCE(reserved_quantity, 0) + $1
       WHERE id = $2 AND quantity >= $1
       RETURNING *`,
      [qty, product.id]
    ))[0];
    if (!locked) {
      const stock = Number(product.quantity || 0);
      const error = new Error(stock <= 0 ? 'Produit en rupture de stock' : 'Stock insuffisant');
      error.statusCode = 409;
      throw error;
    }

    let confirmCode = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = randomConfirmCode();
      const taken = (await tx.query('SELECT id FROM sales WHERE confirm_code = $1 FOR SHARE', [candidate]))[0];
      if (!taken) { confirmCode = candidate; break; }
    }
    if (!confirmCode) {
      const error = new Error('Impossible de générer le code de confirmation');
      error.statusCode = 503;
      throw error;
    }

    const created = await tx.query(
      `INSERT INTO sales (product_id, seller_id, quantity, total_price, commission, status, purchase_price, currency, buyer_id, buyer_code, buyer_name, buyer_phone, buyer_city, buyer_address, confirm_code, referral_commission, referred_by, payment_method, stock_reserved)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, TRUE) RETURNING id`,
      [product.id, seller.id, qty, total, commission, price, product.currency || 'XAF', buyer ? buyer.id : null, code, name, phone, city, address, confirmCode, referralCommission, referredBy, method]
    );

    await tx.query(
      `INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'sale_order', $2), ($3, 'sale_order', $2)`,
      [seller.id, created[0].id, product.shop_id]
    );
    return { id: created[0].id, confirmCode };
  });

  const productName = String(product.name || 'article');
  await sendPush(seller.id, {
    title: 'Nouvelle commande 🛒',
    body: `${productName} — ${name} attend la livraison.`,
    url: '/seller',
  });
  await sendPush(product.shop_id, {
    title: 'Nouvelle commande 🛒',
    body: `${productName} — vendeur : ${seller.name} (${code}), client : ${name}${result.confirmCode ? `, code : ${result.confirmCode}` : ''}${referredBy ? `, client parrainé (2% pour le parrain : ${referralCommission} F)` : ''}.`,
    url: '/shop',
  });
  if (referredBy) {
    const referrer = (await q('SELECT name FROM users WHERE id = $1', [referredBy]))[0];
    await q(
      `INSERT INTO notifications (user_id, type, sale_id) VALUES ($1, 'referral_earned', $2)`,
      [referredBy, result.id]
    );
    await sendPush(referredBy, {
      title: 'Votre filleul a commandé 🎁',
      body: `${name} a commandé « ${productName} » — vous recevrez 2% (${referralCommission} F) après livraison.`,
      url: '/seller',
    });
  }

  const full = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, u.name AS seller_name, shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.id = $1`,
      [result.id]
    )
  )[0];

  res.status(201).json({ sale: saleRow(full), ok: true });
}));

router.get('/my', authRequired, ah(async (req, res) => {
  const purchases = (
    await q(
      `SELECT s.*, p.name AS product_name, p.commission_percent, p.photos, p.contact AS shop_contact, COALESCE(u.name, '—') AS seller_name, u.phone AS seller_phone, shop.name AS shop_name, shop.country AS shop_country
       FROM sales s
       JOIN products p ON p.id = s.product_id
       LEFT JOIN users u ON u.id = s.seller_id
       JOIN users shop ON shop.id = p.shop_id
       WHERE s.buyer_id = $1 AND NOT ($1 = ANY(s.hidden_for))
       ORDER BY s.created_at DESC`,
      [req.user.id]
    )
  ).map((s) => ({ ...saleRow(s), photos: listPhotos(s.photos) }));
  res.json({ purchases });
}));

export default router;
