// ─── Générateur de documents (ebooks/PDF) — module admin isolé ───────────────
// Onglet « Générateur » du panneau Admin. Deux vues :
//   1. Bibliothèque : documents (ouvrir, dupliquer, supprimer, nouveau) ;
//   2. Éditeur : TipTap + import TXT/MD/DOCX + design (template, couverture,
//      protection) + aperçu paginé fidèle + export PDF réel (jsPDF).
// Aucune table métier touchée : tout passe par api.gen* (/api/generator/*).

import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "../generator/templates.js";
import { useAuth } from "../App.jsx";
import { DIGITAL_CATEGORIES, countrySymbol } from "../config.js";
import { detectStructureHtml } from "../generator/structure.js";
import { detectScope } from "../generator/scope.js";
import { HeadingAutoDetect, formatHeadings } from "../generator/headings.js";
import { paginateDocument, PX_PER_MM, PT_TO_PX } from "../generator/paginate.js";
import { exportDocumentPdf, saveBlob } from "../generator/exportPdf.js";
import { exportEpub } from "../generator/epub.js";
import { checkDocument } from "../generator/check.js";
import { renderCoverImage, libraryThumb } from "../generator/coverImage.js";
import { coverDecorPrims } from "../generator/coverDecor.js";
import CoverDecor from "../generator/CoverDecor.jsx";
import {
  copyrightLines,
  sha256Hex,
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
export default function GeneratorPanel({ variant = "creator" }) {
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
  const [creating, setCreating] = useState(false);
  const [newDoc, setNewDoc] = useState({
    title: "",
    author: "",
    template_id: "moderne",
    page_format: "A4",
  });

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

  const create = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const d = await api.genCreateDocument(newDoc);
      setCreating(false);
      setNewDoc({ title: "", author: "", template_id: "moderne", page_format: "A4" });
      load();
      setOpenDoc({ document: d.document, content: d.content || EMPTY_DOC, versions: [] });
    } catch (err) {
      setError(err?.message || "Création impossible");
    } finally {
      setBusy(false);
    }
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
    return <GenEditor initialDoc={openDoc} onBack={() => { setOpenDoc(null); load(); }} />;
  }

  return (
    <section className="card section gen-section">
      <div className="gen-head">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          📚 {t("Générateur de documents")} — {t("Bibliothèque")}
        </h3>
        <button type="button" className="btn btn-primary btn-small" onClick={() => setCreating((v) => !v)}>
          ➕ {t("Nouveau document")}
        </button>
      </div>
      <p className="hint">
        {t(
          "Collez un texte brut, choisissez un modèle : le Générateur structure, pagine, ajoute couverture, table des matières et protection, puis exporte un PDF professionnel."
        )}
      </p>
      {error && <p className="error" role="alert">{error}</p>}

      {creating && (
        <form className="gen-form" onSubmit={create}>
          <div className="gen-form-row">
            <div>
              <label>{t("Titre du document")}</label>
              <input
                className="input"
                required
                maxLength={200}
                placeholder="Comment devenir entrepreneur"
                value={newDoc.title}
                onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
              />
            </div>
            <div>
              <label>{t("Auteur")}</label>
              <input
                className="input"
                maxLength={200}
                value={newDoc.author}
                onChange={(e) => setNewDoc({ ...newDoc, author: e.target.value })}
              />
            </div>
          </div>
          <div className="gen-form-row">
            <div>
              <label>{t("Modèle de design")}</label>
              <select
                className="input"
                value={newDoc.template_id}
                onChange={(e) => setNewDoc({ ...newDoc, template_id: e.target.value })}
              >
                {GEN_TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} — {tpl.category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>{t("Format de page")}</label>
              <select
                className="input"
                value={newDoc.page_format}
                onChange={(e) => setNewDoc({ ...newDoc, page_format: e.target.value })}
              >
                {Object.keys(PAGE_FORMATS).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
            {busy ? t("Création…") : t("Créer et ouvrir l'éditeur")}
          </button>
        </form>
      )}

      {list === null ? (
        <p className="hint">{t("Chargement…")}</p>
      ) : list.length === 0 ? (
        <p className="hint">{t("Aucun document pour l'instant. Créez votre premier ebook !")}</p>
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
function GenEditor({ initialDoc, onBack }) {
  const { t } = useLang();
  const { user } = useAuth();
  // Devise du PAYS du compte (XAF au Cameroun, XOF au Sénégal…), affichée sur
  // le champ prix et envoyée au serveur — plus de « XAF » en dur.
  const priceCurrency = countrySymbol(user?.country) || "XAF";
  const [meta, setMeta] = useState(initialDoc.document);
  const [versions, setVersions] = useState(initialDoc.versions || []);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [view, setView] = useState("edit"); // edit | design | preview
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [exportPct, setExportPct] = useState(null);
  const [check, setCheck] = useState(null);
  // Assistant IA (résultat relu puis inséré par l'utilisateur — jamais injecté
  // sans validation), export EPUB, publication produit.
  const [aiBusy, setAiBusy] = useState(null); // action en cours
  const [aiResult, setAiResult] = useState(null); // { action, text, replaceSel }
  const [epubStep, setEpubStep] = useState(null); // label progression EPUB
  const [pub, setPub] = useState(null); // formulaire { price, description }
  const [pubBusy, setPubBusy] = useState(null); // label d'étape ou null
  const [published, setPublished] = useState(null); // { product_id, updated }
  const [delBusy, setDelBusy] = useState(false); // suppression du produit publié
  const [formatMsg, setFormatMsg] = useState(""); // résultat de « Détecter les titres »
  // Portée du contenu détectée → design suggéré (onglet Design).
  const [scopeInfo, setScopeInfo] = useState(null);
  const hasAi = typeof meta.ai_available === "undefined" ? true : meta.ai_available;

  const contentRef = useRef(initialDoc.content || EMPTY_DOC);
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const saveTimer = useRef(null);
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
  const saveNow = useCallback(async () => {
    const m = metaRef.current;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    try {
      const d = await api.genSaveDocument(m.id, {
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
      });
      setMeta((cur) => ({ ...cur, ...d.document }));
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setError(e?.message || "Sauvegarde impossible");
    }
  }, []);

  const scheduleSave = useCallback(() => {
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
    if (previewStaleTimer.current) clearTimeout(previewStaleTimer.current);
    previewStaleTimer.current = setTimeout(() => setPreview(null), 800);
  }, []);

  // Le rapport « 🔍 DOCUMENT CHECK » reste cohérent : dès qu'un nouvel aperçu
  // paginé est construit alors que le rapport est ouvert, il est recalculé.
  useEffect(() => {
    if (!preview) return;
    setCheck((cur) => (cur ? checkDocument({ paginated: preview, docMeta: metaRef.current }) : cur));
  }, [preview]);

  const patchMeta = (patch, immediate = false) => {
    setMeta((cur) => ({ ...cur, ...patch }));
    if (immediate) setTimeout(saveNow, 0);
    else scheduleSave();
  };

  // ─── Import : TXT/MD (détection de structure) et DOCX (mammoth) ────────────
  const applyHtml = (html) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.commands.setContent(html);
    contentRef.current = ed.getJSON();
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
    setScopeInfo(detectScope(text, { templateIds: GEN_TEMPLATES.map((tpl) => tpl.id) }));
  }, []);

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
  }, [layoutKey]);
  useEffect(() => {
    if (view === "preview" && !preview && !previewBusy) buildPreview();
  }, [view, preview, previewBusy, buildPreview]);

  // Suggestion de design : (re)analysée à chaque ouverture de l'onglet Design.
  useEffect(() => {
    if (view === "design") analyzeScope();
  }, [view, analyzeScope]);

  // ─── Export PDF réel (jsPDF, mêmes positions que l'aperçu) ─────────────────
  const doExport = async () => {
    setError("");
    setExportPct(0);
    try {
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
      await api.genSaveVersion(meta.id, { label });
      const d = await api.genDocument(meta.id);
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

  const runAi = async (action, { instruction, tone, lang } = {}) => {
    setError("");
    setAiBusy(action);
    setAiResult(null);
    try {
      const m = metaRef.current;
      const d = await api.genAi({
        action,
        text: selectionText(),
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
      setAiResult({ action, text: String(d.text || "").trim() });
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
    if (res.action === "structure" && !replaceSelection) {
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

  // ─── Publication : PDF → produit digital Mboppi (chaîne réelle) ────────────
  // 1) export jsPDF en mémoire → 2) hash SHA-256 → 3) URL signée → PUT Supabase
  // direct → 4) le serveur vérifie l'objet puis crée/met à jour le produit.
  async function sha256Buffer(buf) {
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const openPublish = () => {
    setError("");
    setPub({
      price: "",
      description: "",
      title: metaRef.current.title || "",
      category: "Digital",
      commission: "",
    });
  };

  const doPublish = async () => {
    setError("");
    const price = Number(String(pub.price).replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      setError(t("Prix invalide : indiquez un montant positif."));
      return;
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
        coverData = (await renderCoverImage(metaRef.current, { width: 480 })) || "";
      } catch {
        coverData = "";
      }
      const d = await api.genPublish(meta.id, {
        key: signed.path,
        price,
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
            ["preview", t("Aperçu")],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={`gen-tab ${view === id ? "active" : ""}`}
              onClick={() => setView(id)}
            >
              {label}
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
            title={t("Exporter le PDF puis le publier comme produit digital téléchargeable dans votre boutique Mboppi")}
          >
            {meta.published_product_id ? `🛒 ${t("Produit publié")}` : `🛒 ${t("Vendre sur Mboppi")}`}
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
                  ["blurb", t("Quatrième de couverture")],
                  ["bio", t("Biographie d'auteur")],
                  ["design", t("Proposer un design")],
                ].map(([action, label]) => (
                  <button
                    key={action}
                    type="button"
                    className="btn btn-small btn-outline"
                    disabled={aiBusy !== null}
                    onClick={() => runAi(action)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {aiBusy && <p className="hint">{t("L'assistant travaille…")}</p>}
              {aiResult?.text && (
                <div className="gen-ai-result">
                  <pre>{aiResult.text}</pre>
                  <div className="gen-ai-result-actions">
                    {editor && !editor.state.selection.empty && aiResult.action !== "design" && (
                      <button type="button" className="btn btn-small btn-primary" onClick={() => applyAiResult(true)}>
                        {t("Remplacer la sélection")}
                      </button>
                    )}
                    {aiResult.action !== "design" && (
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
                    "Suggestion indicative : les 12 modèles restent disponibles ci-dessous, et vos réglages de couleurs et de polices sont conservés."
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

          <div className="gen-design-block">
            <h4>🎨 {t("Modèle de design")}</h4>
            <div className="gen-templates">
              {GEN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className={`gen-template-card ${meta.template_id === tpl.id ? "active" : ""}`}
                  onClick={() => patchMeta({ template_id: tpl.id })}
                  title={tpl.name}
                >
                  <span className="gen-tpl-swatch" style={{ background: tpl.coverBg, color: tpl.coverText }}>
                    Aa
                    {decorMarks(tpl).map((st, i) => (
                      <span key={i} style={st} />
                    ))}
                  </span>
                  <span className="gen-tpl-name">{tpl.name}</span>
                </button>
              ))}
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
                <label>{t("Marge haut/bas (mm)")}</label>
                <input
                  className="input" type="number" min={5} max={60}
                  value={meta.margins?.top ?? 20}
                  onChange={(e) => patchMeta({ margins: { ...(meta.margins || {}), top: Number(e.target.value), bottom: Number(e.target.value) } })}
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
          </div>

          <div className="gen-design-block">
            <h4>📕 {t("Couverture")}</h4>
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
                  <input className="input" value={meta.protection?.watermark?.text ?? ""} placeholder={`© ${meta.author || "Auteur"}`} onChange={(e) => patchMeta({ protection: { ...(meta.protection || {}), watermark: { ...(meta.protection?.watermark || {}), text: e.target.value } } })} />
                </div>
                <div>
                  <label>{t("Intensité")}</label>
                  <select className="input" value={meta.protection?.watermark?.mode || "discreet"} onChange={(e) => patchMeta({ protection: { ...(meta.protection || {}), watermark: { ...(meta.protection?.watermark || {}), mode: e.target.value } } })}>
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
        <div className="gen-preview-zone">
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
          {preview && (
            <div className="gen-pages">
              {preview.pages.map((page, i) => (
                <div key={i} className="gen-page-wrap">
                  <GenPage page={page} paginated={preview} docMeta={meta} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Publication : produit digital (modale légère) ──────────────────── */}
      {pub && (
        <div className="gen-publish" role="dialog" aria-modal="true" aria-label={t("Publier comme produit digital")}>
          <div className="gen-publish-card">
            <h4>🛒 {meta.published_product_id ? t("Mettre à jour le produit digital") : t("Publier comme produit digital")}</h4>
            <p className="hint">
              {t("Le PDF est généré puis téléversé dans le stockage privé de Mboppi. Le produit apparaît dans votre catalogue et le fichier devient téléchargeable par l'acheteur après confirmation du paiement.")}
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

// Décor de page du modèle de design, rendu en HTML à l'identique du PDF
// (mêmes formes, mêmes coordonnées en millimètres — voir drawPageDecor dans
// exportPdf.js). C'est ce qui rend le changement de modèle immédiatement
// visible dans l'aperçu : bandeau titre, filets, colonne, cadre, marge…
function PageDecor({ template, box, docMeta, scale }) {
  const decor = template.pageDecor;
  if (!decor) return null;
  const { w, h, m } = box;
  const mm = (v) => v * PX_PER_MM * scale;
  const accent = template.colors.accent;
  const title = String(docMeta?.title || "");
  const abs = { position: "absolute" };
  const rule = (style) => <div style={{ ...abs, background: accent, ...style }} />;
  const lw = Math.max(1, mm(0.5));

  switch (decor) {
    case "toprule":
      return (
        <>
          {rule({ left: mm(m.left), top: mm(m.top * 0.5), width: mm(w - m.right - m.left), height: mm(0.9) })}
          <div
            style={{
              ...abs,
              left: mm(m.left),
              top: mm(m.top * 0.5 + 2.2),
              width: mm(w - m.right - m.left),
              height: mm(0.25),
              background: template.colors.heading,
            }}
          />
        </>
      );
    case "topbar":
      return <div style={{ ...abs, left: 0, top: 0, width: "100%", height: mm(4.5), background: accent }} />;
    case "headerband": {
      const bh = Math.max(9, m.top * 0.62);
      return (
        <>
          <div
            style={{
              ...abs,
              left: 0,
              top: 0,
              width: "100%",
              height: mm(bh),
              background: accent,
              opacity: 0.14,
            }}
          />
          <div style={{ ...abs, left: 0, top: mm(bh), width: "100%", height: lw, background: accent }} />
          {title && (
            <div
              style={{
                ...abs,
                left: mm(m.left),
                top: mm(bh / 2 - 3),
                fontSize: mm(3.1),
                fontWeight: "bold",
                color: accent,
                fontFamily: FONT_CSS[template.headingFont],
              }}
            >
              {title.length > 58 ? `${title.slice(0, 58)}…` : title}
            </div>
          )}
        </>
      );
    }
    case "bottomband":
      return (
        <div style={{ ...abs, left: 0, bottom: 0, width: "100%", height: mm(5.5), background: accent }} />
      );
    case "sidestrip":
      return <div style={{ ...abs, left: 0, top: 0, width: mm(4), height: "100%", background: accent }} />;
    case "frame": {
      const pad = Math.max(4, m.left * 0.42);
      return (
        <>
          <div
            style={{
              ...abs,
              left: mm(pad),
              top: mm(pad),
              width: mm(w - pad * 1.5),
              height: mm(h - pad),
              border: `${lw}px solid ${accent}`,
              boxSizing: "border-box",
            }}
          />
          {rule({ left: mm(m.left), top: mm(m.top * 0.5), width: mm(w - m.right - m.left), height: mm(0.6) })}
        </>
      );
    }
    case "doublerule":
      return (
        <>
          {rule({ left: mm(m.left), top: mm(m.top * 0.45), width: mm(w - m.right - m.left), height: mm(1) })}
          {rule({ left: mm(m.left), top: mm(m.top * 0.45 + 2), width: mm(w - m.right - m.left), height: mm(0.3) })}
          {rule({ left: mm(m.left), bottom: mm(m.bottom * 0.55), width: mm(w - m.right - m.left), height: mm(1) })}
          {rule({ left: mm(m.left), bottom: mm(m.bottom * 0.55 + 2), width: mm(w - m.right - m.left), height: mm(0.3) })}
        </>
      );
    case "noterule": {
      const x = Math.max(5, m.left - 6);
      const top = m.top * 0.6;
      const bottom = h - m.bottom * 0.6;
      return (
        <>
          <div
            style={{
              ...abs,
              left: mm(x),
              top: mm(top),
              width: mm(0.7),
              height: mm(bottom - top),
              background: accent,
            }}
          />
          <div style={{ ...abs, left: mm(x - 1.2), top: mm(top - 1.2), width: mm(4.8), height: mm(2.4), background: accent }} />
          <div style={{ ...abs, left: mm(x - 1.2), top: mm(bottom - 1.2), width: mm(4.8), height: mm(2.4), background: accent }} />
        </>
      );
    }
    case "sidebartint": {
      const bw = Math.max(12, m.left * 0.8);
      return (
        <>
          <div style={{ ...abs, left: 0, top: 0, width: mm(bw), height: "100%", background: accent, opacity: 0.12 }} />
          {rule({ left: mm(bw), top: 0, width: lw, height: "100%" })}
        </>
      );
    }
    case "doubleband":
      return (
        <>
          {rule({ left: mm(m.left), top: mm(m.top * 0.45), width: mm(w - m.right - m.left), height: mm(1.1) })}
          <div style={{ ...abs, left: 0, bottom: 0, width: "100%", height: mm(4.2), background: accent }} />
        </>
      );
    case "sideline": {
      const x = Math.min(w - 6, w - m.right + 6);
      const top = m.top * 0.6;
      const bottom = h - m.bottom * 0.6;
      const ticks = [];
      for (let y = top; y <= bottom; y += 20) {
        ticks.push(rule({ left: mm(x - 2.4), top: mm(y), width: mm(2.4), height: mm(0.5) }));
      }
      return (
        <>
          <div
            style={{
              ...abs,
              left: mm(x),
              top: mm(top),
              width: mm(0.6),
              height: mm(bottom - top),
              background: accent,
            }}
          />
          {ticks}
        </>
      );
    }
    case "masthead": {
      // Hauteur bornée SOUS la ligne d'en-tête (m.top - 7), comme le PDF.
      const bh = Math.max(8, Math.min(m.top * 0.55, m.top - 8));
      return (
        <>
          <div style={{ ...abs, left: 0, top: 0, width: "100%", height: mm(bh), background: accent }} />
          {title && (
            <div
              style={{
                ...abs,
                left: mm(m.left),
                top: mm(bh / 2 - 3.4),
                fontSize: mm(4.2),
                fontWeight: "bold",
                color: "#ffffff",
                fontFamily: FONT_CSS[template.headingFont],
              }}
            >
              {title.length > 52 ? `${title.slice(0, 52)}…` : title}
            </div>
          )}
          <div
            style={{
              ...abs,
              left: 0,
              top: mm(bh),
              width: "100%",
              height: mm(0.6),
              background: template.colors.heading,
            }}
          />
        </>
      );
    }
    default:
      return null;
  }
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

function GenPage({ page, paginated, docMeta }) {
  const { box, template, contentWpx, contentHpx } = paginated;
  const { w, h, m } = box;
  const s = GEN_PREVIEW_SCALE; // zoom : 0.75 = 75 % d'une page au 96 dpi
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
        {cover.image && (
          <img
            src={cover.image}
            alt=""
            className="gen-cover-img"
            style={{ opacity: 1 - cover.dim, objectPosition: `50% ${cover.imageY ?? 30}%` }}
          />
        )}
        {/* Décor géométrique du modèle : mêmes primitives que PDF/miniature. */}
        <CoverDecor prims={decorPrims} w={w} h={h} />
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
              }}
            >
              {cover.title}
            </div>
            {cover.subtitle && (
              <div style={{ fontSize: pt(template.sizes.h3), marginTop: mm(3) }}>{cover.subtitle}</div>
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
        {cover.author && (
          <div
            className="gen-cover-author"
            style={{
              bottom: geo.band ? mm(4) : mm(6),
              left: `${(geo.pad / w) * 100}%`,
              width: `${((w - geo.pad * 2) / w) * 100}%`,
              textAlign: geo.band ? "right" : align,
              fontSize: pt(template.sizes.h4),
            }}
          >
            {cover.author}
          </div>
        )}
      </div>
    );
  }

  if (page.kind === "copyright") {
    return (
      <div className="gen-page" style={{ ...pageStyle, background: template.colors.bg, color: template.colors.body }}>
        <CoverDecor prims={decorPrims} w={w} h={h} />
        <div className="gen-cover-body" style={{ top: "40%", left: mm(m.left), right: mm(m.right), fontSize: pt(template.sizes.small), lineHeight: 1.6, whiteSpace: "pre-line" }}>
          {copyrightLines(docMeta).join("\n")}
          <div style={{ marginTop: mm(4), color: template.colors.accent }}>Référence : {docMeta.doc_ref}</div>
        </div>
      </div>
    );
  }

  if (page.kind === "toc") {
    return (
      <div className="gen-page" style={{ ...pageStyle, background: template.colors.bg, color: template.colors.body, fontFamily: FONT_CSS[template.bodyFont] }}>
        <CoverDecor prims={decorPrims} w={w} h={h} />
        <PageDecor template={template} box={box} docMeta={docMeta} scale={s} />
        <div style={{ padding: `${mm(m.top)}px ${mm(m.right)}px 0 ${mm(m.left)}px` }}>
          <div style={{ fontWeight: "bold", fontSize: pt(template.sizes.h2), color: template.colors.heading }}>
            Table des matières
          </div>
          {page.entries.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: mm(1), fontSize: pt(template.sizes.body), marginTop: mm(1.5), paddingLeft: e.level === 1 ? 0 : mm(3) }}>
              <span style={{ fontWeight: e.level === 1 ? "bold" : "normal", color: e.level === 1 ? template.colors.heading : template.colors.body }}>
                {e.text.length > 62 ? e.text.slice(0, 62) + "…" : e.text}
              </span>
              <span style={{ flex: 1, borderBottom: `1px dotted ${template.colors.accent}` }} />
              <span>{e.page}</span>
            </div>
          ))}
        </div>
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
            fontSize: pt(42),
            color: docMeta.protection.watermark.color || "#555555",
            opacity: docMeta.protection.watermark.mode === "visible" ? 0.16 : 0.06,
          }}
        >
          {docMeta.protection.watermark.text || `© ${docMeta.author || "Auteur"}`}
        </div>
      )}
      {/* Boîte de texte utile : même repère que le PDF (marges incluses). */}
      <div
        style={{
          position: "absolute",
          top: mm(m.top),
          left: mm(m.left),
          width: contentWpx,
          height: contentHpx,
          transform: `scale(${s})`,
          transformOrigin: "top left",
        }}
      >
        {page.items.map((item, i) => (
          <GenItem key={i} item={item} template={template} />
        ))}
      </div>
      <div className="gen-page-footer" style={{ bottom: mm(1.5), fontSize: pt(template.sizes.small), color: template.colors.accent }}>
        {page.number}
      </div>
    </div>
  );
}

// Un atome (bloc de lignes, image, séparateur, ligne de tableau) positionné.
function GenItem({ item, template }) {
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
        <span>QR</span>
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
  return (
    <>
      {bar === "left" && isH1 && lineIndex === 0 && (
        <div
          style={{
            position: "absolute",
            left: -5 * PX_PER_MM,
            top: item.top,
            width: 1.6 * PX_PER_MM,
            height: lineH * Math.max(1, item.groupLines || 1),
            background: template.colors.accent,
          }}
        />
      )}
      {isLast && applyRule && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: item.top + lineH + 1.4 * PX_PER_MM,
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

