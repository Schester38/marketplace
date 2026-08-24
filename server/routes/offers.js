import { Router } from "express";
import { q } from "../db.js";
import { defaultCurrencyFor, validCurrency } from "../currency.js";
import { storePhotoStrings, collectStorageKeys, deleteStorageKeys } from "../storage.js";
import { offerSchema } from "../validators.js";
import { validate } from "../middlewares/validate.js";

const router = Router();
const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE = 1500000;

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
  return {
    ...o,
    original_price: Number(o.original_price),
    promo_price: Number(o.promo_price),
    quantity: Number(o.quantity),
    photos,
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

router.post("/", validate(offerSchema), async (req, res) => {
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
    `INSERT INTO offers (owner_id, name, category, description, warranty, original_price, promo_price, phone, quantity, photos, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
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
    ]
  );

  const offer = offerRow((await q("SELECT * FROM offers WHERE id = $1", [created[0].id]))[0]);
  res.status(201).json({ offer });
});

router.delete("/:id", async (req, res) => {
  const offer = (await q("SELECT * FROM offers WHERE id = $1", [Number(req.params.id)]))[0];
  if (!offer) return res.status(404).json({ error: "Offre introuvable" });
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
