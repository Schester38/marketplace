// ─── Générateur de documents (ebooks/PDF) — module admin isolé ───────────────
// Onglet « Générateur » du panneau Admin. Deux vues :
//   1. Bibliothèque : documents (ouvrir, dupliquer, supprimer, nouveau) ;
//   2. Éditeur : TipTap + import TXT/MD/DOCX + design (template, couverture,
//      protection) + aperçu paginé fidèle + export PDF réel (jsPDF).
// Aucune table métier touchée : tout passe par api.gen* (/api/generator/*).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ResizableImage } from "../generator/GenImage.jsx";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { api, setGeneratorScope } from "../api.js";
import { useLang } from "../i18n.jsx";
import {
  GEN_TEMPLATES,
  PAGE_FORMATS,
  getTemplate,
  FONT_CSS,
  resolvePageBox,
  resolveTemplate,
  resolveCover,
  coverLayoutBox,
  SIZE_KEYS,
  COLOR_KEYS,
  templateFacets,
  templateMeta,
  templateVariant,
} from "../generator/templates.js";
import { useAuth } from "../App.jsx";
import { DIGITAL_CATEGORIES, countrySymbol } from "../config.js";
import { MBOPPI_CONTENT_URL, MBOPPI_CONTENT_LABEL, MBOPPI_PROMO_FONT_PT } from "../generator/footerPromo.js";
import { detectStructureHtml } from "../generator/structure.js";
import { detectScope } from "../generator/scope.js";
import { HeadingAutoDetect, formatHeadings } from "../generator/headings.js";
import { paginateDocument, PX_PER_MM, PT_TO_PX } from "../generator/paginate.js";
import { exportDocumentPdf, saveBlob } from "../generator/exportPdf.js";
import { exportEpub } from "../generator/epub.js";
import { checkDocument } from "../generator/check.js";
import { renderCoverImage, libraryThumb } from "../generator/coverImage.js";
import { coverDecorPrims } from "../generator/coverDecor.js";
import { parseDesignCommand, recommendTemplates } from "../generator/designCommands.js";
import CoverDecor from "../generator/CoverDecor.jsx";
// Décor de PAGE du modèle (bandeau, filets, colonne, cadre…) : module partagé
// avec le Studio, TOUJOURS dessiné derrière le texte (z-index 0).
import PageDecor from "../generator/PageDecor.jsx";
import DocStudio, { resolveActiveTemplate } from "../generator/DocStudio.jsx";
import { watermarkPreviewFontSize, watermarkOpacity } from "../generator/watermark.js";
import StudioCanvas from "../generator/StudioCanvas.jsx";
import { readStudio, studioBox, studioDesignKey, studioContentKey, ensureStudioFooters } from "../generator/studioModel.js";
import { exportStudioPdf } from "../generator/studioExport.js";
import {
  copyrightBlock,
  copyrightBlockHeightMm,
  COPYRIGHT_LINE_HEIGHT,
  BASELINE_EM,
  makeQrDataUrl,
  sha256Hex,
  verificationPayload,
} from "../generator/protection.js";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

// Lecture d'un fichier texte (TXT / MD) comme UTF-8.
function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Lecture du fichier impossible"));
    fr.readAsText(file);
  });
}

// Import DOCX : mammoth convertit Word → HTML sémantique (h1-h3, listes, images
// inline en dataURL — mammoth est la lib de référence pour ce pont, légère).
async function readDocxHtml(file) {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return String(result.value || "<p></p>");
}

// Compression d'image → dataURL JPEG (limité la taille du document en base).
function compressImage(file, maxSide = 1400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    // window.Image : le symbole `Image` du module est l'extension TipTap
    // (un objet Node.create, pas un constructeur) — il masquerait sinon
    // le constructeur natif <img> et ferait échouer tout insertion.
    const img = new window.Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible"));
    };
    img.src = url;
  });
}

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso || "—";
  }
};

// ─── Onglet Studio masqué ────────────────────────────────────────────────────
// L'interface n'affiche plus l'onglet « Studio » (Contenu, Design et Aperçu
// restent disponibles). Le moteur reste en place : les mises en page Studio
// enregistrées continuent d'alimenter l'aperçu et l'export PDF via un
// chargement silencieux. Repasser ce drapeau à `true` réaffiche l'onglet.
const SHOW_STUDIO_TAB = false;

// ═════════════════════════════════════════════════════════════════════════════
// Panneau « Générateur » : bibliothèque + éditeur.
// ═════════════════════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════
// Vignette de bibliothèque : première page (couverture) rendue par le même
// moteur que l'aperçu (libraryThumb → canvas → dataURL), en 120 px de large.
// ═════════════════════════════════════════════════════════════════════════════
function DocThumb({ doc }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    libraryThumb(doc, 120)
      .then((u) => alive && setSrc(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [doc.id, doc.template_id, doc.cover, doc.title, doc.author]);
  return (
    <span className="gen-thumb">
      {src ? <img src={src} alt="" /> : <span className="gen-thumb-empty">📄</span>}
    </span>
  );
}

// variant : "creator" (page /generateur, portée utilisateur — défaut) ou
// "admin" (onglet 📚 du panneau, portée admin : tous les documents).
export default function GeneratorPanel({ variant = "creator", initialDocumentId = null }) {
  const { t } = useLang();
  useEffect(() => {
    setGeneratorScope(variant === "admin");
    // Nettoyage : en quittant le panneau admin, on rend la portée créateur.
    return () => {
      if (variant === "admin") setGeneratorScope(false);
    };
  }, [variant]);
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openDoc, setOpenDoc] = useState(null); // { document, content, versions }
  const initialOpenedRef = useRef(0);

  const load = useCallback(() => {
    api
      .genDocuments()
      .then((d) => setList(d.documents || []))
      .catch((e) => setError(e?.message || "Chargement impossible"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = async (id) => {
    setError("");
    setBusy(true);
    try {
      const d = await api.genDocument(id);
      setOpenDoc({ document: d.document, content: d.content || EMPTY_DOC, versions: d.versions || [] });
    } catch (e) {
      setError(e?.message || "Ouverture impossible");
    } finally {
      setBusy(false);
    }
  };

  // Ouverture profonde depuis « Modifier » dans l'espace créateur. Le serveur
  // conserve la propriété : un autre document répond 404 et n'est jamais ouvert.
  useEffect(() => {
    const id = Number(initialDocumentId || 0);
    if (!id || initialOpenedRef.current === id) return;
    initialOpenedRef.current = id;
    open(id);
  }, [initialDocumentId]);

  // ─── Assistant guidé : « Déposez → Analysez → Choisissez → Générez » ────────
  // Dépose d'un fichier (ou collage de texte) : le document est créé, ouvert
  // dans l'éditeur, le contenu importé puis analysé — l'utilisateur arrive
  // directement au rapport + au choix du design. `pendingImport` transporte
  // le fichier/texte vers GenEditor (qui l'importera au montage).
  const [pendingImport, setPendingImport] = useState(null); // { file } | { text }
  const [dragOver, setDragOver] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const quickCreate = async (payload, title) => {
    setError("");
    setBusy(true);
    try {
      const d = await api.genCreateDocument({
        title: title || t("Nouveau document"),
        template_id: "moderne",
        page_format: "A4",
      });
      setPasteText("");
      load();
      setPendingImport(payload);
      setOpenDoc({ document: d.document, content: d.content || EMPTY_DOC, versions: [] });
    } catch (err) {
      setError(err?.message || "Création impossible");
    } finally {
      setBusy(false);
    }
  };
  const quickImportFile = async (file) => {
    if (!file) return;
    if (!/\.(docx|txt|md|markdown)$/i.test(file.name)) {
      setError(t("Formats acceptés : DOCX (Word), TXT ou Markdown."));
      return;
    }
    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 120).trim();
    await quickCreate({ file }, title);
  };
  const quickPaste = () => {
    const text = pasteText.trim();
    if (!text) return;
    const first = (text.split(/\r?\n/).find((l) => l.trim()) || "").replace(/^#+\s*/, "");
    quickCreate({ text }, first.slice(0, 120).trim());
  };

  const duplicate = async (id) => {
    setBusy(true);
    try {
      await api.genDuplicateDocument(id);
      load();
    } catch (e) {
      setError(e?.message || "Duplication impossible");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Supprimer définitivement « ${doc.title} » (${doc.doc_ref}) ?`)) return;
    setBusy(true);
    try {
      await api.genDeleteDocument(doc.id);
      load();
    } catch (e) {
      setError(e?.message || "Suppression impossible");
    } finally {
      setBusy(false);
    }
  };

  if (openDoc) {
    return (
      <GenEditor
        initialDoc={openDoc}
        pendingImport={pendingImport}
        onPendingImportDone={() => setPendingImport(null)}
        onBack={() => {
          setOpenDoc(null);
          load();
        }}
      />
    );
  }

  return (
    <section className="card section gen-section">
      <div className="gen-head">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          📚 {t("Générateur de documents")} — {t("Bibliothèque")}
        </h3>
      </div>
      <p className="hint">
        {t(
          "Collez un texte brut, choisissez un modèle : le Générateur structure, pagine, ajoute couverture et table des matières, puis exporte un PDF professionnel."
        )}
      </p>
      <p className="gen-pcnote">
        💻 {t("Pour une meilleure expérience de la plateforme, veuillez générer et éditer votre document sur Ordinateur. Merci !")}
      </p>

      {/* Assistant guidé « Déposez → Analysez → Choisissez → Générez » : le
          chemin le plus court d'un Word (ou d'un texte collé) à l'ebook. */}
      <div
        className={`gen-dropzone ${dragOver ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          quickImportFile(e.dataTransfer?.files?.[0]);
        }}
      >
        <div className="gen-dropzone-main">
          <strong>📥 {t("Déposez votre fichier ici")}</strong>
          <span className="hint">
            {t("DOCX (Word), TXT ou Markdown — un document est créé puis analysé automatiquement.")}
          </span>
        </div>
        <label className="btn btn-small btn-primary">
          📁 {t("Choisir un fichier")}
          <input
            type="file"
            accept=".docx,.txt,.md,.markdown"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              quickImportFile(f);
            }}
          />
        </label>
      </div>
      <div className="gen-pastezone">
        <textarea
          className="input"
          rows={3}
          placeholder={t("… ou collez votre texte ici (la première ligne devient le titre)")}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-small btn-primary"
          disabled={busy || !pasteText.trim()}
          onClick={quickPaste}
        >
          ✨ {t("Créer depuis le texte")}
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {list === null ? (
        <p className="hint">{t("Chargement…")}</p>
      ) : list.length === 0 ? (
        <p className="hint">
          {t(
            "Aucun document pour l'instant. Déposez un fichier Word/TXT ci-dessus ou collez votre texte pour créer le premier."
          )}
        </p>
      ) : (
        <div className="table-wrap gen-list">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>{t("Titre")}</th>
                <th>{t("Référence")}</th>
                <th>{t("Modèle")}</th>
                <th>{t("Format")}</th>
                <th>{t("Statut")}</th>
                <th>{t("Modifié")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((doc) => (
                <tr key={doc.id}>
                  <td className="gen-thumb-cell">
                    <DocThumb doc={doc} />
                  </td>
                  <td>
                    <strong>{doc.title}</strong>
                    {doc.author ? <div className="hint">{doc.author}</div> : null}
                  </td>
                  <td className="hint">{doc.doc_ref}</td>
                  <td className="hint">{getTemplate(doc.template_id).name}</td>
                  <td className="hint">
                    {doc.page_format}
                    {doc.orientation === "landscape" ? " ↔" : ""}
                  </td>
                  <td>
                    <span className={`gen-status ${doc.status === "ready" ? "ok" : ""}`}>
                      {doc.status === "ready" ? t("Prêt") : t("Brouillon")}
                    </span>
                  </td>
                  <td className="hint">{fmtDate(doc.updated_at)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-small btn-primary" onClick={() => open(doc.id)}>
                      {t("Ouvrir")}
                    </button>{" "}
                    <button type="button" className="btn btn-small btn-outline" onClick={() => duplicate(doc.id)} disabled={busy}>
                      {t("Dupliquer")}
                    </button>{" "}
                    <button type="button" className="btn btn-small btn-danger" onClick={() => remove(doc)} disabled={busy}>
                      {t("Supprimer")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Éditeur : TipTap + autosave débouncé + design + aperçu paginé + export PDF.
// ═════════════════════════════════════════════════════════════════════════════
function GenEditor({ initialDoc, onBack, pendingImport, onPendingImportDone }) {
  const { t } = useLang();
  const { user } = useAuth();
  // Devise du PAYS du compte (XAF au Cameroun, XOF au Sénégal…), affichée sur
  // le champ prix et envoyée au serveur — plus de « XAF » en dur.
  const priceCurrency = countrySymbol(user?.country) || "XAF";
  const [meta, setMeta] = useState(initialDoc.document);
  const [studioLayoutStale, setStudioLayoutStale] = useState(false);
  const [versions, setVersions] = useState(initialDoc.versions || []);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [studioLayoutLoading, setStudioLayoutLoading] = useState(false);
  const [view, setView] = useState("edit"); // edit | design | studio | preview
  // Ajustement automatique de l'aperçu à la largeur disponible (téléphone :
  // la page entière est visible, plus besoin de faire défiler horizontalement).
  // NB : computeFit est déclaré APRÈS `preview` (il lit preview.box.w).
  const previewZoneRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [exportPct, setExportPct] = useState(null);
  const [check, setCheck] = useState(null);
  // La page d'aperçu fait : largeur mm × PX_PER_MM × 0.75. Si elle dépasse la
  // largeur de la zone (téléphone), on réduit tout le rendu (polices comprises
  // — le PDF reste au format exact, seul l'affichage est rétréci).
  const computeFit = useCallback(() => {
    const el = previewZoneRef.current;
    if (!el) return;
    // Largeur réelle de la page (orientation paysage incluse) sinon le
    // format par défaut.
    const pageMmW =
      (preview && preview.box && Number(preview.box.w)) ||
      resolvePageBox(meta.page_format || "A4")[0];
    const pagePx = pageMmW * PX_PER_MM * GEN_PREVIEW_SCALE;
    const avail = el.clientWidth || window.innerWidth;
    const k = avail / pagePx;
    setFitScale(k < 1 ? Math.max(0.3, k - 0.02) : 1);
  }, [meta.page_format, preview]);
  useEffect(() => {
    // Recalcul quand on entre dans l'aperçu, au redimensionnement et à la
    // rotation du téléphone.
    if (view !== "preview") return undefined;
    computeFit();
    window.addEventListener("resize", computeFit);
    return () => window.removeEventListener("resize", computeFit);
  }, [view, computeFit]);
  useEffect(() => {
    // La zone n'existe pas encore au premier paint : on refait le calcul après.
    if (view === "preview") {
      const id = requestAnimationFrame(computeFit);
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [view, preview, computeFit]);
  // Assistant IA (résultat relu puis inséré par l'utilisateur — jamais injecté
  // sans validation), export EPUB, publication produit.
  const [aiBusy, setAiBusy] = useState(null); // action en cours
  const [aiResult, setAiResult] = useState(null); // { action, text, replaceSel }
  const aiResultRef = useRef(null);
  useEffect(() => {
    if (!aiResult?.text) return;
    requestAnimationFrame(() => {
      try { aiResultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch { /* ancien navigateur */ }
    });
  }, [aiResult]);
  const [epubStep, setEpubStep] = useState(null); // label progression EPUB
  const [pub, setPub] = useState(null); // formulaire { price, old_price, description }
  const [pubBusy, setPubBusy] = useState(null); // label d'étape ou null
  const [published, setPublished] = useState(null); // { product_id, updated }
  const [delBusy, setDelBusy] = useState(false); // suppression du produit publié
  const [formatMsg, setFormatMsg] = useState(""); // résultat de « Détecter les titres »
  // Portée du contenu détectée → design suggéré (onglet Design).
  const [scopeInfo, setScopeInfo] = useState(null);
  // Extrait du texte du document mémorisé à l'analyse : sert au moteur de
  // recommandation de modèles (§16/§65) sans relire l'éditeur à chaque rendu.
  const [scopeText, setScopeText] = useState("");
  const hasAi = typeof meta.ai_available === "undefined" ? true : meta.ai_available;

  const contentRef = useRef(initialDoc.content || EMPTY_DOC);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const saveTimer = useRef(null);
  const studioLayoutLoaded = useRef(Object.prototype.hasOwnProperty.call(initialDoc.document, "page_layout"));
  const editorRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      // Détection intelligente des titres : conversion en direct (Entrée en
      // fin de ligne-titre) + collage automatique d'un texte structuré.
      HeadingAutoDetect,
      ResizableImage.configure({ inline: false, allowBase64: true }),
      TableKit.configure({ table: { resizable: true } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyleKit,
      // Mise en forme « façon Word » : surlignage multicolore, exposant,
      // indice (couleur/taille/police viennent de TextStyleKit).
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
    ],
    content: contentRef.current,
    onUpdate: ({ editor: ed }) => {
      contentRef.current = ed.getJSON();
      scheduleSave();
      // L'aperçu paginé (et donc le PDF exporté) est périmé dès que le texte
      // change : invalidation automatique, ~0,8 s après la dernière frappe.
      markContentDirty();
    },
  });
  editorRef.current = editor;

  // ─── Autosave : PATCH complet débouncé (1,5 s après la dernière frappe) ────
  // Les sauvegardes sont sérialisées : une nouvelle modification arrivée pendant
  // une requête est conservée pour la requête suivante. Une réponse serveur ne
  // remplace jamais une révision plus récente du state local.
  const saveRevision = useRef(0);
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const saveNow = useCallback(async () => {
    if (saveInFlight.current) {
      saveQueued.current = true;
      return;
    }
    const m = metaRef.current;
    if (!m?.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const version = saveRevision.current;
    saveInFlight.current = true;
    setSaveState("saving");
    try {
      const payload = {
        title: m.title,
        subtitle: m.subtitle,
        author: m.author,
        status: m.status,
        template_id: m.template_id,
        style_overrides: m.style_overrides || {},
        page_format: m.page_format,
        page_width: m.page_width,
        page_height: m.page_height,
        orientation: m.orientation,
        margins: m.margins || {},
        cover: m.cover || {},
        back_cover: m.back_cover || {},
        protection: m.protection || {},
        content: contentRef.current,
        // Le page_layout est volumineux et n'est jamais renvoyé par
        // l'autosave du contenu. Seul DocStudio l'envoie, via sa route dédiée.
      };
      const d = await api.genSaveDocument(m.id, payload);
      // Une réponse peut être reçue après une modification plus récente : on ne
      // réécrit alors ni les métadonnées ni le statut de sauvegarde.
      if (version === saveRevision.current && !saveQueued.current) {
        const next = {
          ...metaRef.current,
          ...d.document,
          // Les réponses d'autosave sont allégées des data-URI de couverture ;
          // on conserve donc les médias déjà présents dans l'état local.
          cover: { ...(metaRef.current.cover || {}), ...(d.document.cover || {}) },
          back_cover: { ...(metaRef.current.back_cover || {}), ...(d.document.back_cover || {}) },
          // `page_layout` est écrit par le Studio ; cette route ne le renvoie
          // pas dans `document` et ne doit jamais l'effacer.
          page_layout: metaRef.current.page_layout,
        };
        metaRef.current = next;
        setMeta(next);
        setSaveState("saved");
      }
    } catch (e) {
      if (version === saveRevision.current && !saveQueued.current) {
        setSaveState("error");
        setError(e?.message || "Sauvegarde impossible");
      }
    } finally {
      saveInFlight.current = false;
      if (saveQueued.current) {
        saveQueued.current = false;
        setTimeout(() => saveNow(), 0);
      }
    }
  }, []);

  const scheduleSave = useCallback(() => {
    saveRevision.current += 1;
    if (saveInFlight.current) saveQueued.current = true;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNow(), 1500);
  }, [saveNow]);

  // ─── Aperçu : invalidation AUTOMATIQUE dès que le texte change ─────────────
  // Avant, seul le bouton « 🔍 Vérifier » (qui appelait buildPreview) rafraîchissait
  // l'aperçu : les modifications semblaient ne s'appliquer qu'après ce clic.
  // Désormais toute frappe marque l'aperçu comme périmé (debounce 0,8 s pour ne
  // pas relancer la mesure à chaque caractère) ; l'aperçu est reconstruit dès
  // qu'il est affiché (effet plus bas), et le rapport qualité suit.
  const previewStaleTimer = useRef(null);
  const markContentDirty = useCallback(() => {
    // Une frappe ne reconstruit ni ne renvoie le gros page_layout : cette
    // reconstruction appartient au Studio et sera faite à son ouverture.
    setStudioLayoutStale(true);
    if (previewStaleTimer.current) clearTimeout(previewStaleTimer.current);
    previewStaleTimer.current = setTimeout(() => {
      setPreview(null);
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Studio → Aperçu ────────────────────────────────────────────────────────
  // Un layout Studio n'est utilisé que s'il correspond encore exactement au
  // texte et au design actuels. Le Studio le reconstruit lui-même si nécessaire.

  // Le rapport « 🔍 DOCUMENT CHECK » reste cohérent : dès qu'un nouvel aperçu
  // paginé est construit alors que le rapport est ouvert, il est recalculé.
  useEffect(() => {
    if (!preview) return;
    setCheck((cur) => (cur ? checkDocument({ paginated: preview, docMeta: metaRef.current }) : cur));
  }, [preview]);

  const patchMeta = (patch, immediate = false) => {
    const next = { ...metaRef.current, ...patch };
    metaRef.current = next;
    setMeta(next);
    if (immediate) {
      saveRevision.current += 1;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveNow();
    } else scheduleSave();
  };

  // ─── Bibliothèque de modèles : filtres, recherche, favoris, récents ─────────
  // Tout est LOCAL (localStorage + analyse de chaînes) : aucun impact serveur,
  // aucun changement au moteur — la grille existante est simplement filtrée.
  const tplFacets = useMemo(() => templateFacets(), []);
  const [tplCat, setTplCat] = useState(""); // "" = tous ; "__fav" = favoris
  // Aperçu d'un modèle SANS l'appliquer : { id, paginated } du modèle candidat.
  const [tplPreview, setTplPreview] = useState(null);
  const [tplPreviewBusy, setTplPreviewBusy] = useState(false);

  const [tplStyle, setTplStyle] = useState("");
  const [tplSearch, setTplSearch] = useState("");
  const [tplFavs, setTplFavs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("gen_fav_templates") || "[]");
    } catch {
      return [];
    }
  });
  const [tplRecents, setTplRecents] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("gen_recent_templates") || "[]");
    } catch {
      return [];
    }
  });
  const [variantSeed, setVariantSeed] = useState(0);

  const toggleTplFav = (id) =>
    setTplFavs((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try {
        localStorage.setItem("gen_fav_templates", JSON.stringify(next));
      } catch {}
      return next;
    });
  const rememberTpl = (id) =>
    setTplRecents((cur) => {
      const next = [id, ...cur.filter((x) => x !== id)].slice(0, 6);
      try {
        localStorage.setItem("gen_recent_templates", JSON.stringify(next));
      } catch {}
      return next;
    });
  // « Utiliser ce modèle » : applique le template ET le mémorise en récent.
  // ─── Aperçu RÉEL d'un modèle, SANS l'appliquer (cahier des charges §17/18/62)
  // Le contenu du document est repaginé avec le modèle candidat (mêmes règles de
  // mesure et de flux que l'aperçu normal) : l'utilisateur voit son propre texte
  // dans le modèle avant de choisir. Rien n'est écrit : le document garde son
  // modèle tant que « Utiliser ce modèle » n'est pas cliqué.
  const previewTemplate = async (id) => {
    const ed = editorRef.current;
    if (!ed || tplPreviewBusy) return;
    setTplPreviewBusy(true);
    setError("");
    try {
      const html = ed.getHTML();
      const paginated = await paginateDocument({
        html,
        doc: { ...metaRef.current, template_id: id },
        toc: metaRef.current.protection?.toc !== false,
      });
      setTplPreview({ id, paginated });
    } catch (e) {
      setError(e?.message || t("Aperçu impossible"));
    } finally {
      setTplPreviewBusy(false);
    }
  };

  const applyTemplate = (id) => {
    patchMeta({ template_id: id });
    rememberTpl(id);
  };
  const filteredTemplates = GEN_TEMPLATES.filter((tpl) => {
    const m = templateMeta(tpl);
    if (tplCat === "__fav" && !tplFavs.includes(tpl.id)) return false;
    if (tplCat && tplCat !== "__fav" && m.category !== tplCat) return false;
    if (tplStyle && m.style !== tplStyle) return false;
    const q = tplSearch.trim().toLowerCase();
    if (q && !`${tpl.name} ${m.category} ${m.style} ${m.audience} ${m.sector}`.toLowerCase().includes(q)) return false;
    return true;
  });
  // « Générer une variante » : variation harmonieuse (couleurs + polices +
  // couverture) du modèle actif, via style_overrides — contenu intact.
  const generateVariant = () => {
    const tpl = getTemplate(metaRef.current.template_id);
    const v = templateVariant(tpl, variantSeed);
    setVariantSeed((s) => s + 1);
    patchMeta(
      {
        style_overrides: {
          ...(metaRef.current.style_overrides || {}),
          colors: v.colors,
          bodyFont: v.bodyFont,
          headingFont: v.headingFont,
        },
        cover: { ...(metaRef.current.cover || {}), bg: v.cover.bg, text: v.cover.text },
      },
      true
    );
  };

  // ─── Commandes de design en langage naturel (§41-56) ───────────────────────
  // Le moteur (`designCommands.js`) ne renvoie qu'un patch de PRÉSENTATION :
  // modèle, couleurs, polices, mise en page, couverture. Le texte, la structure
  // et les images ne sont JAMAIS touchés (Content / Presentation séparés).
  const [cmdText, setCmdText] = useState("");
  const [cmdReport, setCmdReport] = useState(null);

  const runDesignCommand = () => {
    const phrase = cmdText.trim();
    if (!phrase) return;
    const res = parseDesignCommand(phrase, {
      currentTemplateId: metaRef.current.template_id,
      seed: variantSeed,
    });
    const cur = metaRef.current;
    const patch = {};
    if (res.templateId && res.templateId !== cur.template_id) {
      patch.template_id = res.templateId;
      rememberTpl(res.templateId);
    }
    const merged = { ...(cur.style_overrides || {}), ...(res.overrides || {}) };
    if (Object.keys(merged).length) patch.style_overrides = merged;
    if (res.cover) patch.cover = { ...(cur.cover || {}), ...res.cover };
    if (Object.keys(patch).length) patchMeta(patch, true);
    if (res.coverIdeas?.length) setCoverIdeas(res.coverIdeas);
    setVariantSeed((s) => s + 1);
    setCmdReport(res);
  };

  // Variante proposée par la commande (« fais-moi 3 variantes ») : applique
  // couleurs + polices + couverture, contenu strictement identique.
  const applyCmdVariant = (v) => {
    const cur = metaRef.current;
    patchMeta(
      {
        style_overrides: { ...(cur.style_overrides || {}), ...(v.overrides || {}) },
        cover: { ...(cur.cover || {}), bg: v.cover.bg, text: v.cover.text },
      },
      true
    );
  };

  // Traduction des codes compris / des notes du moteur (jamais de clé brute).
  const cmdCodeLabel = (c) => {
    switch (c.code) {
      case "template": return t("Modèle appliqué : {v}", { v: c.value });
      case "accent": return t("Couleur d'accent : {v}", { v: c.value });
      case "theme": return c.value === "dark" ? t("Thème sombre") : t("Thème clair");
      case "font": return t("Police : {v}", { v: c.value });
      case "align":
        return c.value === "center"
          ? t("Texte centré")
          : c.value === "left"
            ? t("Texte aligné à gauche")
            : t("Texte justifié");
      case "lineHeight": return t("Interligne : {v}", { v: c.value });
      case "paraSpace": return t("Espacement des paragraphes augmenté");
      case "coverIdeas": return t("{n} propositions de couverture", { n: c.value });
      case "cover": return t("Couleur de couverture appliquée");
      case "variants": return t("{n} variantes de design proposées", { n: c.value });
      case "contentLock": return t("Contenu conservé : seul le design change");
      default: return "";
    }
  };
  const cmdNote = (n) => {
    switch (n.code) {
      case "lineHeightRange": return t("Interligne : précisez une valeur entre 1,0 et 2,5.");
      case "format": return t("Le format se règle dans « Format et mise en page » (A4, A5, 6×9…).");
      case "margins": return t("Les marges se règlent dans « Format et mise en page ».");
      case "coverStyle": return t("Le style de couverture vient du modèle choisi — essayez « Générer une variante ».");
      case "watermark": return t("Le filigrane se règle dans la section Protection du document.");
      case "qr": return t("Le QR code de vérification se règle dans la section Protection du document (ou avec le marqueur [QR]).");
      case "copyright": return t("Le copyright se règle dans la section Protection du document.");
      case "password": return t("La protection par code se fait à la vente (code de confirmation de l'acheteur), pas dans le PDF.");
      case "quote": return t("L'alignement global n'a pas été modifié : les citations sont déjà mises en valeur par le modèle.");
      default: return "";
    }
  };
  // Exemples cliquables : le libellé est traduit, la phrase INSÉRÉE reste en
  // français — c'est la langue comprise par le moteur de commandes.
  const CMD_EXAMPLES = [
    { label: t("Rends le design plus moderne et professionnel."), text: "Rends le design plus moderne et professionnel." },
    { label: t("Ajoute des couleurs bleu et blanc."), text: "Ajoute des couleurs bleu et blanc." },
    { label: t("Utilise un style adapté à la finance."), text: "Utilise un style adapté à la finance." },
    { label: t("Fais-moi 3 variantes de design sans changer le contenu."), text: "Fais-moi 3 variantes de design sans changer le contenu." },
    { label: t("Crée trois couvertures différentes."), text: "Crée trois couvertures différentes." },
  ];

  // ─── Analyse du document importé (DOCX / TXT / MD) — rapport local ──────────
  // Comptage TipTap après import : chapitres (h1), sections (h2), images,
  // tableaux, mots et pages estimées (~300 mots/page en A4).
  const [importReport, setImportReport] = useState(null);
  const analyzeImportedDoc = () => {
    const ed = editorRef.current;
    if (!ed) return null;
    let h1 = 0;
    let h2 = 0;
    let images = 0;
    let tables = 0;
    ed.state.doc.descendants((node) => {
      if (node.type.name === "heading") {
        if (node.attrs.level === 1) h1 += 1;
        else if (node.attrs.level === 2) h2 += 1;
      } else if (node.type.name === "image") images += 1;
      else if (node.type.name === "table") tables += 1;
      return true;
    });
    const words = ed.getText().split(/\s+/).filter(Boolean).length;
    return { h1, h2, images, tables, words, pages: Math.max(1, Math.round(words / 300)) };
  };

  // Assistant guidé : import automatique du fichier/texte déposé dans la
  // bibliothèque (transmis via la prop `pendingImport`). L'éditeur TipTap est
  // créé pendant le montage — on attend sa disponibilité avant d'importer.
  useEffect(() => {
    if (!pendingImport) return undefined;
    let tries = 0;
    let timer = null;
    const run = async () => {
      const ed = editorRef.current;
      if (!ed) {
        if (tries++ < 20) {
          timer = setTimeout(run, 150);
          return;
        }
        onPendingImportDone?.();
        return;
      }
      try {
        if (pendingImport.file) {
          const f = pendingImport.file;
          applyHtml(
            /\.docx$/i.test(f.name) ? await readDocxHtml(f) : detectStructureHtml(await readTextFile(f))
          );
        } else if (pendingImport.text) {
          applyHtml(detectStructureHtml(pendingImport.text));
        }
        setImportReport({
          fileName: pendingImport.file?.name || "",
          ...(analyzeImportedDoc() || {}),
        });
      } catch {
        setError(t("Import impossible (fichier illisible)."));
      }
      onPendingImportDone?.();
    };
    run();
    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImport]);

  // ─── AUTO COVER : trois palettes de couverture assorties au modèle actif ────
  const [coverIdeas, setCoverIdeas] = useState(null); // [{ cover: { bg, text } }]
  const proposeCovers = () => {
    const tpl = getTemplate(metaRef.current.template_id);
    setCoverIdeas([1, 3, 5].map((s) => templateVariant(tpl, (variantSeed + s) % 6)));
  };

  // ─── Import : TXT/MD (détection de structure) et DOCX (mammoth) ────────────
  const applyHtml = (html) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.commands.setContent(html);
    contentRef.current = ed.getJSON();
    saveRevision.current += 1;
    saveNow();
  };
  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      if (/\.docx$/i.test(file.name)) {
        applyHtml(await readDocxHtml(file));
      } else {
        applyHtml(detectStructureHtml(await readTextFile(file)));
      }
      // Rapport « Document Analyzer » : structure détectée après import.
      setImportReport({
        fileName: file.name,
        ...(analyzeImportedDoc() || {}),
      });
    } catch {
      setError("Fichier non compatible (TXT, MD ou DOCX attendu).");
    }
  };
  const onInsertImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      editorRef.current?.chain().focus().setImage({ src: dataUrl }).run();
      contentRef.current = editorRef.current.getJSON();
      scheduleSave();
    } catch {
      setError("Image non lisible (JPG, PNG ou WebP attendu).");
    }
  };

  // ─── Aperçu paginé (moteur : mesure réelle + flux en pages) ────────────────
  const buildPreview = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return null;
    setPreviewBusy(true);
    setError("");
    try {
      const html = ed.getHTML();
      const result = await paginateDocument({
        html,
        doc: metaRef.current,
        toc: metaRef.current.protection?.toc !== false,
      });
      setPreview(result);
      return result;
    } catch (e) {
      setError(e?.message || "Aperçu impossible");
      return null;
    } finally {
      setPreviewBusy(false);
    }
  }, []);

  // ─── Portée du contenu → design suggéré ────────────────────────────────────
  // Analyse locale (aucun appel réseau) du texte de l'éditeur : le Générateur
  // propose les modèles adaptés au SUJET (finance, roman, jeunesse, formation…)
  // et laisse l'utilisateur décider — rien n'est appliqué automatiquement.
  const analyzeScope = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const text = typeof ed.getText === "function" ? ed.getText() : "";
    setScopeText(String(text || "").slice(0, 6000));
    setScopeInfo(detectScope(text, { templateIds: GEN_TEMPLATES.map((tpl) => tpl.id) }));
  }, []);

  // ─── SMART TEMPLATE RECOMMENDER (§16/§65) ──────────────────────────────────
  // Classe les modèles d'après le TITRE et le TEXTE du document, avec un petit
  // bonus aux favoris ⭐ et aux modèles récents 🕘 (préférences personnelles).
  // Moteur pur et local : aucune requête, aucun réglage modifié tout seul — la
  // rangée propose, l'utilisateur décide.
  const recoRow = useMemo(
    () =>
      recommendTemplates({
        title: meta.title || "",
        text: scopeText,
        recents: tplRecents,
        favs: tplFavs,
        limit: 4,
      }),
    [meta.title, scopeText, tplRecents, tplFavs]
  );

  // ─── Aperçu paginé : invalidation + (re)construction ────────────────────────
  // L'aperçu est périmé dès qu'un paramètre de mise en page change (modèle de
  // design, styles avancés, format, orientation, marges, table des matières).
  // Sans invalidation, l'aperçu — ET LE PDF EXPORTÉ, calculé à partir de
  // l'aperçu — gardaient l'ancien modèle : changer de design semblait sans
  // aucun effet. On invalide partout, puis on reconstruit à l'ouverture.
  const layoutKey = JSON.stringify([
    meta.template_id,
    meta.style_overrides || {},
    meta.page_format,
    meta.page_width,
    meta.page_height,
    meta.orientation,
    meta.margins || {},
    meta.protection?.toc !== false,
  ]);
  const layoutKeyRef = useRef(layoutKey);
  useEffect(() => {
    if (layoutKeyRef.current === layoutKey) return;
    layoutKeyRef.current = layoutKey;
    setPreview(null);
    // Le changement de design invalide le layout Studio sans le reconstruire
    // ni le renvoyer ici. DocStudio le reconstruira à son ouverture.
    if (readStudio(metaRef.current?.page_layout)) setStudioLayoutStale(true);
  }, [layoutKey]);

  // ─── Synchronisation Studio → Aperçu ────────────────────────────────────────
  // Dès qu'une mise en page du Studio est enregistrée, l'aperçu (et donc le PDF
  // exporté) montre CES pages : ce que l'on voit est exactement ce qui sort.
  const currentStudioContentKey = studioContentKey(editor?.getHTML() || "");
  const studioLayoutIsFresh = useMemo(() => {
    if (studioLayoutStale) return false;
    const layout = meta.page_layout;
    if (!readStudio(layout)) return false;
    return layout.design_key === studioDesignKey(meta) && layout.content_key === currentStudioContentKey;
  }, [meta, studioLayoutStale, currentStudioContentKey]);
  const studioPages = useMemo(
    () => (studioLayoutIsFresh ? ensureStudioFooters(readStudio(meta.page_layout), studioBox(meta), resolveActiveTemplate(meta), meta) : []),
    [meta, studioLayoutIsFresh],
  );
  const studioTpl = useMemo(
    () => (studioPages && studioPages.length ? { box: studioBox(meta), template: resolveActiveTemplate(meta) } : null),
    [studioPages, meta]
  );
  useEffect(() => {
    if (view === "preview" && !preview && !previewBusy) buildPreview();
  }, [view, preview, previewBusy, buildPreview]);

  // Suggestion de design : (re)analysée à chaque ouverture de l'onglet Design.
  useEffect(() => {
    if (view === "design") analyzeScope();
  }, [view, analyzeScope]);

  // ─── Ouverture du Studio : layout chargé à la demande ─────────────────────
  const openStudio = useCallback(async () => {
    if (studioLayoutLoaded.current || metaRef.current?.page_layout) {
      setView("studio");
      return;
    }
    setStudioLayoutLoading(true);
    setError("");
    try {
      const d = await api.genDocumentLayout(metaRef.current.id);
      const next = { ...metaRef.current, page_layout: d.page_layout || null };
      studioLayoutLoaded.current = true;
      metaRef.current = next;
      setMeta(next);
      setStudioLayoutStale(false);
      setView("studio");
    } catch (e) {
      setError(e?.message || t("Studio indisponible"));
    } finally {
      setStudioLayoutLoading(false);
    }
  }, [t]);

  // Studio masqué : la mise en page enregistrée est chargée EN SILENCE (une
  // requête par document) pour que l'aperçu et l'export PDF continuent de
  // suivre les pages éditées. Aucun écran Studio n'est ouvert.
  useEffect(() => {
    if (SHOW_STUDIO_TAB) return;
    if (studioLayoutLoaded.current) return;
    if (!meta?.id) return;
    let alive = true;
    api
      .genDocumentLayout(meta.id)
      .then((d) => {
        if (!alive) return;
        studioLayoutLoaded.current = true;
        const next = { ...metaRef.current, page_layout: d.page_layout || null };
        metaRef.current = next;
        setMeta((cur) => ({ ...cur, page_layout: d.page_layout || null }));
      })
      .catch(() => {
        /* silencieux : le générateur classique reste utilisable */
      });
    return () => {
      alive = false;
    };
  }, [meta?.id]);

  // ─── Export PDF réel (jsPDF, mêmes positions que l'aperçu) ─────────────────
  const doExport = async () => {
    setError("");
    setExportPct(0);
    try {
      // ─── Synchronisation Studio → export PDF ─────────────────────────────
      // Dès qu'une mise en page du Studio existe, c'est ELLE la référence :
      // le PDF exporté correspond exactement aux pages éditées (décors,
      // positions, textes), sans repasser par la pagination automatique.
      const m = metaRef.current || {};
      const studioPages = studioLayoutIsFresh
        ? ensureStudioFooters(readStudio(m.page_layout), studioBox(m), resolveActiveTemplate(m), m)
        : [];
      if (studioPages && studioPages.length) {
        await exportStudioPdf({
          pages: studioPages,
          docMeta: metaRef.current,
          onProgress: (p) => setExportPct(p),
          filename: `${metaRef.current?.doc_ref || metaRef.current?.title || "document"}.pdf`,
        });
        return;
      }
      const paginated = preview || (await buildPreview());
      if (!paginated) throw new Error("Aperçu indisponible");
      await exportDocumentPdf({
        docMeta: metaRef.current,
        paginated,
        onProgress: (p) => setExportPct(p),
      });
    } catch (e) {
      setError(e?.message || "Export PDF impossible");
    } finally {
      setExportPct(null);
    }
  };

  const saveVersion = async () => {
    const label = window.prompt(t("Nom de la version"), `Version du ${new Date().toLocaleDateString("fr-FR")}`);
    if (label === null) return;
    try {
      await saveNow();
      const d = await api.genSaveVersion(meta.id, { label });
      setVersions(d.versions || []);
    } catch (e) {
      setError(e?.message || "Version impossible");
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // FONCTIONS AVANCÉES — assistant IA, contrôle qualité, EPUB, publication,
  // versions restaurables. L'IA ne modifie JAMAIS le document directement :
  // le résultat est proposé, relu puis inséré par l'utilisateur.
  // ═════════════════════════════════════════════════════════════════════════

  // ─── Assistant IA (Gemini — route /api/generator/ai) ───────────────────────
  // Contrat serveur : { action, text (sélection), title, subtitle, author,
  // instruction } → { text } ou { design } pour l'action "design".
  const selectionText = () => {
    const ed = editorRef.current;
    if (!ed) return "";
    const sel = ed.state.selection;
    if (!sel || sel.empty) return "";
    try {
      return ed.state.doc.textBetween(sel.from, sel.to, "\n\n");
    } catch {
      return "";
    }
  };

  // La description catalogue concerne le document entier, pas seulement la
  // sélection courante. On envoie le texte TipTap complet ; le serveur applique
  // ensuite sa limite de 4 000 caractères pour ne pas gonfler l'appel IA.
  const documentText = () => {
    const ed = editorRef.current;
    if (!ed) return "";
    try {
      return ed.getText({ blockSeparator: "\n\n" });
    } catch {
      return "";
    }
  };

  const useDescriptionForPublication = () => {
    const description = String(aiResult?.text || "").trim().slice(0, 4000);
    if (!description) return;
    setError("");
    setAiResult(null);
    setPub({
      price: "",
      old_price: "",
      description,
      title: metaRef.current.title || "",
      category: "Digital",
      commission: "",
    });
  };

  const runAi = async (action, { instruction, tone, lang } = {}) => {
    setError("");
    setAiBusy(action);
    setAiResult(null);
    try {
      const m = metaRef.current;
      const d = await api.genAi({
        action,
        text: action === "description" ? documentText() : selectionText(),
        title: m.title,
        subtitle: m.subtitle,
        author: m.author,
        instruction: instruction || "",
        tone: tone || "",
        lang: lang || "",
      });
      // Action "design" : le serveur renvoie un objet { design } déjà validé.
      if (action === "design") {
        const design = d.design || null;
        if (design?.template_id) {
          patchMeta({
            template_id: design.template_id,
            cover: {
              ...(metaRef.current.cover || {}),
              ...(design.cover?.bg ? { bg: design.cover.bg } : {}),
              ...(design.cover?.text ? { text: design.cover.text } : {}),
            },
          }, true);
          setAiResult({ action, text: design.reason || t("Design appliqué.") });
        } else {
          throw new Error(t("L'IA n'a pas pu proposer de design valide. Réessayez."));
        }
        return;
      }
      const text = String(d.text || "").trim();
      if (!text) throw new Error(t("L'assistant IA n'a renvoyé aucun résultat. Réessayez dans un instant."));
      setAiResult({ action, text });
    } catch (e) {
      const msg = e?.message || t("Assistant IA indisponible");
      setError(/503|GEMINI|clé|activé|configuré/i.test(msg)
        ? t("L'assistant IA n'est pas activé sur ce serveur (clé Gemini manquante). Le reste du Générateur fonctionne normalement.")
        : msg);
    } finally {
      setAiBusy(null);
    }
  };

  // Insère le résultat IA : remplace la sélection (actions sur passage) ou
  // s'ajoute en fin de document (plan, quatrième, bio). L'action "structure"
  // repasse par le détecteur pour produire un document structuré complet.
  const applyAiResult = (replaceSelection) => {
    const ed = editorRef.current;
    const res = aiResult;
    if (!ed || !res?.text) return;
    if ((res.action === "structure" || res.action === "book_plan") && !replaceSelection) {
      // Plan de livre = Markdown avec titres « # » : repasse par le détecteur
      // de structure pour produire un document réellement structuré (h1/h2).
      applyHtml(detectStructureHtml(res.text));
    } else if (replaceSelection && !ed.state.selection.empty) {
      ed.chain().focus().insertContentAt(ed.state.selection.from, res.text).run();
      contentRef.current = ed.getJSON();
      saveNow();
    } else {
      ed.chain().focus("end").insertContent(`<p>${res.text.replace(/\n/g, "</p><p>")}</p>`).run();
      contentRef.current = ed.getJSON();
      saveNow();
    }
    setAiResult(null);
  };

  // ─── Détection intelligente des titres (passe complète) ────────────────────
  // Convertit les paragraphes qui sont des titres et propose de numéroter les
  // chapitres sans numéro (série continue : CHAPITRE 1, 2, 3…). Le texte n'est
  // jamais réécrit ailleurs ; tout est annulable (Ctrl+Z).
  const detectTitles = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const number = window.confirm(
      t(
        "Numéroter automatiquement les chapitres qui n'ont pas de numéro (CHAPITRE 1, 2, 3…) ? Les titres déjà numérotés ne sont pas modifiés."
      )
    );
    const res = formatHeadings(ed, { number });
    setFormatMsg(
      res.headings === 0
        ? t("Aucun titre détecté : ajoutez « Chapitre 1 », « INTRODUCTION », « 1.2 … » ou une ligne en MAJUSCULES.")
        : t("{n} titre(s) mis en forme{m}", {
            n: res.headings,
            m: res.numbered ? ` — ${res.numbered} chapitre(s) numéroté(s)` : "",
          })
    );
    if (res.headings) {
      contentRef.current = ed.getJSON();
      saveNow();
    }
  };

  // ─── Contrôle qualité (🔍 DOCUMENT CHECK — analyse de la sortie paginée) ───
  const runCheck = async () => {
    setError("");
    const paginated = await buildPreview();
    if (!paginated) return;
    setCheck(checkDocument({ paginated, docMeta: metaRef.current }));
    setView("preview");
  };

  const applyFix = async (code) => {
    const prot = { ...(metaRef.current.protection || {}) };
    const patch = { protection: prot };
    if (code === "toc") prot.toc = true;
    else if (code === "copyright") prot.copyright = true;
    else if (code === "qr") prot.qrEnabled = true;
    else if (code === "cover") patch.cover = { ...(metaRef.current.cover || {}), enabled: true };
    else if (code === "cover_title") patch.cover = { ...(patch.cover || metaRef.current.cover || {}), title: metaRef.current.title };
    else if (code === "compact_margins") {
      const m = metaRef.current.margins || {};
      patch.margins = {
        top: Math.max(12, (m.top ?? 20) - 6),
        bottom: Math.max(12, (m.bottom ?? m.top ?? 20) - 6),
        left: Math.max(12, (m.left ?? 18) - 4),
        right: Math.max(12, (m.right ?? m.left ?? 18) - 4),
      };
    } else if (code === "justify") {
      editorRef.current?.chain().focus().setTextAlign("justify").run();
      contentRef.current = editorRef.current.getJSON();
    }
    patchMeta(patch, true);
    setCheck(null);
    const paginated = await buildPreview();
    if (paginated) setCheck(checkDocument({ paginated, docMeta: metaRef.current }));
  };

  // ─── Export EPUB 3 (reflowable, module indépendant du moteur PDF) ──────────
  const doExportEpub = async () => {
    setError("");
    setEpubStep(t("Préparation…"));
    try {
      await exportEpub({
        doc: contentRef.current,
        docMeta: metaRef.current,
        onProgress: (_p, label) => setEpubStep(label || `${_p} %`),
      });
    } catch (e) {
      setError(e?.message || t("Export EPUB impossible"));
    } finally {
      setEpubStep(null);
    }
  };

  // ─── Publication : PDF → produit digital MboppiShop (chaîne réelle) ────────────
  // 1) export jsPDF en mémoire → 2) hash SHA-256 → 3) URL signée → PUT Supabase
  // direct → 4) le serveur vérifie l'objet puis crée/met à jour le produit.
  async function sha256Buffer(buf) {
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const openPublish = async () => {
    setError("");
    const productId = Number(metaRef.current.published_product_id || 0);
    const current = metaRef.current;
    setPub({
      price: "",
      old_price: "",
      description: "",
      title: current.title || "",
      category: "Digital",
      commission: "",
    });
    if (!productId) return;
    try {
      // La publication existante doit être mise à jour, jamais remplacée par
      // une nouvelle fiche vide. On relit les valeurs commerciales actuelles.
      const d = await api.getProduct(productId, { cache: "no-store" });
      const p = d?.product || {};
      const price = Number(p.price || 0);
      setPub({
        price: price ? String(price) : "",
        // Prix barré déjà enregistré : rechargé pour que la mise à jour du
        // produit n'efface pas la promotion affichée sur la fiche.
        old_price:
          p.old_price !== null && p.old_price !== undefined && Number(p.old_price) > 0
            ? String(p.old_price)
            : "",
        description: p.description || "",
        title: p.name || current.title || "",
        category: p.category || "Digital",
        commission:
          price && p.commission_percent != null
            ? String(Math.round(price * Number(p.commission_percent)) / 100)
            : "",
      });
    } catch (e) {
      setError(e?.message || t("Impossible de charger la publication actuelle."));
    }
  };

  const doPublish = async () => {
    setError("");
    const price = Number(String(pub.price).replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      setError(t("Prix invalide : indiquez un montant positif."));
      return;
    }
    // Prix barré (optionnel) : STRICTEMENT supérieur au prix de vente, sinon le
    // faux rabais serait refusé par le serveur — on prévient avant l'export.
    const oldRaw = String(pub.old_price ?? "").trim();
    let oldPrice = null;
    if (oldRaw !== "") {
      const n = Number(oldRaw.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0 || n <= price) {
        setError(t("Le prix barré doit être supérieur au prix de vente."));
        return;
      }
      oldPrice = Math.round(n * 100) / 100;
    }
    setPubBusy(t("Génération du PDF…"));
    try {
      const paginated = preview || (await buildPreview());
      if (!paginated) throw new Error(t("Aperçu indisponible"));
      const pdf = await exportDocumentPdf({
        docMeta: metaRef.current,
        paginated,
        download: false,
        onProgress: (p) => setPubBusy(p < 100 ? `${t("Génération du PDF…")} ${p} %` : t("Préparation du téléversement…")),
      });
      const buf = pdf.output("arraybuffer");
      if (!buf || buf.byteLength <= 0) throw new Error(t("PDF vide : réessayez."));
      const hash = await sha256Buffer(buf);
      setPubBusy(t("Téléversement du fichier…"));
      const safe = (metaRef.current.title || "document").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
      const signed = await api.genUploadUrl(meta.id, { name: `${safe}.pdf`, size: buf.byteLength, hash });
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signed.uploadUrl);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("Content-Type", "application/pdf");
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error(t("Téléversement interrompu : vérifiez votre connexion.")));
        xhr.send(buf);
      });
      setPubBusy(t("Création du produit…"));
      let coverData = "";
      try {
        coverData = (await renderCoverImage(metaRef.current, { width: 1000, maxBytes: 350 * 1024 })) || "";
      } catch {
        coverData = "";
      }
      const d = await api.genPublish(meta.id, {
        key: signed.path,
        price,
        // Prix barré (null = aucun) : affiché barré sur la carte et la fiche.
        old_price: oldPrice,
        currency: priceCurrency,
        title: pub.title || metaRef.current.title,
        description: pub.description || "",
        category: pub.category || "Digital",
        // Commission saisie en MONTANT (comme dans l'espace créateur) — le
        // serveur la convertit en pourcentage. (Avant : la valeur saisie était
        // traitée comme un % et bridée à 100 → commission = prix de vente.)
        commission_amount: Math.max(0, Number(String(pub.commission || "").replace(",", ".")) || 0),
        cover: coverData,
      });
      setMeta(d.document);
      metaRef.current = d.document;
      setPublished({ product_id: d.product_id, updated: d.updated });
      setPub(null);
    } catch (e) {
      setError(e?.message || t("Publication impossible"));
    } finally {
      setPubBusy(null);
    }
  };

  // ─── Suppression TOTALE du produit publié (base + fichiers) ─────────────────
  // Route dédiée du Générateur : ouverte à l'admin ET au créateur propriétaire
  // (la portée owner_id est vérifiée côté serveur). Le produit, ses photos, le
  // PDF du bucket privé, ses ventes/téléchargements/avis liés sont supprimés et
  // le document redevient publiable.
  const doDeleteProduct = async () => {
    const pid = Number(meta.published_product_id);
    if (!pid || delBusy) return;
    if (
      !window.confirm(
        t(
          "Supprimer DÉFINITIVEMENT ce produit publié et son fichier ? Le produit disparaît du catalogue et toutes ses données liées (ventes, téléchargements, avis) sont supprimées. Action irréversible."
        )
      )
    ) {
      return;
    }
    setDelBusy(true);
    setError("");
    try {
      await api.genDeleteProduct(meta.id);
      setPublished(null);
      // Le serveur a déjà posé published_product_id = NULL ; on synchronise
      // l'état local sans recharger la bibliothèque.
      setMeta((cur) => ({ ...cur, published_product_id: null }));
    } catch (e) {
      setError(e?.message || t("Suppression impossible"));
    } finally {
      setDelBusy(false);
    }
  };

  // ─── Restauration d'un instantané (versions enregistrées) ──────────────────
  const restoreVersion = async (v) => {
    if (!window.confirm(t("Restaurer cette version ? Le contenu actuel sera remplacé (les versions restent disponibles)."))) return;
    setError("");
    try {
      await saveNow();
      const d = await api.genRestoreVersion(meta.id, v.id);
      setMeta(d.document);
      metaRef.current = d.document;
      contentRef.current = d.content || EMPTY_DOC;
      editorRef.current?.commands.setContent(contentRef.current, false);
      setPreview(null);
      setCheck(null);
      setView("edit");
    } catch (e) {
      setError(e?.message || t("Restauration impossible"));
    }
  };

  const setDocStatus = (status) => patchMeta({ status }, true);

  // ─── Styles avancés : surcharges typographiques (style_overrides) ──────────
  // Chaque champ vide = valeur du modèle de design (placeholder). La surcharge
  // est validée puis fusionnée par resolveTemplate (pagination + aperçu + PDF).
  const styleOv = meta.style_overrides || {};
  const setStyleOv = (patch) => patchMeta({ style_overrides: { ...styleOv, ...patch } }, true);
  const tpl = getTemplate(meta.template_id);
  const FONT_LABELS = { serif: t("Serif (Times)"), sans: t("Sans (Arial)"), mono: t("Mono (Courier)") };
  const COLOR_LABELS = { heading: t("Titres"), body: t("Texte"), accent: t("Accent"), bg: t("Fond") };

  return (
    <section className="card section gen-section">
      {/* ─── Barres d'en-tête collantes (ruban statique) ─── */}
      <div className="gen-headwrap">
      <div className="gen-head">
        <button type="button" className="btn btn-outline btn-small" onClick={onBack}>
          ← {t("Bibliothèque")}
        </button>
        <input
          className="input gen-title-input"
          value={meta.title}
          maxLength={200}
          onChange={(e) => patchMeta({ title: e.target.value })}
          placeholder={t("Titre du document")}
          aria-label={t("Titre du document")}
        />
        <input
          className="input gen-author-input"
          value={meta.author}
          maxLength={200}
          onChange={(e) => patchMeta({ author: e.target.value })}
          placeholder={t("Auteur")}
          aria-label={t("Auteur")}
        />
      </div>
      <div className="gen-head gen-head-actions">
        <div className="gen-tabs" role="tablist">
          {[
            ["edit", t("Contenu")],
            ["design", t("Design")],
            ...(SHOW_STUDIO_TAB ? [["studio", t("Studio")]] : []),
            ["preview", t("Aperçu")],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={`gen-tab ${view === id ? "active" : ""}`}
              onClick={() => {
                if (id === "studio") openStudio();
                else setView(id);
              }}
              disabled={id === "studio" && studioLayoutLoading}
            >
              {id === "studio" && studioLayoutLoading ? "⏳ …" : label}
            </button>
          ))}
        </div>
        <div className="dash-actions">
          <span className={`gen-save ${saveState}`}>
            {saveState === "saving"
              ? t("Enregistrement…")
              : saveState === "saved"
                ? t("✓ Enregistré")
                : saveState === "error"
                  ? t("⚠ Erreur de sauvegarde")
                  : ""}
          </span>
          <button type="button" className="btn btn-outline btn-small" onClick={saveVersion}>
            💾 {t("Version")}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={() => setDocStatus(meta.status === "ready" ? "draft" : "ready")}
          >
            {meta.status === "ready" ? t("Repasser en brouillon") : t("Marquer prêt")}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={detectTitles}
            title={t(
              "Analyser tout le texte et transformer les lignes qui sont des titres (CHAPITRE 3, INTRODUCTION, 1.2 Mesure, lignes en MAJUSCULES…) en vrais titres, avec numérotation des chapitres"
            )}
          >
            🧠 {t("Détecter les titres")}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-small"
            onClick={runCheck}
            title={t("Analyser le document (structure, pagination, images) avant l'export")}
          >
            🔍 {t("Vérifier")}
          </button>
          <button type="button" className="btn btn-primary btn-small" onClick={doExport} disabled={exportPct !== null}>
            {exportPct !== null ? `PDF… ${exportPct} %` : `⬇ ${t("Exporter PDF")}`}
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={doExportEpub} disabled={epubStep !== null} title={t("Livre numérique reflowable (EPUB 3)")}>
            {epubStep !== null ? `EPUB… ${epubStep}` : `⬇ ${t("Exporter EPUB")}`}
          </button>
          <button
            type="button"
            className={`btn btn-small ${meta.published_product_id ? "btn-outline" : "btn-primary"}`}
            onClick={openPublish}
            disabled={pubBusy !== null}
            title={t("Exporter le PDF puis le publier comme produit digital téléchargeable dans votre boutique MboppiShop")}
          >
            {meta.published_product_id ? `🛒 ${t("Produit publié")}` : `🛒 ${t("Vendre sur MboppiShop")}`}
          </button>
        </div>
      </div>
      </div>
      {meta.doc_ref && (
        <p className="hint gen-ref">
          {t("Référence")} : <strong>{meta.doc_ref}</strong>
          {meta.published_product_id && (
            <> — 🛒 {t("Produit digital")} <a href={`/produit/${meta.published_product_id}`} target="_blank" rel="noreferrer">#{meta.published_product_id}</a>{" "}
              <button
                type="button"
                className="btn btn-small btn-outline"
                onClick={doDeleteProduct}
                disabled={delBusy}
                title={t("Supprimer définitivement ce produit publié (base de données + fichier)")}
              >
                {delBusy ? "…" : `🗑 ${t("Supprimer")}`}
              </button>
            </>
          )}
          {versions.length > 0 && <> — {versions.length} {t("version(s)")}</>}
        </p>
      )}
      {versions.length > 0 && (
        <details className="gen-versions">
          <summary>🕘 {t("Versions enregistrées")} ({versions.length})</summary>
          <ul>
            {versions.map((v) => (
              <li key={v.id}>
                <span>
                  {v.label || `#${v.id}`} — {v.created_at ? new Date(v.created_at).toLocaleString("fr-FR") : ""}
                </span>
                <button type="button" className="btn btn-small btn-outline" onClick={() => restoreVersion(v)}>
                  ↺ {t("Restaurer")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {formatMsg && (
        <p className="hint gen-format-msg" role="status">
          {formatMsg}{" "}
          <button type="button" className="btn btn-small btn-outline" onClick={() => setFormatMsg("")}>
            {t("OK")}
          </button>
        </p>
      )}

      {/* ─── Vue STUDIO : édition page par page (Digital Publishing Studio) ── */}
      {view === "studio" && (
        <DocStudio
          doc={meta}
          docMeta={meta}
          html={editor?.getHTML() || ""}
          onClose={() => setView("edit")}
          onSaved={(env) => {
            // Le Studio possède son propre état d'enregistrement ; ne pas
            // annoncer « enregistré » dans le parent si son autosave de contenu
            // est encore en attente.
            // Synchronisation Studio → Aperçu / Export : les pages éditées
            // sont conservées en mémoire pour que l'export PDF les applique.
            if (env) {
              metaRef.current = { ...metaRef.current, page_layout: env };
              setMeta((cur) => ({ ...cur, page_layout: env }));
              setStudioLayoutStale(false);
            }
          }}
          onLayoutChange={(env) => {
            // Le Studio publie sa version courante immédiatement : le bouton
            // PDF de la page principale ne peut pas utiliser une ancienne
            // copie de page_layout pendant l'autosave de 900 ms.
            if (env) {
              metaRef.current = { ...metaRef.current, page_layout: env };
              setMeta((cur) => ({ ...cur, page_layout: env }));
              setStudioLayoutStale(false);
            }
          }}
          onMetaPatch={(patch) => patchMeta(patch)}
          onGluedContent={(fixedHtml) => {
            // « 🔗 Mots collés » corrige aussi le texte de l'onglet Contenu, SANS
            // émettre d'update : la mise en page du Studio reste intacte et une
            // prochaine synchronisation ne réintroduit pas les mots collés.
            const ed = editorRef.current;
            if (!ed || !fixedHtml) return;
            ed.commands.setContent(fixedHtml, false);
            contentRef.current = ed.getJSON();
            scheduleSave();
            // L'aperçu paginé classique et le rapport DOCUMENT CHECK repartent du
            // texte corrigé (aucune resynchronisation : le Studio garde sa mise
            // en page).
            setPreview(null);
          }}
          t={t}
        />
      )}

      {/* ─── Vue CONTENU : éditeur TipTap + import + mise en forme ────────── */}
      {view === "edit" && (
        <>
          <div className="gen-toolbar" role="toolbar" aria-label={t("Mise en forme")}>
            <select
              className="input gen-inline-select"
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (v === "p") editor?.chain().focus().setParagraph().run();
                else editor?.chain().focus().toggleHeading({ level: Number(v) }).run();
              }}
              title={t("Style de titre")}
            >
              <option value="">{t("Titre…")}</option>
              <option value="1">H1</option>
              <option value="2">H2</option>
              <option value="3">H3</option>
              <option value="4">H4</option>
              <option value="p">{t("Paragraphe")}</option>
            </select>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleBold().run()} title="Gras (Ctrl+B)"><strong>G</strong></button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italique (Ctrl+I)"><em>I</em></button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Souligné (Ctrl+U)"><u>S</u></button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleStrike().run()} title="Barré">S̶</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleCode().run()} title="Code (monospace)">‹›</button>
            {/* Couleur du texte + surlignage (rendus dans l'aperçu ET le PDF) */}
            <input
              type="color"
              className="gen-color-input"
              defaultValue="#1a1a2e"
              onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
              title={t("Couleur du texte")}
            />
            <input
              type="color"
              className="gen-color-input"
              defaultValue="#fff3a0"
              onChange={(e) => editor?.chain().focus().toggleHighlight({ color: e.target.value }).run()}
              title={t("Surlignage")}
            />
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().unsetColor().run()} title={t("Retirer la couleur")}>A✕</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleSuperscript().run()} title={t("Exposant")}>X²</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleSubscript().run()} title={t("Indice")}>X₂</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleBulletList().run()} title={t("Liste à puces")}>•≡</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleOrderedList().run()} title={t("Liste numérotée")}>1≡</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().toggleBlockquote().run()} title={t("Citation")}>❝</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().setHorizontalRule().run()} title={t("Séparateur")}>—</button>
            <button
              type="button"
              className="btn btn-small btn-outline"
              onClick={() => {
                const url = window.prompt(t("URL du lien"));
                if (url) editor?.chain().focus().setLink({ href: url }).run();
              }}
              title={t("Lien")}
            >🔗</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().unsetLink().run()} title={t("Retirer le lien")}>🔗✕</button>
            <label className="btn btn-small btn-outline" title={t("Insérer une image (compressée) — cliquez sur l'image puis glissez la poignée ↔ pour la redimensionner")}>
              🖼️
              <input type="file" accept="image/*" hidden onChange={onInsertImage} />
            </label>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run()} title={t("Tableau")}>▦</button>
            <button
              type="button"
              className="btn btn-small btn-outline"
              onClick={() =>
                editor
                  ?.chain()
                  .focus()
                  .insertContent({
                    type: "paragraph",
                    content: [{ type: "text", text: "[QR]" }],
                  })
                  .run()
              }
              title={t("Emplacement du QR de vérification — insère un paragraphe « [QR] » qui devient le QR code dans l'aperçu, le PDF et l'EPUB (réservez l'espace à cet endroit sur votre affiche)")}
            >▩</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().setTextAlign("left").run()} title={t("Aligner à gauche")}>⯇</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().setTextAlign("center").run()} title={t("Centrer")}>≡</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().setTextAlign("right").run()} title={t("Aligner à droite")}>⯈</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().setTextAlign("justify").run()} title={t("Justifier")}>☰</button>
            <span className="gen-toolbar-sep" />
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().undo().run()} title="Annuler (Ctrl+Z)">↺</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().redo().run()} title="Rétablir (Ctrl+Y)">↻</button>
            <button type="button" className="btn btn-small btn-outline" onClick={() => editor?.chain().focus().selectAll().deleteSelection().run()} title={t("Tout effacer")}>🗑</button>
            <button
              type="button"
              className="btn btn-small btn-outline"
              onClick={() => {
                const text = window.prompt(t("Texte à insérer"));
                if (text) editor?.chain().focus().insertContent(text).run();
              }}
              title={t("Insérer du texte")}
            >⌨</button>
          </div>
          <div className="gen-toolbar gen-toolbar-import">
            <label className="btn btn-small btn-primary">
              📄 {t("Importer TXT / Markdown")}
              <input type="file" accept=".txt,.md,.markdown,text/plain" hidden onChange={onImportFile} />
            </label>
            <label className="btn btn-small btn-primary">
              📝 {t("Importer DOCX (Word)")}
              <input type="file" accept=".docx" hidden onChange={onImportFile} />
            </label>
            <span className="hint">
              {t("L'import détecte automatiquement titre, chapitres, listes et citations.")}
            </span>
          </div>
          {/* Rapport « Document Analyzer » : ce que l'import a détecté, avec
              raccourci vers le choix du design — tout est recalculé localement. */}
          {importReport && (
            <div className="gen-import-report">
              <strong>🔍 {t("Analyse du document")}</strong>
              {importReport.fileName && <span className="hint"> — {importReport.fileName}</span>}
              <div className="gen-import-stats">
                <span>📖 {t("Chapitres")} : <strong>{importReport.h1 ?? 0}</strong></span>
                <span>§ {t("Sections")} : <strong>{importReport.h2 ?? 0}</strong></span>
                <span>🖼️ {t("Images")} : <strong>{importReport.images ?? 0}</strong></span>
                <span>📊 {t("Tableaux")} : <strong>{importReport.tables ?? 0}</strong></span>
                <span>✍️ {t("Mots")} : <strong>{importReport.words ?? 0}</strong></span>
                <span>📄 {t("Pages estimées")} : <strong>~{importReport.pages ?? 1}</strong></span>
              </div>
              <div className="gen-import-report-actions">
                <button type="button" className="btn btn-small btn-primary" onClick={() => setView("design")}>
                  🎨 {t("Choisir un design")}
                </button>
                <button type="button" className="btn btn-small btn-outline" onClick={() => setImportReport(null)}>
                  {t("Masquer")}
                </button>
              </div>
            </div>
          )}
          <EditorContent editor={editor} className="gen-editor" />
          <p className="hint gen-edit-hint">
            {t(
              "✏️ Ce document est entièrement éditable : cliquez dans le texte pour le modifier, utilisez le ruban ci-dessus. Chaque modification met à jour l'aperçu, le PDF et l'EPUB."
            )}
          </p>
          {hasAi && (
            <div className="gen-ai">
              <div className="gen-ai-actions">
                <span className="gen-ai-label">✨ {t("Assistant IA")}</span>
                {[
                  ["structure", t("Structurer le texte")],
                  ["improve", t("Améliorer la sélection")],
                  ["correct", t("Corriger la sélection")],
                  ["rephrase", t("Reformuler")],
                  ["summarize", t("Résumer")],
                  ["expand", t("Développer")],
                  ["tone", t("Changer le ton")],
                  ["translate", t("Traduire (EN)")],
                  ["book_plan", t("📋 Plan de livre")],
                  ["write_chapter", t("✍️ Rédiger ce chapitre")],
                  ["blurb", t("Quatrième de couverture")],
                  ["bio", t("Biographie d'auteur")],
                  ["description", t("Description")],
                  ["design", t("Proposer un design")],
                ].map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    className="btn btn-small btn-outline"
                    disabled={aiBusy !== null}
                    onClick={() => {
                      // Commandes « livre » : une consigne est demandée avant
                      // l'appel (le reste de l'IA agit sur la sélection).
                      if (action === "book_plan") {
                        const inst = window.prompt(
                          t("Décrivez le livre à planifier : sujet, audience, longueur (ex. « ebook de 40 pages sur le marketing digital pour jeunes entrepreneurs »).")
                        );
                        if (inst === null) return;
                        runAi(action, { instruction: inst });
                      } else if (action === "write_chapter") {
                        const inst = window.prompt(t("Titre (ou thème précis) du chapitre à rédiger :"));
                        if (inst === null) return;
                        runAi(action, { instruction: inst });
                      } else {
                        runAi(action);
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {aiBusy && <p className="hint">{t("L'assistant travaille…")}</p>}
              {aiResult?.text && (
                <div ref={aiResultRef} className="gen-ai-result">
                  <pre>{aiResult.text}</pre>
                  <div className="gen-ai-result-actions">
                    {aiResult.action === "description" && (
                      <button type="button" className="btn btn-small btn-primary" onClick={useDescriptionForPublication}>
                        {t("Utiliser pour la publication")}
                      </button>
                    )}
                    {editor && !editor.state.selection.empty && aiResult.action !== "design" && aiResult.action !== "description" && (
                      <button type="button" className="btn btn-small btn-primary" onClick={() => applyAiResult(true)}>
                        {t("Remplacer la sélection")}
                      </button>
                    )}
                    {aiResult.action !== "design" && aiResult.action !== "description" && (
                      <button type="button" className="btn btn-small btn-outline" onClick={() => applyAiResult(false)}>
                        {aiResult.action === "structure" ? t("Remplacer tout le contenu") : t("Ajouter à la fin")}
                      </button>
                    )}
                    <button type="button" className="btn btn-small btn-outline" onClick={() => setAiResult(null)}>
                      {t("Ignorer")}
                    </button>
                  </div>
                </div>
              )}
              <p className="hint">{t("Sélectionnez un passage pour les actions sur texte. L'IA propose — vous validez : rien n'est inséré sans votre confirmation.")}</p>
            </div>
          )}
        </>
      )}

      {/* ─── Vue DESIGN : modèle, format, couverture, protection ──────────── */}
      {view === "design" && (
        <div className="gen-design">
          {/* Suggestion par portée du contenu : analyse locale du texte, le
              Générateur propose les modèles adaptés au sujet — l'utilisateur
              reste libre (aucun changement automatique). */}
          <div className="gen-design-block gen-scope">
            <h4>🧠 {t("Design suggéré selon votre contenu")}</h4>
            {scopeInfo ? (
              <>
                <p className="gen-scope-head">
                  <strong>
                    {scopeInfo.emoji} {t(scopeInfo.label)}
                  </strong>
                  {scopeInfo.confidence > 0 && (
                    <span className="gen-scope-badge">
                      {t("correspondance {n} %", { n: scopeInfo.confidence })}
                    </span>
                  )}
                </p>
                {scopeInfo.reason && (
                  <p className="hint">
                    {t("Repéré dans votre texte : {words}.", { words: scopeInfo.reason })}
                  </p>
                )}
                <div className="gen-scope-actions">
                  {scopeInfo.suggestions.map((sug) => {
                    const tpl = GEN_TEMPLATES.find((x) => x.id === sug.id);
                    if (!tpl) return null;
                    return (
                      <button
                        key={sug.id}
                        type="button"
                        className={`btn btn-small ${meta.template_id === sug.id ? "btn-primary" : "btn-outline"}`}
                        onClick={() => patchMeta({ template_id: sug.id })}
                        title={t("Appliquer ce modèle")}
                      >
                        <span className="gen-tpl-swatch" style={{ background: tpl.coverBg, color: tpl.coverText }}>
                          Aa
                        </span>{" "}
                        {tpl.name}
                      </button>
                    );
                  })}
                  <button type="button" className="btn btn-small btn-outline" onClick={analyzeScope}>
                    🔄 {t("Relancer l'analyse")}
                  </button>
                </div>
                <p className="hint">
                  {t(
                    "Suggestion indicative : les {n} modèles restent disponibles ci-dessous, et vos réglages de couleurs et de polices sont conservés.",
                    { n: GEN_TEMPLATES.length }
                  )}
                </p>
              </>
            ) : (
              <p className="hint">
                {t(
                  "Ajoutez quelques paragraphes à votre document : le Générateur détecte alors son sujet et vous propose les modèles de design adaptés."
                )}
              </p>
            )}
          </div>

          {/* ─── Commande de design en langage naturel (§45-§51, §54-§56) ────
              L'utilisateur écrit ce qu'il veut (« rends le design plus sobre et
              bleu ») : le moteur `designCommands.js` analyse la phrase puis
              renvoie un patch de PRÉSENTATION (modèle, couleurs, polices, mise
              en page, couverture). Le texte, la structure et les images ne sont
              JAMAIS modifiés : contenu et présentation sont séparés. */}
          <div className="gen-design-block gen-command">
            <h4>💬 {t("Commande de design")}</h4>
            <p className="hint">
              {t(
                "Écrivez ce que vous voulez : le Générateur change le design, jamais votre texte."
              )}
            </p>
            <div className="gen-command-examples">
              {CMD_EXAMPLES.map((ex) => (
                <button
                  key={ex.text}
                  type="button"
                  className="gen-cmd-example"
                  onClick={() => setCmdText(ex.text)}
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <div className="gen-command-row">
              <textarea
                className="gen-command-input"
                rows={2}
                value={cmdText}
                onChange={(e) => setCmdText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    runDesignCommand();
                  }
                }}
                placeholder={t(
                  "Ex. : un design moderne, élégant, bleu et blanc, pour des entrepreneurs."
                )}
                aria-label={t("Commande de design")}
              />
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={runDesignCommand}
                disabled={!cmdText.trim()}
              >
                ✨ {t("Appliquer la commande")}
              </button>
            </div>
            {cmdReport && (
              <div className="gen-command-out">
                {cmdReport.empty ? (
                  <p className="hint">
                    {t(
                      "Commande non comprise : essayez par exemple « rends le design plus moderne et bleu »."
                    )}
                  </p>
                ) : (
                  <>
                    {cmdReport.codes?.length > 0 && (
                      <>
                        <p className="gen-ai-label">{t("Compris")} :</p>
                        <div className="gen-cmd-chips">
                          {cmdReport.codes.map((c, i) => (
                            <span key={`${c.code}-${i}`} className="gen-cmd-chip">
                              ✓ {cmdCodeLabel(c)}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {cmdReport.notes?.length > 0 && (
                      <ul className="gen-cmd-notes">
                        {cmdReport.notes.map((n, i) => (
                          <li key={`${n.code}-${i}`}>ℹ️ {cmdNote(n)}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {cmdReport.variants?.length > 0 && (
                  <div className="gen-cmd-variants">
                    <span className="gen-ai-label">
                      🎲{" "}
                      {t("{n} variantes — cliquez pour appliquer :", {
                        n: cmdReport.variants.length,
                      })}
                    </span>
                    {cmdReport.variants.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        className="btn btn-small btn-outline"
                        onClick={() => applyCmdVariant(v)}
                        title={t("Appliquer cette variante")}
                      >
                        <span
                          className="gen-tpl-swatch"
                          style={{ background: v.cover.bg, color: v.cover.text }}
                        >
                          Aa
                        </span>{" "}
                        {v.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="gen-design-block">
            <h4>🎨 {t("Modèle de design")}</h4>
            {/* Filtres de bibliothèque (catégorie / style) + recherche +
                favoris ⭐ — tout est local, la grille est simplement filtrée. */}
            <div className="gen-tpl-filters">
              <select className="input" value={tplCat} onChange={(e) => setTplCat(e.target.value)} title={t("Catégorie")}>
                <option value="">{t("Toutes les catégories")}</option>
                <option value="__fav">⭐ {t("Favoris")}{tplFavs.length ? ` (${tplFavs.length})` : ""}</option>
                {tplFacets.categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select className="input" value={tplStyle} onChange={(e) => setTplStyle(e.target.value)} title={t("Style")}>
                <option value="">{t("Tous les styles")}</option>
                {tplFacets.styles.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                className="input"
                placeholder={t("Rechercher un modèle…")}
                value={tplSearch}
                onChange={(e) => setTplSearch(e.target.value)}
              />
            </div>
            {tplRecents.length > 0 && tplCat !== "__fav" && !tplSearch && !tplStyle && !tplCat && (
              <div className="gen-tpl-recents">
                <span className="gen-ai-label">🕘 {t("Récents")} :</span>
                {tplRecents.map((id) => {
                  const tpl = getTemplate(id);
                  if (!tpl) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`btn btn-small ${meta.template_id === id ? "btn-primary" : "btn-outline"}`}
                      onClick={() => applyTemplate(id)}
                      title={t("Appliquer ce modèle")}
                    >
                      <span className="gen-tpl-swatch" style={{ background: tpl.coverBg, color: tpl.coverText }}>Aa</span>{" "}
                      {tpl.name}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Recommandations intelligentes (§16) : modèles classés d'après le
                contenu du document + les préférences (favoris ⭐, récents 🕘).
                Chaque pastille applique le modèle ; 👁 l'essaie sans appliquer. */}
            {recoRow.length > 0 && (
              <div className="gen-tpl-recos">
                <span className="gen-ai-label">✨ {t("Recommandé pour votre contenu")} :</span>
                {recoRow.map((r) => (
                  <span key={r.tpl.id} className={`gen-reco-chip ${meta.template_id === r.tpl.id ? "active" : ""}`}>
                    <button
                      type="button"
                      className="gen-reco-apply"
                      onClick={() => applyTemplate(r.tpl.id)}
                      title={`${r.tpl.name} — ${r.m.category} · ${r.m.style} · ${r.m.sector}`}
                    >
                      <span className="gen-tpl-swatch" style={{ background: r.tpl.coverBg, color: r.tpl.coverText }}>
                        Aa
                      </span>
                      <span className="gen-reco-text">
                        <strong>{r.tpl.name}</strong>
                        <em>
                          {r.m.category} · {r.m.style}
                        </em>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="gen-tpl-eye"
                      onClick={() => previewTemplate(r.tpl.id)}
                      title={t("Aperçu du modèle")}
                      aria-label={t("Aperçu du modèle")}
                    >
                      👁
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="gen-templates">
              {filteredTemplates.map((tpl) => {
                const m = templateMeta(tpl);
                return (
                  <div key={tpl.id} className={`gen-template-card ${meta.template_id === tpl.id ? "active" : ""}`}>
                    <button
                      type="button"
                      className="gen-tpl-apply"
                      onClick={() => applyTemplate(tpl.id)}
                      title={`${tpl.name} — ${m.category} · ${m.style} · ${m.sector}`}
                    >
                      <span className="gen-tpl-swatch" style={{ background: tpl.coverBg, color: tpl.coverText }}>
                        Aa
                        {decorMarks(tpl).map((st, i) => (
                          <span key={i} style={st} />
                        ))}
                      </span>
                      <span className="gen-tpl-name">{tpl.name}</span>
                      <span className="gen-tpl-meta">{m.category} · {m.style}</span>
                    </button>
                    <button
                      type="button"
                      className={`gen-tpl-eye ${tplPreviewBusy ? "busy" : ""}`}
                      onClick={() => previewTemplate(tpl.id)}
                      title={t("Aperçu du modèle avec votre contenu")}
                      aria-label={t("Aperçu du modèle")}
                    >
                      👁
                    </button>
                    <button
                      type="button"
                      className={`gen-tpl-star ${tplFavs.includes(tpl.id) ? "on" : ""}`}
                      onClick={() => toggleTplFav(tpl.id)}
                      title={tplFavs.includes(tpl.id) ? t("Retirer des favoris") : t("Ajouter aux favoris")}
                      aria-label={tplFavs.includes(tpl.id) ? t("Retirer des favoris") : t("Ajouter aux favoris")}
                    >
                      {tplFavs.includes(tpl.id) ? "★" : "☆"}
                    </button>
                  </div>
                );
              })}
            </div>
            {filteredTemplates.length === 0 && (
              <p className="hint">{t("Aucun modèle ne correspond à ces filtres.")}</p>
            )}
            <div className="gen-tpl-variant">
              <button type="button" className="btn btn-small btn-outline" onClick={generateVariant}>
                🎲 {t("Générer une variante")}
              </button>
              <span className="hint">
                {t("Varie les couleurs, les polices et la couverture du modèle actif — votre contenu reste intact (réversible via Styles avancés).")}
              </span>
            </div>
          </div>

          <div className="gen-design-block">
            <h4>📐 {t("Format et mise en page")}</h4>
            <div className="gen-form-row">
              <div>
                <label>{t("Format")}</label>
                <select className="input" value={meta.page_format} onChange={(e) => patchMeta({ page_format: e.target.value, page_width: null, page_height: null })}>
                  {Object.keys(PAGE_FORMATS).map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>{t("Orientation")}</label>
                <select className="input" value={meta.orientation || "portrait"} onChange={(e) => patchMeta({ orientation: e.target.value })}>
                  <option value="portrait">{t("Portrait")}</option>
                  <option value="landscape">{t("Paysage")}</option>
                </select>
              </div>
              <div>
                <label>{t("Marge haut (mm)")}</label>
                <input
                  className="input" type="number" min={5} max={60}
                  value={meta.margins?.top ?? 20}
                  onChange={(e) => patchMeta({ margins: { ...(meta.margins || {}), top: Number(e.target.value) } })}
                />
              </div>
              <div>
                <label>{t("Marge bas (mm)")}</label>
                <input
                  className="input" type="number" min={5} max={60}
                  value={meta.margins?.bottom ?? 20}
                  onChange={(e) => patchMeta({ margins: { ...(meta.margins || {}), bottom: Number(e.target.value) } })}
                />
              </div>
              <div>
                <label>{t("Marge gauche/droite (mm)")}</label>
                <input
                  className="input" type="number" min={5} max={60}
                  value={meta.margins?.left ?? 18}
                  onChange={(e) => patchMeta({ margins: { ...(meta.margins || {}), left: Number(e.target.value), right: Number(e.target.value) } })}
                />
              </div>
            </div>
            {/* Gras global : un seul clic met TOUT le texte courant en gras
                (paragraphes, listes, tableaux) — aperçu, PDF, EPUB et Studio
                lisent le même drapeau `style_overrides.bodyBold`. */}
            <div className="gen-tpl-variant">
              <button
                type="button"
                className={`btn btn-small ${styleOv.bodyBold ? "btn-primary" : "btn-outline"}`}
                aria-pressed={styleOv.bodyBold === true}
                onClick={() => setStyleOv({ bodyBold: styleOv.bodyBold !== true })}
              >
                {styleOv.bodyBold ? "✓ " : ""}{t("Tout le document en gras")}
              </button>
              <span className="hint">
                {t("Met en gras tous les textes du document, sauf les titres et les citations.")}
              </span>
            </div>
          </div>

          <div className="gen-design-block">
            <h4>📕 {t("Couverture")}</h4>
            {/* AUTO COVER : trois palettes générées à partir du modèle actif
                (réutilise templateVariant) — un clic applique fond + texte. */}
            <div className="gen-tpl-variant">
              <button type="button" className="btn btn-small btn-outline" onClick={proposeCovers}>
                🎨 {t("3 propositions de couverture")}
              </button>
              <span className="hint">
                {t("Trois palettes assorties au modèle actif — cliquez sur une pastille pour l'appliquer.")}
              </span>
            </div>
            {coverIdeas && (
              <div className="gen-cover-ideas">
                {coverIdeas.map((v, i) => (
                  <button
                    key={i}
                    type="button"
                    className="gen-cover-idea"
                    title={t("Appliquer cette couverture")}
                    onClick={() => {
                      patchMeta({
                        cover: { ...(metaRef.current.cover || {}), bg: v.cover.bg, text: v.cover.text },
                      }, true);
                      setCoverIdeas(null);
                    }}
                  >
                    <span className="gen-tpl-swatch" style={{ background: v.cover.bg, color: v.cover.text }}>
                      Aa
                    </span>
                  </button>
                ))}
                <button type="button" className="btn btn-small btn-outline" onClick={() => setCoverIdeas(null)}>
                  {t("Masquer")}
                </button>
              </div>
            )}
            <div className="gen-form-row">
              <div>
                <label>{t("Titre de couverture")}</label>
                <input className="input" value={meta.cover?.title ?? ""} placeholder={meta.title} onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), title: e.target.value } })} />
              </div>
              <div>
                <label>{t("Sous-titre")}</label>
                <input className="input" value={meta.cover?.subtitle ?? ""} placeholder={meta.subtitle} onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), subtitle: e.target.value } })} />
              </div>
            </div>
            <div className="gen-form-row">
              <div>
                <label>{t("Fond (couleur)")}</label>
                <input type="color" className="gen-color" value={meta.cover?.bg || getTemplate(meta.template_id).coverBg} onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), bg: e.target.value } })} />
              </div>
              <div>
                <label>{t("Texte (couleur)")}</label>
                <input type="color" className="gen-color" value={meta.cover?.text || getTemplate(meta.template_id).coverText} onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), text: e.target.value } })} />
              </div>
              <div className="gen-grow">
                <label>{t("Image de fond")}</label>
                <label className="btn btn-small btn-outline">
                  🖼️ {meta.cover?.image ? t("Changer") : t("Importer")}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        patchMeta({ cover: { ...(meta.cover || {}), image: await compressImage(file, 1600, 0.82) } });
                      } catch {
                        setError("Image non lisible.");
                      }
                    }}
                  />
                </label>
                {meta.cover?.image && (
                  <button type="button" className="btn btn-small btn-danger" onClick={() => patchMeta({ cover: { ...(meta.cover || {}), image: null } })}>
                    {t("Retirer")}
                  </button>
                )}
              </div>
            </div>
            {/* Mise en page du titre : affichage/masquage, position libre, opacité. */}
            <div className="gen-form-row">
              <div>
                <label className="gen-check">
                  <input
                    type="checkbox"
                    checked={meta.cover?.showTitle !== false}
                    onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), showTitle: e.target.checked } })}
                  />
                  {t("Afficher le titre et le sous-titre")}
                </label>
              </div>
              <div>
                <label>{t("Alignement du titre")}</label>
                <select
                  className="input"
                  value={meta.cover?.titleAlign || "center"}
                  onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), titleAlign: e.target.value } })}
                >
                  <option value="left">{t("Gauche")}</option>
                  <option value="center">{t("Centre")}</option>
                  <option value="right">{t("Droite")}</option>
                </select>
              </div>
            </div>
            <div className="gen-form-row">
              <div className="gen-grow">
                <label>
                  {t("Position horizontale du titre")} — {Math.round(meta.cover?.titleX ?? 50)} %
                </label>
                <input
                  type="range"
                  min="5"
                  max="95"
                  step="1"
                  value={meta.cover?.titleX ?? 50}
                  onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), titleX: Number(e.target.value) } })}
                />
              </div>
              <div className="gen-grow">
                <label>
                  {t("Position verticale du titre")} — {Math.round(meta.cover?.titleY ?? 32)} %
                </label>
                <input
                  type="range"
                  min="5"
                  max="95"
                  step="1"
                  value={meta.cover?.titleY ?? 32}
                  onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), titleY: Number(e.target.value) } })}
                />
              </div>
            </div>
            {meta.cover?.image && (
              <div className="gen-form-row">
                <div className="gen-grow">
                  <label>
                    {t("Opacité de l'image de fond")} —{" "}
                    {Math.round(
                      meta.cover?.imageOpacity ?? Math.round((1 - (meta.cover?.imageDim ?? 0.2)) * 100)
                    )}{" "}
                    %
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={meta.cover?.imageOpacity ?? Math.round((1 - (meta.cover?.imageDim ?? 0.2)) * 100)}
                    onChange={(e) =>
                      patchMeta({
                        cover: { ...(meta.cover || {}), imageOpacity: Number(e.target.value), imageDim: undefined },
                      })
                    }
                  />
                </div>
                <div className="gen-grow">
                  <label>
                    {t("Cadrage vertical de l'image")} — {Math.round(meta.cover?.imageY ?? 30)} %
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={meta.cover?.imageY ?? 30}
                    onChange={(e) => patchMeta({ cover: { ...(meta.cover || {}), imageY: Number(e.target.value) } })}
                    title={t("0 % = haut de la photo conservé (plus de coupe en haut), 100 % = bas de la photo")}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-small btn-outline"
                  onClick={() =>
                    patchMeta({
                      cover: {
                        ...(meta.cover || {}),
                        showTitle: true,
                        titleAlign: "center",
                        titleX: 50,
                        titleY: undefined,
                        imageY: undefined,
                      },
                    })
                  }
                >
                  {t("Réinitialiser la position du titre")}
                </button>
              </div>
            )}
            <p className="hint">
              {t("Le modèle de design impose la mise en page de la couverture (centrée, à gauche, en bande ou en haut) : ces réglages déplacent le titre et règlent la visibilité de la photo.")}
            </p>
          </div>

          <div className="gen-design-block">
            <h4>🛡️ {t("Protection et authenticité")}</h4>
            <label className="gen-check">
              <input
                type="checkbox"
                checked={meta.protection?.watermark?.enabled ?? false}
                onChange={(e) => patchMeta({ protection: { ...(meta.protection || {}), watermark: { ...(meta.protection?.watermark || {}), enabled: e.target.checked } } })}
              />
              {t("Filigrane (watermark) sur les pages de contenu")}
            </label>
            {meta.protection?.watermark?.enabled && (
              <div className="gen-form-row">
                <div className="gen-grow">
                  <label>{t("Texte du filigrane")}</label>
                  <input
                    className="input"
                    value={meta.protection?.watermark?.text ?? ""}
                    placeholder={`© ${meta.author || "Auteur"}`}
                    onChange={(e) => patchMeta({ protection: { ...(meta.protection || {}), watermark: { ...(meta.protection?.watermark || {}), text: e.target.value } } })}
                  />
                </div>
                <div>
                  <label>{t("Intensité")}</label>
                  <select
                    className="input"
                    value={meta.protection?.watermark?.mode || "discreet"}
                    onChange={(e) => patchMeta({ protection: { ...(meta.protection || {}), watermark: { ...(meta.protection?.watermark || {}), mode: e.target.value } } })}
                  >
                    <option value="discreet">{t("Discret")}</option>
                    <option value="visible">{t("Visible")}</option>
                  </select>
                </div>
              </div>
            )}
            <label className="gen-check">
              <input
                type="checkbox"
                checked={meta.protection?.qrEnabled !== false}
                onChange={(e) => patchMeta({ protection: { ...(meta.protection || {}), qrEnabled: e.target.checked } })}
              />
              {t("QR code de vérification (référence + empreinte) sur la couverture")}
            </label>
            <label className="gen-check">
              <input
                type="checkbox"
                checked={meta.protection?.copyright !== false}
                onChange={(e) => patchMeta({ protection: { ...(meta.protection || {}), copyright: e.target.checked } })}
              />
              {t("Page de copyright (mention légale automatique)")}
            </label>
            <label className="gen-check">
              <input
                type="checkbox"
                checked={meta.protection?.toc !== false}
                onChange={(e) => patchMeta({ protection: { ...(meta.protection || {}), toc: e.target.checked } })}
              />
              {t("Table des matières (numéros de page exacts)")}
            </label>
            <p className="hint">
              {t("Chaque document porte une référence unique (DOC-2026-XXXXXXXX) et une empreinte SHA-256 calculée sur le contenu — affichées dans le PDF et encodées dans le QR code.")}
            </p>
          </div>

          <div className="gen-design-block">
            <h4>⚙️ {t("Styles avancés")}</h4>
            <p className="hint">
              {t("Surchargez la typographie et les couleurs sans changer de modèle. Un champ vide garde la valeur du modèle.")}
            </p>
            <div className="gen-form-row">
              <div>
                <label>{t("Police du corps")}</label>
                <select
                  className="input"
                  value={styleOv.bodyFont || ""}
                  onChange={(e) => setStyleOv({ bodyFont: e.target.value || undefined })}
                >
                  <option value="">{`${t("Modèle")} — ${FONT_LABELS[tpl.bodyFont]}`}</option>
                  <option value="serif">{FONT_LABELS.serif}</option>
                  <option value="sans">{FONT_LABELS.sans}</option>
                  <option value="mono">{FONT_LABELS.mono}</option>
                </select>
              </div>
              <div>
                <label>{t("Police des titres")}</label>
                <select
                  className="input"
                  value={styleOv.headingFont || ""}
                  onChange={(e) => setStyleOv({ headingFont: e.target.value || undefined })}
                >
                  <option value="">{`${t("Modèle")} — ${FONT_LABELS[tpl.headingFont]}`}</option>
                  <option value="serif">{FONT_LABELS.serif}</option>
                  <option value="sans">{FONT_LABELS.sans}</option>
                  <option value="mono">{FONT_LABELS.mono}</option>
                </select>
              </div>
              <div>
                <label>{t("Alignement du texte")}</label>
                <select
                  className="input"
                  value={styleOv.align || ""}
                  onChange={(e) => setStyleOv({ align: e.target.value || undefined })}
                >
                  <option value="">{`${t("Modèle")} — ${tpl.align === "justify" ? t("justifié") : tpl.align === "center" ? t("centré") : t("gauche")}`}</option>
                  <option value="left">{t("Gauche")}</option>
                  <option value="justify">{t("Justifié")}</option>
                  <option value="center">{t("Centré")}</option>
                </select>
              </div>
            </div>
            <div className="gen-form-row">
              <div>
                <label>{t("Interligne (1,1 – 2,4)")}</label>
                <input
                  className="input"
                  type="number"
                  min="1.1"
                  max="2.4"
                  step="0.05"
                  value={styleOv.lineHeight ?? ""}
                  placeholder={tpl.lineHeight}
                  onChange={(e) => setStyleOv({ lineHeight: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
              <div>
                <label>{t("Espacement des paragraphes (0 – 24 pt)")}</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="24"
                  step="1"
                  value={styleOv.paraSpace ?? ""}
                  placeholder={tpl.paraSpace}
                  onChange={(e) => setStyleOv({ paraSpace: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
            </div>
            <label>{t("Tailles (pt) — vides = valeurs du modèle")}</label>
            <div className="gen-style-grid">
              {SIZE_KEYS.map((k) => (
                <div key={k}>
                  <label className="gen-mini-label">{k.toUpperCase()}</label>
                  <input
                    className="input"
                    type="number"
                    min="5"
                    max="60"
                    step="0.5"
                    value={styleOv.sizes?.[k] ?? ""}
                    placeholder={tpl.sizes[k]}
                    onChange={(e) =>
                      setStyleOv({ sizes: { ...(styleOv.sizes || {}), [k]: e.target.value === "" ? undefined : Number(e.target.value) } })
                    }
                  />
                </div>
              ))}
            </div>
            <label>{t("Couleurs — vides = couleurs du modèle")}</label>
            <div className="gen-style-grid">
              {COLOR_KEYS.map((k) => (
                <div key={k}>
                  <label className="gen-mini-label">{COLOR_LABELS[k]}</label>
                  <input
                    type="color"
                    className="gen-color-input"
                    value={styleOv.colors?.[k] || tpl.colors[k]}
                    title={`${COLOR_LABELS[k]} — ${styleOv.colors?.[k] || tpl.colors[k]}`}
                    onChange={(e) => setStyleOv({ colors: { ...(styleOv.colors || {}), [k]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
            {Object.keys(styleOv).length > 0 && (
              <button
                type="button"
                className="btn btn-small btn-outline"
                onClick={() => patchMeta({ style_overrides: {} }, true)}
              >
                ↺ {t("Réinitialiser au style du modèle")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Vue APERÇU : pages paginées (même sortie que le PDF) ─────────── */}
      {view === "preview" && (
        <div className="gen-preview-zone" ref={previewZoneRef}>
          <div className="dash-actions" style={{ marginBottom: 12 }}>
            <button type="button" className="btn btn-primary btn-small" onClick={() => setView("edit")}>
              ✏️ {t("Modifier le contenu")}
            </button>
            <button type="button" className="btn btn-outline btn-small" onClick={buildPreview} disabled={previewBusy}>
              {previewBusy ? t("Recalcul…") : `⟳ ${t("Régénérer l'aperçu")}`}
            </button>
            <button type="button" className="btn btn-outline btn-small" onClick={runCheck}>
              🔍 {t("Contrôle qualité")}
            </button>
            {preview && (
              <span className="hint">
                {preview.pages.length} {t("page(s)")} — {t("format")} {meta.page_format} — {t("modèle")} {preview.template.name}
              </span>
            )}
          </div>
          {check && (
            <div className={`gen-check-report ${check.errors?.length ? "has-errors" : "ok"}`}>
              <h4>🔍 {t("DOCUMENT CHECK — contrôle qualité")}</h4>
              {check.stats && (
                <p className="hint">
                  {check.stats.words} {t("mot(s)")} — {check.stats.headings} {t("titre(s)")} — {check.stats.images} {t("image(s)")}
                </p>
              )}
              {Array.isArray(check.quality) && check.quality.length > 0 && (
                <div className="gen-check-quality">
                  {check.quality.map((q) => (
                    <span key={q.key} className={`gen-quality gen-quality-${q.level}`} title={q.hint}>
                      {q.label} : <strong>{q.label && q.level === "excellent" ? t("excellente") : q.level === "good" ? t("bonne") : q.level === "warn" ? t("correcte") : t("à revoir")}</strong>
                    </span>
                  ))}
                </div>
              )}
              {(["errors", "warnings", "suggestions"]).map((k) =>
                check[k]?.length ? (
                  <div key={k} className={`gen-check-group gen-check-${k}`}>
                    <strong>{k === "errors" ? t("Erreurs") : k === "warnings" ? t("Avertissements") : t("Suggestions")}</strong>
                    <ul>
                      {check[k].map((c, i) => {
                        const msg = c?.message || c?.label || (typeof c === "string" ? c : JSON.stringify(c));
                        return (
                          <li key={i}>
                            {msg}
                            {c?.fixable && (
                              <button type="button" className="btn btn-small btn-outline" onClick={() => applyFix(c.code || c)}>
                                🔧 {t("Corriger")}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null
              )}
              {check.fixables?.length > 0 && (
                <div className="gen-check-fixables">
                  <strong>🔧 {t("Corrections possibles")}</strong>
                  <div className="gen-check-fix-buttons">
                    {check.fixables.map((f) => (
                      <button key={f.code} type="button" className="btn btn-small btn-outline" onClick={() => applyFix(f.code)}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {check.errors?.length === 0 && <p className="hint">✓ {t("Aucune erreur bloquante détectée.")}</p>}
              <button type="button" className="btn btn-small btn-outline" onClick={() => setCheck(null)}>{t("Fermer")}</button>
            </div>
          )}
          {studioTpl && studioPages.length ? (
            <>
              <p className="hint">
                🧩 {t("Mise en page du Studio active : l'aperçu et le PDF exporté suivent les pages éditées page par page.")}{" "}
                {SHOW_STUDIO_TAB && (
                  <button type="button" className="btn btn-outline btn-small" onClick={() => setView("studio")}>
                    {t("Ouvrir le Studio")}
                  </button>
                )}
              </p>
              <div className="studio-preview">
                <div className="studio-preview-pages">
                  {studioPages.map((p) => (
                    <div
                      key={p.id}
                      className="studio-preview-page"
                      style={{
                        width: studioTpl.box.w * PX_PER_MM * GEN_PREVIEW_SCALE * (fitScale || 1),
                        height: studioTpl.box.h * PX_PER_MM * GEN_PREVIEW_SCALE * (fitScale || 1),
                      }}
                    >
                      <StudioCanvas
                        page={p}
                        box={studioTpl.box}
                        template={studioTpl.template}
                        docMeta={meta}
                        totalPages={studioPages.length}
                        zoom={GEN_PREVIEW_SCALE * (fitScale || 1)}
                        selectedIds={[]}
                        readOnly
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : preview && (
            <div className="gen-pages">
              {preview.pages.map((page, i) => (
                <div key={i} className="gen-page-wrap">
                  <GenPage page={page} paginated={preview} docMeta={meta} fit={fitScale} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Aperçu d'un modèle SANS l'appliquer : contenu réel repaginé ────── */}
      {tplPreview && (
        <div className="gen-tpl-preview" role="dialog" aria-modal="true" aria-label={t("Aperçu du modèle")}>
          <div className="gen-tpl-preview-card">
            <div className="gen-tpl-preview-head">
              <strong>
                👁 {getTemplate(tplPreview.id)?.name} ·{" "}
                {templateMeta(getTemplate(tplPreview.id)).style}
              </strong>
              <span className="hint">
                {t(
                  "Votre contenu repaginé avec ce modèle — rien n'est modifié tant que vous ne cliquez pas sur « Utiliser ce modèle »."
                )}
              </span>
              <span className="gen-tpl-preview-count">
                {tplPreview.paginated.pages.length} {t("pages")}
              </span>
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={() => {
                  applyTemplate(tplPreview.id);
                  setTplPreview(null);
                }}
              >
                ✓ {t("Utiliser ce modèle")}
              </button>
              <button type="button" className="btn btn-small btn-outline" onClick={() => setTplPreview(null)}>
                {t("Fermer")}
              </button>
            </div>
            <div className="gen-tpl-preview-pages">
              <div className="gen-pages">
                {tplPreview.paginated.pages.slice(0, 8).map((page, i) => (
                  <div key={i} className="gen-page-wrap">
                    <GenPage
                      page={page}
                      paginated={tplPreview.paginated}
                      docMeta={meta}
                      fit={fitScale || 1}
                    />
                  </div>
                ))}
              </div>
            </div>
            {tplPreview.paginated.pages.length > 8 && (
              <p className="hint gen-tpl-preview-more">
                {t(
                  "Aperçu des {n} premières pages sur {total} — le document complet sera mis en page exactement de la même façon.",
                  { n: 8, total: tplPreview.paginated.pages.length }
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Publication : produit digital (modale légère) ──────────────────── */}
      {pub && (
        <div className="gen-publish" role="dialog" aria-modal="true" aria-label={t("Publier comme produit digital")}>
          <div className="gen-publish-card">
            <h4>🛒 {meta.published_product_id ? t("Mettre à jour le produit digital") : t("Publier comme produit digital")}</h4>
            <p className="hint">
              {t("Le PDF est généré puis téléversé dans le stockage privé de MboppiShop. Le produit apparaît dans votre catalogue et le fichier devient téléchargeable par l'acheteur après confirmation du paiement.")}
            </p>
            <label>
              {t("Prix")} ({priceCurrency})
              <input
                className="input"
                type="number"
                min="0"
                step="100"
                value={pub.price}
                onChange={(e) => setPub({ ...pub, price: e.target.value })}
                placeholder="2500"
              />
            </label>
            <label>
              {t("Prix barré (optionnel)")} ({priceCurrency})
              <input
                className="input"
                type="number"
                min="0"
                step="100"
                value={pub.old_price || ""}
                onChange={(e) => setPub({ ...pub, old_price: e.target.value })}
                placeholder="3500"
              />
            </label>
            {(() => {
              const sale = Number(String(pub.price || "").replace(",", ".")) || 0;
              const old = Number(String(pub.old_price || "").replace(",", ".")) || 0;
              if (old <= 0 || sale <= 0 || old > sale) return null;
              return <p className="hint">{t("Le prix barré doit être supérieur au prix de vente.")}</p>;
            })()}
            <div className="gen-form-row">
              <div className="gen-grow">
                <label>{t("Commission vendeur (montant)")}</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="100"
                  value={pub.commission}
                  onChange={(e) => setPub({ ...pub, commission: e.target.value })}
                  placeholder="500"
                />
                {(() => {
                  const amt = Number(String(pub.commission || "").replace(",", ".")) || 0;
                  const base = Number(String(pub.price || "").replace(",", ".")) || 0;
                  if (amt <= 0 || base <= 0) return null;
                  const pct = Math.round((amt / base) * 1e8) / 1e6;
                  if (pct > 100)
                    return (
                      <p className="hint">
                        {t("Montant supérieur au prix : la commission est limitée au prix de vente.")}
                      </p>
                    );
                  return <p className="hint">{t("≈ {p} % du prix", { p: pct })}</p>;
                })()}
              </div>
              <div className="gen-grow">
                <label>{t("Catégorie")}</label>
                <select
                  className="input"
                  value={pub.category || "Digital"}
                  onChange={(e) => setPub({ ...pub, category: e.target.value })}
                >
                  {DIGITAL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label>
              {t("Description (optionnelle)")}
              <textarea
                className="input"
                rows={3}
                maxLength={4000}
                value={pub.description}
                onChange={(e) => setPub({ ...pub, description: e.target.value })}
                placeholder={t("Résumé du document, public visé, nombre de pages…")}
              />
            </label>
            <div className="gen-publish-actions">
              <button type="button" className="btn btn-primary" onClick={doPublish} disabled={pubBusy !== null || delBusy}>
                {pubBusy !== null ? pubBusy : meta.published_product_id ? t("Mettre à jour le produit") : t("Publier maintenant")}
              </button>
              {meta.published_product_id && (
                <button
                  type="button"
                  className="btn btn-outline gen-danger"
                  onClick={doDeleteProduct}
                  disabled={pubBusy !== null || delBusy}
                  title={t("Supprimer définitivement ce produit publié (base de données + fichier)")}
                >
                  {delBusy ? t("Suppression…") : `🗑 ${t("Supprimer le produit publié")}`}
                </button>
              )}
              <button type="button" className="btn btn-outline" onClick={() => setPub(null)} disabled={pubBusy !== null || delBusy}>
                {t("Annuler")}
              </button>
            </div>
          </div>
        </div>
      )}
      {published && !pub && (
        <p className="hint gen-published-ok" role="status">
          ✓ {published.updated ? t("Produit mis à jour") : t("Produit publié")} —{" "}
          <a href={`/produit/${published.product_id}`} target="_blank" rel="noreferrer">
            {t("voir le produit")} #{published.product_id}
          </a>
        </p>
      )}
    </section>
  );
}
// ═════════════════════════════════════════════════════════════════════════════
// Aperçu d'une page : rendu HTML des atomes mesurés (positions identiques au
// PDF jsPDF — chaque mot est dessiné à sa position mesurée).
// ═════════════════════════════════════════════════════════════════════════════
const GEN_PREVIEW_SCALE = 0.75;
const previewQrCache = new Map();

function PreviewQr({ text, style }) {
  const [src, setSrc] = useState(() => previewQrCache.get(text || "") || null);
  useEffect(() => {
    const key = text || "";
    if (!key || previewQrCache.has(key)) return undefined;
    let alive = true;
    makeQrDataUrl(key, 240).then((data) => {
      previewQrCache.set(key, data);
      if (alive) setSrc(data);
    });
    return () => { alive = false; };
  }, [text]);
  return src ? <img src={src} alt="QR de vérification" style={style} /> : (
    <div style={{ ...style, border: "1px dashed #888", display: "flex", alignItems: "center", justifyContent: "center", color: "#555" }}>QR</div>
  );
}

// Aperçu miniature du décor d'un modèle (barre, bandeau, cadre, colonne…) :
// rendu DANS la pastille de la grille de choix, pour que la différence entre
// modèles soit visible AVANT d'appliquer (l'utilisateur ne découvre plus le
// design après coup).
function decorMarks(tpl) {
  const a = tpl.colors.accent;
  const base = { position: "absolute", background: a };
  switch (tpl.pageDecor) {
    case "topbar":
      return [{ ...base, top: 0, left: 0, right: 0, height: "13%" }];
    case "bottomband":
      return [{ ...base, bottom: 0, left: 0, right: 0, height: "15%" }];
    case "sidestrip":
      return [{ ...base, top: 0, bottom: 0, left: 0, width: "13%" }];
    case "sidebartint":
      return [
        { ...base, top: 0, bottom: 0, left: 0, width: "24%", opacity: 0.4 },
        { ...base, top: 0, bottom: 0, left: "24%", width: "2%" },
      ];
    case "toprule":
      return [
        { ...base, top: "10%", left: "10%", right: "10%", height: "4%" },
        { ...base, top: "18%", left: "10%", right: "10%", height: "2%", opacity: 0.7 },
      ];
    case "doublerule":
      return [
        { ...base, top: "10%", left: "10%", right: "10%", height: "4%" },
        { ...base, bottom: "10%", left: "10%", right: "10%", height: "4%" },
      ];
    case "doubleband":
      return [
        { ...base, top: "10%", left: "10%", right: "10%", height: "4%" },
        { ...base, bottom: 0, left: 0, right: 0, height: "12%" },
      ];
    case "sideline":
      return [
        { ...base, top: "10%", bottom: "10%", right: "14%", width: "3%" },
        { ...base, top: "30%", right: "8%", width: "6%", height: "3%" },
        { ...base, top: "55%", right: "8%", width: "6%", height: "3%" },
      ];
    case "headerband":
      return [{ ...base, top: 0, left: 0, right: 0, height: "28%", opacity: 0.38 }];
    case "masthead":
      return [{ ...base, top: 0, left: 0, right: 0, height: "32%" }];
    case "noterule":
      return [{ ...base, top: "12%", bottom: "12%", left: "18%", width: "3%" }];
    case "frame":
      return [
        {
          position: "absolute",
          top: "10%",
          left: "8%",
          right: "8%",
          bottom: "10%",
          background: "transparent",
          border: `1.5px solid ${a}`,
        },
      ];
    default:
      return [];
  }
}

export function GenPage({ page, paginated, docMeta, fit }) {
  const { box, template, contentWpx, contentHpx } = paginated;
  const { w, h, m } = box;
  // Zoom : 0.75 = 75 % d'une page au 96 dpi, multiplié par le facteur
  // d'ajustement (fitScale ≤ 1 sur petit écran → la page ENTière tient dans
  // la largeur, plus de défilement horizontal sur téléphone).
  const s = GEN_PREVIEW_SCALE * (fit && fit > 0 ? fit : 1);
  // Toutes les valeurs du modèle sont en mm (page, marges) ou en pt (polices) :
  // on les convertit en px CSS (96 dpi) AVANT le zoom, comme la boîte de
  // contenu mesurée. Sans cette conversion, la boîte de contenu (px réels) était
  // 3,8 × plus large que la page et se retrouvait rognée.
  const mm = (v) => v * PX_PER_MM * s;
  const pt = (v) => v * PT_TO_PX * s;
  const pageStyle = { width: mm(w), height: mm(h) };
  // Décor géométrique du modèle : mêmes primitives sur TOUTES les pages
  // (couverture, copyright, table des matières, contenu), derrière le texte.
  const decorPrims = coverDecorPrims(template, w, h);
  const qrPayload =
    docMeta?.protection?.qrEnabled === false
      ? ""
      : verificationPayload(docMeta || {}, docMeta?.content_hash || "");
  // Pied de page / en-tête : MÊMES coordonnées que le PDF (exportPdf.js) —
  // mention MboppiShop, numéro de page et champs personnalisés se placent à la
  // même distance des bords, mesurée depuis la ligne de base (l'aperçu les
  // affichait auparavant à 1,5 mm du bas de page, sans les en-têtes).
  const hfText = (text) =>
    String(text || "")
      .replaceAll("{title}", docMeta.title || "")
      .replaceAll("{author}", docMeta.author || "")
      .replaceAll("{page}", String(page.number ?? ""));
  const footerSize = MBOPPI_PROMO_FONT_PT;
  const smallPt = template.sizes.small;
  const baselineTop = (sizePt) => mm((Number(sizePt) * BASELINE_EM) / 2.83);
  // Pied de page : 8 mm sous le texte, mais TOUJOURS dans la page même avec une
  // marge basse minimale (5 mm → sans borne, la ligne de base tombait à h+3).
  const footerBaseline = Math.min(h - m.bottom + 8, h - 6);
  const headerBaseline = m.top - 7;
  const hfBase = { position: "absolute", zIndex: 3, whiteSpace: "nowrap", color: template.colors.accent };
  const prot = docMeta.protection || {};
  const hasHeader = prot.header !== false && (prot.headerLeft || prot.headerCenter || prot.headerRight);
  const promoFooter = (
    <>
      {hasHeader && (
        <>
          {prot.headerLeft && (
            <div style={{ ...hfBase, left: mm(m.left), top: mm(headerBaseline) - baselineTop(smallPt), fontSize: pt(smallPt) }}>
              {hfText(prot.headerLeft)}
            </div>
          )}
          {prot.headerCenter && (
            <div style={{ ...hfBase, left: mm(w / 2), transform: "translateX(-50%)", top: mm(headerBaseline) - baselineTop(smallPt), fontSize: pt(smallPt) }}>
              {hfText(prot.headerCenter)}
            </div>
          )}
          {prot.headerRight && (
            <div style={{ ...hfBase, right: mm(m.right), top: mm(headerBaseline) - baselineTop(smallPt), fontSize: pt(smallPt) }}>
              {hfText(prot.headerRight)}
            </div>
          )}
        </>
      )}
      {prot.footer !== false && (
        <>
          <div style={{ ...hfBase, left: mm(m.left), top: mm(footerBaseline) - baselineTop(footerSize), fontSize: pt(footerSize), fontStyle: "italic" }}>
            visitez{" "}
            <a
              href={MBOPPI_CONTENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              {MBOPPI_CONTENT_LABEL}
            </a>{" "}
            pour plus de contenu
            {prot.footerLeft ? (
              <span style={{ fontStyle: "normal", marginLeft: mm(3) }}>{hfText(prot.footerLeft)}</span>
            ) : null}
          </div>
          <div
            style={{
              ...hfBase,
              ...(prot.footerCenter || w >= 170
                ? { left: mm(w / 2), transform: "translateX(-50%)" }
                : { right: mm(m.right) }),
              top: mm(footerBaseline) - baselineTop(smallPt),
              fontSize: pt(smallPt),
            }}
          >
            {hfText(prot.footerCenter || "{page}")}
          </div>
          {prot.footerRight && (
            <div style={{ ...hfBase, right: mm(m.right), top: mm(footerBaseline) - baselineTop(smallPt), fontSize: pt(smallPt) }}>
              {hfText(prot.footerRight)}
            </div>
          )}
        </>
      )}
    </>
  );

  if (page.kind === "cover") {
    // Mêmes règles que le PDF et la miniature produit : resolveCover +
    // coverLayoutBox (géométrie en mm convertie en % de la page).
    const cover = resolveCover(docMeta, template);
    const geo = coverLayoutBox(cover, w);
    const fg = geo.band ? "#ffffff" : cover.fg;
    const align = geo.leftish ? "left" : cover.align;
    const leftPct = (geo.x / w) * 100;
    const widthPct = (geo.maxW / w) * 100;
    return (
      <div className="gen-page" style={{ ...pageStyle, background: cover.bg, color: fg }}>
        {/* Décor géométrique du modèle : DERRIÈRE l'image de fond (l'image est
            devant), et derrière le texte. Mêmes primitives que PDF/miniature. */}
        <CoverDecor prims={decorPrims} w={w} h={h} />
        {cover.image && (
          <img
            src={cover.image}
            alt=""
            className="gen-cover-img"
            style={{ opacity: 1 - cover.dim, objectPosition: `50% ${cover.imageY ?? 30}%` }}
          />
        )}
        {cover.showTitle && (
          <div
            style={{
              position: "absolute",
              top: `${geo.yPct}%`,
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              textAlign: align,
              fontFamily: FONT_CSS[template.headingFont],
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                fontSize: pt(geo.band ? template.sizes.h1 + 4 : template.sizes.h1 + 8),
                lineHeight: 1.2, // même interligne que le PDF (drawParagraphText)
              }}
            >
              {cover.title}
            </div>
            {cover.subtitle && (
              <div style={{ fontSize: pt(template.sizes.h3), marginTop: mm(3), lineHeight: 1.3 }}>{cover.subtitle}</div>
            )}
            {cover.rule && !geo.band && (
              <div
                style={{
                  height: mm(0.9),
                  background: cover.accent,
                  width: align === "center" ? "30%" : "45%",
                  margin: align === "center" ? `${mm(3)}px auto 0` : `${mm(3)}px 0 0`,
                }}
              />
            )}
          </div>
        )}
        {qrPayload && (
          <PreviewQr
            text={qrPayload}
            style={{
              position: "absolute",
              right: mm(10),
              bottom: mm(10),
              width: mm(22),
              height: mm(22),
              zIndex: 4,
              background: "#ffffff",
            }}
          />
        )}
        {/* L'auteur n'apparaît JAMAIS sur la couverture (règle produit) : il
            reste sur la page de copyright, dans les en-têtes et les métadonnées. */}
      </div>
    );
  }

  if (page.kind === "copyright") {
    // MÊMES lignes, mêmes tailles et mêmes espacements que le PDF : le bloc est
    // construit par `copyrightBlock` (source unique) et empilé avec la même
    // arithmétique de lignes de base — plus de mentions présentes d'un seul côté.
    const detailPt = Math.max(8, template.sizes.small - 1);
    const blockItems = copyrightBlock(docMeta, { detailPt });
    const blockH = copyrightBlockHeightMm(blockItems);
    const startMm = Math.min(h * 0.4, h - 18 - blockH);
    let boxTop = startMm;
    return (
      <div className="gen-page" style={{ ...pageStyle, background: template.colors.bg, color: template.colors.body }}>
        <CoverDecor prims={decorPrims} w={w} h={h} />
        {blockItems.map((it, i) => {
          if (i > 0) {
            const prev = blockItems[i - 1];
            boxTop += (Number(prev.sizePt) * COPYRIGHT_LINE_HEIGHT) / 2.83 + (Number(it.gapMm) || 0);
          }
          if (!it.text) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                zIndex: 1,
                top: mm(boxTop),
                left: mm(m.left),
                right: mm(m.right),
                textAlign: "center",
                fontSize: pt(it.sizePt),
                lineHeight: COPYRIGHT_LINE_HEIGHT,
                color: it.tone === "accent" ? template.colors.accent : template.colors.body,
              }}
            >
              {it.text}
            </div>
          );
        })}
        {promoFooter}
      </div>
    );
  }

  if (page.kind === "toc") {
    return (
      <div className="gen-page" style={{ ...pageStyle, background: template.colors.bg, color: template.colors.body, fontFamily: FONT_CSS[template.bodyFont] }}>
        <CoverDecor prims={decorPrims} w={w} h={h} />
        <PageDecor template={template} box={box} docMeta={docMeta} scale={s} />
        <div style={{ position: "relative", zIndex: 2, padding: `${mm(m.top)}px ${mm(m.right)}px 0 ${mm(m.left)}px` }}>
          <div style={{ fontWeight: "bold", fontSize: pt(template.sizes.h2), color: template.colors.heading, lineHeight: 1.2 }}>
            Table des matières
          </div>
          {page.entries.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: mm(1), fontSize: pt(template.sizes.body), lineHeight: 1.2, marginTop: mm(1.5), paddingLeft: e.level === 1 ? 0 : mm(3) }}>
              <span style={{ fontWeight: e.level === 1 ? "bold" : "normal", color: e.level === 1 ? template.colors.heading : template.colors.body }}>
                {e.text.length > 62 ? e.text.slice(0, 62) + "…" : e.text}
              </span>
              <span style={{ flex: 1, borderBottom: `1px dotted ${template.colors.accent}` }} />
              <span>{e.page}</span>
            </div>
          ))}
        </div>
        {promoFooter}
      </div>
    );
  }

  // Page de contenu.
  return (
    <div className="gen-page" style={{ ...pageStyle, background: template.colors.bg }}>
      <CoverDecor prims={decorPrims} w={w} h={h} />
      <PageDecor template={template} box={box} docMeta={docMeta} scale={s} />
      {docMeta.protection?.watermark?.enabled && (
        <div
          className="gen-watermark"
          style={{
            fontSize: pt(watermarkPreviewFontSize(box)),
            color: docMeta.protection.watermark.color || "#555555",
            opacity: watermarkOpacity(docMeta.protection.watermark.mode),
          }}
        >
          {docMeta.protection.watermark.text || `© ${docMeta.author || "Auteur"}`}
        </div>
      )}
      {/* Boîte de texte utile : même repère que le PDF (marges incluses). */}
      <div
        style={{
          position: "absolute",
          zIndex: 1, // le texte passe devant le décor du modèle
          top: mm(m.top),
          left: mm(m.left),
          width: contentWpx,
          height: contentHpx,
          transform: `scale(${s})`,
          transformOrigin: "top left",
        }}
      >
        {page.items.map((item, i) => (
          <GenItem key={i} item={item} template={template} qrPayload={qrPayload} />
        ))}
      </div>
      {promoFooter}
    </div>
  );
}

// Un atome (bloc de lignes, image, séparateur, ligne de tableau) positionné.
function GenItem({ item, template, qrPayload }) {
  if (item.kind === "image") {
    return (
      <img
        src={item.src}
        alt=""
        style={{ position: "absolute", top: item.top, left: item.x ?? 0, width: item.w, height: item.h }}
      />
    );
  }
  if (item.kind === "hr") {
    return (
      <div
        style={{
          position: "absolute",
          top: item.top + 2,
          left: item.x ?? 0,
          width: item.w ?? "100%",
          borderTop: `1px solid ${template.colors.accent}`,
        }}
      />
    );
  }
  if (item.kind === "qr") {
    return (
      <div
        className="gen-qr-slot"
        style={{ position: "absolute", top: item.top, left: item.x ?? 0, width: item.w, height: item.h }}
      >
        <PreviewQr text={qrPayload} style={{ width: "100%", height: "100%" }} />
      </div>
    );
  }
  if (item.kind === "tableRow") {
    return (
      <>
        {item.cells.map((c, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: item.top,
              left: c.x,
              width: c.w,
              height: c.h,
              border: `1px solid ${template.colors.accent}55`,
              background: c.header ? `${template.colors.accent}22` : "transparent",
              overflow: "hidden",
            }}
          >
            {(c.lines || []).map((ln, j) => (
              <GenLine key={j} ln={ln} />
            ))}
          </div>
        ))}
      </>
    );
  }
  const decor =
    item.kind === "h1" || item.kind === "h2" ? <GenHeadingDecor item={item} template={template} /> : null;
  return (
    <>
      {decor}
      {(item.lines || []).map((ln, i) => (
        // `ln.top` est relatif à la boîte de l'atome : on y ajoute la position
        // de l'atome dans la page (sinon toutes les 3ᵉ lignes des blocs se
        // superposaient en haut de page).
        <GenLine key={i} ln={ln} top={item.top} />
      ))}
    </>
  );
}

// Décor de titre du modèle — miroir EXACT du PDF (drawHeadingDecor) : barre
// d'accent à gauche de h1 et règle sous le titre (h1, ou h1 + h2 selon le
// modèle). Sans cela, tous les designs se ressemblaient dans l'aperçu.
function GenHeadingDecor({ item, template }) {
  const ln = (item.lines || [])[0];
  if (!ln) return null;
  const lineH = ln.bottom - ln.top;
  const isH1 = item.kind === "h1";
  const rule = template.headingRule || "none";
  const bar = template.headingBar || "none";
  const lineIndex = item.lineIndex ?? 0;
  const isLast = lineIndex === (item.groupLines || 1) - 1;
  const applyRule = rule === "h1h2" || (rule === "h1" && isH1);
  const words = ln.words || [];
  const textW = words.length ? Math.max(...words.map((wd) => wd.x + wd.w)) : 0;
  // Hauteur du décor = hauteur d'encre du TITRE COMPLET (`groupH`), pas
  // `lineH` × nombre de lignes : depuis que les lignes d'un bloc sont posées à
  // leur avance réelle (interligne compris), la barre latérale du h1 couvrirait
  // sinon seulement une partie du titre.
  const decorH = item.groupH || lineH * Math.max(1, item.groupLines || 1);
  return (
    <>
      {bar === "left" && isH1 && lineIndex === 0 && (
        <div
          style={{
            position: "absolute",
            left: -5 * PX_PER_MM,
            top: item.top,
            width: 1.6 * PX_PER_MM,
            height: decorH,
            background: template.colors.accent,
          }}
        />
      )}
      {isLast && applyRule && (
        <div
          style={{
            position: "absolute",
            left: 0,
            // Chaque atome = UNE ligne : `item.top` est déjà la position de
            // cette ligne, la règle se pose donc sous son encre.
            top: item.top + ln.top + lineH + 1.4 * PX_PER_MM,
            width: isH1 ? "100%" : textW,
            height: (isH1 ? 0.7 : 0.4) * PX_PER_MM,
            background: template.colors.accent,
          }}
        />
      )}
    </>
  );
}

// Une ligne : chaque mot à sa position mesurée (fidélité aperçu = PDF).
function GenLine({ ln, top = 0 }) {
  return (
    <>
      {(ln.runs || []).map((run, i) => (
        <span key={i}>
          {run.words.map((wd, j) => (
            <span
              key={j}
              style={{
                position: "absolute",
                left: wd.x,
                top: top + ln.top,
                fontWeight: run.style.bold ? "bold" : "normal",
                fontStyle: run.style.italic ? "italic" : "normal",
                textDecoration: [run.style.underline ? "underline" : "", run.style.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
                color: run.style.color,
                fontSize: run.style.sizePx,
                fontFamily: FONT_CSS[run.style.font],
                whiteSpace: "pre",
              }}
            >
              {wd.text}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}

