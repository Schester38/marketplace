// MboppiStudio → outil « Hooks » (311) — adaptation React du prototype
// « Studio IA » (générateur de hooks viraux pour les réseaux sociaux).
//
// Différences voulues avec le prototype d'origine :
//   • aucune clé API dans le navigateur : l'appel passe par /api/studio/hooks
//     (admin) qui utilise la clé Gemini déjà configurée sur le serveur ;
//   • état React + presse-papiers (plus de manipulation innerHTML) ;
//   • libellés traduits (fr/en/ar/es) comme le reste de la plateforme.

import React, { useCallback, useRef, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

const PRESETS = [
  { label: "🚀 Viral", text: "Comment devenir viral sur TikTok en 30 jours" },
  { label: "💰 Business", text: "Les 3 erreurs qui ruinent ta jeune entreprise" },
  { label: "💪 Fitness", text: "Comment perdre 10 kilos sans régime" },
  { label: "🧠 Productivité", text: "La méthode pour doubler ta productivité" },
  { label: "💸 Finance", text: "Comment épargner 500 € par mois sans effort" },
];

const PLATFORMS = [
  { id: "tiktok", label: "TikTok" },
  { id: "reels", label: "Instagram Reels" },
  { id: "shorts", label: "YouTube Shorts" },
  { id: "linkedin", label: "LinkedIn" },
];

const COUNTS = [5, 10, 20, 50];

const TONES = [
  { id: "choc", label: "Choc" },
  { id: "curiosite", label: "Curiosité" },
  { id: "autorite", label: "Autorité" },
  { id: "storytelling", label: "Storytelling" },
  { id: "controversial", label: "Controversé" },
  { id: "humour", label: "Humour" },
  { id: "mix", label: "Mix" },
];

// Copie presse-papiers avec repli pour les navigateurs/iframes sans API
// (même approche que le prototype d'origine, sans toucher au DOM visible).
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function HooksTool() {
  const { t } = useLang();
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [count, setCount] = useState(10);
  const [tone, setTone] = useState("mix");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hooks, setHooks] = useState([]);
  const [copied, setCopied] = useState(-1); // index copié ; -2 = « tout copier »
  const copyTimer = useRef(null);

  const canGenerate = topic.trim().length >= 3 && !busy;

  const flashCopied = useCallback((idx) => {
    setCopied(idx);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(-1), 1400);
  }, []);

  async function onCopyOne(text, idx) {
    if (await copyText(text)) flashCopied(idx);
  }

  async function onCopyAll() {
    if (!hooks.length) return;
    if (await copyText(hooks.join("\n"))) flashCopied(-2);
  }

  async function onGenerate() {
    if (!canGenerate) return;
    setBusy(true);
    setError("");
    setHooks([]);
    setCopied(-1);
    try {
      const res = await api.studioHooks({ topic: topic.trim(), platform, tone, count });
      setHooks(Array.isArray(res.hooks) ? res.hooks : []);
    } catch (err) {
      setError(err?.message || t("Erreur inconnue"));
    } finally {
      setBusy(false);
    }
  }

  // ── Rendu ──
  return (
    <div className="mstudio-tool">
      <div className="mstudio-card">
        <div className="mstudio-card-title">
          <span className="mstudio-num">311</span> {t("Générateur de hooks")}
        </div>
        <label className="mstudio-label" htmlFor="mstudio-hooks-topic">
          {t("Sujet de ta vidéo")}
        </label>
        <textarea
          id="mstudio-hooks-topic"
          className="mstudio-textarea"
          placeholder={t("Ex : Comment gagner 1000 abonnés en 30 jours")}
          value={topic}
          maxLength={300}
          onChange={(e) => setTopic(e.target.value)}
        />
        <div className="mstudio-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="mstudio-preset"
              onClick={() => setTopic(p.text)}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="mstudio-card">
        <div className="mstudio-card-title">
          <span className="mstudio-num">2</span> {t("Paramètres")}
        </div>
        <div className="mstudio-grid-3">
          <div>
            <label className="mstudio-label" htmlFor="mstudio-hooks-platform">
              {t("Plateforme")}
            </label>
            <select
              id="mstudio-hooks-platform"
              className="mstudio-select"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mstudio-label" htmlFor="mstudio-hooks-count">
              {t("Nombre")}
            </label>
            <select
              id="mstudio-hooks-count"
              className="mstudio-select"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mstudio-label" htmlFor="mstudio-hooks-tone">
              {t("Ton")}
            </label>
            <select
              id="mstudio-hooks-tone"
              className="mstudio-select"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              {TONES.map((x) => (
                <option key={x.id} value={x.id}>
                  {t(x.label)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="mstudio-btn mstudio-btn-primary"
        disabled={!canGenerate}
        onClick={onGenerate}
      >
        {busy
          ? t("Génération…")
          : topic.trim().length < 3
            ? t("Décris ton sujet")
            : t("Générer les hooks")}
      </button>

      {busy && (
        <div className="mstudio-loading" role="status">
          <span className="mstudio-spinner" aria-hidden="true" />
          {t("L'IA rédige vos hooks…")}
        </div>
      )}

      {error && <div className="mstudio-error">{error}</div>}

      {hooks.length > 0 && (
        <div className="mstudio-card">
          <div className="mstudio-card-title mstudio-card-title-row">
            <span>
              <span className="mstudio-num">✨</span> {t("Tes hooks")}
            </span>
            <button type="button" className="mstudio-btn mstudio-btn-ghost" onClick={onCopyAll}>
              {copied === -2 ? t("Copié ✓") : t("Tout copier")}
            </button>
          </div>
          <div className="mstudio-hooks">
            {hooks.map((h, i) => (
              <div key={`${i}-${h.slice(0, 24)}`} className="mstudio-hook">
                {i === 0 && <span className="mstudio-top">TOP</span>}
                <span className="mstudio-hook-num">{i + 1}</span>
                <span className="mstudio-hook-text">{h}</span>
                <button
                  type="button"
                  className="mstudio-btn mstudio-btn-ghost"
                  onClick={() => onCopyOne(h, i)}
                >
                  {copied === i ? t("Copié ✓") : t("Copier")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
