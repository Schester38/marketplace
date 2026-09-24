// ─── DocStudio — Digital Publishing Studio (§2 à §28) ────────────────────────
// Studio d'édition page par page ouvert sur le document paginé du Générateur :
// colonne de pages (miniatures, réorganisation, duplication), canvas éditable
// (StudioCanvas), inspecteur (texte riche, calques, alignements, données),
// IA page par page avec confirmation de portée, historique annuler/rétablir,
// aperçu multi-modes, export PDF/EPUB depuis le modèle structuré.
// Le document source (docModel TipTap) n'est JAMAIS détruit : le modèle du
// Studio vit dans `gen_documents.page_layout` (JSONB) et le PDF/EPUB ne sont
// que des exports (§24 « édition sans destruction »).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  paginateDocument, PX_PER_MM,
} from "./paginate.js";
import { GEN_TEMPLATES, resolveTemplate, FONT_CSS } from "./templates.js";
import { api } from "../api.js";
import {
  buildStudioPages, readStudio, studioBox, serializeStudio, studioDesignKey, studioContentKey,
  insertPage, deletePages, duplicatePage, movePage, updatePage, patchPages, patchElements,
  cloneElement, addElement, addElements, removeElements, reorderElement, sortedElements, mergeElement,
  overflowPx, studioCheck, alignOffsets, distributeOffsets, ALIGN_MODES,
  buildCoverPage, buildTocPage,
  uid, round1, isTextType, elementLabel, defaultStyle, stepTextSizes, boldDocumentText, ensureStudioFooters,
  fitMeasuredTextHeight,
} from "./studioModel.js";
import {
  ELEMENT_LIBRARY, PAGE_KINDS, buildPage, PAGE_LAYOUTS, applyLayout, smartLayouts, newElement,
} from "./studioLayouts.js";
import {
  parsePageInstruction, describeScope, distributeText, pageWordCount, pageTextForAi, AI_PAGE_EXAMPLES,
} from "./studioAi.js";
import { parseDesignCommand } from "./designCommands.js";
import { exportStudioPdf, exportStudioEpub } from "./studioExport.js";
import { fixGluedInPages, fixGluedInHtml, fixGluedDoc, applyGluedChanges, buildGluedReference, gluedPagesText } from "./gluedWords.js";
import StudioCanvas from "./StudioCanvas.jsx";

// ─── Helpers module ──────────────────────────────────────────────────────────
const mm = (v) => `${round1(Number(v || 0))} mm`;
const stripHtml = (h) => String(h || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
// Libellés lisibles des polices (tokens PDF natifs → noms affichés dans la liste).
const FONT_LABELS = { serif: "Serif — Times", sans: "Sans — Arial", mono: "Mono — Courier" };
// Taille de base d'un élément texte : réglage manuel s'il existe, sinon défaut
// du modèle pour ce type (la liste « Police » de l'inspecteur était vide car
// elle lisait un `template.fonts` qui n'existe pas : les modèles exposent
// `bodyFont`/`headingFont` + `FONT_CSS`).
const baseSizeOf = (el, tpl) => {
  const n = Number(el?.style?.size);
  if (Number.isFinite(n) && n > 0) return n;
  if (tpl?.sizes) {
    try {
      return Number(defaultStyle(tpl, el?.type).size) || 11;
    } catch { /* modèle incomplet : repli */ }
  }
  return 11;
};

/** Modèle actif du document (template + style_overrides) — même règle que le PDF. */
export function resolveActiveTemplate(docMeta = {}) {
  const base = GEN_TEMPLATES.find((x) => x.id === (docMeta.template_id || "moderne")) || GEN_TEMPLATES[0];
  try {
    return resolveTemplate(base, docMeta.style_overrides);
  } catch {
    return base;
  }
}

/** Patchs multiples sur une page (protocole des gestes du canvas). */
function applyPatchesToPage(pages, pageId, patches) {
  return pages.map((p) => {
    if (p.id !== pageId) return p;
    let els = p.elements;
    for (const { id, patch } of patches) els = els.map((el) => (el.id === id ? mergeElement(el, patch) : el));
    return { ...p, elements: els };
  });
}

/**
 * Traduit des surcharges de DESIGN (mêmes clés que `style_overrides` du
 * document : bodyFont, headingFont, colors{}, align, lineHeight, paraSpace)
 * en styles SUR LES ÉLÉMENTS de la page. C'est indispensable : l'aperçu du
 * Studio et les exports ne lisent que les styles d'éléments — un réglage
 * stocké « à côté » n'aurait aucun effet visible (§24 : aperçu = export).
 */
function applyDesignToElements(page, overrides = {}) {
  const ov = overrides || {};
  const colors = ov.colors || {};
  const lh = Number(ov.lineHeight);
  const ps = Number(ov.paraSpace);
  return {
    ...page,
    elements: (page.elements || []).map((el) => {
      const isHeading = el.type === "heading" || el.type === "chapter" || el.type === "subtitle";
      const hasText = !!el.html;
      const style = { ...el.style };
      if (ov.bodyFont && hasText && !isHeading) style.font = ov.bodyFont;
      if (ov.headingFont && isHeading) style.font = ov.headingFont;
      if (colors.body && hasText && !isHeading) style.color = colors.body;
      if (colors.heading && isHeading) style.color = colors.heading;
      if (colors.accent) {
        if (el.type === "line" || el.type === "divider") style.stroke = colors.accent;
        else if (["rect", "block", "shape", "circle"].includes(el.type)) style.fill = colors.accent;
        else if (el.type === "pageNumber" || el.type === "header" || el.type === "footer") style.color = colors.accent;
        else if (el.type === "quote" || el.type === "note" || el.type === "box") style.borderColor = colors.accent;
      }
      if (colors.bg) style.bg = "transparent"; // le fond de page se règle dans « Mise en page »
      if (ov.align && hasText && (el.type === "paragraph" || el.type === "textzone")) style.align = ov.align;
      if (Number.isFinite(lh) && hasText) style.lineHeight = lh;
      if (Number.isFinite(ps) && hasText) style.paraSpace = ps;
      if (ov.sizes && typeof ov.sizes === "object") {
        const key = el.type === "chapter" || el.type === "heading" ? "h1" : el.type === "subtitle" ? "h2" : "body";
        const size = Number(ov.sizes[key]);
        if (Number.isFinite(size)) style.size = size;
      }
      return { ...el, style };
    }),
  };
}

/**
 * Typographie et couleurs d'un MODÈLE traduites en surcharges d'éléments —
 * permet à « Transforme cette page en style magazine » de changer la seule
 * page (le modèle du document reste intact).
 */
function templateAsOverrides(tpl) {
  if (!tpl) return {};
  return {
    bodyFont: tpl.bodyFont,
    headingFont: tpl.headingFont,
    align: tpl.align,
    lineHeight: tpl.lineHeight,
    paraSpace: tpl.paraSpace,
    sizes: { ...tpl.sizes },
    colors: { ...tpl.colors },
  };
}
/** Entrées de sommaire dérivées des titres du document (page « Sommaire » §7). */
function tocEntries(pgs) {
  return (pgs || []).flatMap((p, i) =>
    sortedElements(p)
      .filter((e) => e.type === "heading" || e.type === "chapter")
      .map((e) => ({ text: stripHtml(e.html).slice(0, 120), page: i + 1, level: e.type === "chapter" ? 1 : 2 })),
  );
}

/** Y de fin de contenu : les nouveaux éléments s'empilent sous les existants. */
function stackY(page, box) {
  let y = box.m.top;
  for (const el of sortedElements(page)) {
    if (!el.hidden && el.type !== "header" && el.type !== "footer" && el.type !== "pageNumber") {
      y = Math.max(y, el.box.y + el.box.h);
    }
  }
  return round1(Math.min(y + 4, box.h - box.m.bottom - 6));
}

// ─── Import d'images dans le Studio (§3 « cliquer sur une image → remplacer »,
// §6 « image, galerie ») : le fichier choisi est redimensionné dans le
// navigateur (max 1400 px, JPEG 82 %) pour rester compatible avec la limite de
// 2 Mo du modèle serveur (`gen_documents.page_layout`).
const STUDIO_IMG_MAX_BYTES = 1_600_000;
const MEDIA_TYPES = ["image", "logo", "gallery"];
async function fileToStudioImage(file) {
  if (!file) throw new Error("Fichier image illisible.");
  if (!/^image\//.test(file.type || "")) throw new Error("Seules les images sont acceptées (JPG, PNG, WebP, GIF).");
  if (file.size > 12 * 1024 * 1024) throw new Error("Image trop lourde (12 Mo maximum).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new window.Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Fichier image illisible."));
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    for (const [maxPx, quality] of [[1400, 0.82], [1000, 0.72], [760, 0.62]]) {
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= STUDIO_IMG_MAX_BYTES) return data;
    }
    throw new Error("Image trop lourde — choisissez une image plus petite.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function DocStudio({ doc, docMeta, html, onClose, onSaved, onLayoutChange, onMetaPatch, onGluedContent, t: tProp }) {
  const t = tProp || ((s) => s);
  // ─── État ──────────────────────────────────────────────────────────────────
  const [pages, setPages] = useState(null); // null = conversion en cours
  const [box, setBox] = useState(() => studioBox(docMeta));
  const [template, setTemplate] = useState(() => resolveActiveTemplate(docMeta));
  const [activeId, setActiveId] = useState(null);
  const [selIds, setSelIds] = useState([]); // éléments sélectionnés (canvas)
  const [past, setPast] = useState([]); // historique : { id, label, at, pages }
  const [future, setFuture] = useState([]);
  const [zoom, setZoom] = useState(0.85);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [busy, setBusy] = useState("load"); // load | pdf | epub | ai
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [panel, setPanel] = useState("add"); // add | text | element | layers | history | ai | multi | layout | check
  const [mode, setMode] = useState("edit"); // edit | preview
  const [previewMode, setPreviewMode] = useState("single"); // single | spread | mobile
  const [selPageIds, setSelPageIds] = useState([]); // multi-pages (§11)
  const [pageSearch, setPageSearch] = useState("");
  const [pageView, setPageView] = useState("grid"); // grid | list
  const [aiText, setAiText] = useState("");
  const [aiMode, setAiMode] = useState("design"); // design | content (§10)
  const [aiResult, setAiResult] = useState(null);
  const [pendingPlan, setPendingPlan] = useState(null); // confirmation de portée (§12/§26)
  const [check, setCheck] = useState(null);
  const [glued, setGlued] = useState(null); // rapport « 🔗 Mots collés » (détection + correction)
  const [gluedSkip, setGluedSkip] = useState([]); // corrections décochées (ignorées)
  const [sizeScope, setSizeScope] = useState("page"); // taille du texte : selection | page | document
  const [menu, setMenu] = useState(null); // menu contextuel { x, y, elId }
  const [addOpen, setAddOpen] = useState(false); // « + Ajouter une page »
  const [designChoices, setDesignChoices] = useState(null); // { pageId, options } (§8)
  const [dragIdx, setDragIdx] = useState(null);
  const gestureSnap = useRef(null);
  const clipboardEl = useRef(null);
  const fileRef = useRef(null); // <input type="file"> caché — images (§3/§6)
  const fileIntent = useRef(null); // { intent: "add" | "replace", typeId }
  const previewRef = useRef(null); // conteneur de l'aperçu — plein écran (§19)
  const centerRef = useRef(null); // zone centrale — ajustement du canvas (§18)
  const saveTimer = useRef(null);
  const saveVersion = useRef(0);
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const pagesRef = useRef(null);
  pagesRef.current = pages;
  const layoutRef = useRef(onLayoutChange);
  layoutRef.current = onLayoutChange;
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;
  const activePage = useMemo(() => (pages || []).find((p) => p.id === activeId) || null, [pages, activeId]);
  const totalPages = (pages || []).length;
  // ─── Toast / erreur ─────────────────────────────────────────────────────────
  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? "" : cur)), 2600);
  }, []);

  // ─── Empreintes TEXTE / DESIGN : base de la synchronisation des onglets ─────
  // Le Studio dérive du document (texte du Contenu + modèle de l'onglet Design).
  // On enregistre l'empreinte des deux avec les pages : si l'une change ensuite,
  // les pages sont reconstruites à l'ouverture du Studio. Sans cela, les pages
  // enregistrées restaient figées sur l'ancien texte / l'ancien modèle et les
  // modifications des autres onglets semblaient « ne pas coller ».
  const studioKeys = useMemo(
    () => ({
      designKey: studioDesignKey(docMeta || {}),
      contentKey: studioContentKey(html),
    }),
    [docMeta, html]
  );
  const keysRef = useRef(studioKeys);
  keysRef.current = studioKeys;

  // ─── Chargement : modèle Studio existant, sinon conversion du document ──────
  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = readStudio(doc?.page_layout);
      const keys = keysRef.current;
      // Les pages enregistrées ne sont réutilisées QUE si ni le contenu ni le
      // design n'ont changé depuis : sinon on reconstruit (synchronisation).
      const upToDate =
        doc?.page_layout?.design_key === keys.designKey &&
        doc?.page_layout?.content_key === keys.contentKey;
      if (stored && stored.length && upToDate) {
        if (!alive) return;
        const withFooters = ensureStudioFooters(stored, studioBox(docMeta), resolveActiveTemplate(docMeta));
        const footerAdded = JSON.stringify(withFooters) !== JSON.stringify(stored);
        setPages(withFooters);
        setActiveId(withFooters[0].id);
        setBusy("");
        if (footerAdded) markDirty();
        return;
      }
      const rebuilding = !!(stored && stored.length);
      try {
        const paginated = await paginateDocument({
          html: html || "",
          doc: docMeta || {},
          toc: docMeta?.protection?.toc !== false,
        });
        const built = buildStudioPages({ paginated, docMeta: docMeta || {} });
        if (!alive) return;
        setBox(paginated.box);
        setTemplate(paginated.template);
        setPages(built);
        setActiveId(built[0]?.id || null);
        setBusy("");
        if (rebuilding) {
          // Les modifications faites ailleurs (contenu ou design) viennent
          // d'être appliquées : on réenregistre les nouvelles empreintes.
          flash(t("Studio synchronisé avec le contenu et le design du document."));
          markDirty();
        }
      } catch (e) {
        if (!alive) return;
        setError(e?.message || t("Conversion du document impossible"));
        setPages([]);
        setBusy("");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sauvegarde + automatique (§2) ─────────────────────────────────────────
  const markDirty = useCallback(() => {
    saveVersion.current += 1;
    if (saveInFlight.current) saveQueued.current = true;
    setDirty(true);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRef.current(true), 900); // autosave rapide
  }, []);

  const publishLayout = useCallback((nextPages) => {
    const payload = serializeStudio(nextPages || [], {
      template_id: docMeta?.template_id || "",
      design_key: keysRef.current.designKey,
      content_key: keysRef.current.contentKey,
    });
    layoutRef.current?.(payload);
    return payload;
  }, [docMeta?.template_id]);
  useEffect(() => {
    if (pages?.length) publishLayout(pages);
  }, [pages, publishLayout]);

  const save = useCallback(
    async (silent = false) => {
      if (!doc?.id) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Une seule requête Studio à la fois. Si une modification arrive pendant
      // l'écriture, la sauvegarde courante reste valide mais ne peut pas
      // effacer le statut « non enregistré » de cette nouvelle révision.
      if (saveInFlight.current) {
        saveQueued.current = true;
        return;
      }
      const version = saveVersion.current;
      saveInFlight.current = true;
      setSaving(true);
      setError("");
      try {
        // Enveloppe enregistrée : pages + empreintes contenu/design. Les
        // empreintes servent à savoir, à la réouverture, si les autres onglets
        // ont changé et si le Studio doit se resynchroniser.
        const payload = publishLayout(pagesRef.current || []);
        await api.genSaveDocument(doc.id, { page_layout: payload });
        if (version === saveVersion.current && !saveQueued.current) {
          setDirty(false);
          setSavedAt(new Date());
          onSaved?.(payload);
          if (!silent) flash(t("Document enregistré."));
        }
      } catch (e) {
        if (version === saveVersion.current && !saveQueued.current) {
          setError(e?.message || t("Enregistrement impossible"));
        }
      } finally {
        if (saveQueued.current) {
          saveQueued.current = false;
          saveInFlight.current = false;
          setTimeout(() => saveRef.current(true), 0);
        } else {
          saveInFlight.current = false;
          setSaving(false);
        }
      }
    },
    [doc?.id, docMeta?.template_id, onSaved, publishLayout, t, flash],
  );
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // ─── Historique (§17) : annuler / rétablir + journal lisible ────────────────
  const commit = useCallback(
    (label, nextPages) => {
      setPast((p) => [...p.slice(-79), { id: uid("h"), label, at: new Date().toISOString(), pages: pagesRef.current }]);
      setFuture([]);
      setPages(nextPages);
      publishLayout(nextPages);
      markDirty();
    },
    [markDirty, publishLayout],
  );
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const entry = p[p.length - 1];
      setFuture((f) => [...f, { id: uid("h"), label: entry.label, at: entry.at, pages: pagesRef.current }]);
      setPages(entry.pages);
      publishLayout(entry.pages);
      markDirty();
      return p.slice(0, -1);
    });
  }, [markDirty, publishLayout]);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const entry = f[f.length - 1];
      setPast((p) => [...p, { id: uid("h"), label: entry.label, at: entry.at, pages: pagesRef.current }]);
      setPages(entry.pages);
      publishLayout(entry.pages);
      markDirty();
      return f.slice(0, -1);
    });
  }, [markDirty, publishLayout]);

  // ─── Protocole des gestes du canvas (sélection → patchs vifs → validation) ──
  const beginGesture = useCallback((label) => {
    gestureSnap.current = { label, pages: pagesRef.current };
  }, []);
  const applyLive = useCallback(
    (patches) => {
      const next = applyPatchesToPage(pagesRef.current || [], activeIdRef.current, patches);
      pagesRef.current = next;
      setPages(next);
      publishLayout(next);
      markDirty();
    },
    [markDirty, publishLayout],
  );
  const endGesture = useCallback((cancel) => {
    const snap = gestureSnap.current;
    gestureSnap.current = null;
    if (!snap) return;
    if (cancel) {
      pagesRef.current = snap.pages;
      setPages(snap.pages);
      publishLayout(snap.pages);
      return;
    }
    setPast((p) => [...p.slice(-79), { id: uid("h"), label: snap.label, at: new Date().toISOString(), pages: snap.pages }]);
    setFuture([]);
  }, [markDirty, publishLayout]);
  const onSelectEls = useCallback((ids, additive) => {
    setSelIds((cur) => (additive ? [...new Set([...cur, ...ids])] : ids));
  }, []);
  // ─── Opérations sur les PAGES (§2, §7, §15, §16) ────────────────────────────
  const helpers = useMemo(
    () => ({
      buildCoverPage: (dm, tpl, bx) => buildCoverPage(dm || docMeta || {}, tpl, bx),
      buildTocPage: (data, tpl, bx) => buildTocPage(data, tpl, bx),
      entries: () => tocEntries(pagesRef.current),
    }),
    [docMeta],
  );
  const addPage = useCallback(
    (kindId) => {
      const cur = pagesRef.current || [];
      const at = cur.findIndex((p) => p.id === activeIdRef.current);
      const page = ensureStudioFooters([buildPage(kindId, template, box, docMeta || {}, { ...helpers, entries: tocEntries(cur) })], box, template)[0];
      commit(`Nouvelle page ajoutée (${PAGE_KINDS.find((k) => k.id === kindId)?.label || kindId})`, insertPage(cur, page, at + 1));
      setActiveId(page.id);
      setSelIds([]);
      setAddOpen(false);
      flash(t("Page ajoutée."));
    },
    [template, box, docMeta, helpers, commit, t, flash],
  );
  const doDuplicatePage = useCallback(
    (pageId) => {
      commit("Page dupliquée", duplicatePage(pagesRef.current || [], pageId, { toEnd: true }));
      flash(t("Page dupliquée — textes, images et styles conservés."));
    },
    [commit, t, flash],
  );
  const doDeletePages = useCallback(
    (ids) => {
      const cur = pagesRef.current || [];
      if (cur.length <= (Array.isArray(ids) ? ids.length : 1)) {
        flash(t("Le document doit garder au moins une page."));
        return;
      }
      const next = deletePages(cur, ids);
      commit("Page supprimée", next);
      if (ids.includes(activeIdRef.current)) setActiveId(next[0]?.id || null);
      setSelPageIds([]);
      flash(t("Page supprimée."));
    },
    [commit, t, flash],
  );
  const doMovePage = useCallback((from, to) => commit("Page déplacée", movePage(pagesRef.current || [], from, to)), [commit]);
  const goPage = useCallback((id) => {
    setActiveId(id);
    setSelIds([]);
    setMode("edit");
  }, []);
  const filteredPages = useMemo(() => {
    const q = pageSearch.trim().toLowerCase();
    if (!q) return pages || [];
    return (pages || []).filter(
      (p) =>
        String(p.number).includes(q) ||
        (p.label || "").toLowerCase().includes(q) ||
        (p.kind || "").toLowerCase().includes(q) ||
        (p.elements || []).some((e) => stripHtml(e.html).toLowerCase().includes(q)),
    );
  }, [pages, pageSearch]);
  const toggleSelPage = useCallback((id) => {
    setSelPageIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);

  // ─── Changement de design d'une page (§8) + Smart Layout (§21) ─────────────
  function applyLayoutOn(pgs, pageId, layoutId) {
    return pgs.map((p) => (p.id === pageId ? applyLayout(p, layoutId, box) : p));
  }
  const openDesignChoices = useCallback(() => {
    if (!activePage) return;
    setDesignChoices({ pageId: activePage.id, options: smartLayouts(activePage).slice(0, 6) });
    setPanel("layout");
  }, [activePage, box]);
  const applyPageLayout = useCallback(
    (pageId, layoutId) => {
      const cur = pagesRef.current || [];
      // Les anciennes pages peuvent contenir un ancien verrou de mise en page.
      // Il n'est plus utilisé par le Studio : toutes les pages restent éditables.
      const page = cur.find((p) => p.id === pageId);
      // Multi-pages (§11) : un layout choisi s'applique à toute la sélection.
      const ids = selPageIds.length > 1 && selPageIds.includes(pageId) ? selPageIds : [pageId];
      let next = cur;
      for (const id of ids) next = applyLayoutOn(next, id, layoutId);
      const label = PAGE_LAYOUTS.find((l) => l.id === layoutId)?.label || layoutId;
      commit(`Design de la page modifié (${label})${ids.length > 1 ? ` — ${ids.length} pages` : ""}`, next);
      setDesignChoices(null);
      flash(t("Mise en page appliquée — contenu conservé."));
    },
    [selPageIds, commit, t, flash],
  );
  // ─── Opérations sur les ÉLÉMENTS (§3-§6, §13, §14, §16) ────────────────────
  const curPage = () => (pagesRef.current || []).find((p) => p.id === activeIdRef.current) || null;
  const addElementOf = useCallback(
    (typeId) => {
      const page = curPage();
      if (!page) return;
      const el = newElement(template, typeId, box, { docMeta: docMeta || {}, y: stackY(page, box), autoH: true });
      commit(`Élément ajouté (${elementLabel(el)})`, addElement(pagesRef.current || [], page.id, el));
      setSelIds([el.id]);
      setPanel("text");
      setMenu(null);
    },
    [template, box, docMeta, commit],
  );
  // ─── Images (§3 « remplacer l'image », §6 « image / galerie ») ─────────────
  const askImage = useCallback((intent, typeId) => {
    fileIntent.current = { intent, typeId: typeId || "image" };
    const input = fileRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, []);
  // patchEls est déclaré AVANT onImagePicked : ce dernier le référence dans son
  // tableau de dépendances, évalué pendant le rendu (sinon TDZ « Lt » au clic Studio).
  const patchEls = useCallback(
    (patches, label) => {
      const page = curPage();
      if (!page) return;
      // Aucun verrou de page n'est appliqué : le contenu et le design restent
      // librement modifiables dans le Studio.
      commit(label, applyPatchesToPage(pagesRef.current || [], page.id, patches));
    },
    [commit, t, flash],
  );
  const autoHeightQueue = useRef(new Map());
  const autoHeightFrame = useRef(0);
  // La mesure DOM fait partie de la gesture courante : elle ne crée pas une
  // nouvelle entrée d'historique. Les mesures de plusieurs pages sont accumulées
  // dans une seule frame afin qu'aucune page n'écrase la hauteur ajustée avant.
  const fitTextHeight = useCallback(
    (pageId, elId, heightMm) => {
      autoHeightQueue.current.set(`${pageId}:${elId}`, { pageId, elId, heightMm });
      if (autoHeightFrame.current) return;
      autoHeightFrame.current = requestAnimationFrame(() => {
        autoHeightFrame.current = 0;
        let next = pagesRef.current || [];
        let changed = false;
        for (const item of autoHeightQueue.current.values()) {
          const updated = fitMeasuredTextHeight(next, item.pageId, item.elId, item.heightMm);
          if (updated !== next) changed = true;
          next = updated;
        }
        autoHeightQueue.current.clear();
        if (!changed) return;
        pagesRef.current = next;
        setPages(next);
        markDirty();
      });
    },
    [markDirty],
  );
  useEffect(() => () => {
    if (autoHeightFrame.current) cancelAnimationFrame(autoHeightFrame.current);
  }, []);
  const onImagePicked = useCallback(
    async (file) => {
      const intent = fileIntent.current || { intent: "add", typeId: "image" };
      fileIntent.current = null;
      if (!file) return;
      const page = curPage();
      if (!page) return;
      try {
        const src = await fileToStudioImage(file);
        if (intent.intent === "replace") {
          const targets = page.elements.filter((e) => selIds.includes(e.id) && MEDIA_TYPES.includes(e.type));
          if (!targets.length) return;
          patchEls(
            targets.map((e) =>
              e.type === "gallery"
                ? { id: e.id, patch: { data: { ...(e.data || {}), items: [...((e.data || {}).items || []), src] } } }
                : { id: e.id, patch: { src } },
            ),
            "Image remplacée",
          );
          flash(t("Image mise à jour."));
          return;
        }
        const el = newElement(template, intent.typeId, box, { docMeta: docMeta || {}, y: stackY(page, box) });
        el.src = src;
        if (el.type === "gallery") el.data = { ...(el.data || {}), items: [src] };
        commit("Image importée", addElement(pagesRef.current || [], page.id, el));
        setSelIds([el.id]);
        setPanel("text");
        flash(t("Image ajoutée."));
      } catch (e) {
        setError(e?.message || t("Fichier image illisible."));
      }
    },
    [selIds, patchEls, template, box, docMeta, commit, t, flash],
  );
  const doDuplicateEls = useCallback(() => {
    const page = curPage();
    if (!page || !selIds.length) return;
    const clones = page.elements.filter((e) => selIds.includes(e.id)).map((e) => {
      const c = cloneElement(e);
      c.box = { ...c.box, x: round1(c.box.x + 4), y: round1(c.box.y + 4) };
      return c;
    });
    commit("Élément dupliqué", addElements(pagesRef.current || [], page.id, clones));
    setSelIds(clones.map((c) => c.id));
    setMenu(null);
  }, [selIds, commit]);
  const doDeleteEls = useCallback(() => {
    const page = curPage();
    if (!page || !selIds.length) return;
    commit("Élément supprimé", removeElements(pagesRef.current || [], page.id, selIds));
    setSelIds([]);
    setMenu(null);
  }, [selIds, commit]);
  const copyEls = useCallback(() => {
    const page = curPage();
    const els = (page?.elements || []).filter((e) => selIds.includes(e.id));
    if (els.length) {
      clipboardEl.current = els.map(cloneElement);
      flash(t(`${els.length} élément(s) copié(s) — collez-les sur une autre page.`));
      setMenu(null);
    }
  }, [selIds, t, flash]);
  const cutEls = useCallback(() => {
    copyEls();
    doDeleteEls();
  }, [copyEls, doDeleteEls]);
  const pasteEls = useCallback(() => {
    const page = curPage();
    if (!page || !clipboardEl.current?.length) return;
    const clones = clipboardEl.current.map((e) => {
      const c = cloneElement(e);
      c.box = { ...c.box, x: round1(Math.min(c.box.x + 4, box.w - c.box.w - 2)), y: round1(Math.min(c.box.y + 4, box.h - c.box.h - 2)) };
      return c;
    });
    commit("Élément collé", addElements(pagesRef.current || [], page.id, clones));
    setSelIds(clones.map((c) => c.id));
    setMenu(null);
    flash(t("Collé sur cette page."));
  }, [box, commit, t, flash]);
  const toggleHideEls = useCallback(
    (hidden) => patchEls(selIds.map((id) => ({ id, patch: { hidden } })), hidden ? "Calque masqué" : "Calque affiché"),
    [selIds, patchEls],
  );
  const reorderSel = useCallback(
    (dir) => {
      const page = curPage();
      if (!page || !selIds.length) return;
      let next = pagesRef.current || [];
      for (const id of selIds) next = reorderElement(next, page.id, id, dir);
      commit("Ordre des calques modifié", next);
    },
    [selIds, commit],
  );
  const alignSel = useCallback(
    (modeId) => {
      const page = curPage();
      if (!page || !selIds.length) return;
      const chosen = selIds.map((id) => page.elements.find((e) => e.id === id)).filter(Boolean);
      const boxes = chosen.map((e) => e.box);
      const ref = chosen[chosen.length - 1]?.box;
      const offs = boxes.length > 1 ? alignOffsets(boxes, modeId, ref) : alignOffsets(boxes, modeId, null, box);
      commit(
        "Éléments alignés",
        applyPatchesToPage(
          pagesRef.current || [],
          page.id,
          chosen.map((e, i) => ({ id: e.id, patch: { box: { x: round1(e.box.x + offs[i].dx), y: round1(e.box.y + offs[i].dy) } } })),
        ),
      );
    },
    [selIds, box, commit],
  );
  const distributeSel = useCallback(
    (axis) => {
      const page = curPage();
      if (!page || selIds.length < 3) {
        flash(t("Sélectionnez au moins 3 éléments pour distribuer."));
        return;
      }
      const chosen = selIds.map((id) => page.elements.find((e) => e.id === id)).filter(Boolean);
      const offs = distributeOffsets(chosen.map((e) => e.box), axis);
      commit(
        "Éléments distribués",
        applyPatchesToPage(
          pagesRef.current || [],
          page.id,
          chosen.map((e, i) => ({ id: e.id, patch: { box: { x: round1(e.box.x + offs[i].dx), y: round1(e.box.y + offs[i].dy) } } })),
        ),
      );
    },
    [selIds, commit, t, flash],
  );
  const selEls = useMemo(() => (activePage ? sortedElements(activePage).filter((e) => selIds.includes(e.id)) : []), [activePage, selIds]);
  const overflow = useMemo(() => (activePage ? overflowPx(activePage, box) : null), [activePage, box]);
  // ─── Taille du texte (§4/§11/§12) ──────────────────────────────────────────
  // Le réglage n'est PAS limité à l'élément sélectionné : la portée choisie
  // (sélection, page entière, document) touche tous les éléments TEXTE de cette
  // portée. Une modification globale (§12) passe toujours par la confirmation.
  // Tous les textes de la portée choisie sont modifiables.
  // Déclaré APRÈS `selEls` : sa liste de dépendances est évaluée pendant le rendu
  // (sinon TDZ « Cannot access 'selEls' before initialization »).
  const sizeStep = useCallback(
    (delta, scope, confirmed = false) => {
      const all = pagesRef.current || [];
      const cur = curPage();
      const hasSel = selEls.some((e) => isTextType(e));
      const desired = scope === "selection" && !hasSel ? "page" : scope;
      const scopeLabel =
        desired === "selection" ? t("Sélection") : desired === "page" ? t("Page entière") : t("Document");
      const label = `${t("Taille du texte")} ${delta > 0 ? "+" : ""}${delta} pt — ${scopeLabel}`;
      if (desired === "document" && !confirmed) {
        // Modification GLOBALE : toujours confirmée (§12).
        setPendingPlan({ kind: "size", label, delta, sizeScope: desired });
        return;
      }
      const selTextIds =
        desired === "selection" ? selEls.filter((e) => isTextType(e)).map((e) => e.id) : null;
      // Réglage pur et testé (studioModel) : borné 5-72 pt, verrous respectés.
      const { pages: next, count } = stepTextSizes(all, {
        delta,
        scope: desired,
        pageId: cur?.id,
        selIds: selTextIds || [],
        template,
      });
      if (!count) {
        flash(t("Taille inchangée (limites atteintes ou aucun texte dans la portée)."));
        return;
      }
      commit(label, next);
      flash(`${t("Taille du texte mise à jour")} — ${count} ${t("élément(s)")}`);
    },
    [selEls, template, commit, t, flash],
  );
  // ─── IA page par page (§9, §10, §26) ───────────────────────────────────────
  // Portée affichée AVANT application (§26 « Pages concernées : … ») ; le mode
  // « design » ne touche jamais au texte (§10).
  const buildAiPlan = useCallback(() => {
    const instruction = aiText.trim();
    if (!instruction) {
      flash(t("Décrivez la modification souhaitée."));
      return null;
    }
    // designParser : SANS lui, « Rends cette page moderne » ne produirait
    // aucun plan de design (parsePageInstruction → design = null).
    const plan = parsePageInstruction(instruction, {
      page: activePage,
      pageIndex: (pages || []).findIndex((p) => p.id === activeId),
      totalPages,
      designParser: parseDesignCommand,
      designCtx: { templates: GEN_TEMPLATES, currentTemplateId: docMeta?.template_id || "moderne" },
    });
    return { ...plan, mode: aiMode, kind: "ai" };
  }, [aiText, activePage, pages, activeId, totalPages, aiMode, docMeta, t, flash]);
  const previewAi = useCallback(() => {
    const plan = buildAiPlan();
    if (plan) setPendingPlan(plan);
  }, [buildAiPlan]);
  const pageTextForAiSafe = useCallback((page) => (page ? pageTextForAi(page, { target: "text" }) : ""), []);
  const runAi = useCallback(
    async (plan) => {
      setPendingPlan(null);
      setBusy("ai");
      setError("");
      try {
        let nextPages = pagesRef.current || [];
        const targets = plan.pageNumbers
          .map((n) => nextPages.find((p) => p.number === n))
          .filter(Boolean);
        let applied = 0;

        // (a) MISE EN PAGE (§8/§21) : repositionnement pur, contenu intact.
        if (plan.layout) {
          for (const p of targets) nextPages = applyLayoutOn(nextPages, p.id, plan.layout);
          applied += plan.layout ? 1 : 0;
        }

        // (b) DESIGN (§10, mode « design uniquement ») : polices/couleurs/
        //     espacements écrits sur les éléments (aperçu = export).
        if (plan.mode === "design" && plan.design) {
          let ov = { ...(plan.design.overrides || {}) };
          // Un modèle demandé (« style magazine ») devient des styles
          // d'éléments : la SEULE page ciblée change, le modèle du document
          // reste intact — et l'aperçu = export lit les styles d'éléments.
          if (plan.design.templateId) {
            const tpl = GEN_TEMPLATES.find((x) => x.id === plan.design.templateId);
            if (tpl) ov = { ...templateAsOverrides(tpl), ...ov };
          }
          if (Object.keys(ov).length) {
            const ids = targets.map((p) => p.id);
            nextPages = nextPages.map((p) => (ids.includes(p.id) ? applyDesignToElements(p, ov) : p));
            applied += 1;
          }
        }

        // (c) CONTENU (§10, mode « Contenu + design ») : l'assistant réécrit
        //     page par page, puis le texte est redistribué sur les éléments.
        if (plan.mode === "content" && plan.action) {
          for (const p of targets) {
            const src = pageTextForAiSafe(p);
            if (!src) continue;
            const d = await api.genAi({
              action: plan.action === "shorten" ? "shorten" : plan.action,
              text: src.slice(0, 4000),
              title: docMeta?.title,
              subtitle: docMeta?.subtitle,
              author: docMeta?.author,
              instruction: plan.instruction,
            });
            const out = String(d?.text || "").trim();
            if (!out) continue;
            const { patches } = distributeText(p, out, { target: plan.action === "quote" ? "text" : "text" });
            const ids = Object.keys(patches || {});
            if (!ids.length) continue;
            nextPages = nextPages.map((q) =>
              q.id !== p.id
                ? q
                : {
                    ...q,
                    elements: q.elements.map((e) =>
                      patches[e.id] != null ? { ...e, html: patches[e.id] } : e,
                    ),
                  },
            );
            applied += 1;
          }
        } else if (plan.shorten) {
          // « Réduis ce texte » en mode design : le texte EXISTANT est
          // simplement redistribué dans la page (aucun mot modifié).
          for (const p of targets) {
            const text = pageTextForAiSafe(p);
            if (!text) continue;
            const { patches } = distributeText(p, text);
            const ids = Object.keys(patches || {});
            if (!ids.length) continue;
            nextPages = nextPages.map((q) =>
              q.id !== p.id ? q : { ...q, elements: q.elements.map((e) => (patches[e.id] != null ? { ...e, html: patches[e.id] } : e)) },
            );
            applied += 1;
          }
        }

        if (!applied) {
          flash(t("L'IA n'a pas proposé de modification exploitable pour cette portée."));
          return;
        }
        commit(`IA — ${plan.summary} (${describeScope(plan)})`, nextPages);
        setAiResult({ scope: describeScope(plan), ok: true });
        flash(t("Modification IA appliquée."));
      } catch (e) {
        setError(e?.message || t("IA indisponible"));
      } finally {
        setBusy("");
      }
    },
    [activePage, pages, commit, t, flash, pageTextForAiSafe],
  );
  // ─── Multi-pages (§11) et global (§12) ─────────────────────────────────────
  const applyMultiPatch = useCallback(
    (label, overrides) => {
      const all = pages || [];
      const wanted = selPageIds.length ? selPageIds : all.map((p) => p.id);
      const ids = wanted;
      setPendingPlan({ kind: "multi", label: `${label} — ${ids.length} page(s)`, ids, patch: { overrides: overrides || {} } });
    },
    [selPageIds, pages, t, flash],
  );
  const applyMultiFont = useCallback((fontFamily) => applyMultiPatch(`Police ${fontFamily}`, { bodyFont: fontFamily }), [applyMultiPatch]);
  // Aucun verrou de page ni d'élément n'est appliqué : toutes les pages et tous
  // les éléments restent modifiables.
  const addEditorialToPages = useCallback(
    (ids, typeId) => {
      const cur = pagesRef.current || [];
      let next = cur;
      let added = 0;
      for (const id of ids) {
        const page = next.find((p) => p.id === id);
        if (!page || page.elements.some((e) => e.type === typeId)) continue;
        next = addElement(next, id, newElement(template, typeId, box, { docMeta: docMeta || {} }));
        added++;
      }
      if (!added) {
        flash(t("Déjà présent sur les pages concernées."));
        return;
      }
      commit(`Éléments éditoriaux (${typeId}) — ${added} page(s)`, next);
      flash(t("Ajouté aux pages concernées."));
    },
    [template, box, docMeta, commit, t, flash],
  );
  // ─── Débordement (§20) : solutions en un clic ─────────────────────────────
  const reduceFontsActive = useCallback(() => {
    const page = curPage();
    if (!page) return;
    const next = patchPages(pagesRef.current || [], [page.id], (p) => ({
      ...p,
      elements: p.elements.map((el) => (isTextType(el) && el.style?.size ? { ...el, style: { ...el.style, size: Math.max(7, round1(el.style.size - 0.5)) } } : el)),
    }));
    commit("Police réduite (débordement)", next);
    flash(t("Police réduite — vérifiez le résultat."));
  }, [commit, t, flash]);
  const nudgeOverflow = useCallback(() => {
    const page = curPage();
    if (!page) return;
    const bottom = round1(box.h - box.m.bottom);
    const target = sortedElements(page)
      .filter((e) => !e.hidden && round1(e.box.y + e.box.h) > bottom)
      .sort((a, b) => b.box.y + b.box.h - (a.box.y + a.box.h))[0];
    if (!target) {
      flash(t("Aucun élément ne dépasse de la page."));
      return;
    }
    const delta = Math.max(1, round1(target.box.y + target.box.h - bottom));
    const next = patchPages(pagesRef.current || [], [page.id], (p) => ({
      ...p,
      elements: p.elements.map((e) => (e.id === target.id ? { ...e, box: { ...e.box, y: Math.max(box.m.top, round1(e.box.y - delta)) } } : e)),
    }));
    commit("Élément remonté (débordement)", next);
    flash(t("Élément remonté dans la page."));
  }, [box, commit, t, flash]);
// ─── Ajustement de l'aperçu à l'écran (§18 : téléphone compris) ──────────────
// Une page A4 à zoom 0,85 mesure ~790 px : sur téléphone (~360 px) elle
// débordait. On applique un facteur `previewFit` pour que la largeur PLEINE
// de la page tienne toujours dans la zone d'aperçu, sans changer le zoom
// choisi par l'utilisateur (l'export n'est pas affecté).
const [previewFit, setPreviewFit] = useState(1);
useEffect(() => {
  if (mode !== "preview") return undefined;
  const el = previewRef.current;
  if (!el) return undefined;
  const measure = () => {
    const raw = box.w * PX_PER_MM * zoom;
    if (!raw) return;
    let avail = (el.clientWidth || 360) - 24; // padding de la carte
    if (previewMode === "mobile") avail = Math.min(avail, 360);
    else if (previewMode === "spread") avail = avail / 2;
    setPreviewFit(Math.max(0.15, Math.min(1, avail / raw)));
  };
  measure();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
  ro?.observe(el);
  window.addEventListener("resize", measure);
  return () => {
    ro?.disconnect();
    window.removeEventListener("resize", measure);
  };
}, [mode, previewMode, box.w, zoom]);
const previewZoom = zoom * previewFit;
// ─── Ajustement du canvas d'ÉDITION à l'écran (§18 : téléphone) ─────────────
// Même logique que `previewFit`, appliquée au mode ÉDITION : sur téléphone une
// page A4 (~794 px à zoom 1) ne tenait pas dans la largeur visible → les
// éléments hors écran semblaient « disparus » et il fallait scroller dans tous
// les sens. `canvasFit` est le rapport LARGEUR DISPONIBLE / LARGEUR DE PAGE À
// ZOOM 1 (borné à 1) : il ne dépend donc PAS du zoom courant, ce qui permet aux
// boutons +/− de continuer à agrandir la page (au-delà de la largeur écran, on
// scrolle — comportement attendu). Il est appliqué AU ZOOM passé au canvas (et
// non par un `transform: scale` CSS) : tous les gestes étant calculés à partir
// de ce zoom (`/ (PX_PER_MM * zoom)`), déplacement et redimensionnement restent
// exacts. L'export, lui, garde la taille réelle (le facteur est local à l'UI).
const [canvasFit, setCanvasFit] = useState(1);
useEffect(() => {
  if (mode !== "edit" || busy === "load") return undefined;
  const raw1 = box.w * PX_PER_MM; // largeur de page à zoom 1
  if (!raw1) return undefined;
  let ro = null;
  let raf = 0;
  let tries = 0;
  const measure = () => {
    const el = centerRef.current;
    if (!el) return;
    // Padding lu sur l'élément (14 px desktop, 8 px mobile) : aucune constante
    // magique à maintenir, + 4 px de sécurité pour ne jamais déborder.
    const cs = window.getComputedStyle(el);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const avail = Math.max(0, el.getBoundingClientRect().width - pad - 4);
    setCanvasFit(Math.max(0.2, Math.min(1, avail / raw1)));
  };
  // Le <main> n'est PAS monté au premier passage (écran « Préparation de
  // l'éditeur… ») : sans réessai, le facteur restait à 1 et la page débordait
  // — exactement le « il faut glisser le document de droite à gauche ».
  const attach = () => {
    if (!centerRef.current) {
      if (tries < 30) {
        tries += 1;
        raf = requestAnimationFrame(attach);
      }
      return;
    }
    measure();
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(centerRef.current);
    }
  };
  attach();
  window.addEventListener("resize", measure);
  return () => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
    window.removeEventListener("resize", measure);
  };
}, [mode, box.w, busy, (pages || []).length]);
const editZoom = zoom * canvasFit;

  // ─── Aperçu plein écran (§19) ─────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    try {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else previewRef.current?.requestFullscreen?.();
    } catch { /* plein écran indisponible : l'aperçu reste utilisable */ }
  }, []);
  const confirmPending = useCallback(() => {
    const plan = pendingPlan;
    if (!plan) return;
    setPendingPlan(null);
    if (plan.kind === "multi") {
      const ids = new Set(plan.ids);
      const ovr = plan.patch.overrides || {};
      if (Object.keys(ovr).length) {
        // Écrit sur les STYLES D'ÉLÉMENTS (seuls lus par l'aperçu et l'export) —
        // un `page.style_overrides` ne serait jamais consommé nulle part.
        commit(plan.label, (pages || []).map((p) => (ids.has(p.id) ? applyDesignToElements(p, ovr) : p)));
        flash(t("Modification appliquée."));
      }
    } else if (plan.kind === "size") {
      // Taille du texte sur tout le document — déjà confirmée par l'utilisateur.
      sizeStep(plan.delta, plan.sizeScope || "document", true);
    } else if (plan.kind === "bold") {
      // Gras global : le moteur exclut les titres et citations et respecte les
      // verrous de design/élément. Un seul point d'historique via commit().
      const { pages: next, count } = boldDocumentText(pagesRef.current || []);
      if (!count) {
        flash(t("Document déjà en gras (hors titres et citations)."));
        return;
      }
      commit(plan.label, next);
      flash(`${t("Gras appliqué au document")} — ${count} ${t("élément(s)")}`);
    } else if (plan.kind === "ai") {
      runAi(plan);
    }
  }, [pendingPlan, pages, commit, t, flash, runAi, sizeStep]);

  // ─── Contrôle qualité (§20) ────────────────────────────────────────────────
  const runCheck = useCallback(() => {
    setCheck(studioCheck(pagesRef.current || [], box, docMeta || {}));
    setPanel("check");
  }, [box, docMeta]);

  // ─── 🔗 Mots collés (§20 bis) ──────────────────────────────────────────────
  // Les textes importés (PDF → DOCX, OCR, copier-coller) arrivent souvent SANS
  // les espaces (« lesmots », « fin.Le », « 5000francs »). Le moteur PUR
  // `gluedWords.js` les détecte ; l'utilisateur VOIT la liste avant/après puis
  // corrige tout d'un clic (un seul point d'historique → annulable Ctrl+Z).
  const GLUED_RULE_TXT = useMemo(
    () => ({
      punct: t("Ponctuation collée"),
      space: t("Espace avant la ponctuation"),
      case: t("Majuscule collée"),
      long: t("Mots agglutinés"),
      ref: t("Comparatif (vocabulaire du document)"),
      digit: t("Chiffres collés"),
      apos: t("Apostrophe manquante"),
    }),
    [t]
  );
  const scanGlued = useCallback(() => {
    const all = pagesRef.current || [];
    // ─── COMPARATIF : le texte d'origine et les pages se comparent ─────────
    // Les mots des PAGES sont découpés selon le vocabulaire du TEXTE D'ORIGINE
    // (onglet Contenu) et réciproquement : un mot collé dont les morceaux sont
    // des mots de l'autre texte est découpé même s'il est absent du dictionnaire
    // général (vocabulaire métier, noms propres, sigles). Un mot qui existe TEL
    // QUEL dans le texte de référence est considéré correct et n'est jamais
    // coupé — c'est le garde-fou du comparatif.
    const originWords = buildGluedReference(html || "");
    const pageWords = buildGluedReference(gluedPagesText(all));
    const { changes } = fixGluedInPages(all, { reference: originWords });
    const meta = fixGluedDoc(docMeta || {}, { reference: originWords });
    const items = changes.map((c) => {
      const page = all.find((p) => p.id === c.pageId);
      const el = (page?.elements || []).find((e) => e.id === c.elId);
      return {
        key: `${c.pageId}:${c.elId}`,
        where: `${t("Page")} ${page?.number ?? "?"} · ${t(elementLabel(el) || "")}`,
        fixes: c.fixes,
      };
    });
    if (meta.fixes.length) {
      items.push({ key: "meta", where: t("Titre, auteur et couverture"), fixes: meta.fixes });
    }
    // Le texte de l'onglet « Contenu » est corrigé EN MÊME TEMPS (le parent
    // applique le HTML sans émettre d'update : la mise en page du Studio reste
    // intacte, mais une prochaine synchronisation ne réintroduit pas les mots
    // collés dans les pages).
    const content = onGluedContent && html ? fixGluedInHtml(html, { reference: pageWords }) : null;
    if (content?.fixes.length) {
      items.push({ key: "content", where: t("Texte du document"), fixes: content.fixes });
    }
    const total = items.reduce((n, it) => n + it.fixes.length, 0);
    setGluedSkip([]);
    setGlued({ changes, meta, content, items, total, refWords: originWords.size });
  }, [docMeta, html, onGluedContent, t]);
  const toggleGluedItem = useCallback((key) => {
    setGluedSkip((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }, []);
  // Nombre de corrections retenues (celles qui seront appliquées au clic).
  const gluedSelected = useMemo(() => {
    if (!glued) return 0;
    const skipped = new Set(gluedSkip);
    return glued.items.reduce((n, it) => n + (skipped.has(it.key) ? 0 : it.fixes.length), 0);
  }, [glued, gluedSkip]);
  const applyGluedFixes = useCallback(() => {
    const rep = glued;
    if (!rep) return;
    const skipped = new Set(gluedSkip);
    const changes = rep.changes.filter((c) => !skipped.has(`${c.pageId}:${c.elId}`));
    const withMeta = !!(rep.meta?.count && !skipped.has("meta"));
    const withContent = !!(rep.content?.fixes?.length && !skipped.has("content"));
    const n =
      changes.reduce((k, c) => k + c.fixes.length, 0) +
      (withMeta ? rep.meta.fixes.length : 0) +
      (withContent ? rep.content.fixes.length : 0);
    if (!n) {
      flash(t("Aucune correction sélectionnée."));
      return;
    }
    if (changes.length) {
      commit(`Mots collés — ${n}`, applyGluedChanges(pagesRef.current || [], changes));
    }
    if (withMeta) onMetaPatch?.(rep.meta.patch);
    if (withContent) {
      // Empreinte mise à jour tout de suite : la sauvegarde qui suit écrit le
      // bon `content_key` (sinon une resynchronisation reconstruirait les pages).
      keysRef.current = { ...keysRef.current, contentKey: studioContentKey(rep.content.html) };
      onGluedContent?.(rep.content.html);
    }
    setGlued(null);
    setGluedSkip([]);
    flash(`${t("Corrections appliquées")} — ${n}`);
  }, [glued, gluedSkip, commit, onMetaPatch, onGluedContent, t, flash]);

  // ─── Exports (§19 : PDF/EPUB ne sont que des exports du modèle) ────────────
  const doExport = useCallback(
    async (kind) => {
      setBusy(kind);
      setError("");
      try {
        const opts = { pages: pagesRef.current || [], docMeta: docMeta || {} };
        if (kind === "pdf") await exportStudioPdf({ ...opts, filename: `${doc?.ref || "document"}-studio.pdf` });
        else await exportStudioEpub(opts);
        flash(t(kind === "pdf" ? "PDF exporté." : "EPUB exporté."));
      } catch (e) {
        setError(e?.message || t("Export impossible"));
      } finally {
        setBusy("");
      }
    },
    [doc?.ref, docMeta, t, flash],
  );
  // ─── Raccourcis clavier (§27) ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (!activeId || mode !== "edit") return;
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const k = (e.key || "").toLowerCase();
      if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((mod && k === "y") || (mod && e.shiftKey && k === "z")) {
        e.preventDefault();
        redo();
      } else if (mod && k === "s") {
        e.preventDefault();
        saveRef.current(false);
      } else if (mod && k === "c" && !typing && selIds.length) {
        copyEls();
      } else if (mod && k === "v" && !typing) {
        pasteEls();
      } else if (mod && k === "x" && !typing && selIds.length) {
        cutEls();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing && selIds.length) {
        e.preventDefault();
        doDeleteEls();
      } else if (e.key === "Escape") {
        setMenu(null);
        setSelIds([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, mode, selIds, undo, redo, copyEls, pasteEls, cutEls, doDeleteEls]);
  // Taille moyenne affichée dans « Texte et styles » pour la portée active :
  // sélection de textes si elle existe, sinon tous les textes de la page.
  // Déclaré AVANT le retour anticipé de chargement : un hook placé après
  // `if (busy === "load") return …` serait sauté au premier rendu puis appelé
  // au suivant → React #310 « Rendered more hooks than during the previous render ».
  const sizeLabel = useMemo(() => {
    const scopeEls =
      sizeScope === "selection" && selEls.some((e) => isTextType(e))
        ? selEls.filter((e) => isTextType(e))
        : (activePage?.elements || []).filter((e) => isTextType(e));
    const vals = scopeEls.map((e) => baseSizeOf(e, template)).filter((n) => Number.isFinite(n));
    if (!vals.length) return "—";
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `${Math.round(avg * 10) / 10} pt`;
  }, [sizeScope, selEls, activePage, template]);
  // ─── Rendu ──────────────────────────────────────────────────────────────────
  if (busy === "load") {
    return (
      <div className="studio-root">
        <div className="studio-loading">⏳ {t("Préparation de l'éditeur page par page…")}</div>
      </div>
    );
  }
  const timeShort = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
  return (
    <div className="studio-root">
      {/* Sélecteur de fichier caché — import/remplacement d'image (§3/§6) */}
      <input
        ref={fileRef}
        type="file"
        className="studio-fileinput"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(e) => onImagePicked(e.target.files?.[0])}
      />
      {/* Barre supérieure (§2) */}
      <div className="studio-topbar">
        <button type="button" className="btn btn-outline btn-small" onClick={onClose} title={t("Retour au document")}>
          ←
        </button>
        <div className="studio-docname" title={doc?.ref}>
          📗 {doc?.title || doc?.ref || t("Document")}
        </div>
        <button type="button" className="btn btn-small" onClick={() => saveRef.current(false)} disabled={saving}>
          {saving ? "…" : `💾 ${t("Enregistrer")}`}
        </button>
        <span className="studio-autosave">
          {dirty ? `● ${t("modifications en cours")}` : savedAt ? `✓ ${t("enregistré")} ${timeShort(savedAt.toISOString())}` : t("sauvegarde automatique activée")}
        </span>
        <span className="studio-sep" />
        <button type="button" className="btn btn-outline btn-small" onClick={undo} disabled={!past.length} title="Annuler (Ctrl+Z)">↩</button>
        <button type="button" className="btn btn-outline btn-small" onClick={redo} disabled={!future.length} title="Rétablir (Ctrl+Y)">↪</button>
        <span className="studio-sep" />
        <button type="button" className="btn btn-outline btn-small" onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))} title="Zoom −">−</button>
        <span className="studio-zoomval" title={canvasFit < 0.999 ? t("Ajusté à l'écran — l'export garde la taille réelle.") : ""}>
          {Math.round(editZoom * 100)} %{canvasFit < 0.999 ? " ⤢" : ""}
        </span>
        <button type="button" className="btn btn-outline btn-small" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} title="Zoom +">+</button>
        {canvasFit < 0.999 && (
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => setZoom(1)}
            title={t("Ajuster à la largeur de l'écran")}
          >
            ⤢
          </button>
        )}
        <span className="studio-sep" />
        <button type="button" className={`btn btn-small ${mode === "preview" ? "" : "btn-outline"}`} onClick={() => setMode(mode === "preview" ? "edit" : "preview")}>
          👁 {t("Aperçu")}
        </button>
        <button type="button" className="btn btn-outline btn-small" onClick={runCheck}>🔍 {t("Vérifier le document")}</button>
        <button
          type="button"
          className="btn btn-outline btn-small"
          onClick={scanGlued}
          title={t("Détecter les mots collés (comparatif avec le texte d'origine) et tout corriger d'un clic")}
        >
          🔗 {t("Mots collés")}
        </button>
        <button type="button" className="btn btn-outline btn-small" onClick={() => setPanel("ai")} title={t("Générer avec l'IA")}>
          ✨ {t("IA")}
        </button>
        <span className="studio-spacer" />
        <button type="button" className="btn btn-outline btn-small" onClick={() => doExport("epub")} disabled={busy === "epub"}>📘 EPUB</button>
        <button type="button" className="btn btn-outline btn-small" onClick={() => doExport("pdf")} disabled={busy === "pdf"}>📄 PDF</button>
        <button
          type="button"
          className="btn btn-outline btn-small"
          onClick={() => {
            navigator.clipboard?.writeText(`${window.location.origin}/generateur?ref=${encodeURIComponent(doc?.ref || "")}`);
            flash(t("Lien de partage copié."));
          }}
        >
          🔗 {t("Partager")}
        </button>
      </div>
      <div className="studio-body">
        {/* Colonne gauche : pages (§2, §11, §15) */}
        <aside className="studio-pages">
          <div className="studio-pages-head">
            <strong>PAGES</strong>
            <span>
              {pageView === "grid" ? (
                <button type="button" className="studio-iconbtn" onClick={() => setPageView("list")} title={t("Vue liste")}>☰</button>
              ) : (
                <button type="button" className="studio-iconbtn" onClick={() => setPageView("grid")} title={t("Vue grille")}>▦</button>
              )}
            </span>
          </div>
          <input
            className="studio-pages-search"
            placeholder={t("Rechercher une page…")}
            value={pageSearch}
            onChange={(e) => setPageSearch(e.target.value)}
          />
          <div className={`studio-pages-list ${pageView === "grid" ? "is-grid" : "is-list"}`}>
            {filteredPages.map((p) => {
              const idx = (pages || []).indexOf(p);
              return (
                <div
                  key={p.id}
                  className={`studio-pagecard ${p.id === activeId ? "active" : ""} ${selPageIds.includes(p.id) ? "checked" : ""}`}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx != null && dragIdx !== idx) doMovePage(dragIdx, idx);
                    setDragIdx(null);
                  }}
                  onClick={() => goPage(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && goPage(p.id)}
                >
                  <label className="studio-pagecheck" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selPageIds.includes(p.id)} onChange={() => toggleSelPage(p.id)} />
                  </label>
                  <div className="studio-pagethumb">
                    <span className="studio-pagethumb-num">{p.number}</span>
                    <span className="studio-pagethumb-label">
                      {p.label || PAGE_KINDS.find((k) => k.id === p.kind)?.label || "Page"}
                    </span>
                  </div>
                  <div className="studio-pageactions">
                    <button type="button" title={t("Dupliquer cette page")} onClick={(e) => { e.stopPropagation(); doDuplicatePage(p.id); }}>⧉</button>
                    <button type="button" title={t("Supprimer")} onClick={(e) => { e.stopPropagation(); doDeletePages([p.id]); }}>🗑</button>
                    <button type="button" title={t("Modifier cette page")} onClick={(e) => { e.stopPropagation(); goPage(p.id); }}>✏️</button>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-outline btn-small studio-addpage" onClick={() => setAddOpen(true)}>
            + {t("Ajouter une page")}
          </button>
          {selPageIds.length > 0 && (
            <div className="studio-multipages">
              <strong>{selPageIds.length} {t("page(s) sélectionnée(s)")}</strong>
              <button type="button" className="btn btn-outline btn-small" onClick={() => applyMultiPatch("Police serif", { bodyFont: "serif" })}>Aa serif</button>
              <button type="button" className="btn btn-outline btn-small" onClick={() => applyMultiPatch("Police sans", { bodyFont: "sans" })}>Aa sans</button>
              <button type="button" className="btn btn-outline btn-small" onClick={() => applyMultiPatch("Couleur d'accent", { colors: { accent: template.colors.accent } })}>🎨 {t("Couleur")}</button>
              <button type="button" className="btn btn-outline btn-small studio-danger" onClick={() => doDeletePages(selPageIds)}>🗑 {t("Supprimer la sélection")}</button>
              <button type="button" className="btn btn-outline btn-small" onClick={() => setSelPageIds([])}>{t("Désélectionner")}</button>
            </div>
          )}
        </aside>
        {/* Centre : canvas éditable (§3-§5) ou aperçu (§19) */}
        <main className="studio-center" ref={centerRef}>
          {error && <div className="studio-error">⚠️ {error}</div>}
          {mode === "edit" ? (
            <>
              
              <StudioCanvas
                page={activePage}
                box={box}
                template={template}
                docMeta={docMeta || {}}
                totalPages={totalPages}
                zoom={editZoom}
                selectedIds={selIds}
                readOnly={false}
                onSelect={onSelectEls}
                onBeginGesture={beginGesture}
                onPatch={applyLive}
                onEndGesture={endGesture}
                onElementMenu={(pos, elId) => setMenu({ ...pos, elId })}
                onAutoHeight={fitTextHeight}
              />
            </>
          ) : (
            <div ref={previewRef} className={`studio-preview ${previewMode === "spread" ? "is-spread" : ""} ${previewMode === "mobile" ? "is-mobile" : ""}`}>
              <div className="studio-preview-tools">
                {[
                  { id: "single", label: "1 page" },
                  { id: "spread", label: t("Deux pages") },
                  { id: "mobile", label: "📱 " + t("Mobile") },
                ].map((m) => (
                  <button key={m.id} type="button" className={`btn btn-outline btn-small ${previewMode === m.id ? "active" : ""}`} onClick={() => setPreviewMode(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <div className={`studio-preview-pages ${previewMode === "spread" ? "is-spread" : ""}`}>
                {(pages || []).map((p, i) => (
                  <div key={p.id} className="studio-preview-page" style={{ width: box.w * PX_PER_MM * previewZoom, height: box.h * PX_PER_MM * previewZoom }}>
                    <StudioCanvas
                      page={p}
                      box={box}
                      template={template}
                      docMeta={docMeta || {}}
                      totalPages={totalPages}
                      zoom={previewZoom}
                      selectedIds={[]}
                      readOnly
                      onAutoHeight={fitTextHeight}
                    />
                    <button type="button" className="studio-preview-edit" onClick={() => { goPage(p.id); setMode("edit"); }}>
                      ✏️ {t("Modifier cette page")}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
        {/* Droite : inspecteur (§4, §6, §9-§14, §17, §20) */}
        <aside className="studio-inspector">
          <div className="studio-tabs">
            {[
              { id: "add", label: "➕" },
              { id: "text", label: "🅰" },
              { id: "layers", label: "🧱" },
              { id: "ai", label: "✨" },
              { id: "layout", label: "📐" },
              { id: "history", label: "🕘" },
              { id: "check", label: "🔍" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`studio-tab ${panel === tab.id ? "active" : ""}`}
                onClick={() => setPanel(tab.id)}
                title={t(
                  {
                    add: "Ajouter des éléments",
                    text: "Texte et styles",
                    layers: "Calques",
                    ai: "Modifier avec l'IA",
                    layout: "Mise en page",
                    history: "Historique",
                    check: "Contrôle du document",
                  }[tab.id],
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="studio-panel">
            {panel === "add" && (
              <div className="studio-panel-sec">
                <strong>➕ {t("Ajouter des éléments")}</strong>
                {ELEMENT_LIBRARY.map((g) => (
                  <div key={g.id} className="studio-lib">
                    <span className="studio-lib-title">{g.label}</span>
                    <div className="studio-lib-items">
                      {g.items.map((it) => (
                        <button key={it.id} type="button" className="studio-chip" onClick={() => addElementOf(it.id)}>
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="studio-imagebar">
                  <button type="button" className="btn btn-outline btn-small" onClick={() => askImage("add", "image")}>
                    🖼️ {t("Importer une image")}
                  </button>
                  <button type="button" className="btn btn-outline btn-small" onClick={() => askImage("add", "gallery")}>
                    🖼️ {t("Galerie : ajouter des images")}
                  </button>
                  {selEls.some((e) => MEDIA_TYPES.includes(e.type)) && (
                    <button type="button" className="btn btn-small" onClick={() => askImage("replace")}>
                      🔁 {t("Remplacer l'image")}
                    </button>
                  )}
                </div>
                <button type="button" className="btn btn-outline btn-small" onClick={openDesignChoices}>📐 {t("Changer le design de cette page")}</button>
              </div>
            )}
            {panel === "text" && (
              <div className="studio-panel-sec">
                <strong>🅰 {t("Texte et styles")}</strong>
                {/* Taille du texte — portée réglable (§4/§11/§12) : jamais limitée
                    à l'élément sélectionné, on peut agrandir la page ou le livre. */}
                <div className="studio-sizerow">
                  <span className="studio-mini-label">{t("Taille du texte")}</span>
                  <button type="button" className="studio-stepbtn" title={t("Réduire la taille")} onClick={() => sizeStep(-1, sizeScope)}>−</button>
                  <span className="studio-sizeval">{sizeLabel}</span>
                  <button type="button" className="studio-stepbtn" title={t("Augmenter la taille")} onClick={() => sizeStep(1, sizeScope)}>+</button>
                </div>
                <div className="studio-rowbtns">
                  {[["selection", "Sélection"], ["page", "Page entière"], ["document", "Document"]].map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      className={`studio-chip studio-chip-sm ${sizeScope === k ? "active" : ""}`}
                      disabled={k === "selection" && !selEls.some((e) => isTextType(e))}
                      onClick={() => setSizeScope(k)}
                    >
                      {t(lbl)}
                    </button>
                  ))}
                </div>
                <span className="studio-hint">
                  {t("La taille s'applique à tous les textes de la portée choisie — pas seulement à l'élément sélectionné.")}
                </span>
                <div className="studio-rowbtns">
                  <button
                    type="button"
                    className="studio-chip studio-chip-sm"
                    onClick={() => setPendingPlan({ kind: "bold", label: t("Tout le document en gras") })}
                    title={t("Met en gras tous les textes du document, sauf les titres et les citations.")}
                  >
                    <strong>G</strong> {t("Tout le document en gras")}
                  </button>
                </div>
                <span className="studio-hint">
                  {t("Met en gras tous les textes du document, sauf les titres et les citations.")}
                </span>
                {!selEls.filter((e) => isTextType(e)).length && <span className="studio-hint">{t("Pour modifier un élément précis, sélectionnez-le sur la page.")}</span>}
                {selEls.filter((e) => isTextType(e)).map((el) => (
                  <div key={el.id} className="studio-texteditor">
                    <span className="studio-mini-label">{elementLabel(el)}</span>
                    <textarea
                      className="studio-html-input"
                      value={el.html || ""}
                      rows={4}
                      onChange={(e) => patchEls([{ id: el.id, patch: { html: e.target.value } }], "Texte modifié")}
                    />
                    <div className="studio-stylegrid">
                      <label>
                        {t("Police")}
                        <select value={el.style?.font || template.bodyFont || "sans"} onChange={(e) => patchEls([{ id: el.id, patch: { style: { ...el.style, font: e.target.value } } }], "Police modifiée")}>
                          {Object.keys(FONT_CSS).map((k) => (
                            <option key={k} value={k}>{FONT_LABELS[k] || k}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t("Taille")}
                        <input type="number" min="6" max="72" step="0.5" value={baseSizeOf(el, template)} onChange={(e) => patchEls([{ id: el.id, patch: { style: { ...el.style, size: Math.max(5, Math.min(72, Number(e.target.value) || baseSizeOf(el, template))) } } }], "Taille modifiée")} />
                      </label>
                      <label>
                        {t("Couleur")}
                        <input type="color" value={el.style?.color || template.colors?.body || template.colors?.heading || "#111111"} onChange={(e) => patchEls([{ id: el.id, patch: { style: { ...el.style, color: e.target.value } } }], "Couleur modifiée")} />
                      </label>
                      <label>
                        {t("Interligne")}
                        <input type="number" step="0.05" min="0.8" max="3" value={el.style?.lineHeight || 1.35} onChange={(e) => patchEls([{ id: el.id, patch: { style: { ...el.style, lineHeight: Number(e.target.value) || 1.35 } } }], "Interligne modifié")} />
                      </label>
                    </div>
                    <div className="studio-rowbtns">
                      {[
                        { k: "bold", label: "G" },
                        { k: "italic", label: "I" },
                        { k: "underline", label: "S" },
                      ].map((s) => (
                        <button key={s.k} type="button" className={`studio-tglbtn ${el.style?.[s.k] ? "active" : ""}`} onClick={() => patchEls([{ id: el.id, patch: { style: { ...el.style, [s.k]: !el.style?.[s.k] } } }], "Style modifié")}>
                          {s.label}
                        </button>
                      ))}
                      {[
                        { k: "left", label: "⯇" },
                        { k: "center", label: "≡" },
                        { k: "right", label: "⯈" },
                        { k: "justify", label: "▤" },
                      ].map((a) => (
                        <button key={a.k} type="button" className={`studio-tglbtn ${el.style?.align === a.k ? "active" : ""}`} onClick={() => patchEls([{ id: el.id, patch: { style: { ...el.style, align: a.k } } }], "Alignement modifié")}>
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {panel === "layers" && activePage && (
              <div className="studio-panel-sec">
                <strong>🧱 {t("Calques")}</strong>
                <div className="studio-alignrow">
                  {ALIGN_MODES.map((m) => (
                    <button key={m.id} type="button" className="studio-chip" disabled={!selIds.length} onClick={() => alignSel(m.id)} title={m.label}>
                      {m.label.replace("Aligner ", "")}
                    </button>
                  ))}
                  <button type="button" className="studio-chip" disabled={selIds.length < 3} onClick={() => distributeSel("h")}>{t("Distribuer ↔")}</button>
                  <button type="button" className="studio-chip" disabled={selIds.length < 3} onClick={() => distributeSel("v")}>{t("Distribuer ↕")}</button>
                </div>
                <ul className="studio-layers">
                  {sortedElements(activePage).slice().reverse().map((el) => (
                    <li key={el.id} className={`${selIds.includes(el.id) ? "active" : ""} ${el.hidden ? "is-hidden" : ""}`}>
                      <button type="button" className="studio-layername" onClick={() => onSelectEls([el.id])}>
                        {elementLabel(el)}
                        {el.hidden ? " 👁‍🗨" : ""}
                      </button>
                      <span className="studio-layerbtns">
                        <button type="button" title={t("Monter")} onClick={() => { setSelIds([el.id]); reorderSel("up"); }}>↑</button>
                        <button type="button" title={t("Descendre")} onClick={() => { setSelIds([el.id]); reorderSel("down"); }}>↓</button>
                        <button type="button" title={el.hidden ? t("Afficher") : t("Masquer")} onClick={() => toggleHideEls(!el.hidden) || setSelIds([el.id])}>{el.hidden ? "👁" : "👁‍🗨"}</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {panel === "ai" && (
              <div className="studio-panel-sec">
                <strong>✨ {t("Modifier avec l'IA")}</strong>
                <div className="studio-aimode">
                  <button type="button" className={`studio-chip ${aiMode === "design" ? "active" : ""}`} onClick={() => setAiMode("design")} title={t("L'IA modifie la disposition, les couleurs, la typographie — jamais le texte.")}>
                    🎨 {t("Design uniquement")}
                  </button>
                  <button type="button" className={`studio-chip ${aiMode === "content" ? "active" : ""}`} onClick={() => setAiMode("content")} title={t("L'IA peut aussi réécrire, corriger, résumer le contenu.")}>
                    ✍️ {t("Contenu + design")}
                  </button>
                </div>
                <textarea
                  className="studio-html-input"
                  rows={3}
                  placeholder={t("Ex : Rends cette page plus moderne. / Corrige uniquement les fautes.")}
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                />
                <div className="studio-aiexamples">
                  {AI_PAGE_EXAMPLES.slice(0, 4).map((ex) => (
                    <button key={ex} type="button" className="studio-chip studio-chip-sm" onClick={() => setAiText(ex)}>
                      {ex.length > 34 ? `${ex.slice(0, 34)}…` : ex}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn btn-small" onClick={previewAi} disabled={busy === "ai"}>
                  {busy === "ai" ? "…" : `✨ ${t("Aperçu de la modification")}`}
                </button>
                {activePage && (
                  <span className="studio-hint">
                    {t("Page")} {activePage.number} · {pageWordCount(activePage)} {t("mots")} — {t("l'IA respecte strictement la portée annoncée.")}
                  </span>
                )}
                {aiResult && <span className="studio-okmsg">✓ {aiResult.scope}</span>}
              </div>
            )}
            {panel === "layout" && (
              <div className="studio-panel-sec">
                <strong>📐 {t("Mise en page de la page active")}</strong>
                {designChoices && (
                  <div className="studio-smart">
                    <span className="studio-lib-title">{t("Suggestions intelligentes (contenu conservé)")}</span>
                    <div className="studio-lib-items">
                      {designChoices.options.map((o) => (
                        <button key={o.id} type="button" className="studio-chip studio-chip-sm" title={o.reason} onClick={() => applyPageLayout(designChoices.pageId, o.id)}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {PAGE_LAYOUTS.map((l) => (
                  <button key={l.id} type="button" className={`studio-layoutbtn ${activePage?.layout === l.id ? "active" : ""}`} onClick={() => activePage && applyPageLayout(activePage.id, l.id)} title={l.desc}>
                    <strong>{l.label}</strong>
                    <span>{l.desc}</span>
                  </button>
                ))}
              </div>
            )}
            {panel === "history" && (
              <div className="studio-panel-sec">
                <strong>🕘 {t("Historique")}</strong>
                <div className="studio-rowbtns">
                  <button type="button" className="btn btn-outline btn-small" onClick={undo} disabled={!past.length}>↩ {t("Annuler")}</button>
                  <button type="button" className="btn btn-outline btn-small" onClick={redo} disabled={!future.length}>↪ {t("Rétablir")}</button>
                </div>
                <ul className="studio-history">
                  {past.slice().reverse().slice(0, 40).map((h) => (
                    <li key={h.id}>
                      <span className="studio-histtime">{timeShort(h.at)}</span>
                      <span className="studio-histlabel">{h.label}</span>
                      <button type="button" className="studio-linkbtn" onClick={() => {
                        setPast((p) => p.slice(0, p.indexOf(h) + 1));
                        setFuture((f) => [...f, { id: uid("h"), label: h.label, at: h.at, pages: pagesRef.current }]);
                        setPages(h.pages);
                        pagesRef.current = h.pages;
                        publishLayout(h.pages);
                        markDirty();
                      }}>
                        {t("Restaurer")}
                      </button>
                    </li>
                  ))}
                  {!past.length && <li className="studio-hint">{t("Aucune modification enregistrée.")}</li>}
                </ul>
              </div>
            )}
            {panel === "check" && (
              <div className="studio-panel-sec">
                <strong>🔍 {t("Contrôle du document")}</strong>
                {!check && <button type="button" className="btn btn-small" onClick={runCheck}>{t("Lancer la vérification")}</button>}
                {check && (
                  <>
                    <span className={`studio-score ${check.score >= 80 ? "good" : check.score >= 55 ? "mid" : "bad"}`}>
                      {t("Score")} : {check.score}/100
                    </span>
                    {check.errors.map((e, i) => (
                      <div key={`e${i}`} className="studio-checkline is-error">⛔ {e.label} — <em>{e.detail}</em></div>
                    ))}
                    {check.warnings.map((w, i) => (
                      <div key={`w${i}`} className="studio-checkline is-warn">⚠️ {w.label} — <em>{w.detail}</em></div>
                    ))}
                    {check.suggestions.map((s, i) => (
                      <div key={`s${i}`} className="studio-checkline">💡 {s.label} — <em>{s.detail}</em></div>
                    ))}
                    {overflow && (
                      <div className="studio-checkline is-warn">
                        ⚠️ {t(`Débordement : ${overflow.px} px.`)}{" "}
                        <button type="button" className="studio-linkbtn" onClick={() => {
                          const page = curPage();
                          if (!page) return;
                          // Resserre l'interligne des ÉLÉMENTS texte de la page
                          // (style.lineHeight est lu par l'aperçu et l'export) —
                          // l'ancien `page.style_overrides.lineStep` n'était lu nulle part.
                          const tighten = (pg) => ({
                            ...pg,
                            elements: (pg.elements || []).map((el) =>
                              el.html
                                ? { ...el, style: { ...el.style, lineHeight: Math.max(0.9, (Number(el.style?.lineHeight) || 1.5) - 0.15) } }
                                : el,
                            ),
                          });
                          commit("Texte resserré (débordement)", updatePage(pagesRef.current || [], page.id, tighten(page)));
                          flash(t("Espacement réduit — vérifiez le résultat."));
                        }}>
                          {t("Réduire l'espacement")}
                        </button>
                      </div>
                    )}
                    {!check.errors.length && !check.warnings.length && <span className="studio-okmsg">✓ {t("Aucun problème détecté.")}</span>}
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
        {/* Overlays */}
        {menu && (
          <div className="studio-ctxmenu" style={{ position: "fixed", left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
            {[
              { label: `⧉ ${t("Dupliquer")}`, fn: doDuplicateEls, disabled: !selIds.length },
              { label: `📋 ${t("Copier")}`, fn: copyEls, disabled: !selIds.length },
              { label: `✂️ ${t("Couper")}`, fn: cutEls, disabled: !selIds.length },
              { label: `📥 ${t("Coller")}`, fn: pasteEls, disabled: !clipboardEl.current?.length },
              { label: `🖼️ ${t("Remplacer l'image")}`, fn: () => askImage("replace"), disabled: !selEls.some((e) => MEDIA_TYPES.includes(e.type)) },
              { label: `🗑 ${t("Supprimer")}`, fn: doDeleteEls, disabled: !selIds.length, danger: true },
            ].map((it) => (
              <button key={it.label} type="button" className={`${it.danger ? "studio-danger" : ""}`} disabled={it.disabled} onClick={it.fn}>
                {it.label}
              </button>
            ))}
          </div>
        )}
        {addOpen && (
          <div className="studio-modal" onClick={() => setAddOpen(false)}>
            <div className="studio-modal-box" onClick={(e) => e.stopPropagation()}>
              <strong>➕ {t("Ajouter une page")}</strong>
              <div className="studio-pagekinds">
                {PAGE_KINDS.map((k) => (
                  <button key={k.id} type="button" className="studio-pagekind" title={k.desc || k.label} onClick={() => addPage(k.id)}>
                    <span className="studio-pagekind-icon">{k.icon || "📄"}</span>
                    <span>{k.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-outline btn-small" onClick={() => setAddOpen(false)}>{t("Annuler")}</button>
            </div>
          </div>
        )}
        {pendingPlan && (
          <div className="studio-modal" onClick={() => setPendingPlan(null)}>
            <div className="studio-modal-box" onClick={(e) => e.stopPropagation()}>
              <strong>🛰️ {t("Confirmation requise")}</strong>
              <p className="studio-planscope">
                <strong>{pendingPlan.scope || pendingPlan.label}</strong>
              </p>
              <p className="studio-hint">{t("Vérifiez la portée : la modification ne s'appliquera qu'aux pages annoncées.")}</p>
              <div className="studio-rowbtns">
                <button type="button" className="btn btn-small" onClick={confirmPending}>✓ {t("Appliquer")}</button>
                <button type="button" className="btn btn-outline btn-small" onClick={() => setPendingPlan(null)}>{t("Annuler")}</button>
              </div>
            </div>
          </div>
        )}
        {glued && (
          <div className="studio-modal" onClick={() => setGlued(null)}>
            <div className="studio-modal-box studio-glued-box" onClick={(e) => e.stopPropagation()}>
              <strong>
                🔗 {t("Mots collés")} — {t("Corrections proposées")} ({glued.total})
              </strong>
              {glued.total === 0 ? (
                <p className="studio-okmsg">✓ {t("Aucun mot collé détecté.")}</p>
              ) : (
                <>
                  <p className="studio-hint">
                    {t(
                      "Détection des mots sans espace (« lesmots », « fin.Le », « 5000francs ») — vérifiez la liste puis corrigez tout d'un clic. La correction est annulable (Ctrl+Z)."
                    )}
                  </p>
                  <p className="studio-hint">
                    🔎{" "}
                    {t("Comparatif : le texte d'origine ({n} mots) sert de référence aux pages, et réciproquement.", {
                      n: glued.refWords,
                    })}{" "}
                    {t("Décochez une ligne pour l'ignorer.")}
                  </p>
                  <ul className="studio-glued-list">
                    {glued.items.slice(0, 80).map((it) => {
                      const off = gluedSkip.includes(it.key);
                      return (
                        <li key={it.key} className={`studio-glued-item ${off ? "is-skipped" : ""}`}>
                          <label className="studio-glued-check" title={t("Ignorer cette correction")}>
                            <input type="checkbox" checked={!off} onChange={() => toggleGluedItem(it.key)} />
                          </label>
                          <span className="studio-glued-fixes">
                            <span className="studio-glued-where">{it.where}</span>
                            {it.fixes.map((f, i) => (
                              <span key={`${it.key}-${i}`} className="studio-glued-fix">
                                <span className="studio-glued-rule">{GLUED_RULE_TXT[f.rule] || f.rule}</span>
                                <span className="studio-glued-before">{f.before}</span>
                                <span className="studio-glued-arrow">→</span>
                                <span className="studio-glued-after">{f.after}</span>
                              </span>
                            ))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {glued.items.length > 80 && (
                    <p className="studio-hint">{t("… et d'autres corrections sur les pages suivantes.")}</p>
                  )}
                </>
              )}
              <div className="studio-rowbtns">
                {glued.total > 0 && (
                  <button type="button" className="btn btn-small" onClick={applyGluedFixes} disabled={!gluedSelected}>
                    ✓ {t("Tout corriger")} ({gluedSelected})
                  </button>
                )}
                <button type="button" className="btn btn-outline btn-small" onClick={() => setGlued(null)}>
                  {t("Fermer")}
                </button>
              </div>
            </div>
          </div>
        )}
        {toast && <div className="studio-toast">{toast}</div>}
      </div>
    </div>
  );
}













