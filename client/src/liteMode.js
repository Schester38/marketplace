import { useEffect, useState } from "react";

const KEY = "mboppi_lite";

export function isLite() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setLite(v) {
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {}
}

export function weakConnection() {
  try {
    const c = navigator.connection;
    if (!c) return false;
    if (c.saveData) return true;
    return c.effectiveType === "slow-2g" || c.effectiveType === "2g";
  } catch {
    return false;
  }
}

export function useLite() {
  const [lite, set] = useState(isLite());
  useEffect(() => {
    const on = () => set(isLite());
    window.addEventListener("mboppi-lite", on);
    return () => window.removeEventListener("mboppi-lite", on);
  }, []);
  const update = (v) => {
    setLite(v);
    set(v);
    try {
      window.dispatchEvent(new Event("mboppi-lite"));
    } catch {}
  };
  return { lite, setLite: update, toggle: () => update(!lite) };
}

export function pickPhoto(entry, lite) {
  if (!entry) return null;
  if (typeof entry === "string") return entry;
  if (lite) return entry.thumb || entry.full || null;
  return entry.full || entry.thumb || null;
}
