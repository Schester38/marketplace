import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { q } from '../db.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');
const BASE_URL = process.env.PUBLIC_URL || 'https://mboppi-mboppi.vercel.app';

let htmlCache = null;
let htmlCacheAt = 0;
const TTL = 30 * 1000;

async function loadIndexHtml() {
  if (htmlCache && Date.now() - htmlCacheAt < TTL) return htmlCache;
  const raw = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf8') : null;
  htmlCache = raw;
  htmlCacheAt = Date.now();
  return raw;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function injectHead(html, { title, description, canonical, ogImage, ogType = 'website' }) {
  if (!html) return null;
  const safe = (v) => escapeHtml(v).replace(/\s+/g, ' ');
  const t = safe(title);
  const d = safe(description);
  const c = safe(canonical);
  const img = safe(ogImage);
  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${t}</title>`);
  const setMeta = (selector, contentAttr, value) => {
    const esc = String(value).replace(/\s+/g, ' ');
    const re = new RegExp(`<meta[^>]*${selector}[^>]*>`, 'i');
    if (re.test(out)) {
      out = out.replace(re, (tag) => {
        if (tag.includes(`${contentAttr}=`)) {
          return tag.replace(new RegExp(`(${contentAttr}=")[^"]*(")`), `$1${esc}$2`);
        }
        return tag.replace(/(\/?>$)/, ` ${contentAttr}="${esc}"$1`);
      });
    } else {
      out = out.replace(/<\/head>/, () => `<meta ${selector} ${contentAttr}="${esc}" />\n</head>`);
    }
  };
  setMeta('name="description"', 'content', d);
  setMeta('property="og:title"', 'content', t);
  setMeta('property="og:description"', 'content', d);
  setMeta('property="og:url"', 'content', c);
  setMeta('property="og:type"', 'content', ogType);
  setMeta('name="twitter:title"', 'content', t);
  setMeta('name="twitter:description"', 'content', d);
  setMeta('name="twitter:card"', 'content', 'summary_large_image');
  if (img) {
    setMeta('property="og:image"', 'content', img);
    setMeta('name="twitter:image"', 'content', img);
  }
  out = out.replace(/<link rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${c}" />`);
  if (!/rel="canonical"/i.test(out)) {
    out = out.replace(/<\/head>/, () => `<link rel="canonical" href="${c}" />\n</head>`);
  }
  return out;
}

function injectJsonLd(html, jsonLd) {
  if (!html) return null;
  const script = `<script type="application/ld+json" data-ssr="1">\n${JSON.stringify(jsonLd)}\n</script>`;
  return html.replace(/<\/head>/, () => `${script}\n</head>`);
}

const notFoundHtml = `<!doctype html>
<html lang="fr"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Produit introuvable — Mboppi</title>
<meta name="robots" content="noindex, nofollow"/>
<link rel="canonical" href="${BASE_URL}/"/>
</head><body style="font-family:system-ui,sans-serif;text-align:center;padding:40px">
<h1>Produit introuvable</h1>
<p>Le produit que vous cherchez n'existe plus.</p>
<p><a href="${BASE_URL}/">Retour au marché Mboppi</a></p>
</body></html>`;

function parsePhotos(raw, fallback) {
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const urls = arr.map((x) => (typeof x === 'string' ? x : x?.url)).filter(Boolean);
        if (urls.length) return urls;
      }
    } catch {
      /* ignore */
    }
  }
  return fallback ? [fallback] : [];
}

router.get('/produit/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).type('html').send(notFoundHtml);
    const [p] = await q(
      `SELECT p.name, p.description, p.price, p.currency, p.image, p.photos,
              u.name AS shop_name, u.location AS shop_location, u.country AS shop_country, u.verified AS shop_verified
       FROM products p JOIN users u ON u.id = p.shop_id
       WHERE p.id = $1`,
      [id]
    );
    if (!p) return res.status(404).type('html').send(notFoundHtml);
    const images = parsePhotos(p.photos, p.image);
    const image = images[0] || '';
    const absImage = image
      ? /^https?:/.test(image)
        ? image
        : `${BASE_URL}${image}`
      : `${BASE_URL}/og-image.svg`;
    const description = (p.description || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 155);
    const shopLine = p.shop_name ? ` chez ${p.shop_name}` : '';
    const price = Number(p.price);
    const title = `${p.name}${shopLine} — Mboppi`;
    const canonical = `${BASE_URL}/produit/${id}`;
    const descText = description || `${p.name} disponible sur Mboppi. Commandez en ligne ou par WhatsApp.`;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      image,
      description: descText,
      url: canonical,
      offers: {
        '@type': 'Offer',
        price: String(price),
        priceCurrency: (p.currency || 'XAF').toUpperCase(),
        availability: 'https://schema.org/InStock',
        url: canonical,
      },
      seller: p.shop_name ? { '@type': 'Organization', name: p.shop_name } : undefined,
    };
    if (p.shop_verified) jsonLd.brand = { '@type': 'Brand', name: p.shop_name };

    let html = await loadIndexHtml();
    html = injectHead(html, {
      title,
      description: descText,
      canonical,
      ogImage: absImage,
      ogType: 'product',
    });
    html = injectJsonLd(html, jsonLd);
    if (!html) {
      return res
        .status(200)
        .type('html')
        .send(
          `<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>${title.replace(/</g, '')}</title>${Object.entries({ description: descText, 'og:title': title, 'og:description': descText, 'og:url': canonical, 'og:image': absImage, 'og:type': 'product' })
            .map(([k, v]) => (k.startsWith('og:') ? `<meta property="${k}" content="${v.replace(/"/g, '&quot;')}"/>` : `<meta name="${k}" content="${v.replace(/"/g, '&quot;')}"/>`))
            .join('')}<script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body><h1>${title.replace(/</g, '')}</h1><p>${descText.replace(/</g, '')}</p><p><a href="${canonical}">Voir le produit</a></p></body></html>`
        );
    }
    res.type('html').send(html);
  } catch (err) {
    const html = await loadIndexHtml();
    if (html) return res.type('html').send(html);
    res.status(500).send('Erreur serveur');
  }
});

router.get('/boutique/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).type('html').send(notFoundHtml);
    const [shop] = await q(
      `SELECT id, name, location, country, verified,
              (SELECT COUNT(*) FROM products p WHERE p.shop_id = users.id) AS product_count,
              (SELECT image FROM products p WHERE p.shop_id = users.id AND image IS NOT NULL ORDER BY p.created_at DESC LIMIT 1) AS sample_image
       FROM users WHERE id = $1 AND role IN ('shop', 'creator')`,
      [id]
    );
    if (!shop) return res.status(404).type('html').send(notFoundHtml);
    const title = `${shop.name}${shop.location ? ` — Boutique à ${shop.location}` : ''} | Mboppi`;
    const canonical = `${BASE_URL}/boutique/${id}`;
    const count = Number(shop.product_count || 0);
    const descText = `${shop.name} est une boutique sur Mboppi${shop.location ? `, située à ${shop.location}${shop.country ? ` (${shop.country})` : ''}` : ''}. ${count} produit${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}. Commandez en ligne ou par WhatsApp.`.slice(0, 155);
    const image = shop.sample_image || '';
    const absImage = image ? (/^https?:/.test(image) ? image : `${BASE_URL}${image}`) : `${BASE_URL}/og-image.svg`;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: shop.name,
      url: canonical,
      image: image || undefined,
      description: descText,
      ...(shop.location
        ? { address: { '@type': 'PostalAddress', addressLocality: shop.location, addressCountry: shop.country || undefined } }
        : {}),
    };

    let html = await loadIndexHtml();
    html = injectHead(html, { title, description: descText, canonical, ogImage: absImage, ogType: 'website' });
    html = injectJsonLd(html, jsonLd);
    if (!html) return res.status(200).type('html').send(`<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>${title}</title><meta name="description" content="${descText}"/></head><body><h1>${title}</h1></body></html>`);
    res.type('html').send(html);
  } catch {
    const html = await loadIndexHtml();
    if (html) return res.type('html').send(html);
    res.status(500).send('Erreur serveur');
  }
});

export default router;
