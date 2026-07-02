import { useMemo } from 'react';

// A compact horizontal color ramp with min/max labels, showing what the current
// continuous color encoding (drift metric or a data column) maps to.
function ColorLegend({ interpolator, extent, label, width = 120 }) {
  const gradient = useMemo(() => {
    if (!interpolator) return '';
    const stops = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      stops.push(`${interpolator(i / n)} ${(100 * i) / n}%`);
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, [interpolator]);

  const [lo, hi] = extent || [0, 1];
  const fmt = (v) =>
    v == null ? '' : Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.01)
      ? v.toExponential(1)
      : (+v).toFixed(2);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontSize: '0.72em',
        color: '#888',
      }}
    >
      {label && <span style={{ fontWeight: 600 }}>{label}</span>}
      <div style={{ height: 8, width, borderRadius: 2, background: gradient }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', width }}>
        <span>{fmt(lo)}</span>
        <span>{fmt(hi)}</span>
      </div>
    </div>
  );
}

export default ColorLegend;
