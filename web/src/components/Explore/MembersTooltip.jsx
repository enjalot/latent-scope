import { createPortal } from 'react-dom';

import styles from './MembersTooltip.module.scss';

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
    <div className={styles.tooltip} style={{ left, top, width }}>
      <div className={styles.header}>
        <span className={styles.count}>{summary.count.toLocaleString()}</span> datapoint
        {summary.count === 1 ? '' : 's'}
        <span className={styles.label}> · {summary.label}</span>
      </div>
      <div className={styles.snippets}>
        {loading && snippets.length === 0 && (
          <span className={styles.muted}>loading snippets…</span>
        )}
        {snippets.map((t, i) => (
          <div key={i} className={styles.snippet}>
            {t == null || t === '' ? <span className={styles.muted}>(empty)</span> : String(t)}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

export default MembersTooltip;
