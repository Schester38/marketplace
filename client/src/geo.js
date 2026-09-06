// Géolocalisation automatique du visiteur.
//
// Stratégie en cascade :
//   1. /api/geo — headers IP fournis par Vercel (x-vercel-ip-*), mapping ISO → fr.
//   2. navigator.geolocation (navigation GPS du navigateur) + reverse geocoding
//      BigDataCloud (gratuit, sans clé), si l'utilisateur accepte.
//   3. Aucune info → { country: "" } (l'utilisateur choisit son pays lui-même).
//
// Résultat mis en cache 24 h (storage) pour ne pas re-solliciter l'API/le GPS à
// chaque page ; le pays détecté sert à pré-remplir l'inscription et à prioriser
// les produits du même pays (catalogue).

import { storage } from "./storage.js";
import { COUNTRIES } from "./config.js";
import { useEffect, useState } from "react";

const CACHE_KEY = "mboppi_geo";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

// Correspondances non triviales code ISO → nom COUNTRIES (le reste est mappé
// serveur). Surtout utile pour le repli navigateur (BigDataCloud renvoie des
// noms en anglais ou localisés).
function normalizeCountry(name) {
  if (!name) return "";
  const n = String(name).trim();
  const lookup = new Map([
    ["us", "États-Unis"],
    ["usa", "États-Unis"],
    ["united states", "États-Unis"],
    ["united states of america", "États-Unis"],
    ["uk", "Royaume-Uni"],
    ["great britain", "Royaume-Uni"],
    ["england", "Royaume-Uni"],
    ["uae", "Émirats arabes unis"],
    ["democratic republic of the congo", "République démocratique du Congo"],
    ["dr congo", "République démocratique du Congo"],
    ["congo (kinshasa)", "République démocratique du Congo"],
    ["congo - kinshasa", "République démocratique du Congo"],
    ["ivory coast", "Côte d'Ivoire"],
    ["south korea", "Corée du Sud"],
    ["north korea", "Corée du Nord"],
    ["czech republic", "Tchéquie"],
    ["czechia", "Tchéquie"],
    ["russia", "Russie"],
    ["iran", "Iran"],
    ["syria", "Syrie"],
    ["vietnam", "Vietnam"],
    ["laos", "Laos"],
    ["brunei darussalam", "Brunei"],
    ["cabo verde", "Cap-Vert"],
    ["cape verde", "Cap-Vert"],
    ["eswatini", "Eswatini"],
    ["swaziland", "Eswatini"],
    ["macedonia", "Macédoine du Nord"],
    ["bosnia and herzegovina", "Bosnie-Herzégovine"],
    ["tanzania", "Tanzanie"],
    ["venezuela", "Venezuela"],
    ["bolivia", "Bolivie"],
    ["peru", "Pérou"],
  ]);

  const k = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (lookup.has(k)) return lookup.get(k);
  // Match exact ou "contient" dans la liste COUNTRIES (noms français).
  const exact = COUNTRIES.find((c) => c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === k);
  if (exact) return exact.name;
  const partial = COUNTRIES.find((c) => c.name.toLowerCase().includes(n.toLowerCase()));
  return partial ? partial.name : n;
}

let cached = null;

async function detectFromApi() {
  try {
    const d = await fetch("/api/geo", { cache: "no-store" }).then((r) => r.json());
    if (d && d.ok && d.country) return { country: d.country, city: d.city || "", lat: d.lat, lon: d.lon };
    if (d && d.ok && d.code && !d.country) {
      // Code ISO non mappé côté serveur : dernier recours par ville (headers).
      // Sans nom exploitable, on laisse le GPS/le choix manuel prendre le relais.
      return { country: "", city: d.city || "", lat: d.lat, lon: d.lon, isoCode: d.code };
    }
  } catch {
    /* API indisponible : on retombe sur le GPS */
  }
  return null;
}

function detectFromGps() {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    try {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const url =
              "https://api.bigdatacloud.net/data/reverse-geocode-client" +
              `?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=fr`;
            const data = await fetch(url).then((r) => r.json());
            const country = normalizeCountry(data.countryName || data.country?.name || "");
            resolve({ country, city: data.city || data.locality || "", lat: latitude, lon: longitude });
          } catch {
            resolve(null);
          }
        },
        () => resolve(null),
        { timeout: 8000, maximumAge: 15 * 60 * 1000 }
      );
    } catch {
      resolve(null);
    }
  });
}

export async function detectCountry() {
  // Cache 24 h
  if (cached) return cached;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.at && Date.now() - parsed.at < CACHE_TTL) {
        cached = parsed;
        return parsed;
      }
    }
  } catch {
    /* cache invalide */
  }

  let result = null;
  const fromApi = await detectFromApi();
  if (fromApi && fromApi.country) {
    result = { country: fromApi.country, city: fromApi.city || "", lat: fromApi.lat, lon: fromApi.lon };
  } else {
    const gps = await detectFromGps();
    if (gps && gps.country) {
      result = { country: gps.country, city: gps.city || "", lat: gps.lat, lon: gps.lon };
    }
  }

  if (result) {
    result.at = Date.now();
    cached = result;
    try {
      storage.setItem(CACHE_KEY, JSON.stringify(result));
    } catch {
      /* stockage indisponible : on ignore */
    }
  }
  return result || { country: "", city: "" };
}

// Petit hook React : expose la détection + état de chargement.
export function useGeo() {
  const [geo, setGeo] = useState({ country: "", city: "", loading: true });
  useEffect(() => {
    let cancelled = false;
    detectCountry().then((g) => {
      if (!cancelled) setGeo({ ...g, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return geo;
}

export function clearGeoCache() {
  cached = null;
  try {
    storage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}