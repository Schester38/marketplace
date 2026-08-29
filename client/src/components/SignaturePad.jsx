import { useEffect, useRef } from "react";

// Pavé de signature tactile : le client signe avec le doigt sur l'écran du
// livreur au moment de la livraison. Aucune dépendance externe — canvas HTML
// + événements pointeur (souris, tactile, stylet). Le tracé est exporté en
// PNG data URI et transmis au parent via onChange.
export default function SignaturePad({ label, hint, clearLabel, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const dirty = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = point(e);
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {
      /* ancien navigateur sans setPointerCapture : le tracé fonctionne quand même */
    }
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current && onChange) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    dirty.current = false;
    if (onChange) onChange("");
  };

  return (
    <div style={{ marginTop: 14 }}>
      {label ? <label>{label}</label> : null}
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        style={{
          touchAction: "none",
          width: "100%",
          height: 140,
          display: "block",
          border: "1px dashed var(--border)",
          borderRadius: 10,
          background: "#fff",
          cursor: "crosshair",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
        <button type="button" className="btn btn-outline btn-small" onClick={clear}>
          ✕ {clearLabel || "Effacer"}
        </button>
        {hint ? (
          <span className="hint" style={{ margin: 0 }}>
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}
