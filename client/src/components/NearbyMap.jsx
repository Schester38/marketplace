import React, { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

/**
 * Carte « à proximité » entre acteurs de la place de marché.
 *  - Partage EN CONTINU de la position de l'utilisateur courant (ping ~30 s
 *    tant que l'écran est ouvert) → il apparaît « en ligne » chez les autres.
 *  - Recharge toutes les 30 s les acteurs du rôle demandé à proximité
 *    (distance Haversine côté serveur) et les place sur la carte OSM.
 *
 * Props :
 *  - role    : "shop" | "livreur" | "seller" | "creator" — qui montrer
 *  - fresh   : true = seulement les acteurs en ligne (défaut)
 *  - title   : titre de la section
 *  - emoji   : émoji des marqueurs (défaut "🛵")
 *  - label   : libellé (« livreurs », « boutiques »…) pour les messages
 */
export default function NearbyMap({ role = "livreur", fresh = true, title, emoji = "🛵", label }) {
  const { t } = useLang();
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const LRef = useRef(null);
  const [mapError, setMapError] = useState("");
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);

  // --- Init Leaflet (chunk dynamique, tuiles OSM gratuites) ---
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
        if (!cancelled) setMapError(t("Carte indisponible (OpenStreetMap inaccessible)."));
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

  // --- Partage de position EN CONTINU : ping ~30 s tant que l'écran est ouvert ---
  let shareTimerRef = useRef(null);
  useEffect(() => {
    if (!navigator.geolocation) {
      setMsg(t("La géolocalisation n'est pas disponible sur cet appareil."));
      return undefined;
    }
    const post = (pos) => {
      api
        .myPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        .then(() => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
        .catch(() => {});
    };
    const ask = () =>
      navigator.geolocation.getCurrentPosition(
        post,
        () => {},
        { enableHighAccuracy: true, timeout: 12000 }
      );
    ask();
    shareTimerRef.current = setInterval(ask, 30000);
    return () => {
      if (shareTimerRef.current) clearInterval(shareTimerRef.current);
    };
  }, []);

  // --- Chargement des acteurs autour (distance côté serveur) ---
  useEffect(() => {
    if (!me) {
      setUsers([]);
      return;
    }
    const load = () => {
      api
        .nearbyUsers({ role, lat: me.lat, lng: me.lng, fresh })
        .then((d) => setUsers(Array.isArray(d.users) ? d.users : []))
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [me, role, fresh]);

  // --- Dessin : marqueurs acteurs + position courante + cadrage ---
  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current || !LRef.current) return;
    const L = LRef.current;
    const layer = layerRef.current;
    layer.clearLayers();
    const pts = [];
    const mk = (lat, lng, emoji, name) =>
      L.marker([lat, lng], {
        icon: L.divIcon({
          html: `<div style="font-size:22px;line-height:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));">${emoji}</div>`,
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        title: name,
      });
    if (me) {
      layer.addLayer(mk(me.lat, me.lng, "📍", t("Moi")));
      pts.push([me.lat, me.lng]);
    }
    for (const u of users) {
      layer.addLayer(
        mk(u.lat, u.lng, emoji, `${u.name}${u.distance_km != null ? ` — ${u.distance_km} km` : ""}`)
      );
      pts.push([u.lat, u.lng]);
    }
    if (pts.length) {
      try {
        mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 15 });
      } catch {
        /* bornes invalides : vue par défaut */
      }
    }
  }, [ready, me, users]);

  return (
    <section className="card" style={{ marginBottom: 14 }}>
      {title ? <h2>{title}</h2> : null}
      <p className="hint" style={{ margin: "4px 0 8px" }}>
        {t(
          "Votre position est partagée pendant que cet écran est ouvert ; les {role} à proximité sont mis à jour toutes les 30 s.",
          { role: label || role }
        )}
      </p>
      {msg && <p className="hint">{msg}</p>}
      <div
        ref={boxRef}
        style={{
          height: 300,
          borderRadius: 12,
          overflow: "hidden",
          background: "#e5e7eb",
          border: "1px solid #e5e7eb",
        }}
      >
        {mapError && <div style={{ padding: 14, fontSize: 13 }}>{mapError}</div>}
      </div>
      {me && users.length === 0 && (
        <p className="hint" style={{ marginTop: 6 }}>
          {t("Aucun acteur à proximité pour le moment.")}
        </p>
      )}
      {users.length > 0 && (
        <ul style={{ marginTop: 8, fontSize: 13 }}>
          {users.map((u) => (
            <li key={u.id}>
              {emoji} {u.name}
              {u.city ? ` · ${u.city}` : ""}
              {u.distance_km != null ? ` · ${u.distance_km} km` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}