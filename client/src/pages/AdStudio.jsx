import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

const SOURCE_TYPES = [
  { id: "features", label: "Pages et fonctionnalités" },
  { id: "products", label: "Produits" },
  { id: "publications", label: "Offres publiées" },
  { id: "roles", label: "Rôles utilisateurs" },
];

const STYLES = [
  { id: "ugc", label: "UGC / face caméra" },
  { id: "cinema", label: "Cinématique" },
  { id: "presentation", label: "Présentation" },
  { id: "demonstration", label: "Démonstration" },
  { id: "storytelling", label: "Storytelling" },
  { id: "humor", label: "Humour" },
  { id: "testimonial", label: "Témoignage joué (clairement fictif)" },
];

const PLATFORMS = [
  { id: "general", label: "Format adaptable" },
  { id: "tiktok", label: "TikTok" },
  { id: "reels", label: "Instagram / Facebook Reels" },
  { id: "shorts", label: "YouTube Shorts" },
  { id: "facebook", label: "Facebook" },
  { id: "whatsapp", label: "WhatsApp Statut" },
  { id: "linkedin", label: "LinkedIn" },
];

const DURATIONS = [15, 30, 45, 60];
const IDEA_COUNTS = [2, 3, 4];

function ideaText(idea) {
  const scenes = idea.storyboard
    .map(
      (scene, index) =>
        `${index + 1}. ${scene.time}\nImage : ${scene.visual}\nAudio : ${scene.audio}\nTexte à l'écran : ${scene.overlay}`
    )
    .join("\n\n");
  return [
    idea.title,
    `Concept : ${idea.concept}`,
    `Accroche : ${idea.hook}`,
    `Script :\n${idea.script}`,
    `Storyboard :\n${scenes}`,
    `Légende : ${idea.caption}`,
    `Appel à l'action : ${idea.cta}`,
  ].join("\n\n");
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Utiliser le repli DOM si l'accès au presse-papiers est refusé.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  let copied = false;
  try {
    area.select();
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(area);
  }
  if (!copied) throw new Error("Copie impossible dans ce navigateur.");
}

export default function AdStudio() {
  const { t } = useLang();
  const [sourceType, setSourceType] = useState("features");
  const [sourceQuery, setSourceQuery] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState({ items: [], has_more: false });
  const [sourceId, setSourceId] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [style, setStyle] = useState("ugc");
  const [platform, setPlatform] = useState("general");
  const [duration, setDuration] = useState(30);
  const [count, setCount] = useState(3);
  const [language, setLanguage] = useState("fr");
  const [brief, setBrief] = useState("");
  const [ideas, setIdeas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const requestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = ++requestSequence.current;
    const timer = setTimeout(
      async () => {
        setLoadingCatalog(true);
        setCatalogError("");
        try {
          const result = await api.adsCatalog({
            type: sourceType,
            q: sourceQuery.trim(),
            page,
          });
          if (!active || requestId !== requestSequence.current) return;
          setCatalog((previous) => {
            const items =
              page === 1
                ? result.items || []
                : [
                    ...previous.items,
                    ...(result.items || []).filter(
                      (item) => !previous.items.some((current) => current.id === item.id)
                    ),
                  ];
            return { items, has_more: Boolean(result.has_more) };
          });
        } catch (err) {
          if (active && requestId === requestSequence.current) {
            setCatalogError(err?.message || t("Impossible de charger le catalogue."));
          }
        } finally {
          if (active && requestId === requestSequence.current) setLoadingCatalog(false);
        }
      },
      sourceType === "products" || sourceType === "publications" ? 300 : 0
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [sourceType, sourceQuery, page, t]);

  const selectedSource = catalog.items.find((item) => item.id === sourceId);
  const canGenerate = Boolean(selectedSource) && !busy;

  const changeSourceType = (value) => {
    setSourceType(value);
    setSourceQuery("");
    setPage(1);
    setSourceId("");
    setIdeas([]);
    setError("");
  };

  async function generateIdeas() {
    if (!selectedSource || busy) return;
    setBusy(true);
    setError("");
    setCopyMessage("");
    try {
      const result = await api.adsGenerate({
        source_type: sourceType,
        source_id: sourceId,
        style,
        platform,
        duration,
        count,
        language,
        brief: brief.trim(),
      });
      setIdeas(Array.isArray(result.ideas) ? result.ideas : []);
    } catch (err) {
      setError(err?.message || t("La génération des idées a échoué."));
    } finally {
      setBusy(false);
    }
  }

  async function copyIdeas(text) {
    try {
      await copyText(text);
      setCopyMessage(t("Copié dans le presse-papiers."));
    } catch (err) {
      setCopyMessage(err?.message || t("Copie impossible."));
    }
  }

  return (
    <section className="mstudio-root adstudio-root">
      <header className="mstudio-head">
        <div>
          <h1 className="mstudio-title">🎥 {t("Studio publicitaire IA")}</h1>
          <p className="mstudio-sub">
            {t(
              "Choisissez un élément de Mboppi, définissez le style de publicité et obtenez plusieurs concepts à copier et monter où vous voulez."
            )}
          </p>
        </div>
        <span className="mstudio-pill mstudio-pill-ok">
          {t("Création et copie — sans publication sociale")}
        </span>
      </header>

      <div className="adstudio-grid">
        <div className="mstudio-card">
          <div className="mstudio-card-title">
            <span className="mstudio-num">1</span> {t("Que voulez-vous promouvoir ?")}
          </div>
          <label className="mstudio-label" htmlFor="adstudio-source-type">
            {t("Type de source")}
          </label>
          <select
            id="adstudio-source-type"
            className="mstudio-select"
            value={sourceType}
            onChange={(event) => changeSourceType(event.target.value)}
          >
            {SOURCE_TYPES.map((item) => (
              <option key={item.id} value={item.id}>
                {t(item.label)}
              </option>
            ))}
          </select>

          {sourceType === "products" || sourceType === "publications" ? (
            <label className="mstudio-label adstudio-search-label" htmlFor="adstudio-search">
              {t("Rechercher dans le catalogue")}
              <input
                id="adstudio-search"
                className="mstudio-textarea adstudio-search"
                value={sourceQuery}
                maxLength={120}
                placeholder={t("Nom, catégorie ou description")}
                onChange={(event) => {
                  setSourceQuery(event.target.value);
                  setPage(1);
                  setSourceId("");
                  setIdeas([]);
                }}
              />
            </label>
          ) : null}

          <label className="mstudio-label" htmlFor="adstudio-source">
            {t("Élément")}
          </label>
          <select
            id="adstudio-source"
            className="mstudio-select"
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setIdeas([]);
              setError("");
            }}
            disabled={loadingCatalog || catalog.items.length === 0}
          >
            <option value="">
              {loadingCatalog
                ? t("Chargement…")
                : catalog.items.length
                  ? t("Choisir un élément")
                  : t("Aucun élément trouvé")}
            </option>
            {catalog.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.user_count !== undefined ? ` (${item.user_count} comptes)` : ""}
              </option>
            ))}
          </select>

          {catalogError ? <div className="mstudio-error">{catalogError}</div> : null}
          {catalog.has_more ? (
            <button
              type="button"
              className="mstudio-btn mstudio-btn-ghost adstudio-more"
              onClick={() => setPage((current) => current + 1)}
              disabled={loadingCatalog}
            >
              {loadingCatalog ? t("Chargement…") : t("Charger la page suivante")}
            </button>
          ) : null}
          {selectedSource?.description ? (
            <p className="adstudio-source-description">{selectedSource.description}</p>
          ) : null}
          {sourceType === "features" ? (
            <p className="adstudio-hint">
              {t(
                "Le référentiel des fonctionnalités est maintenu côté serveur et peut être enrichi avec les nouveautés du site."
              )}
            </p>
          ) : null}
        </div>

        <div className="mstudio-card">
          <div className="mstudio-card-title">
            <span className="mstudio-num">2</span> {t("Style et format")}
          </div>
          <div className="adstudio-controls">
            <label>
              <span className="mstudio-label">{t("Style publicitaire")}</span>
              <select
                className="mstudio-select"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
              >
                {STYLES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mstudio-label">{t("Plateforme visée")}</span>
              <select
                className="mstudio-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mstudio-label">{t("Durée approximative")}</span>
              <select
                className="mstudio-select"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATIONS.map((item) => (
                  <option key={item} value={item}>
                    {item} s
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mstudio-label">{t("Nombre d'idées")}</span>
              <select
                className="mstudio-select"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {IDEA_COUNTS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mstudio-label">{t("Langue")}</span>
              <select
                className="mstudio-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="ar">العربية</option>
              </select>
            </label>
          </div>
          <label className="mstudio-label adstudio-brief-label" htmlFor="adstudio-brief">
            {t("Consignes complémentaires (facultatif)")}
            <textarea
              id="adstudio-brief"
              className="mstudio-textarea"
              value={brief}
              maxLength={1000}
              placeholder={t(
                "Ex. : mettre en avant la simplicité, éviter les promesses de résultats…"
              )}
              onChange={(event) => setBrief(event.target.value)}
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        className="mstudio-btn mstudio-btn-primary"
        disabled={!canGenerate}
        onClick={generateIdeas}
      >
        {busy ? t("L'IA prépare vos concepts…") : t("Générer plusieurs idées publicitaires")}
      </button>
      {busy ? (
        <div className="mstudio-loading" role="status">
          {t("Création des scripts et storyboards…")}
        </div>
      ) : null}
      {error ? <div className="mstudio-error">{error}</div> : null}

      {ideas.length ? (
        <div className="adstudio-results">
          <div className="adstudio-results-head">
            <div>
              <h2>{t("Vos concepts publicitaires")}</h2>
              <p>
                {t(
                  "Modifiez ou copiez une proposition, puis réalisez le montage sur la plateforme de votre choix."
                )}
              </p>
            </div>
            <button
              type="button"
              className="mstudio-btn mstudio-btn-ghost"
              onClick={() => copyIdeas(ideas.map(ideaText).join("\n\n--------------------\n\n"))}
            >
              {t("Tout copier")}
            </button>
          </div>
          {copyMessage ? (
            <p className="adstudio-copy-status" role="status">
              {copyMessage}
            </p>
          ) : null}
          <div className="adstudio-ideas">
            {ideas.map((idea, index) => (
              <article className="mstudio-card adstudio-idea" key={`${index}-${idea.title}`}>
                <header className="adstudio-idea-head">
                  <div>
                    <span className="mstudio-num">{String(index + 1).padStart(2, "0")}</span>
                    <h3>{idea.title}</h3>
                  </div>
                  <button
                    type="button"
                    className="mstudio-btn mstudio-btn-ghost"
                    onClick={() => copyIdeas(ideaText(idea))}
                  >
                    {t("Copier ce concept")}
                  </button>
                </header>
                <p className="adstudio-concept">{idea.concept}</p>
                <section>
                  <h4>{t("Accroche")}</h4>
                  <p>{idea.hook}</p>
                </section>
                <section>
                  <h4>{t("Script parlé")}</h4>
                  <p className="adstudio-script">{idea.script}</p>
                </section>
                {idea.storyboard.length ? (
                  <section>
                    <h4>{t("Storyboard")}</h4>
                    <ol className="adstudio-scenes">
                      {idea.storyboard.map((scene, sceneIndex) => (
                        <li key={`${sceneIndex}-${scene.time}`}>
                          <strong>{scene.time || `${sceneIndex + 1}.`}</strong>
                          {scene.visual ? (
                            <span>
                              <b>{t("Image de la scène")} :</b> {scene.visual}
                            </span>
                          ) : null}
                          {scene.audio ? (
                            <span>
                              <b>{t("Audio")} :</b> {scene.audio}
                            </span>
                          ) : null}
                          {scene.overlay ? (
                            <span>
                              <b>{t("Texte à l'écran")} :</b> {scene.overlay}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                <div className="adstudio-footer-copy">
                  <div>
                    <h4>{t("Légende")}</h4>
                    <p>{idea.caption}</p>
                  </div>
                  <div>
                    <h4>{t("Appel à l'action")}</h4>
                    <p>{idea.cta}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
