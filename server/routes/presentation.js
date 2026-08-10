import { Router } from 'express';
import { q } from '../db.js';

const router = Router();
const imageRouter = Router();

function firstPhoto(p) {
  let photos = [];
  try {
    photos = JSON.parse(p.photos || '[]');
  } catch {
    photos = [];
  }
  return photos[0] || p.image || null;
}

function dataUriParts(uri) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(String(uri || ''));
  if (!m) return null;
  return { type: m[1], buffer: Buffer.from(m[2], 'base64') };
}

imageRouter.get('/:id', async (req, res) => {
  const product = (
    await q('SELECT photos, image FROM products WHERE id = $1', [Number(req.params.id)])
  )[0];
  if (!product) return res.status(404).json({ error: 'Image introuvable' });
  const photo = firstPhoto(product);
  const parts = dataUriParts(photo);
  if (parts) {
    res.set('Content-Type', parts.type);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(parts.buffer);
  }
  if (String(photo || '').startsWith('http')) {
    return res.redirect(photo);
  }
  return res.status(404).json({ error: 'Image introuvable' });
});

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(title, desc, imgUrl, appUrl, buyUrl, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:type" content="product"/>
<meta property="og:image" content="${imgUrl}"/>
<meta property="og:url" content="${appUrl}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${imgUrl}"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f5fb;color:#111827;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px}
  .card{background:#fff;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:480px;width:100%;overflow:hidden}
  .photo{width:100%;max-height:380px;object-fit:cover;background:#eef0f7;display:block}
  .body{padding:22px}
  .brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:18px;margin-bottom:14px;color:#4f46e5}
  .brand span{background:#4f46e5;color:#fff;width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:14px}
  h1{font-size:20px;line-height:1.3;margin-bottom:6px}
  .shop{color:#6b7280;font-size:14px;margin-bottom:12px}
  .price{font-size:24px;font-weight:800;color:#4f46e5;margin-bottom:4px}
  .old{color:#9ca3af;font-size:14px;text-decoration:line-through}
  .desc{color:#374151;font-size:14px;line-height:1.55;margin:12px 0 18px}
  .btn{display:block;width:100%;text-align:center;padding:14px;border-radius:14px;font-size:16px;font-weight:700;text-decoration:none;margin-top:10px}
  .primary{background:#4f46e5;color:#fff}
  .outline{border:2px solid #d1d5db;color:#111827;background:#fff}
  .foot{color:#9ca3af;font-size:12px;text-align:center;margin-top:18px}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

router.get('/:id', async (req, res) => {
  const p = (
    await q(
      `SELECT p.*, u.name AS shop_name, u.country AS shop_country
       FROM products p JOIN users u ON u.id = p.shop_id
       WHERE p.id = $1`,
      [Number(req.params.id)]
    )
  )[0];
  if (!p) return res.status(404).send('Produit introuvable');

  const photo = firstPhoto(p);
  const price = Number(p.price || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  const old = Number(p.old_price || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  const symbol = p.shop_country === 'Kenya' ? 'KSh' : p.shop_country === 'Nigeria' ? '₦' : 'F';
  const origin = `${req.protocol}://${req.get('host')}`;
  const title = `${p.name} — Mboppi`;
  const desc = String(p.description || 'Découvrez cet article sur Mboppi.').slice(0, 200);
  const imgUrl = photo && photo.startsWith('http') ? photo : `${origin}/api/img/${p.id}`;
  const appUrl = `${origin}/produit/${p.id}`;
  const buyUrl = `${origin}/acheter/${p.id}`;

  const body = `
  <div class="card">
    ${photo ? `<img class="photo" src="${photo}" alt="${esc(p.name)}"/>` : ''}
    <div class="body">
      <div class="brand"><span>M</span>Mboppi</div>
      <h1>${esc(p.name)}</h1>
      <div class="shop">${esc(p.shop_name)}${p.shop_location ? ' &middot; ' + esc(p.shop_location) : ''}</div>
      <div class="price">${price} ${symbol}</div>
      ${p.old_price ? `<div class="old">${old} ${symbol}</div>` : ''}
      <p class="desc">${esc(desc)}</p>
      <a class="btn primary" href="${buyUrl}">Commander sur Mboppi</a>
      <a class="btn outline" href="${appUrl}">Voir la fiche complète</a>
    </div>
  </div>
  <div class="foot">Mboppi &mdash; boutiques, créateurs, vendeurs et clients</div>`;

  res.send(page(title, desc, imgUrl, appUrl, buyUrl, body));
});

export { router as pageRouter, imageRouter };
export default router;
