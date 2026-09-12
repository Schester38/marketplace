// Proxy de photos publiques : sert l'image Supabase via notre domaine avec un
// cache eternal (CDN Vercel + navigateur) → Supabase n'est appelé qu'une fois
// par image et par région au lieu de chaque vue visiteur.
import { Router } from "express";
import { photoProxyPath } from "../photoProxy.js";

const router = Router();
const SUPABASE_URL = process.env.SUPABASE_URL || "";

router.get("/photo", async (req, res) => {
  if (!SUPABASE_URL) return res.status(503).end();
  const path = photoProxyPath(req.query.p);
  if (!path) return res.status(400).json({ error: "Chemin invalide" });
  const upstream = `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
  try {
    const src = await fetch(upstream, { headers: { Accept: "image/*,*/*;q=0.9" } });
    if (!src.ok) return res.status(src.status === 404 ? 404 : 502).end();
    const buf = Buffer.from(await src.arrayBuffer());
    res.set("Content-Type", src.headers.get("content-type") || "image/webp");
    res.set("Content-Length", String(buf.length));
    res.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    res.set("X-Content-Type-Options", "nosniff");
    res.end(buf);
  } catch {
    res.status(502).end();
  }
});

export default router;