// Décor de PAGE du modèle de design, rendu en HTML à l'identique du PDF
// (mêmes formes, mêmes coordonnées en millimètres — voir drawPageDecor dans
// exportPdf.js). C'est ce qui rend le changement de modèle immédiatement
// visible dans l'aperçu ET dans le Studio.
//
// ⚠️ TOUJOURS DERRIÈRE LE TEXTE : tous les calques portent `z-index: 0`
// (les conteneurs de texte sont en `z-index: 1` ou 2). Aucun dessin du modèle
// ne doit jamais recouvrir les écritures.
import { FONT_CSS } from "./templates.js";
import { PX_PER_MM } from "./paginate.js";

export default function PageDecor({ template, box, docMeta, scale = 1 }) {
  const decor = template?.pageDecor;
  if (!decor || !box) return null;
  const { w, h, m } = box;
  const mm = (v) => v * PX_PER_MM * scale;
  const accent = template.colors.accent;
  const title = String(docMeta?.title || "");
  const abs = { position: "absolute", zIndex: 0 };
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
              // Cadre SYMÉTRIQUE, identique au PDF (drawPageDecor) : le bord bas
              // est à `h − pad/2` dans les deux rendus.
              height: mm(h - pad * 1.5),
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
      // Hauteur bornée SOUS la ligne d'en-tête (m.top - 8), comme le PDF.
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

