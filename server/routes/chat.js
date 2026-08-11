import { Router } from 'express';
import { SYSTEM_PROMPTS } from '../chat-knowledge.js';

const router = Router();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || '';

const MAX_MESSAGE = 2000;
const MAX_HISTORY = 12;

const FALLBACKS = {
  fr: 'Je suis désolé, je ne peux pas répondre pour le moment. Contactez-nous via la page Contact et nous vous répondrons sous 24 heures ! 💬',
  en: "Sorry, I can't answer right now. Please contact us via the Contact page and we'll reply within 24 hours! 💬",
  ar: 'عذراً، لا أستطيع الإجابة الآن. يرجى التواصل معنا عبر صفحة الاتصال وسنرد خلال 24 ساعة! 💬',
};

function fallback(lang) {
  return { reply: FALLBACKS[lang] || FALLBACKS.fr, offline: true };
}

router.post('/', ah(async (req, res) => {
  const { message, history, lang } = req.body || {};
  const clean = message ? String(message).slice(0, MAX_MESSAGE).trim() : '';
  if (!clean) {
    return res.status(400).json({ error: 'Message vide' });
  }

  if (!API_KEY) {
    return res.json(fallback(lang));
  }

  const sys = SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.fr;

  const contents = [];
  const hist = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];
  for (const m of hist) {
    const role = m && m.role === 'user' ? 'user' : 'model';
    const text = m && m.text ? String(m.text).slice(0, 1000).trim() : '';
    if (text) contents.push({ role, parts: [{ text }] });
  }
  contents.push({ role: 'user', parts: [{ text: clean }] });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
        }),
      }
    );

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error(`Gemini ${r.status}:`, body.slice(0, 300));
      return res.json(fallback(lang));
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();

    if (!text) return res.json(fallback(lang));
    res.json({ reply: text });
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Chat Gemini:', err.message);
    res.json(fallback(lang));
  } finally {
    clearTimeout(timeout);
  }
}));

export default router;
