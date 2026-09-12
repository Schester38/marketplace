import { Router } from "express";
import { randomBytes } from "node:crypto";
import { q, ensureColumn } from "../db.js";
import { authOptional } from "../auth.js";
import { defaultCurrencyFor, validCurrency } from "../currency.js";
import { storePhotoStrings, collectStorageKeys, deleteStorageKeys } from "../storage.js";
import { proxyPhotoUrl } from "../photoProxy.js";
import { offerSchema } from "../validators.js";
import { validate } from "../middlewares/validate.js";

const router = Router();
const MAX_PHOTOS = 1;
const MAX_PHOTO_SIZE = 1500000;

// Colonne delete_token créée à la demande (lazy, une seule fois par process).
let deleteTokenColumnChecked = false;
async function ensureDeleteTokenColumn() {
  if (deleteTokenColumnChecked) return;
  await ensureColumn("offers", "delete_token", "TEXT");
  deleteTokenColumnChecked = true;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i += 1) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function cachePublic(res, sMaxAge = 60) {
  res.set(
    "Cache-Control",
    `public, s-maxage=${sMaxAge}, max-age=${Math.floor(sMaxAge / 2)}, stale-while-revalidate=30`
  );
}

function offerRow(o) {
  let photos = [];
  try {
    photos = JSON.parse(o.photos || "[]");
  } catch {
    photos = [];
  }
  // delete_token : secret de suppression — JAMAIS exposé dans les réponses GET.
  const { delete_token, ...rest } = o;
  return {
    ...rest,
    original_price: Number(o.original_price),
    promo_price: Number(o.promo_price),
    quantity: Number(o.quantity),
    photos: photos.map(proxyPhotoUrl),
  };
}

router.get("/", async (req, res) => {
  cachePublic(res);
  const offers = (await q("SELECT * FROM offers ORDER BY created_at DESC")).map(offerRow);
  res.json({ offers });
});

router.get("/mine", async (req, res) => {
  const offers = (await q("SELECT * FROM offers ORDER BY created_at DESC")).map(offerRow);
  res.json({ offers });
});

router.get("/:id", async (req, res) => {
  cachePublic(res, 120);
  const offer = (await q("SELECT * FROM offers WHERE id = $1", [Number(req.params.id)]))[0];
  if (!offer) return res.status(404).json({ error: "Offre introuvable" });
  res.json({ offer: offerRow(offer) });
});

router.post("/", authOptional, validate(offerSchema), async (req, res) => {
  await ensureDeleteTokenColumn();
  const {
    name,
    category,
    description,
    warranty,
    original_price,
    promo_price,
    phone,
    quantity,
    photos,
    currency,
  } = req.body;
  const originalNum = Number(original_price);
  const promoNum = Number(promo_price);
  const qtyNum = Number(quantity || 0);
  const currencyCode = validCurrency(currency)
    ? String(currency).trim().toUpperCase()
    : defaultCurrencyFor(req.user?.country);

  const inputPhotos = Array.isArray(photos) ? photos : [];
  let storedPhotos = inputPhotos;
  try {
    storedPhotos = await storePhotoStrings(inputPhotos);
  } catch (err) {
    console.error("[storage] upload offres échoué, fallback base64 :", err.message);
    storedPhotos = inputPhotos;
  }

  const created = await q(
    `INSERT INTO offers (owner_id, name, category, description, warranty, original_price, promo_price, phone, quantity, photos, currency, delete_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      req.user?.id || null,
      String(name).trim(),
      category ? String(category).trim() : null,
      description ? String(description).trim() : null,
      warranty ? String(warranty).trim() : null,
      originalNum,
      promoNum,
      phone ? String(phone).trim() : null,
      qtyNum,
      JSON.stringify(storedPhotos),
      currencyCode,
      randomBytes(16).toString("hex"),
    ]
  );

  const raw = (await q("SELECT * FROM offers WHERE id = $1", [created[0].id]))[0];
  const offer = offerRow(raw);
  res.status(201).json({ offer, delete_token: raw.delete_token });
});

router.delete("/:id", authOptional, async (req, res) => {
  await ensureDeleteTokenColumn();
  const offer = (await q("SELECT * FROM offers WHERE id = $1", [Number(req.params.id)]))[0];
  if (!offer) return res.status(404).json({ error: "Offre introuvable" });
  // Suppression autorisée si : (a) le token de suppression fourni à la création
  // correspond, (b) l'utilisateur est le propriétaire connecté, ou (c) admin.
  const token = String(req.query?.token || req.body?.token || "");
  const isOwner =
    req.user && offer.owner_id && Number(offer.owner_id) === Number(req.user.id);
  const isAdmin = req.user && req.user.role === "admin";
  const tokenOk = offer.delete_token && token && safeEqual(token, offer.delete_token);
  if (!tokenOk && !isOwner && !isAdmin) {
    return res.status(403).json({
      error: "Suppression non autorisée : jeton de suppression requis.",
      code: "DELETE_TOKEN_REQUIRED",
    });
  }
  const storageKeys = collectStorageKeys(offer.photos);
  await q("DELETE FROM offers WHERE id = $1", [offer.id]);
  try {
    const removed = await deleteStorageKeys(storageKeys);
    if (removed)
      console.warn(`[storage] ${removed} fichier(s) supprimé(s) pour l'offre ${offer.id}`);
  } catch (err) {
    console.error("[storage] nettoyage offre échoué :", err.message);
  }
  res.json({ ok: true });
});

export default router;
