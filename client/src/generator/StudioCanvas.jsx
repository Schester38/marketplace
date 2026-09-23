// ─── Canvas éditable du Studio (§3 « modification directe sur la page ») ────
// Chaque page est rendue au centre comme un VRAI canvas éditable : clic pour
// sélectionner, déplacement avec guides magnétiques, 8 poignées de
// redimensionnement, rotation, édition du texte EN PLACE (double-clic).
// Repère identique au PDF (millimètres, origine haut-gauche) : aperçu = export.
// Les interactions ne mutent JAMAIS les pages ici : chaque geste commence par
// `onBeginGesture(label)` (instantané d'historique côté DocStudio), continue
// par `onPatch` (mise à jour vive, sans historique) et finit par `onEndGesture`.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PX_PER_MM, PT_TO_PX } from "./paginate.js";
import { FONT_CSS } from "./templates.js";
import { sortedElements, snapBox, cssAlpha, applyTokens, round1, overflowPx, isTextType, elementLabel } from "./studioModel.js";
import PageDecor from "./PageDecor.jsx";
import CoverDecor from "./CoverDecor.jsx";
import { coverDecorPrims } from "./coverDecor.js";
import { makeQrDataUrl } from "./protection.js";

const mm2px = (v, zoom = 1) => Number(v || 0) * PX_PER_MM * zoom;
const pt2px = (v, zoom = 1) => Number(v || 0) * PT_TO_PX * zoom;

// Sécuration minimale du HTML édité en place (scripts, iframes et attributs
// d'événements retirés — le reste, y compris gras/italique/liens, est gardé).
function sanitizeHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  for (const bad of div.querySelectorAll("script,iframe,object,embed,link,meta")) bad.remove();
  for (const node of div.querySelectorAll("*")) {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || (name === "href" && /^\s*javascript:/i.test(attr.value))) {
        node.removeAttribute(attr.name);
      }
    }
  }
  return div.innerHTML;
}

// Aperçu QR (vrai QR, même générateur que l'export PDF), mis en cache.
const qrCache = new Map();
function QrPreview({ url }) {
  const [src, setSrc] = useState(() => qrCache.get(url || " ") || null);
  useEffect(() => {
    const key = url || " ";
    if (qrCache.has(key)) return undefined;
    let alive = true;
    makeQrDataUrl(key, 240)
      .then((d) => {
        qrCache.set(key, d);
        if (alive) setSrc(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  if (src) return <img src={src} alt="QR" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
  return <div className="studio-el-placeholder">▣ QR…</div>;
}

// Style du modèle → CSS texte (police, taille, couleur, décoration, fond…).
function textStyle(el, zoom) {
  const s = el.style || {};
  const deco = [s.underline && "underline", s.strike && "line-through"].filter(Boolean);
  const out = {
    fontFamily: FONT_CSS[s.font] || FONT_CSS.serif,
    fontSize: pt2px(s.size || 11, zoom),
    lineHeight: String(s.lineHeight || 1.5),
    color: s.color || "#111",
    textAlign: s.align || "left",
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? "italic" : "normal",
    textDecoration: deco.length ? deco.join(" ") : "none",
    letterSpacing: s.letterSpacing ? pt2px(s.letterSpacing, zoom) : undefined,
    textTransform: s.uppercase ? "uppercase" : undefined,
    textIndent: s.indent ? mm2px(s.indent, zoom) : undefined,
    columnCount: s.columns > 1 ? s.columns : undefined,
    columnGap: s.columns > 1 ? mm2px(6, zoom) : undefined,
    padding: s.padding ? mm2px(s.padding, zoom) : undefined,
    background: s.bg && s.bg !== "transparent" ? cssAlpha(s.bg, (s.bgOpacity ?? 100) / 100) : undefined,
    borderRadius: s.radius ? mm2px(s.radius, zoom) : undefined,
    "--ps": s.paraSpace ? `${mm2px(s.paraSpace, zoom)}px` : "0px",
  };
  const bw = s.border ? mm2px(s.border, zoom) : 0;
  if (bw) {
    const color = s.borderColor || "#111";
    if (s.borderSide === "all") out.border = `${bw}px solid ${color}`;
    else if (s.borderSide === "left") out.borderLeft = `${bw}px solid ${color}`;
    else if (s.borderSide === "top") out.borderTop = `${bw}px solid ${color}`;
  }
  return out;
}
// ─── Barre de mise en forme SUR SÉLECTION (§4) ──────────────────────────────
// Une sélection de quelques mots doit pouvoir être mise en forme sans toucher
// au reste du document : `execCommand` agit sur la portion sélectionnée du
// contentEditable, et le HTML obtenu est assaini par sanitizeHtml (gras,
// italique, souligné, barré, surlignage, listes, liens et indentation gardés).
const FMT_BUTTONS = [
  { cmd: "bold", label: "G", title: "Gras" },
  { cmd: "italic", label: "I", title: "Italique" },
  { cmd: "underline", label: "S", title: "Souligné" },
  { cmd: "strikeThrough", label: "S̶", title: "Barré" },
  { cmd: "hiliteColor", value: "#fde68a", label: "🖍", title: "Surlignage" },
  { cmd: "insertUnorderedList", label: "•", title: "Liste à puces" },
  { cmd: "insertOrderedList", label: "1.", title: "Liste numérotée" },
  { cmd: "outdent", label: "⇤", title: "Désindenter" },
  { cmd: "indent", label: "⇥", title: "Indenter" },
];
const FMT_ALIGN = [
  { cmd: "justifyLeft", label: "⯇", title: "Aligner à gauche" },
  { cmd: "justifyCenter", label: "≡", title: "Centrer" },
  { cmd: "justifyRight", label: "⯈", title: "Aligner à droite" },
  { cmd: "justifyFull", label: "▤", title: "Justifier" },
];
function runFmt(cmd, value) {
  try {
    document.execCommand("styleWithCSS", false, true);
    document.execCommand(cmd, false, value);
  } catch { /* commande non supportée par le navigateur : ignorée */ }
}
function promptLink() {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const url = window.prompt("Lien (https://…)", "https://");
  if (!url) return;
  // La sélection est rétablie avant d'appliquer le lien (le prompt l'a perdue).
  if (range && sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  runFmt("createLink", url);
}

// ─── Élément texte (§4 : édition riche directement sur la page) ─────────────
function TextView({ el, zoom, editing, onCommitHtml, tokensCtx }) {
  const ref = useRef(null);
  const html = useMemo(
    () => (el.data?.pre ? (el.html || "").replace(/\n/g, "<br>") : applyTokens(el.html || "", tokensCtx)),
    [el.html, el.data?.pre, tokensCtx],
  );
  // Contenu posé UNE FOIS à l'entrée en édition (composant non contrôlé : on
  // ne re-render jamais depuis le modèle pendant la frappe, le curseur sauterait).
  useEffect(() => {
    if (editing && ref.current) ref.current.innerHTML = html;
  }, [editing, html]);
  return (
    <>
      {editing ? (
        <div
          className="studio-fmt"
          style={{ transform: `scale(${round1(1 / (zoom || 1))})` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {FMT_BUTTONS.map((b) => (
            <button key={b.cmd} type="button" title={b.title} onMouseDown={(e) => { e.preventDefault(); runFmt(b.cmd, b.value); }}>
              {b.label}
            </button>
          ))}
          <span className="studio-fmt-sep" />
          {FMT_ALIGN.map((b) => (
            <button key={b.cmd} type="button" title={b.title} onMouseDown={(e) => { e.preventDefault(); runFmt(b.cmd); }}>
              {b.label}
            </button>
          ))}
          <span className="studio-fmt-sep" />
          <button type="button" title="Insérer un lien" onMouseDown={(e) => { e.preventDefault(); promptLink(); }}>
            🔗
          </button>
        </div>
      ) : null}
      <div
        ref={ref}
        className={`studio-text ${el.data?.pre ? "studio-pre" : ""} ${editing ? "editing" : ""}`}
        style={textStyle(el, zoom)}
        contentEditable={editing || undefined}
        suppressContentEditableWarning
        spellCheck={editing || undefined}
        onBlur={editing ? (e) => onCommitHtml(sanitizeHtml(e.currentTarget.innerHTML)) : undefined}
        {...(editing ? {} : { dangerouslySetInnerHTML: { __html: html } })}
      />
    </>
  );
}

// ─── Élément forme (rectangle, cercle, ligne, polygone, triangle…) ──────────
function ShapeView({ el, zoom }) {
  const s = el.style || {};
  const { w, h } = el.box;
  const kind = el.data?.shapeKind;
  if (el.type === "line" || el.type === "divider") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          borderTop: `${Math.max(1, mm2px(s.strokeWidth || 0.8, zoom))}px ${s.dash === "dashed" ? "dashed" : "solid"} ${s.stroke || "#111"}`,
        }}
      />
    );
  }
  if (kind === "poly" && Array.isArray(el.data?.pts) && el.data.pts.length > 2) {
    const pts = el.data.pts
      .map(([x, y]) => `${(x / Math.max(w, 0.1)) * 100}%,${(y / Math.max(h, 0.1)) * 100}%`)
      .join(",");
    return <div style={{ width: "100%", height: "100%", clipPath: `polygon(${pts})`, background: cssAlpha(s.fill || "#111", (s.fillOpacity ?? 100) / 100) }} />;
  }
  const style = {
    width: "100%",
    height: "100%",
    background: cssAlpha(s.fill || "transparent", (s.fillOpacity ?? 100) / 100),
    border: s.strokeWidth ? `${mm2px(s.strokeWidth, zoom)}px solid ${s.stroke || "#111"}` : undefined,
    boxSizing: "border-box",
  };
  if (el.type === "circle" || kind === "circle") style.borderRadius = "50%";
  if (kind === "triangle") style.clipPath = "polygon(50% 0, 100% 100%, 0 100%)";
  if (kind === "diamond") style.clipPath = "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)";
  return <div style={style} />;
}
// ─── Éléments média (image, galerie, icône, logo, QR) ───────────────────────
function MediaView({ el, zoom }) {
  const s = el.style || {};
  const frame = {
    width: "100%",
    height: "100%",
    borderRadius: s.radius ? mm2px(s.radius, zoom) : undefined,
    border: s.border ? `${mm2px(s.border, zoom)}px solid ${s.borderColor || "#111"}` : undefined,
    overflow: "hidden",
    background: s.bg && s.bg !== "transparent" ? cssAlpha(s.bg, (s.bgOpacity ?? 100) / 100) : undefined,
    boxSizing: "border-box",
  };
  if (el.type === "icon") {
    return (
      <div style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center", fontSize: pt2px(s.size || 24, zoom), color: s.color || "#111" }}>
        {el.data?.glyph || "✦"}
      </div>
    );
  }
  if (el.type === "qr") {
    return <div style={frame}>{el.data?.url ? <QrPreview url={el.data.url} /> : <div className="studio-el-placeholder">▣ QR</div>}</div>;
  }
  if (el.type === "gallery") {
    const items = (el.data?.items || []).filter(Boolean);
    if (!items.length) {
      return (
        <div style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="studio-el-placeholder">🖼️ Galerie vide</div>
        </div>
      );
    }
    return (
      <div style={{ ...frame, display: "grid", gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 1fr)`, gap: mm2px(1.5, zoom) }}>
        {items.map((src, i) => (
          <img key={i} src={src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ))}
      </div>
    );
  }
  // image / logo
  if (!el.src) {
    return (
      <div style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="studio-el-placeholder">{el.type === "logo" ? "🏷️ Logo" : "🖼️ Image"}</div>
      </div>
    );
  }
  return (
    <img
      src={el.src}
      alt={el.name || ""}
      draggable={false}
      style={{ ...frame, width: "100%", height: "100%", objectFit: s.fit === "contain" ? "contain" : "cover" }}
    />
  );
}
// ─── Éléments de données (tableau, graphique, diagramme, statistiques, TOC) ─
function DataView({ el, template, zoom }) {
  const d = el.data || {};
  const accent = template?.colors?.accent || "#1d4ed8";
  const bodyFont = FONT_CSS[template?.bodyFont] || FONT_CSS.serif;
  const bodyColor = template?.colors?.body || "#111";
  if (el.type === "table") {
    const rows = d.rows || [];
    const cols = d.colWidths && d.colWidths.length ? d.colWidths : rows[0]?.map(() => 1) || [];
    const total = cols.reduce((a, b) => a + b, 0) || 1;
    return (
      <table className="studio-table" style={{ width: "100%", height: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: pt2px(template?.sizes?.small || 8, zoom), fontFamily: bodyFont }}>
        <colgroup>
          {cols.map((w, i) => (
            <col key={i} style={{ width: `${(w / total) * 100}%` }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {(row || []).map((c, ci) => (
                <td
                  key={ci}
                  style={{
                    border: `1px solid ${cssAlpha(accent, 0.55)}`,
                    padding: mm2px(1, zoom),
                    background: c.header ? cssAlpha(accent, 0.14) : undefined,
                    fontWeight: c.header ? 700 : 400,
                    textAlign: c.align || "left",
                    color: bodyColor,
                    overflow: "hidden",
                  }}
                >
                  {c.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (el.type === "chart") {
    const series = d.series || [];
    const max = Math.max(1, ...series.map((p) => Number(p.value) || 0));
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", gap: mm2px(1, zoom), fontFamily: bodyFont }}>
        {d.title ? <div style={{ fontSize: pt2px(template?.sizes?.small || 8, zoom), fontWeight: 700, color: template?.colors?.heading || "#111" }}>{d.title}</div> : null}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: mm2px(2, zoom) }}>
          {series.map((p, i) => (
            <div key={i} style={{ flex: 1, height: `${((Number(p.value) || 0) / max) * 100}%`, minHeight: 2, background: cssAlpha(accent, 0.75), borderRadius: mm2px(0.8, zoom) }} title={`${p.label} : ${p.value}`} />
          ))}
        </div>
        <div style={{ display: "flex", gap: mm2px(2, zoom), fontSize: pt2px((template?.sizes?.small || 8) - 1, zoom), color: bodyColor }}>
          {series.map((p, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.label}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (el.type === "diagram") {
    const nodes = d.nodes || [];
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: mm2px(2, zoom), fontFamily: bodyFont }}>
        {nodes.map((n, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <div style={{ flex: "0 0 auto", color: cssAlpha(accent, 0.8), fontSize: pt2px(10, zoom) }}>➜</div> : null}
            <div style={{ flex: 1, border: `1px solid ${cssAlpha(accent, 0.5)}`, borderRadius: mm2px(2, zoom), padding: mm2px(1.5, zoom), textAlign: "center", fontSize: pt2px(template?.sizes?.small || 8, zoom), color: bodyColor, overflow: "hidden" }}>
              {n.text}
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }
  if (el.type === "stats") {
    const items = d.items || [];
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", gap: mm2px(3, zoom), fontFamily: bodyFont }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: pt2px((template?.sizes?.h2 || 16) * 0.9, zoom), fontWeight: 800, color: accent }}>{it.value}</div>
            <div style={{ fontSize: pt2px(template?.sizes?.small || 8, zoom), color: bodyColor }}>{it.label}</div>
          </div>
        ))}
      </div>
    );
  }
  if (el.type === "toc") {
    const entries = d.entries || [];
    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: bodyFont }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: mm2px(1, zoom), paddingLeft: mm2px((Number(e.level) || 1) * 4, zoom), fontSize: pt2px(template?.sizes?.body || 10, zoom), color: bodyColor, lineHeight: 1.7 }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.text}</span>
            <span style={{ flex: 1, borderBottom: `1px dotted ${cssAlpha(accent, 0.6)}`, transform: "translateY(-3px)" }} />
            <span>{e.page}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
// ─── Composant principal : page éditable ────────────────────────────────────
// Props :
//  - page / box / template / docMeta / totalPages : données de la page
//  - zoom : échelle d'affichage (1 = taille réelle en px CSS)
//  - selectedIds : ids d'éléments sélectionnés
//  - showHidden : affiche les calques masqués en fantôme
//  - readOnly : mode aperçu (aucune interaction)
//  - onSelect(ids, additive) · onBeginGesture(label) · onPatch(patches) ·
//    onEndGesture() : protocole d'historique géré par DocStudio
//  - onElementDblClick(el) : double-clic non texte (image, tableau, graphique…)
//  - onElementMenu(el, x, y) : clic droit (menu contextuel DocStudio)
export default function StudioCanvas({
  page,
  box,
  template,
  docMeta,
  totalPages = 1,
  zoom = 1,
  selectedIds = [],
  showHidden = false,
  readOnly = false,
  lockContent = false,
  lockDesign = false,
  onSelect,
  onBeginGesture,
  onPatch,
  onEndGesture,
  onElementDblClick,
  onElementMenu,
  onDelete,
}) {
  const gesture = useRef(null);
  const [guides, setGuides] = useState([]);
  const [ghost, setGhost] = useState(null); // Map id → boîte (pendant le geste)
  const [editingId, setEditingId] = useState(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const tokensCtx = useMemo(
    () => ({
      page: page.number,
      pages: totalPages,
      title: docMeta?.title,
      author: docMeta?.author,
      ref: docMeta?.doc_ref,
    }),
    [page.number, totalPages, docMeta],
  );
  const els = useMemo(() => sortedElements(page), [page]);
  const elMap = useMemo(() => new Map(els.map((e) => [e.id, e])), [els]);

  // ─── Gestes : déplacement, redimensionnement, rotation (§5) ────────────────
  // Chaque geste : instantané d'historique au départ (onBeginGesture), mises à
  // jour vives via onPatch pendant le mouvement (guides magnétiques via
  // snapBox), validation à la fin. Un déplacement < 3 px est un simple clic.
  const startGesture = useCallback(
    (ev, mode, handle, el) => {
      if (readOnly || lockDesign || !el || el.locked) return;
      ev.preventDefault();
      ev.stopPropagation();
      const ids =
        mode === "move" && selectedIds.includes(el.id) && selectedIds.length > 1
          ? selectedIds.filter((id) => !elMap.get(id)?.locked)
          : [el.id];
      const startBoxes = ids
        .map((id) => elMap.get(id))
        .filter(Boolean)
        .map((o) => ({ id: o.id, box: { ...o.box }, rot: Number(o.rot) || 0 }));
      if (!startBoxes.length) return;
      const g = { mode, handle, startBoxes, sx: ev.clientX, sy: ev.clientY, moved: false, primary: startBoxes[0] };
      gesture.current = g;
      const labels = { move: "Élément déplacé", resize: "Élément redimensionné", rotate: "Élément pivoté" };
      onBeginGesture?.(labels[mode] || "Élément modifié");

      const onMove = (e2) => {
        if (gesture.current !== g) return;
        const dxMm = (e2.clientX - g.sx) / (PX_PER_MM * zoom);
        const dyMm = (e2.clientY - g.sy) / (PX_PER_MM * zoom);
        if (!g.moved && Math.hypot(e2.clientX - g.sx, e2.clientY - g.sy) < 3) return;
        g.moved = true;
        const others = els.filter((o) => !ids.includes(o.id) && !o.hidden);

        if (mode === "move") {
          const raw = { x: g.primary.box.x + dxMm, y: g.primary.box.y + dyMm, w: g.primary.box.w, h: g.primary.box.h };
          const snapped = snapBox(raw, { page: box, others, axes: "xy" });
          const adjX = snapped.box.x - raw.x;
          const adjY = snapped.box.y - raw.y;
          onPatch?.(startBoxes.map(({ id, box: b }) => ({ id, patch: { box: { x: round1(b.x + dxMm + adjX), y: round1(b.y + dyMm + adjY) } } })));
          setGuides(snapped.guides);
          return;
        }
        if (mode === "resize") {
          const b0 = g.primary.box;
          let { x, y, w, h } = b0;
          const H = g.handle || "";
          if (H.includes("w")) x = b0.x + dxMm, w = b0.w - dxMm;
          if (H.includes("e")) w = b0.w + dxMm;
          if (H.includes("n")) y = b0.y + dyMm, h = b0.h - dyMm;
          if (H.includes("s")) h = b0.h + dyMm;
          // Ratio conservé (côtés diagonaux d'une image, d'un logo, d'un QR…).
          const keepRatio = /image|logo|gallery|qr|icon/.test(el.type) || e2.shiftKey;
          if (keepRatio && H.length === 2 && b0.w > 0) {
            const ratio = b0.h / b0.w;
            if (w < 4) w = 4;
            h = w * ratio;
            if (H.includes("n")) y = b0.y + b0.h - h;
          }
          w = Math.max(4, w);
          h = Math.max(2, h);
          let nb = { x: round1(x), y: round1(y), w: round1(w), h: round1(h) };
          const snapped = snapBox(nb, { page: box, others, axes: H.length === 1 ? (H === "n" || H === "s" ? "y" : "x") : "xy" });
          nb = { ...nb, x: round1(snapped.box.x), y: round1(snapped.box.y), w: round1(snapped.box.w), h: round1(snapped.box.h) };
          onPatch?.([{ id: el.id, patch: { box: nb } }]);
          setGuides(snapped.guides);
          return;
        }
        if (mode === "rotate") {
          const cx = (box.w * PX_PER_MM * zoom) / 2;
          const cy = (box.h * PX_PER_MM * zoom) / 2;
          const ang = (Math.atan2(e2.clientY - cy, e2.clientX - cx) * 180) / Math.PI + 90;
          const deg = Math.round(((ang % 360) + 360) % 360);
          const snapped = e2.shiftKey ? deg : Math.round(deg / 15) * 15; // pas de 15° sans Maj
          onPatch?.([{ id: el.id, patch: { rot: snapped % 360 } }]);
        }
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (g.moved) onEndGesture?.();
        else onEndGesture?.("cancel"); // clic sans mouvement → instantané abandonné
        gesture.current = null;
        setGuides([]);
        setGhost(null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [readOnly, lockDesign, selectedIds, elMap, els, box, zoom, onBeginGesture, onPatch, onEndGesture],
  );
  // ─── Clavier (§5 : flèches = déplacement fin, Suppr, Échap) ─────────────────
  useEffect(() => {
    if (readOnly) return undefined;
    const onKey = (e) => {
      if (gesture.current) return;
      const tag = document.activeElement?.tagName;
      const inEditor = document.activeElement?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA";
      if (inEditor) {
        if (e.key === "Escape" && editingId) setEditingId(null);
        return;
      }
      if (!selectedIds.length || lockDesign) return;
      const targets = selectedIds.map((id) => elMap.get(id)).filter(Boolean).filter((o) => !o.locked);
      if (!targets.length) return;
      const step = e.shiftKey ? 5 : 1; // pas fin 1 mm, pas large 5 mm (Maj)
      const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (move) {
        e.preventDefault();
        onBeginGesture?.("Élément déplacé (clavier)");
        onPatch?.(targets.map((o) => ({ id: o.id, patch: { box: { x: round1(o.box.x + move[0]), y: round1(o.box.y + move[1]) } } })));
        onEndGesture?.();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && onDelete) {
        e.preventDefault();
        onBeginGesture?.("Élément supprimé");
        onDelete(selectedIds);
        onEndGesture?.();
      }
      if (e.key === "Escape") onSelect?.([], false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, lockDesign, selectedIds, elMap, editingId, onBeginGesture, onPatch, onEndGesture, onDelete, onSelect]);

  // ─── Débordements de la page (§20 « ⚠️ Ce contenu dépasse de N px ») ────────
  const overflow = useMemo(() => overflowPx(page, box), [page, box]);

  const commitEdit = useCallback(
    (el, html) => {
      setEditingId(null);
      const clean = sanitizeHtml(html);
      if (clean !== (el.html || "")) {
        onBeginGesture?.("Texte modifié");
        onPatch?.([{ id: el.id, patch: { html: clean } }]);
        onEndGesture?.();
      }
    },
    [onBeginGesture, onPatch, onEndGesture],
  );

  const handleClick = (ev, el) => {
    if (readOnly || gesture.current) return;
    ev.stopPropagation();
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      const next = selectedIds.includes(el.id) ? selectedIds.filter((id) => id !== el.id) : [...selectedIds, el.id];
      onSelect?.(next, true);
    } else if (!selectedIds.includes(el.id)) {
      onSelect?.([el.id], false);
    }
  };
  const handleDblClick = (ev, el) => {
    if (readOnly || lockContent || el.locked) return;
    ev.stopPropagation();
    if (isTextType(el) || el.type === "header" || el.type === "footer" || el.type === "pageNumber") {
      onSelect?.([el.id], false);
      setEditingId(el.id);
    } else {
      onElementDblClick?.(el);
    }
  };
  const handleContext = (ev, el) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (el && !selectedIds.includes(el.id)) onSelect?.([el.id], false);
    onElementMenu?.(el || null, ev.clientX, ev.clientY);
  };
  const W = mm2px(box.w, zoom);
  const H = mm2px(box.h, zoom);
  // Fond de la page : celui du modèle de design (page.design.bg, sinon thème).
  const bg = page?.design?.bg || template?.colors?.page || template?.colors?.bg || "#ffffff";
  // Décor géométrique du modèle (coverShape : arc, bars, circle, diag…) :
  // les MÊMES primitives que l'aperçu classique et le PDF classique (depuis
  // 1.57.70) — sans cela, « Moderne / Motivation / Santé / Cuisine » perdent
  // leur arc dans l'onglet Aperçu devenu Studio depuis 1.57.80.
  const coverPrims = coverDecorPrims(template, box.w, box.h);
  // Décor de page du modèle : `page.design.decor` (null explicite = pas de
  // décor, ex. couverture) ; repli sur le modèle quand la page n'en porte pas
  // (anciens documents) pour que le décor s'affiche sur TOUTES les pages.
  const pageDecor =
    page?.design && "decor" in page.design ? page.design.decor : template?.pageDecor ?? null;

  return (
    <div
      className={`studio-page ${readOnly ? "studio-page-readonly" : ""}`}
      style={{ width: W, height: H, background: bg }}
      onPointerDown={(e) => {
        if (!gesture.current && e.target === e.currentTarget) onSelect?.([], false);
      }}
      onContextMenu={(e) => handleContext(e, null)}
    >
      {/* Décor géométrique du modèle (primitives coverShape) : dessiné en
          premier, derrière tout — identique à l'aperçu et au PDF classiques. */}
      <CoverDecor prims={coverPrims} w={box.w} h={box.h} />
      {/* Décor du modèle (bandeau, filets, colonne, cadre) : rendu en PREMIER,
          donc DERRIÈRE tous les éléments — le Studio affiche exactement ce que
          le PDF dessine, sans jamais recouvrir le texte (z-index 0). */}
      <PageDecor
        template={{ ...(template || {}), pageDecor }}
        box={box}
        docMeta={docMeta || {}}
        scale={zoom}
      />
      {els.map((el) => {
        if (el.hidden && !showHidden) return null;
        const sel = selectedSet.has(el.id);
        const editing = editingId === el.id;
        const style = {
          position: "absolute",
          left: mm2px(el.box.x, zoom),
          top: mm2px(el.box.y, zoom),
          width: mm2px(el.box.w, zoom),
          height: mm2px(el.box.h, zoom),
          transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
          opacity: el.hidden ? 0.28 : Number(el.opacity ?? 1) < 1 ? Number(el.opacity) : 1,
          zIndex: sel ? 500 : undefined,
          cursor: readOnly ? "default" : el.locked ? "not-allowed" : "move",
        };
        let inner = null;
        // Dispatch par kind du modèle (§24 : chaque élément garde sa nature).
        if (isTextType(el) || el.type === "header" || el.type === "footer" || el.type === "pageNumber") {
          inner = <TextView el={el} zoom={zoom} editing={editing} onCommitHtml={(html) => commitEdit(el, html)} tokensCtx={tokensCtx} />;
        } else if (el.type === "line" || el.type === "divider" || el.type === "shape" || el.type === "circle" || el.type === "rect" || el.type === "block") {
          inner = <ShapeView el={el} zoom={zoom} />;
        } else if (el.type === "image" || el.type === "logo" || el.type === "icon" || el.type === "gallery" || el.type === "qr") {
          inner = <MediaView el={el} zoom={zoom} />;
        } else if (el.type === "table" || el.type === "chart" || el.type === "diagram" || el.type === "stats" || el.type === "toc") {
          inner = <DataView el={el} zoom={zoom} template={template} />;
        } else {
          inner = <div className="studio-el-placeholder">{elementLabel(el)}</div>;
        }
        return (
          <div
            key={el.id}
            data-el-id={el.id}
            className={`studio-el ${sel ? "selected" : ""} ${el.hidden ? "hidden-el" : ""} ${el.locked ? "locked-el" : ""}`}
            style={style}
            onPointerDown={(e) => {
              if (editing) return;
              handleClick(e, el);
              startGesture(e, "move", null, el);
            }}
            onDoubleClick={(e) => handleDblClick(e, el)}
            onContextMenu={(e) => handleContext(e, el)}
          >
            {inner}
            {sel && !readOnly ? (
              <>
                <div className="studio-sel-frame" />
                {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
                  <div key={h} className={`studio-handle studio-handle-${h}`} onPointerDown={(e) => startGesture(e, "resize", h, el)} />
                ))}
                <div className="studio-rotate-handle" title="Pivoter" onPointerDown={(e) => startGesture(e, "rotate", null, el)}>
                  ⟳
                </div>
                {el.locked ? <div className="studio-lock-badge" title="Élément verrouillé">🔒</div> : null}
              </>
            ) : null}
            {el.locked && !sel ? <div className="studio-lock-badge mini">🔒</div> : null}
          </div>
        );
      })}

      {guides.map((g, i) => (
        <div
          key={i}
          className={`studio-guide studio-guide-${g.axis}`}
          style={g.axis === "x" ? { left: mm2px(g.at, zoom), top: 0, height: H } : { top: mm2px(g.at, zoom), left: 0, width: W }}
        />
      ))}

      {totalPages > 1 ? <div className="studio-page-marker">{page.number || ""}</div> : null}
    </div>
  );
}




