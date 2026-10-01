// ─── MboppiStudio — outils créatifs IA du panneau Admin ──────────────────────
// Onglet « MboppiStudio » : adaptation de l'application « Studio IA » au
// panneau d'administration de MboppiShop.
//
// Première étape (ce lot) : le socle de l'onglet est posé et l'outil HOOKS est
// branché sur l'IA du serveur (Gemini, clé déjà configurée) — les autres outils
// (Tendances 317, Podcast 304, Résumé 305, Avatar 301, Voix 302, Réglages)
// apparaissent dans la barre avec la mention « Bientôt » et seront branchés
// dans les prochains lots, chacun avec sa route /api/studio/*.
//
// Sécurité : aucune clé API dans le navigateur ; l'état du module est lu via
// GET /api/studio (admin) qui indique seulement si l'IA est configurée.

import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import HooksTool from "../studio/HooksTool.jsx";

// Barre d'outils du studio (numéros repris du prototype d'origine).
const STUDIO_TOOLS = [
  { id: "hooks", num: "311", emoji: "🪝", label: "Hooks", ready: true },
  { id: "trends", num: "317", emoji: "📈", label: "Tendances", ready: false },
  { id: "podcast", num: "304", emoji: "🎧", label: "Podcast", ready: false },
  { id: "summary", num: "305", emoji: "📹", label: "Résumé", ready: false },
  { id: "avatar", num: "301", emoji: "🎭", label: "Avatar", ready: false },
  { id: "voice", num: "302", emoji: "🎙️", label: "Voix", ready: false },
  { id: "settings", num: "⚙️", emoji: "⚙️", label: "Réglages", ready: false },
];

export default function MboppiStudio() {
  const { t } = useLang();
  const [tool, setTool] = useState("hooks");
  const [status, setStatus] = useState(null); // { ai_configured } | null
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .studioStatus()
      .then((res) => {
        if (alive) setStatus(res);
      })
      .catch((err) => {
        if (alive) setStatusError(err?.message || "");
      });
    return () => {
      alive = false;
    };
  }, []);

  const active = STUDIO_TOOLS.find((x) => x.id === tool) || STUDIO_TOOLS[0];

  // ── Rendu ──
  return (
    <section className="mstudio-root">
      <header className="mstudio-head">
        <div>
          <h1 className="mstudio-title">🎬 {t("MboppiStudio")}</h1>
          <p className="mstudio-sub">
            {t(
              "Outils créatifs propulsés par l'IA — les clés des fournisseurs restent sur le serveur."
            )}
          </p>
        </div>
        {status?.ai_configured === true && (
          <span className="mstudio-pill mstudio-pill-ok">⚡ {t("IA active")} · Gemini</span>
        )}
        {status?.ai_configured === false && (
          <span className="mstudio-pill mstudio-pill-warn">⚠️ {t("IA non configurée")}</span>
        )}
      </header>

      {/* Une seule famille d'outils est affichée à la fois (barre horizontale
          défilante sur mobile, comme le prototype d'origine). */}
      <nav className="mstudio-tabs" role="tablist" aria-label={t("Outils du studio")}>
        {STUDIO_TOOLS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tool === x.id}
            className={`mstudio-tab ${tool === x.id ? "active" : ""} ${x.ready ? "" : "soon"}`}
            onClick={() => setTool(x.id)}
          >
            <span className="mstudio-tab-emoji" aria-hidden="true">
              {x.emoji}
            </span>
            {t(x.label)}
            <span className="mstudio-tab-num">{x.num}</span>
            {!x.ready && <span className="mstudio-tab-soon">{t("Bientôt")}</span>}
          </button>
        ))}
      </nav>

      {statusError && (
        <div className="mstudio-error">
          {t("Impossible de vérifier l'état du studio :")} {statusError}
        </div>
      )}

      {tool === "hooks" ? (
        <HooksTool />
      ) : (
        <div className="mstudio-card mstudio-placeholder">
          <div className="mstudio-placeholder-emoji" aria-hidden="true">
            {active.emoji}
          </div>
          <h3>{t("Outil en préparation")}</h3>
          <p>
            {t(
              "Ce module sera branché dans un prochain lot. Le socle MboppiStudio — onglet, design, authentification admin et clés côté serveur — est déjà validé avec l'outil Hooks."
            )}
          </p>
        </div>
      )}
    </section>
  );
}
