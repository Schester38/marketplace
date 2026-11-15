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
const OBJECTIVES = [
  { id: "awareness", label: "Notoriété" },
  { id: "engagement", label: "Engagement" },
  { id: "leads", label: "Demandes de contact" },
  { id: "sales", label: "Ventes" },
  { id: "launch", label: "Lancement" },
];
const VIDEO_FORMATS = [
  { id: "vertical", label: "Vertical — 9:16" },
  { id: "square", label: "Carré — 1:1" },
  { id: "horizontal", label: "Paysage — 16:9" },
  { id: "auto", label: "Adapté à la plateforme" },
];
const DEFAULT_BRAND_PROFILE = {
  brand_name: "MboppiShop",
  tagline: "Le marché de votre quartier en ligne",
  voice: "Chaleureuse, claire, concrète et accessible.",
  approved_claims: [],
  avoid_claims: [],
  default_cta: "Découvrir MboppiShop",
};

function ideaText(idea) {
  const scenes = idea.storyboard
    .map(
      (scene, index) =>
        `${index + 1}. ${scene.time}\nImage : ${scene.visual}\nCaméra : ${scene.camera}\nAudio : ${scene.audio}\nTexte à l'écran : ${scene.overlay}\nTransition : ${scene.transition}`
    )
    .join("\n\n");
  const claims = (idea.claim_checks || [])
    .map(
      (item) =>
        `- ${item.claim} — ${item.status === "reference_found" ? `Référence (${item.reference}) : ${item.evidence}` : "À vérifier avant publication"}`
    )
    .join("\n");
  return [
    idea.title,
    `Concept : ${idea.concept}`,
    `Accroche : ${idea.hook}`,
    `Script :\n${idea.script}`,
    `Consignes de production :\n${idea.production_notes || ""}`,
    `Storyboard :\n${scenes}`,
    `Affirmations à vérifier :\n${claims || "Aucune affirmation listée par l'IA — relire le contenu avant publication."}`,
    `Légende : ${idea.caption}`,
    `Appel à l'action : ${idea.cta}`,
  ].join("\n\n");
}

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  const [format, setFormat] = useState("vertical");
  const [objective, setObjective] = useState("awareness");
  const [audience, setAudience] = useState("");
  const [market, setMarket] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [briefNotes, setBriefNotes] = useState("");
  const [brandProfile, setBrandProfile] = useState(DEFAULT_BRAND_PROFILE);
  const [brandBusy, setBrandBusy] = useState(true);
  const [brandError, setBrandError] = useState("");
  const [brandStatus, setBrandStatus] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsBusy, setCampaignsBusy] = useState(true);
  const [campaignError, setCampaignError] = useState("");
  const [campaignStatus, setCampaignStatus] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [campaignChoice, setCampaignChoice] = useState("");
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [sourceOverride, setSourceOverride] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const requestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    api
      .adsBrandProfile()
      .then((result) => {
        if (active) setBrandProfile({ ...DEFAULT_BRAND_PROFILE, ...result.profile });
      })
      .catch((err) => {
        if (active) setBrandError(err?.message || t("Impossible de charger le profil de marque."));
      })
      .finally(() => {
        if (active) setBrandBusy(false);
      });
    api
      .adsCampaigns()
      .then((result) => {
        if (active) {
          setCampaigns(result.campaigns || []);
          if (result.campaigns?.length) setCampaignChoice(String(result.campaigns[0].id));
        }
      })
      .catch((err) => {
        if (active) setCampaignError(err?.message || t("Impossible de charger les campagnes."));
      })
      .finally(() => {
        if (active) setCampaignsBusy(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

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

  const selectedSource =
    catalog.items.find((item) => item.id === sourceId) ||
    (sourceOverride?.id === sourceId ? sourceOverride : null);
  const canGenerate = Boolean(selectedSource) && !busy;

  const changeSourceType = (value) => {
    setSourceType(value);
    setSourceQuery("");
    setPage(1);
    setSourceId("");
    setSourceOverride(null);
    setIdeas([]);
    setError("");
    setActiveCampaignId("");
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
        format,
        brief: {
          objective,
          audience: audience.trim(),
          market: market.trim(),
          key_message: keyMessage.trim(),
          notes: briefNotes.trim(),
        },
      });
      setIdeas(Array.isArray(result.ideas) ? result.ideas : []);
      setSourceOverride(result.source || selectedSource);
      setCampaignName(`${selectedSource.name} — ${new Date().toLocaleDateString()}`);
      setActiveCampaignId("");
      setCampaignChoice("");
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

  function updateIdea(index, field, value) {
    setIdeas((current) =>
      current.map((idea, ideaIndex) =>
        ideaIndex === index
          ? {
              ...idea,
              [field]: value,
              claim_checks: [],
            }
          : idea
      )
    );
  }

  function updateScene(ideaIndex, sceneIndex, field, value) {
    setIdeas((current) =>
      current.map((idea, index) =>
        index === ideaIndex
          ? {
              ...idea,
              claim_checks: [],
              storyboard: idea.storyboard.map((scene, currentSceneIndex) =>
                currentSceneIndex === sceneIndex ? { ...scene, [field]: value } : scene
              ),
            }
          : idea
      )
    );
  }

  async function saveBrandProfile() {
    setBrandBusy(true);
    setBrandError("");
    setBrandStatus("");
    try {
      const result = await api.saveAdsBrandProfile(brandProfile);
      setBrandProfile({ ...DEFAULT_BRAND_PROFILE, ...result.profile });
      setBrandStatus(t("Profil de marque enregistré."));
    } catch (err) {
      setBrandError(err?.message || t("Impossible d'enregistrer le profil de marque."));
    } finally {
      setBrandBusy(false);
    }
  }

  async function saveCampaign() {
    if (!selectedSource || !ideas.length || campaignBusy) return;
    setCampaignBusy(true);
    setCampaignError("");
    setCampaignStatus("");
    try {
      const payload = {
        name: campaignName.trim() || selectedSource.name,
        source_type: sourceType,
        source_id: sourceId,
        brief: {
          objective,
          audience: audience.trim(),
          market: market.trim(),
          key_message: keyMessage.trim(),
          notes: briefNotes.trim(),
        },
        settings: { style, platform, duration, count, language, format },
        ideas,
      };
      const result = activeCampaignId
        ? await api.updateAdsCampaign(activeCampaignId, {
            name: payload.name,
            brief: payload.brief,
            settings: payload.settings,
            ideas,
          })
        : await api.saveAdsCampaign(payload);
      setActiveCampaignId(String(result.campaign.id));
      setCampaignName(result.campaign.name);
      setCampaigns((current) =>
        [
          result.campaign,
          ...current.filter((item) => String(item.id) !== String(result.campaign.id)),
        ].slice(0, 50)
      );
      setCampaignChoice(String(result.campaign.id));
      setCampaignStatus(t("Campagne enregistrée."));
    } catch (err) {
      setCampaignError(err?.message || t("Impossible d'enregistrer la campagne."));
    } finally {
      setCampaignBusy(false);
    }
  }

  async function loadCampaign() {
    if (!campaignChoice || campaignBusy) return;
    setCampaignBusy(true);
    setCampaignError("");
    setCampaignStatus("");
    try {
      const result = await api.adsCampaign(campaignChoice);
      const campaign = result.campaign;
      setActiveCampaignId(String(campaign.id));
      setCampaignName(campaign.name);
      setSourceType(campaign.source_type);
      setSourceId(campaign.source_id);
      setSourceOverride(campaign.source);
      setSourceQuery("");
      setPage(1);
      setObjective(campaign.brief?.objective || "awareness");
      setAudience(campaign.brief?.audience || "");
      setMarket(campaign.brief?.market || "");
      setKeyMessage(campaign.brief?.key_message || "");
      setBriefNotes(campaign.brief?.notes || "");
      setStyle(campaign.settings?.style || "ugc");
      setPlatform(campaign.settings?.platform || "general");
      setDuration(Number(campaign.settings?.duration) || 30);
      setCount(Number(campaign.settings?.count) || campaign.ideas.length || 3);
      setLanguage(campaign.settings?.language || "fr");
      setFormat(campaign.settings?.format || "vertical");
      setIdeas(campaign.ideas || []);
      setCampaignStatus(t("Campagne chargée."));
    } catch (err) {
      setCampaignError(err?.message || t("Impossible de charger cette campagne."));
    } finally {
      setCampaignBusy(false);
    }
  }

  async function deleteCampaign() {
    if (!campaignChoice || campaignBusy) return;
    if (!window.confirm(t("Supprimer définitivement cette campagne ?"))) return;
    setCampaignBusy(true);
    setCampaignError("");
    setCampaignStatus("");
    try {
      await api.deleteAdsCampaign(campaignChoice);
      if (String(campaignChoice) === activeCampaignId) {
        setActiveCampaignId("");
        setIdeas([]);
        setCampaignName("");
      }
      const next = campaigns.filter((campaign) => String(campaign.id) !== String(campaignChoice));
      setCampaigns(next);
      setCampaignChoice(next.length ? String(next[0].id) : "");
      setCampaignStatus(t("Campagne supprimée."));
    } catch (err) {
      setCampaignError(err?.message || t("Impossible de supprimer cette campagne."));
    } finally {
      setCampaignBusy(false);
    }
  }

  function exportCampaign() {
    if (!ideas.length) return;
    const cleanName =
      (campaignName || selectedSource?.name || "campagne")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "campagne";
    downloadText(
      `${cleanName}.txt`,
      [
        campaignName || selectedSource?.name || t("Campagne publicitaire"),
        `Objectif : ${t(OBJECTIVES.find((item) => item.id === objective)?.label || "Notoriété")}`,
        `Public : ${audience || "Non précisé"}`,
        `Marché : ${market || "Non précisé"}`,
        `Message principal : ${keyMessage || "Non précisé"}`,
        "",
        ...ideas.map((idea, index) => `CONCEPT ${index + 1}\n${ideaText(idea)}`),
      ].join("\n\n----------------------------------------\n\n")
    );
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

          <label className="mstudio-label" htmlFor="adstudio-source">
            {t("Élément")}
          </label>
          <select
            id="adstudio-source"
            className="mstudio-select"
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setSourceOverride(null);
              setActiveCampaignId("");
              setIdeas([]);
              setError("");
            }}
            disabled={loadingCatalog || (!catalog.items.length && !sourceOverride)}
          >
            <option value="">
              {loadingCatalog
                ? t("Chargement…")
                : catalog.items.length
                  ? t("Choisir un élément")
                  : t("Aucun élément trouvé")}
            </option>
            {sourceOverride && !catalog.items.some((item) => item.id === sourceOverride.id) ? (
              <option value={sourceOverride.id}>{sourceOverride.name}</option>
            ) : null}
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
              <span className="mstudio-label">{t("Format vidéo")}</span>
              <select
                className="mstudio-select"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {VIDEO_FORMATS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.label)}
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
          <div className="adstudio-brief-fields">
            <label>
              <span className="mstudio-label">{t("Objectif de campagne")}</span>
              <select
                className="mstudio-select"
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
              >
                {OBJECTIVES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mstudio-label">{t("Public cible")}</span>
              <input
                className="mstudio-textarea"
                value={audience}
                maxLength={240}
                placeholder={t("Ex. : jeunes créateurs de contenu au Cameroun")}
                onChange={(event) => setAudience(event.target.value)}
              />
            </label>
            <label>
              <span className="mstudio-label">{t("Pays ou marché")}</span>
              <input
                className="mstudio-textarea"
                value={market}
                maxLength={120}
                placeholder={t("Ex. : Cameroun, Douala")}
                onChange={(event) => setMarket(event.target.value)}
              />
            </label>
            <label>
              <span className="mstudio-label">{t("Message ou bénéfice principal")}</span>
              <input
                className="mstudio-textarea"
                value={keyMessage}
                maxLength={320}
                placeholder={t("Quel avantage concret faut-il mettre en avant ?")}
                onChange={(event) => setKeyMessage(event.target.value)}
              />
            </label>
          </div>
          <label className="mstudio-label adstudio-brief-label" htmlFor="adstudio-brief">
            {t("Consignes complémentaires (facultatif)")}
            <textarea
              id="adstudio-brief"
              className="mstudio-textarea"
              value={briefNotes}
              maxLength={1000}
              placeholder={t(
                "Ex. : mettre en avant la simplicité, éviter les promesses de résultats…"
              )}
              onChange={(event) => setBriefNotes(event.target.value)}
            />
          </label>
        </div>
      </div>

      <details className="mstudio-card adstudio-brand">
        <summary className="mstudio-card-title">
          <span className="mstudio-num">3</span> {t("Identité de marque réutilisable")}
          {brandBusy ? <span className="adstudio-inline-status">{t("Chargement…")}</span> : null}
        </summary>
        <p className="adstudio-hint">
          {t("Ces règles sont conservées et réutilisées pour les prochaines campagnes.")}
        </p>
        <div className="adstudio-brand-grid">
          <label>
            <span className="mstudio-label">{t("Nom de la marque")}</span>
            <input
              className="mstudio-textarea"
              maxLength={100}
              value={brandProfile.brand_name}
              onChange={(event) =>
                setBrandProfile((profile) => ({ ...profile, brand_name: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="mstudio-label">{t("Signature de marque")}</span>
            <input
              className="mstudio-textarea"
              maxLength={200}
              value={brandProfile.tagline}
              onChange={(event) =>
                setBrandProfile((profile) => ({ ...profile, tagline: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="mstudio-label">{t("Voix et ton")}</span>
            <textarea
              className="mstudio-textarea"
              maxLength={300}
              value={brandProfile.voice}
              onChange={(event) =>
                setBrandProfile((profile) => ({ ...profile, voice: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="mstudio-label">{t("Appel à l'action par défaut")}</span>
            <input
              className="mstudio-textarea"
              maxLength={160}
              value={brandProfile.default_cta}
              onChange={(event) =>
                setBrandProfile((profile) => ({ ...profile, default_cta: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="mstudio-label">{t("Affirmations approuvées (une par ligne)")}</span>
            <textarea
              className="mstudio-textarea"
              maxLength={2400}
              value={brandProfile.approved_claims.join("\n")}
              onChange={(event) =>
                setBrandProfile((profile) => ({
                  ...profile,
                  approved_claims: event.target.value.split(/\r?\n/),
                }))
              }
            />
          </label>
          <label>
            <span className="mstudio-label">{t("Formulations à éviter (une par ligne)")}</span>
            <textarea
              className="mstudio-textarea"
              maxLength={2400}
              value={brandProfile.avoid_claims.join("\n")}
              onChange={(event) =>
                setBrandProfile((profile) => ({
                  ...profile,
                  avoid_claims: event.target.value.split(/\r?\n/),
                }))
              }
            />
          </label>
        </div>
        {brandError ? <p className="mstudio-error">{brandError}</p> : null}
        {brandStatus ? <p className="adstudio-copy-status">{brandStatus}</p> : null}
        <button
          type="button"
          className="mstudio-btn mstudio-btn-ghost"
          disabled={brandBusy}
          onClick={saveBrandProfile}
        >
          {brandBusy ? t("Enregistrement…") : t("Enregistrer le profil de marque")}
        </button>
      </details>

      <section className="mstudio-card adstudio-campaign-manager">
        <div className="mstudio-card-title">
          <span className="mstudio-num">4</span> {t("Campagnes enregistrées")}
        </div>
        <div className="adstudio-campaign-toolbar">
          <label className="adstudio-campaign-name">
            <span className="mstudio-label">{t("Nom de la campagne")}</span>
            <input
              className="mstudio-textarea"
              value={campaignName}
              maxLength={120}
              onChange={(event) => setCampaignName(event.target.value)}
            />
          </label>
          <div className="adstudio-campaign-actions">
            <button
              type="button"
              className="mstudio-btn mstudio-btn-primary"
              disabled={!ideas.length || campaignBusy}
              onClick={saveCampaign}
            >
              {campaignBusy
                ? t("Enregistrement…")
                : activeCampaignId
                  ? t("Mettre à jour la campagne")
                  : t("Enregistrer la campagne")}
            </button>
            <button
              type="button"
              className="mstudio-btn mstudio-btn-ghost"
              disabled={!ideas.length}
              onClick={exportCampaign}
            >
              {t("Exporter en fichier texte")}
            </button>
          </div>
        </div>
        <div className="adstudio-saved-campaigns">
          <label className="adstudio-campaign-name">
            <span className="mstudio-label">{t("Ouvrir une campagne enregistrée")}</span>
            <select
              className="mstudio-select"
              value={campaignChoice}
              onChange={(event) => setCampaignChoice(event.target.value)}
              disabled={campaignsBusy || campaigns.length === 0}
            >
              <option value="">
                {campaignsBusy ? t("Chargement…") : t("Aucune campagne enregistrée")}
              </option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} — {campaign.source?.name || campaign.source_type}
                </option>
              ))}
            </select>
          </label>
          <div className="adstudio-campaign-actions">
            <button
              type="button"
              className="mstudio-btn mstudio-btn-ghost"
              disabled={!campaignChoice || campaignBusy}
              onClick={loadCampaign}
            >
              {t("Charger")}
            </button>
            <button
              type="button"
              className="mstudio-btn mstudio-btn-ghost"
              disabled={!campaignChoice || campaignBusy}
              onClick={deleteCampaign}
            >
              {t("Supprimer")}
            </button>
          </div>
        </div>
        {campaignError ? <p className="mstudio-error">{campaignError}</p> : null}
        {campaignStatus ? <p className="adstudio-copy-status">{campaignStatus}</p> : null}
      </section>

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
                  "Comparez les propositions, modifiez-les puis enregistrez ou exportez votre dossier."
                )}
              </p>
            </div>
            <div className="adstudio-campaign-actions">
              <button
                type="button"
                className="mstudio-btn mstudio-btn-ghost"
                onClick={() => copyIdeas(ideas.map(ideaText).join("\n\n--------------------\n\n"))}
              >
                {t("Tout copier")}
              </button>
              <button
                type="button"
                className="mstudio-btn mstudio-btn-ghost"
                onClick={exportCampaign}
              >
                {t("Exporter en fichier texte")}
              </button>
            </div>
          </div>
          <div className="adstudio-fact-warning" role="note">
            {t(
              "Le contrôle des affirmations est indicatif. Relisez chaque chiffre, promesse et information avant publication."
            )}
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
                  <span className="mstudio-num">{String(index + 1).padStart(2, "0")}</span>
                  <button
                    type="button"
                    className="mstudio-btn mstudio-btn-ghost"
                    onClick={() => copyIdeas(ideaText(idea))}
                  >
                    {t("Copier ce concept")}
                  </button>
                </header>
                <label className="adstudio-edit-field">
                  <span>{t("Titre du concept")}</span>
                  <input
                    className="mstudio-textarea"
                    maxLength={120}
                    value={idea.title}
                    onChange={(event) => updateIdea(index, "title", event.target.value)}
                  />
                </label>
                <label className="adstudio-edit-field">
                  <span>{t("Concept")}</span>
                  <textarea
                    className="mstudio-textarea"
                    maxLength={500}
                    value={idea.concept}
                    onChange={(event) => updateIdea(index, "concept", event.target.value)}
                  />
                </label>
                <label className="adstudio-edit-field">
                  <span>{t("Accroche")}</span>
                  <textarea
                    className="mstudio-textarea"
                    maxLength={300}
                    value={idea.hook}
                    onChange={(event) => updateIdea(index, "hook", event.target.value)}
                  />
                </label>
                <label className="adstudio-edit-field">
                  <span>{t("Script parlé")}</span>
                  <textarea
                    className="mstudio-textarea adstudio-script-input"
                    maxLength={2400}
                    value={idea.script}
                    onChange={(event) => updateIdea(index, "script", event.target.value)}
                  />
                </label>
                <label className="adstudio-edit-field">
                  <span>{t("Consignes de production")}</span>
                  <textarea
                    className="mstudio-textarea"
                    maxLength={700}
                    value={idea.production_notes || ""}
                    onChange={(event) => updateIdea(index, "production_notes", event.target.value)}
                  />
                </label>
                {idea.storyboard.length ? (
                  <section>
                    <h4>{t("Storyboard")}</h4>
                    <ol className="adstudio-scenes">
                      {idea.storyboard.map((scene, sceneIndex) => (
                        <li key={`${sceneIndex}-${scene.time}`}>
                          <label>
                            <span>{t("Timing")}</span>
                            <input
                              className="mstudio-textarea"
                              maxLength={30}
                              value={scene.time}
                              onChange={(event) =>
                                updateScene(index, sceneIndex, "time", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>{t("Image de la scène")}</span>
                            <textarea
                              className="mstudio-textarea"
                              maxLength={500}
                              value={scene.visual}
                              onChange={(event) =>
                                updateScene(index, sceneIndex, "visual", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>{t("Cadrage et mouvement caméra")}</span>
                            <textarea
                              className="mstudio-textarea"
                              maxLength={300}
                              value={scene.camera}
                              onChange={(event) =>
                                updateScene(index, sceneIndex, "camera", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>{t("Audio")}</span>
                            <textarea
                              className="mstudio-textarea"
                              maxLength={400}
                              value={scene.audio}
                              onChange={(event) =>
                                updateScene(index, sceneIndex, "audio", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>{t("Texte à l'écran")}</span>
                            <textarea
                              className="mstudio-textarea"
                              maxLength={240}
                              value={scene.overlay}
                              onChange={(event) =>
                                updateScene(index, sceneIndex, "overlay", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>{t("Transition et montage")}</span>
                            <textarea
                              className="mstudio-textarea"
                              maxLength={200}
                              value={scene.transition}
                              onChange={(event) =>
                                updateScene(index, sceneIndex, "transition", event.target.value)
                              }
                            />
                          </label>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                <div className="adstudio-footer-copy">
                  <label className="adstudio-edit-field">
                    <span>{t("Légende")}</span>
                    <textarea
                      className="mstudio-textarea"
                      maxLength={800}
                      value={idea.caption}
                      onChange={(event) => updateIdea(index, "caption", event.target.value)}
                    />
                  </label>
                  <label className="adstudio-edit-field">
                    <span>{t("Appel à l'action")}</span>
                    <textarea
                      className="mstudio-textarea"
                      maxLength={240}
                      value={idea.cta}
                      onChange={(event) => updateIdea(index, "cta", event.target.value)}
                    />
                  </label>
                </div>
                <section className="adstudio-claim-checks">
                  <h4>{t("Contrôle indicatif des affirmations")}</h4>
                  {idea.claim_checks?.length ? (
                    <ul>
                      {idea.claim_checks.map((claim, claimIndex) => (
                        <li
                          key={`${claimIndex}-${claim.claim}`}
                          className={
                            claim.status === "reference_found"
                              ? "adstudio-claim-reference"
                              : "adstudio-claim-review"
                          }
                        >
                          <b>
                            {claim.status === "reference_found"
                              ? t("Référence trouvée — à relire")
                              : t("À vérifier avant publication")}
                          </b>
                          <span>{claim.claim}</span>
                          {claim.evidence ? (
                            <small>
                              {t("Source")} ({claim.reference}) : {claim.evidence}
                            </small>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="adstudio-fact-warning">
                      {t(
                        "Aucune référence fiable n'est associée à cette version. Vérifiez manuellement ses affirmations."
                      )}
                    </p>
                  )}
                </section>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
