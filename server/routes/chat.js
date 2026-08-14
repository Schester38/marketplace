import { Router } from 'express';
import { SYSTEM_PROMPTS } from '../chat-knowledge.js';
import { q } from '../db.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const API_KEY = process.env.GEMINI_API_KEY || '';

const MODEL_FALLBACKS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

const MAX_MESSAGE = 2000;
const MAX_HISTORY = 12;
const CATALOG_MAX_ITEMS = 8;

function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function scoreProduct(kws, p) {
  const name = String(p.name || '').toLowerCase();
  const category = String(p.category || '').toLowerCase();
  const description = String(p.description || '').toLowerCase();
  let s = 0;
  for (const kw of kws) {
    if (name.includes(kw)) s += 3;
    else if (category.includes(kw)) s += 2;
    else if (description.includes(kw)) s += 1;
  }
  return s;
}

async function catalogSnapshot(message) {
  const kws = tokens(message);
  const products = await q(
    `SELECT p.id, p.name, p.price, p.currency, p.category, p.description, p.quantity, p.delivery_fee,
            u.name AS shop_name
     FROM products p JOIN users u ON u.id = p.shop_id
     WHERE p.quantity > 0
     ORDER BY p.created_at DESC
     LIMIT 60`
  );
  const scored = products
    .map((p) => ({ ...p, _s: scoreProduct(kws, p) }))
    .filter((p) => kws.length === 0 || p._s > 0)
    .sort((a, b) => b._s - a._s)
    .slice(0, CATALOG_MAX_ITEMS);
  const list = scored.map((p) => {
    const parts = [`« ${p.name} »`, `prix : ${Number(p.price)} ${p.currency || 'XAF'}`];
    if (p.category) parts.push(`catégorie : ${p.category}`);
    parts.push(`stock : ${Number(p.quantity)}`);
    if (p.shop_name) parts.push(`boutique : ${p.shop_name}`);
    if (Number(p.delivery_fee) > 0) parts.push(`livraison : ${Number(p.delivery_fee)} ${p.currency || 'XAF'}`);
    return '- ' + parts.join(' | ');
  });
  if (list.length) return list.join('\n');
  return null;
}

const FALLBACKS = {
  fr: 'Je suis désolé, je ne peux pas répondre pour le moment. Contactez-nous via la page Contact et nous vous répondrons sous 24 heures ! 💬',
  en: "Sorry, I can't answer right now. Please contact us via the Contact page and we'll reply within 24 hours! 💬",
  ar: 'عذراً، لا أستطيع الإجابة الآن. يرجى التواصل معنا عبر صفحة الاتصال وسنرد خلال 24 ساعة! 💬',
};

function fallback(lang, extra = {}) {
  return { reply: FALLBACKS[lang] || FALLBACKS.fr, ...extra };
}

router.post('/', ah(async (req, res) => {
  const { message, history, lang } = req.body || {};
  const clean = message ? String(message).slice(0, MAX_MESSAGE).trim() : '';
  if (!clean) {
    return res.status(400).json({ error: 'Message vide' });
  }

  if (!API_KEY) {
    return res.json(fallback(lang, { offline: true }));
  }

  const sys = SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.fr;

  let catalog = null;
  try {
    catalog = await catalogSnapshot(clean);
  } catch (err) {
    console.error('Chat : impossible de charger le catalogue ->', err.message);
  }

  const baseSys = catalog
    ? sys + `

CATALOGUE EN TEMPS RÉEL (produits actuellement disponibles sur le site, vérifiés à la base de données) :
${catalog}

Tu peux utiliser ces prix et cette disponibilité dans ta réponse. Ne cite que les prix/listes présents dans ce catalogue ; pour toute autre information, renvoie vers la fiche produit, la FAQ ou la page Contact.`
    : sys;

  const contents = [];
  const hist = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];
  for (const m of hist) {
    const role = m && m.role === 'user' ? 'user' : 'model';
    const text = m && m.text ? String(m.text).slice(0, 1000).trim() : '';
    if (text) contents.push({ role, parts: [{ text }] });
  }
  contents.push({ role: 'user', parts: [{ text: clean }] });

  const body = {
    systemInstruction: { parts: [{ text: baseSys }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
  };

  const models = [MODEL, ...MODEL_FALLBACKS.filter((m) => m !== MODEL)];

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(body),
        }
      );

      if (!r.ok) {
        const text = await r.text().catch(() => '');
        console.error(`Gemini ${model} -> HTTP ${r.status}:`, text.slice(0, 300));
        continue;
      }

      const data = await r.json();
      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('')
        .trim();
      if (text) return res.json({ reply: text });
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error(`Gemini ${model} -> délai dépassé`);
      } else {
        console.error(`Gemini ${model} ->`, err.message);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  res.json(fallback(lang));
}));

export default router;
