import { Router } from "express";
import { q } from "../db.js";
import { authRequired } from "../auth.js";

const router = Router();
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// Carte « à proximité » entre acteurs de la place de marché.
//  - La boutique cherche des LIVREURS autour d'elle (rôle livreur, frais ≤
//    FRESH_MINUTES) ; le vendeur et le client connecté cherchent les BOUTIQUES
//    (rôle shop).
//  - Seuls les comptes qui ont EXPLICITEMENT partagé leur position GPS
//    (users.lat/lng non nuls) apparaissent. La distance (Haversine, km) est
//    calculée depuis la position du demandeur envoyée en query.
//  - Toujours OK car authRequired (aucune donnée de géoloc publique).
// ---------------------------------------------------------------------------

const FRESH_MINUTES = 10; // un acteur est « en ligne » si sa position a < 10 min
const DEFAULT_RADIUS_KM = 50;
const MAX_RADIUS_KM = 200;

router.get(
  "/nearby",
  authRequired,
  ah(async (req, res) => {
    const role = String(req.query.role || "livreur").trim();
    if (!["shop", "livreur", "seller", "creator"].includes(role)) {
      return res.status(400).json({ error: "Rôle invalide (shop, livreur, seller, creator)" });
    }
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Position du demandeur requise (lat, lng)" });
    }
    const radius = Math.min(Number(req.query.radius_km) || DEFAULT_RADIUS_KM, MAX_RADIUS_KM);
    // Fraîcheur demandée : pour les livreurs (disponibilité), on ne montre que
    // les positions mises à jour depuis moins de FRESH_MINUTES. Pour les
    // boutiques on accepte les positions plus anciennes (position de référence).
    const onlyFresh = String(req.query.fresh || "1") !== "0";
    const freshClause = onlyFresh ? "AND u.position_updated_at >= now() - INTERVAL '" + FRESH_MINUTES + " minutes'" : "";

    const rows = await q(
      `SELECT u.id, u.name, u.lat, u.lng, u.position_updated_at, u.city, u.location,
              (6371 * acos(
                LEAST(1,
                  COS(RADIANS($1)) * COS(RADIANS(u.lat))
                  * COS(RADIANS(u.lng) - RADIANS($2))
                  + SIN(RADIANS($1)) * SIN(RADIANS(u.lat))
                )
              )) AS distance_km
       FROM users u
      WHERE u.role = $3
        AND u.id <> $4
        AND u.lat IS NOT NULL AND u.lng IS NOT NULL
        ${freshClause}
        AND 6371 * acos(
                LEAST(1,
                  COS(RADIANS($1)) * COS(RADIANS(u.lat))
                  * COS(RADIANS(u.lng) - RADIANS($2))
                  + SIN(RADIANS($1)) * SIN(RADIANS(u.lat))
                )
              ) <= $5
      ORDER BY distance_km
      LIMIT 50`,
      [lat, lng, role, req.user.id, radius]
    );

    res.json({
      users: rows.map((u) => ({
        id: Number(u.id),
        name: u.name,
        role: u.role,
        city: u.city,
        location: u.location,
        lat: Number(u.lat),
        lng: Number(u.lng),
        distance_km: Math.round(Number(u.distance_km) * 10) / 10,
        online: u.position_updated_at != null,
      })),
      fresh_minutes: FRESH_MINUTES,
      radius_km: radius,
    });
  })
);

export default router;