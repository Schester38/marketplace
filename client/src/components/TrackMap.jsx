import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

/**
 * Carte de suivi GPS (Leaflet + tuiles OpenStreetMap — gratuit, sans clé API).
 * Le bundle Leaflet (~40 Ko gzip) est chargé EN DYNAMIQUE : il n'alourdit le
 * chunk principal d'aucun dashboard. Les tuiles viennent du CDN OSM (aucun
 * egress Supabase).
 *
 * Props :
 *  - livreur : { lat, lng, track: [{lat,lng,at}] } | null  (trace + position)
 *  - buyer   : { lat, lng } | null                          (position client)
 *  - shop    : { lat, lng, name } | null                    (position boutique)
 *  - height  : hauteur de la carte (px, défaut 280)
 */
export default function TrackMap({ livreur, buyer, shop, height = 280 }) {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const LRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Init : import dynamique de Leaflet (chunk séparé, téléchargé à l'usage).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("leaflet");
        const L = mod.default || mod;
        if (cancelled || !boxRef.current || mapRef.current) return;
        const map = L.map(boxRef.current, { zoomControl: true });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        LRef.current = L;
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        setReady(true);
      } catch {
        if (!cancelled) setError("Carte indisponible (OpenStreetMap inaccessible).");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
      }
    };
  }, []);

  // Dessin : marqueurs émoji (divIcon → pas d'assets image à bundler),
  // polyline de la trace livreur, cadrage auto sur tous les points.
  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current || !LRef.current) return;
    const L = LRef.current;
    const layer = layerRef.current;
    layer.clearLayers();
    const pts = [];
    const mk = (lat, lng, emoji, label) =>
      L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));">${emoji}</div>`,
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
        title: label,
      });
    if (shop && shop.lat != null) {
      layer.addLayer(mk(shop.lat, shop.lng, "🏪", shop.name || "Boutique"));
      pts.push([shop.lat, shop.lng]);
    }
    if (buyer && buyer.lat != null) {
      layer.addLayer(mk(buyer.lat, buyer.lng, "🧍", "Client"));
      pts.push([buyer.lat, buyer.lng]);
    }
    if (livreur && livreur.lat != null) {
      const trail = (Array.isArray(livreur.track) ? livreur.track : []).filter(
        (p) => p && p.lat != null && p.lng != null
      );
      if (trail.length > 1) {
        layer.addLayer(
          L.polyline(
            trail.map((p) => [p.lat, p.lng]),
            { color: "#2563eb", weight: 3, opacity: 0.8 }
          )
        );
      }
      layer.addLayer(mk(livreur.lat, livreur.lng, "🛵", "Livreur"));
      pts.push([livreur.lat, livreur.lng]);
    }
    if (pts.length) {
      try {
        mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 16 });
      } catch {
        /* bornes invalides : on garde la vue */
      }
    }
  }, [ready, livreur, buyer, shop]);

  return (
    <div
      ref={boxRef}
      style={{
        height,
        borderRadius: 12,
        overflow: "hidden",
        background: "#e5e7eb",
        border: "1px solid #e5e7eb",
      }}
    >
      {error && <div style={{ padding: 14, fontSize: 13 }}>{error}</div>}
    </div>
  );
}