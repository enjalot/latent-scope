import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { format } from 'd3-format';
import styles from './ColorLegend.module.css';

const fmt = format('.3~g');

// Build a CSS linear-gradient string sampling a d3 interpolator so the numeric
// ramp matches the colors the scatter draws.
function rampGradient(interpolator, steps = 16) {
  const stops = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stops.push(`${interpolator(t)} ${Math.round(t * 100)}%`);
  }
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * Legend for the Compare color-by (#131). Numeric columns render a color ramp
 * with the min/max extent; categorical columns render one swatch per category
 * (with counts when available). Renders nothing when `legend` is null (color-by
 * OFF — the panes fall back to drift coloring). Compare-local by design so it
 * stays independent of the Explore legend.
 */
function ColorLegend({ legend }) {
  const gradient = useMemo(() => {
    if (!legend || legend.type !== 'numeric') return null;
    return rampGradient(legend.interpolator);
  }, [legend]);

  if (!legend) return null;

  if (legend.type === 'numeric') {
    const [min, max] = legend.extent || [null, null];
    return (
      <div className={styles.legend}>
        <div className={styles.title} title={legend.column}>
          {legend.column}
        </div>
        <div className={styles.ramp} style={{ background: gradient }} />
        <div className={styles.extent}>
          <span>{min == null ? '' : fmt(min)}</span>
          <span>{max == null ? '' : fmt(max)}</span>
        </div>
      </div>
    );
  }

  // categorical
  const categories = legend.categories || [];
  return (
    <div className={styles.legend}>
      <div className={styles.title} title={legend.column}>
        {legend.column}
      </div>
      <div className={styles.swatches}>
        {categories.map((c) => (
          <div key={c.label} className={styles.swatchRow} title={String(c.label)}>
            <span className={styles.swatch} style={{ backgroundColor: c.color }} />
            <span className={styles.swatchLabel}>{String(c.label)}</span>
            {c.count != null && <span className={styles.swatchCount}>{c.count}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

ColorLegend.propTypes = {
  legend: PropTypes.shape({
    type: PropTypes.oneOf(['numeric', 'categorical']).isRequired,
    column: PropTypes.string,
    extent: PropTypes.array,
    interpolator: PropTypes.func,
    categories: PropTypes.array,
  }),
};

export default ColorLegend;
