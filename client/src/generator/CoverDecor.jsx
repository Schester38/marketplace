// Décor géométrique de couverture — APERÇU HTML.
// Rend les MÊMES primitives que coverDecor.js dessine sur le canvas
// (miniature produit) et dans le PDF : aperçu = PDF = miniature, à l'identique.
export default function CoverDecor({ prims = [], w, h }) {
  if (!prims.length || !w || !h) return null;
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {prims.map((p, i) => {
        if (p.kind === "poly")
          return (
            <polygon
              key={i}
              points={p.pts.map(([x, y]) => `${x},${y}`).join(" ")}
              fill={p.color}
            />
          );
        if (p.kind === "rect")
          return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.color} />;
        if (p.kind === "circle")
          return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.color} />;
        if (p.kind === "ring")
          return (
            <circle
              key={i}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill="none"
              stroke={p.color}
              strokeWidth={p.lw}
            />
          );
        return null;
      })}
    </svg>
  );
}
