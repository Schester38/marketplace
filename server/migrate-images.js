import { q } from './db.js';
import { ensureBucket, isBase64Photo, isStoredUrl, uploadPhoto } from './storage.js';

async function uploadEntry(value, folder) {
  if (isStoredUrl(value)) return { value, uploaded: false };
  if (isBase64Photo(value)) {
    const url = await uploadPhoto(value, folder);
    return { value: url || value, uploaded: Boolean(url) };
  }
  return { value, uploaded: false };
}

export async function migrateImages() {
  await ensureBucket();

  let uploaded = 0;
  let productsUpdated = 0;
  let offersUpdated = 0;
  let ordersUpdated = 0;

  const products = await q(
    `SELECT id, shop_id, image, photos FROM products
     WHERE photos LIKE '%data:image%' OR image LIKE 'data:image%'`
  );
  for (const p of products) {
    let entries = [];
    try {
      entries = JSON.parse(p.photos || '[]');
    } catch {
      entries = [];
    }
    const folder = `products/${p.shop_id}`;
    const stored = [];
    for (const e of entries) {
      if (typeof e === 'string') {
        const { value, uploaded: up } = await uploadEntry(e, folder);
        if (up) uploaded += 1;
        if (value) stored.push({ thumb: value, full: value });
      } else if (e && typeof e === 'object') {
        const { value: thumb, uploaded: upT } = await uploadEntry(e.thumb, folder);
        const { value: full, uploaded: upF } = await uploadEntry(e.full, folder);
        if (upT) uploaded += 1;
        if (upF) uploaded += 1;
        if (thumb || full) stored.push({ thumb: thumb || full, full: full || thumb });
      }
    }
    if (!stored.length) continue;
    const image = stored[0].thumb;
    await q('UPDATE products SET image = $1, photos = $2 WHERE id = $3', [image, JSON.stringify(stored), p.id]);
    productsUpdated += 1;
  }

  const offers = await q(`SELECT id, photos FROM offers WHERE photos LIKE '%data:image%'`);
  for (const o of offers) {
    let photos = [];
    try {
      photos = JSON.parse(o.photos || '[]');
    } catch {
      photos = [];
    }
    const stored = [];
    for (const photo of photos) {
      const { value, uploaded: up } = await uploadEntry(photo, 'offers');
      if (up) uploaded += 1;
      if (value) stored.push(value);
    }
    if (!stored.length) continue;
    await q('UPDATE offers SET photos = $1 WHERE id = $2', [JSON.stringify(stored), o.id]);
    offersUpdated += 1;
  }

  const orders = await q(`SELECT id, items FROM orders WHERE items::text LIKE '%data:image%'`);
  for (const o of orders) {
    let items = [];
    try {
      items = Array.isArray(o.items) ? o.items : [];
    } catch {
      items = [];
    }
    let changed = false;
    for (const item of items) {
      if (item && isBase64Photo(item.photo)) {
        const pid = Number(item.product_id || item.productId);
        if (pid) {
          const prod = (await q('SELECT image, photos FROM products WHERE id = $1', [pid]))[0];
          let url = prod?.image;
          if (!url) {
            try {
              url = JSON.parse(prod?.photos || '[]')[0]?.thumb ?? null;
            } catch {
              url = null;
            }
          }
          if (url) {
            item.photo = url;
            changed = true;
          }
        }
      }
    }
    if (changed) {
      await q('UPDATE orders SET items = $1::jsonb WHERE id = $2', [JSON.stringify(items), o.id]);
      ordersUpdated += 1;
    }
  }

  return { uploaded, productsUpdated, offersUpdated, ordersUpdated };
}