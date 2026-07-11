import { createPortal } from 'react-dom';

// Presentation for the members-in-cell tooltip (2D heatmap + 3D voxels).
// Controlled: given a viewport position + the active cell summary/snippets from
// useCellMembers, renders a floating card "N datapoints · dominant label" plus a
// few sampled snippets. Rendered into a portal (position: fixed) so it floats
// above the canvas and never gets clipped by the viz pane's overflow.
function MembersTooltip({ x, y, summary, snippets, loading }) {
  if (!summary) return null;

  // Flip to the left of the cursor if we're close to the right edge.
  const width = 320;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const left = x + width + 24 > vw ? x - width - 16 : x + 16;
  const top = Math.max(8, y - 12);

  return createPortal(
    <div
      className="members-tooltip"
      style={{
        position: 'fixed',
        left,
        top,
        width,
        maxWidth: '90vw',
        pointerEvents: 'none',
        zIndex: 10000,
        background: '#D3965E',
        color: '#1c1204',
        borderRadius: 6,
        padding: '8px 10px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        fontSize: 12,
        lineHeight: 1.35,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {summary.count.toLocaleString()} datapoint{summary.count === 1 ? '' : 's'}
        <span style={{ fontWeight: 400 }}> · {summary.label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {loading && snippets.length === 0 && (
          <em style={{ opacity: 0.75 }}>loading snippets…</em>
        )}
        {snippets.map((t, i) => (
          <div
            key={i}
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.12)',
              paddingTop: i === 0 ? 0 : 3,
            }}
          >
            {t == null || t === '' ? <span style={{ opacity: 0.5 }}>(empty)</span> : String(t)}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

export default MembersTooltip;
