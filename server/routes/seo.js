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

const OG_DEFAULT = `${BASE_URL}/og-image.png`;

function originOf(req) {
  const proto = req.get('x-forwarded-proto');
  const host = req.get('host');
  if (proto && host) return `${proto}://${host}`;
  return BASE_URL;
}

function absImageOf(image, origin = BASE_URL) {
  if (!image || /^data:/.test(image)) return OG_DEFAULT;
  if (/^https?:/.test(image)) return image;
  return `${origin}${image}`;
}

router.get('/', async (req, res) => {
  try {
    const products = (await q(
      `SELECT p.id, p.name, p.price, p.currency, p.image, u.name AS shop_name,
              COALESCE(s.n, 0) AS sold, fp.promo_price AS flash_price
       FROM products p
       JOIN users u ON u.id = p.shop_id
       LEFT JOIN (SELECT product_id, SUM(quantity) FILTER (WHERE status = 'delivered') AS n
                  FROM sales GROUP BY product_id) s ON s.product_id = p.id
       LEFT JOIN flash_promotions fp ON fp.product_id = p.id AND fp.ends_at > now()
       WHERE p.quantity > 0
       ORDER BY COALESCE(s.n, 0) DESC, p.created_at DESC
       LIMIT 12`
    )) || [];
    const title = 'Mboppi — Boutiques, vendeurs et offres du moment';
    const canonical = `${originOf(req)}/`;
    const descText =
      'Mboppi, le marché de votre quartier en ligne : produits des boutiques, créations des créateurs, vente avec commissions, commande avec livraison et paiement mobile.';
    const image = products[0]?.image || '';
    const absImage = absImageOf(image, originOf(req));

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Mboppi',
      url: canonical,
      description: descText,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${BASE_URL}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    };
    if (products.length) {
      jsonLd.mainEntity = {
        '@type': 'ItemList',
        itemListElement: products.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          url: `${BASE_URL}/produit/${p.id}`,
          image: p.image && /^https?:/.test(p.image) ? p.image : p.image ? `${BASE_URL}${p.image}` : undefined,
          offers: { '@type': 'Offer', price: String(p.flash_price != null ? Number(p.flash_price) : Number(p.price || 0)), priceCurrency: (p.currency || 'XAF').toUpperCase() },
        })),
      };
    }

    let html = await loadIndexHtml();
    html = injectHead(html, { title, description: descText, canonical, ogImage: absImage });
    html = injectJsonLd(html, jsonLd);
    if (!html) {
      return res.status(200).type('html').send(
        `<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>${title}</title>
<meta name="description" content="${descText}"/><link rel="canonical" href="${canonical}"/>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head>
<body><h1>${title}</h1><p>${descText}</p>
<ul>${products.map((p) => `<li><a href="${BASE_URL}/produit/${p.id}">${p.name}</a></li>`).join('')}</ul>
</body></html>`
      );
    }
    res.type('html').send(html);
  } catch {
    const html = await loadIndexHtml();
    if (html) return res.type('html').send(html);
    res.status(500).send('Erreur serveur');
  }
});

router.get('/produit/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).type('html').send(notFoundHtml);
    const [p] = await q(
      `SELECT p.name, p.description, p.price, p.currency, p.image, p.photos,
              u.name AS shop_name, u.location AS shop_location, u.country AS shop_country, u.verified AS shop_verified,
              fp.promo_price AS flash_price, fp.ends_at AS flash_ends_at
       FROM products p JOIN users u ON u.id = p.shop_id
       LEFT JOIN flash_promotions fp ON fp.product_id = p.id AND fp.ends_at > now()
       WHERE p.id = $1`,
      [id]
    );
    if (!p) return res.status(404).type('html').send(notFoundHtml);
    const images = parsePhotos(p.photos, p.image);
    const image = images[0] || '';
    const absImage = absImageOf(image, originOf(req));
    const description = (p.description || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 155);
    const shopLine = p.shop_name ? ` chez ${p.shop_name}` : '';
    const price = p.flash_price != null ? Number(p.flash_price) : Number(p.price);
    const title = `${p.name}${shopLine} — Mboppi`;
    const canonical = `${originOf(req)}/produit/${id}`;
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
        ...(p.flash_ends_at ? { priceValidUntil: String(p.flash_ends_at).slice(0, 10) } : {}),
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
    const canonical = `${originOf(req)}/boutique/${id}`;
    const count = Number(shop.product_count || 0);
    const descText = `${shop.name} est une boutique sur Mboppi${shop.location ? `, située à ${shop.location}${shop.country ? ` (${shop.country})` : ''}` : ''}. ${count} produit${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}. Commandez en ligne ou par WhatsApp.`.slice(0, 155);
    const image = shop.sample_image || '';
    const absImage = absImageOf(image, originOf(req));

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

router.get('/createur/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).type('html').send(notFoundHtml);
    const [shop] = await q(
      `SELECT id, name, location, country, verified,
              (SELECT COUNT(*) FROM products p WHERE p.shop_id = users.id AND p.quantity > 0) AS product_count,
              (SELECT image FROM products p WHERE p.shop_id = users.id AND p.quantity > 0 AND image IS NOT NULL ORDER BY p.created_at DESC LIMIT 1) AS sample_image
       FROM users WHERE id = $1 AND role = 'creator'`,
      [id]
    );
    if (!shop) return res.status(404).type('html').send(notFoundHtml);
    const title = `${shop.name}${shop.location ? ` — Créateur à ${shop.location}` : ''} | Mboppi`;
    const canonical = `${originOf(req)}/createur/${id}`;
    const count = Number(shop.product_count || 0);
    const descText = `${shop.name} est un créateur sur Mboppi${shop.location ? `, situé à ${shop.location}${shop.country ? ` (${shop.country})` : ''}` : ''}. ${count} création${count > 1 ? 's' : ''} exposée${count > 1 ? 's' : ''}. Découvrez et commandez ses créations en ligne ou par WhatsApp.`.slice(0, 155);
    const image = shop.sample_image || '';
    const absImage = absImageOf(image, originOf(req));

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: shop.name,
      url: canonical,
      description: descText,
      ...(shop.verified ? { image: absImage } : {}),
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

router.get('/sitemap.xml', async (req, res) => {
  try {
    const staticUrls = [
      ['/', 'daily', '1.0'],
      ['/vitrine-offre', 'hourly', '0.9'],
      ['/createurs', 'weekly', '0.7'],
      ['/a-propos', 'monthly', '0.7'],
      ['/contact', 'monthly', '0.7'],
      ['/faq', 'monthly', '0.6'],
      ['/cgv', 'yearly', '0.4'],
      ['/cgu', 'yearly', '0.4'],
      ['/mentions-legales', 'yearly', '0.4'],
      ['/donnees', 'monthly', '0.5'],
      ['/verone', 'yearly', '0.4'],
    ];
    const [products, users, offers] = await Promise.all([
      q('SELECT id, created_at FROM products WHERE quantity > 0 ORDER BY created_at DESC'),
      q("SELECT id, role FROM users WHERE role IN ('shop', 'creator') ORDER BY id DESC"),
      q('SELECT id, created_at FROM offers WHERE quantity > 0 ORDER BY id DESC'),
    ]);
    const entries = [
      ...staticUrls.map(([loc, freq, prio]) => ({ loc: BASE_URL + loc, freq, prio })),
      ...CITIES.map(([slug]) => ({ loc: `${BASE_URL}/ville/${slug}`, freq: 'weekly', prio: '0.7' })),
      ...offers.map((o) => ({ loc: `${BASE_URL}/offre/${o.id}`, freq: 'weekly', prio: '0.7', lastmod: o.created_at })),
      ...products.map((p) => ({ loc: `${BASE_URL}/produit/${p.id}`, freq: 'weekly', prio: '0.8', lastmod: p.created_at })),
      ...users.map((s) => ({
        loc: s.role === 'creator' ? `${BASE_URL}/createur/${s.id}` : `${BASE_URL}/boutique/${s.id}`,
        freq: 'weekly',
        prio: '0.7',
      })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${e.loc}</loc><changefreq>${e.freq}</changefreq><priority>${e.prio}</priority>${e.lastmod ? `<lastmod>${String(e.lastmod).slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`;
    res.type('application/xml').send(xml);
  } catch {
    res.status(500).send('Erreur serveur');
  }
});

const CITIES = [
  ['douala', 'Douala'],
  ['yaounde', 'Yaoundé'],
  ['bafoussam', 'Bafoussam'],
  ['bamenda', 'Bamenda'],
  ['garoua', 'Garoua'],
  ['maroua', 'Maroua'],
  ['kribi', 'Kribi'],
  ['limbe', 'Limbé'],
  ['buea', 'Buéa'],
  ['nkongsamba', 'Nkongsamba'],
  ['edea', 'Edéa'],
  ['ngaoundere', 'Ngaoundéré'],
  ['kumba', 'Kumba'],
];

const cityName = (slug) => {
  const found = CITIES.find(([s]) => s === slug);
  if (found) return found[1];
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
};

router.get('/ville/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return res.status(404).type('html').send(notFoundHtml);
    const name = cityName(slug);
    const [stats] = await q(
      `SELECT COUNT(DISTINCT p.id) AS products,
              COUNT(DISTINCT u.id) AS shops
       FROM products p JOIN users u ON u.id = p.shop_id
       WHERE p.quantity > 0 AND regexp_replace(translate(lower(COALESCE(u.city, '') || ' ' || COALESCE(u.location, '')), 'àâäáéèêëíîïóôöúùûüçñ', 'aaaaeeeeiiiioooouuuucn'), '[^a-z0-9]', '', 'g') ILIKE '%' || $1 || '%'`,
      [slug.replace(/[^a-z0-9]/g, '')]
    );
    const count = Number(stats?.products || 0);
    const title = `Acheter à ${name} — Boutiques et produits | Mboppi`;
    const canonical = `${originOf(req)}/ville/${slug}`;
    const descText = count
      ? `Commandez ${count} produit${count > 1 ? 's' : ''} des boutiques de ${name} en ligne : téléphones, mode, alimentation, artisanat. Livraison rapide avec Mboppi.`
      : `Achetez et vendez à ${name} avec Mboppi : le marché de votre quartier en ligne. Boutiques, créations et livraison.`;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      url: canonical,
      description: descText,
    };

    let html = await loadIndexHtml();
    html = injectHead(html, { title, description: descText, canonical, ogImage: OG_DEFAULT, ogType: 'website' });
    html = injectJsonLd(html, jsonLd);
    if (!html) return res.status(200).type('html').send(`<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>${title}</title><meta name="description" content="${descText}"/></head><body><h1>${title}</h1></body></html>`);
    res.type('html').send(html);
  } catch {
    const html = await loadIndexHtml();
    if (html) return res.type('html').send(html);
    res.status(500).send('Erreur serveur');
  }
});

router.get('/offre/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).type('html').send(notFoundHtml);
    const [o] = await q(
      `SELECT o.*, u.name AS owner_name FROM offers o LEFT JOIN users u ON u.id = o.owner_id WHERE o.id = $1`,
      [id]
    );
    if (!o) return res.status(404).type('html').send(notFoundHtml);
    const photos = parsePhotos(o.photos, null);
    const image = photos[0] || '';
    const absImage = absImageOf(image, originOf(req));
    const title = `${o.name}${o.owner_name ? ` — Offre de ${o.owner_name}` : ''} | Mboppi`;
    const canonical = `${originOf(req)}/offre/${id}`;
    const promo = Number(o.promo_price);
    const descText = (o.description || `${o.name} en promotion sur Mboppi.`).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 155);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: o.name,
      image: image || undefined,
      description: descText,
      url: canonical,
      offers: {
        '@type': 'Offer',
        price: String(promo),
        priceCurrency: (o.currency || 'XAF').toUpperCase(),
        priceValidUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        availability: Number(o.quantity) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: canonical,
      },
    };

    let html = await loadIndexHtml();
    html = injectHead(html, { title, description: descText, canonical, ogImage: absImage, ogType: 'product' });
    html = injectJsonLd(html, jsonLd);
    if (!html) return res.status(200).type('html').send(`<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>${title}</title><meta name="description" content="${descText}"/></head><body><h1>${title}</h1></body></html>`);
    res.type('html').send(html);
  } catch {
    const html = await loadIndexHtml();
    if (html) return res.type('html').send(html);
    res.status(500).send('Erreur serveur');
  }
});

const STATIC_PAGES = {
  '/a-propos': { title: 'À propos de Mboppi — Le marché de votre quartier en ligne', description: 'Découvrez Mboppi, la plateforme qui connecte boutiques, créateurs, vendeurs, livreurs et clients de votre quartier, en ligne et en toute simplicité.' },
  '/contact': { title: 'Contact — Mboppi', description: 'Contactez l\'équipe Mboppi : besoin d\'aide, question ou suggestion ? Nous sommes à votre écoute.' },
  '/faq': { title: 'Questions fréquentes (FAQ) — Mboppi', description: 'Les réponses aux questions les plus fréquentes sur Mboppi : vendre, acheter, commandes, livraison et paiement.' },
  '/cgv': { title: 'Conditions générales de vente — Mboppi', description: 'Consultez les conditions générales de vente applicables sur la plateforme Mboppi.' },
  '/cgu': { title: 'Conditions générales d\'utilisation — Mboppi', description: 'Consultez les conditions générales d\'utilisation de la plateforme Mboppi.' },
  '/mentions-legales': { title: 'Mentions légales — Mboppi', description: 'Mentions légales du site Mboppi : éditeur, hébergement et informations légales.' },
  '/donnees': { title: 'Protection des données — Mboppi', description: 'Découvrez comment Mboppi protège vos données personnelles et votre vie privée.' },
  '/soutien': { title: 'Soutenir Mboppi — Faire un don', description: 'Soutenez Mboppi par un don pour aider le marché de votre quartier à grandir.' },
  '/vitrine-offre': { title: 'Vitrine des offres et promotions — Mboppi', description: 'Toutes les offres et promotions du moment sur Mboppi, avec remises exclusives.' },
  '/createurs': { title: 'Les créateurs de Mboppi — Artisanat et créations', description: 'Découvrez les créateurs Mboppi et leurs créations : artisanat, mode, décoration et plus encore.' },
  '/verone': { title: 'Vérone — Mboppi', description: 'La page Vérone de Mboppi : découvrez tout ce qu\'elle propose.' },
};

router.get(Object.keys(STATIC_PAGES), async (req, res) => {
  try {
    const page = STATIC_PAGES[req.path];
    if (!page) return res.status(404).type('html').send(notFoundHtml);
    const canonical = originOf(req) + req.path;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      url: canonical,
      description: page.description,
    };
    let html = await loadIndexHtml();
    html = injectHead(html, { title: page.title, description: page.description, canonical, ogImage: OG_DEFAULT });
    html = injectJsonLd(html, jsonLd);
    if (!html) {
      return res.status(200).type('html').send(
        `<!doctype html><html lang="fr"><head><meta charset="UTF-8"/><title>${page.title}</title><meta name="description" content="${page.description}"/><link rel="canonical" href="${canonical}"/></head><body><h1>${page.title}</h1><p><a href="${BASE_URL}/">Retour à Mboppi</a></p></body></html>`
      );
    }
    res.type('html').send(html);
  } catch {
    const html = await loadIndexHtml();
    if (html) return res.type('html').send(html);
    res.status(500).send('Erreur serveur');
  }
});

export default router;
