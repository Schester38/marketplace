// Image redimensionnable du Générateur : extension TipTap Image + poignée de
// redimensionnement (Pointer Events natifs, aucune dépendance supplémentaire).
// La largeur choisie (% de la largeur de contenu) vit dans l'attribut `width`
// du nœud → sérialisée dans le HTML du document → la pagination, l'aperçu, le
// PDF et l'EPUB utilisent EXACTEMENT la même taille.
import React, { useRef, useState } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import ImageExtension from "@tiptap/extension-image";

const MIN_W = 10;
const MAX_W = 100;

export const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-width") || (el.style && el.style.width) || null,
        renderHTML: (attrs) =>
          attrs.width ? { "data-width": attrs.width, style: `width:${attrs.width}` } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(GenImageView);
  },
});

function GenImageView({ node, updateAttributes, selected }) {
  const imgRef = useRef(null);
  const drag = useRef(null);
  const [pct, setPct] = useState(null);

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.round(((d.w + (e.clientX - d.x)) / d.hostW) * 100);
    const clamped = Math.min(MAX_W, Math.max(MIN_W, next));
    setPct(clamped);
    updateAttributes({ width: `${clamped}%` });
  };

  const onPointerUp = () => {
    drag.current = null;
    setPct(null);
    window.removeEventListener("pointermove", onPointerMove);
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    const host = img?.closest(".tiptap") || img?.parentElement;
    const hostW = host?.getBoundingClientRect().width || 1;
    const w = img?.getBoundingClientRect().width || hostW;
    drag.current = { x: e.clientX, w, hostW };
    setPct(Math.round((w / hostW) * 100));
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
  };

  return (
    <NodeViewWrapper as="div" className={`gen-img-node${selected ? " is-selected" : ""}`}>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        draggable={false}
        style={{ width: node.attrs.width || "100%" }}
      />
      {selected && (
        <span
          className="gen-img-handle"
          title="Glissez pour redimensionner l'image"
          onPointerDown={onPointerDown}
        >
          ↔
        </span>
      )}
      {pct !== null && <span className="gen-img-pct">{pct} %</span>}
    </NodeViewWrapper>
  );
}
