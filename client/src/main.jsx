import { storage, sessionStore } from "./storage";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App, { AuthProvider } from "./App.jsx";
import { LangProvider } from "./i18n.jsx";
import { StoreProvider } from "./store.jsx";
import "./styles.css";

import * as Sentry from "@sentry/react";

const DSN = import.meta.env.VITE_SENTRY_DSN;
if (DSN) {
  Sentry.init({
    dsn: DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

const pathname = window.location.pathname;

// Monitoring léger : remontée des erreurs globales (auto-hébergé, sans compte externe).
if (!pathname.startsWith("/admin")) {
  let lastSent = 0;
  const sendLog = (message, stack) => {
    const now = Date.now();
    if (now - lastSent < 5000) return; // anti-flood
    lastSent = now;
    const payload = {
      message,
      stack,
      url: window.location.href,
      username: (() => {
        try {
          return JSON.parse(storage.getItem("user") || "null")?.name || "";
        } catch {
          return "";
        }
      })(),
    };
    try {
      navigator.sendBeacon(
        "/api/logs",
        new Blob([JSON.stringify(payload)], { type: "application/json" })
      );
    } catch {
      fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  };
  window.addEventListener("error", (e) =>
    sendLog(String(e.message || "Erreur inconnue"), e.error?.stack)
  );
  window.addEventListener("unhandledrejection", (e) =>
    sendLog(String(e.reason?.message || e.reason || "Promesse rejetée"), e.reason?.stack)
  );
}

try {
  let t = storage.getItem("theme");
  if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
} catch {
  /* stockage indisponible */
}

const themeCol = document.querySelector('meta[name="theme-color"]');
if (themeCol) themeCol.content = "#131a22";
if (pathname.startsWith("/verone")) {
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = "/manifest-verone.webmanifest";
  document.title = "Verone";
} else if (pathname.startsWith("/livreur")) {
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = "/manifest-livreur.webmanifest";
  document.title = "MboppiShop Livreur";
} else if (pathname.startsWith("/admin")) {
  const link = document.querySelector('link[rel="manifest"]');
  if (link) link.href = "/manifest-admin.webmanifest";
  document.title = "MboppiShop Admin";
}

if ("serviceWorker" in navigator) {
  // Mise à jour automatique : quand un nouveau SW prend le contrôle (nouvelle
  // version déployée), la page se recharge avec la nouvelle version SANS
  // action de l'utilisateur.
  const openedAt = Date.now();
  let interacted = false;
  ["mousedown", "keydown", "touchstart", "scroll"].forEach((e) =>
    window.addEventListener(e, () => { interacted = true; }, { once: true, passive: true })
  );
  const reloadScheduler = (() => {
    let applied = false;
    const allowReload = () => {
      // Garde anti-boucle : au plus 1 rechargement déclenché par une mise à
      // jour SW toutes les 10 s (protège contre un controllerchange répété).
      try {
        const K = "mboppi_sw_reload_ts";
        const last = Number(sessionStorage.getItem(K) || 0);
        const now = Date.now();
        if (now - last < 10000) return false;
        sessionStorage.setItem(K, String(now));
        return true;
      } catch {
        return true;
      }
    };
    const go = () => {
      if (applied) return;
      applied = true;
      window.location.reload();
    };
    return {
      request() {
        if (applied) return;
        if (!allowReload()) return;
        fetch("/", { cache: "no-store" }).catch(() => {});
        // L'app n'a pas monté (splash encore affiché) = page bloquée sur un
        // ancien shell dont les chunks manquent : recharger immédiatement,
        // le nouveau SW (network-first) servira l'HTML frais.
        const appMounted = !!document.querySelector(".app");
        // Ouverture récente sans interaction (utilisateur vient d'ouvrir le
        // site) : mise à jour immédiate, invisible. Sinon : au prochain
        // passage en arrière-plan (pas d'interruption en pleine utilisation).
        if (
          !appMounted ||
          document.visibilityState === "hidden" ||
          (Date.now() - openedAt < 10000 && !interacted)
        ) {
          go();
          return;
        }
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") go();
        });
      },
    };
  })();
  let registration = null;
  const checkUpdate = () => {
    if (registration) registration.update().catch(() => {});
  };
  let registered = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "APP_UPDATED") reloadScheduler.request();
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Un SW contrôlait déjà la page au chargement : tout nouveau contrôleur
    // est une mise à jour → recharger (corrigé : « registered » était posé
    // après la fin du register, la course masquait souvent la mise à jour).
    if (hadController) reloadScheduler.request();
  });
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          registered = true;
          registration = reg;
          // Détection régulière des nouvelles versions (onglet laissé ouvert)
          // + immédiate au retour sur l'onglet.
          checkUpdate();
          setInterval(checkUpdate, 5 * 60 * 1000);
        })
        .catch((err) => console.error("SW error:", err));
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkUpdate();
    });
  }
}

const Root = () => (
  <React.StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <LangProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LangProvider>
      </StoreProvider>
    </BrowserRouter>
  </React.StrictMode>
);
ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
