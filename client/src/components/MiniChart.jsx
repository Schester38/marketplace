export default function MiniChart({ data = [], label = "", valueSuffix = "", height = 160 }) {
  if (!data.length) {
    return (
      <div className="chart-empty hint" style={{ height }}>
        Aucune donnée sur la période.
      </div>
    );
  }
  const W = 640;
  const H = height;
  const PAD_X = 34;
  const PAD_TOP = 18;
  const PAD_BOTTOM = 26;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({
    x: PAD_X + (data.length > 1 ? i * step : innerW / 2),
    y: PAD_TOP + innerH - (d.value / max) * innerH,
    ...d,
  }));
  // Courbe lissée (Catmull-Rom simplifié vers Bézier)
  const line = pts
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = pts[i - 1];
      const cx = (prev.x + p.x) / 2;
      return `C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
    })
    .join(" ");
  const area = `${line} L ${pts[pts.length - 1].x} ${PAD_TOP + innerH} L ${pts[0].x} ${
    PAD_TOP + innerH
  } Z`;

  return (
    <svg
      className="mini-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="mcAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((r) => (
        <line
          key={r}
          className="mc-grid"
          x1={PAD_X}
          x2={W - PAD_X}
          y1={PAD_TOP + innerH * r}
          y2={PAD_TOP + innerH * r}
        />
      ))}
      <path d={area} fill="url(#mcAreaGrad)" stroke="none" />
      <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
      {pts.map((p) => (
        <g key={p.label}>
          <circle className="mc-dot" cx={p.x} cy={p.y} r="3.5">
            <title>{p.tip || `${p.label} — ${label} : ${p.value}${valueSuffix}`}</title>
          </circle>
        </g>
      ))}
      {pts.map((p, i) =>
        i % Math.ceil(pts.length / 8) === 0 || i === pts.length - 1 ? (
          <text key={`t-${p.label}`} className="mc-label" x={p.x} y={H - 8} textAnchor="middle">
            {p.label}
          </text>
        ) : null
      )}
    </svg>
  );
}