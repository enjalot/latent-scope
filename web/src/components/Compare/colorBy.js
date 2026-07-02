import { scaleLinear } from 'd3-scale';
import { interpolateViridis, schemeTableau10, interpolateRainbow } from 'd3-scale-chromatic';

// Interpolator used for numeric color-by. Deliberately different from the
// drift metric's Reds ramp so the two coloring modes read distinctly.
export const numericInterpolator = interpolateViridis;

// Palette for categorical color-by. <=10 categories get the distinct Tableau10
// swatches; beyond that we spread hues around the rainbow so every category is
// still visually distinguishable rather than colliding on a 10-color cycle.
export function categoricalColorHex(i, n) {
  if (n <= schemeTableau10.length) {
    return schemeTableau10[i % schemeTableau10.length];
  }
  return interpolateRainbow((i % n) / n);
}

// Neutral color for rows whose value is missing (null/NaN numeric, or the
// backend's -1 category index). Rendering these with a distinct no-value color
// avoids the misreads of coercing them to the column minimum / an arbitrary
// category. Kept in sync with the Explore map's NO_VALUE_COLOR intent.
export const MISSING_COLOR = '#c9c9c9';

const isMissingNumeric = (v) => v == null || Number.isNaN(v);
// Fraction of the continuous ramp reserved (at valueB≈0) for the neutral slot
// that Scatter prepends when `missingColor` is set. Scatter builds a ~50-step
// ramp, so 0.02 (≈1 step) cleanly separates real values from the neutral.
const NEUTRAL_RESERVE = 0.02;

/**
 * Turn a `fetchColumnValues` payload into everything the Compare panes and the
 * legend need to color points by a column (#131).
 *
 * @param {string} column
 * @param {{ values: number[], extent?: [number, number], type: string,
 *   categorical?: { categories: any[], counts?: number[] } }} colorData
 * @returns {null | {
 *   mode: 'column', column: string, type: 'numeric'|'categorical',
 *   values: number[], norm?: number[], extent?: [number, number],
 *   interpolator?: Function, colorRange?: string[], colorDomain?: number[],
 *   legend: object,
 * }}
 */
export function buildColorByConfig(column, colorData) {
  if (!column || !colorData || !Array.isArray(colorData.values)) return null;
  const values = colorData.values;

  if (colorData.type === 'numeric') {
    const extent = colorData.extent || [0, 1];
    let [min, max] = extent;
    if (min == null) min = 0;
    if (max == null) max = 1;
    // Degenerate extent (all-equal values) would collapse the scale.
    const domain = min === max ? [min, min + 1] : [min, max];
    const norms = scaleLinear().domain(domain).range([0, 1]).clamp(true);
    // Missing values keep norm 0 here; buildColorPoints re-detects them (from
    // the raw values) and routes them to the reserved neutral slot instead of
    // the column minimum.
    const norm = values.map((v) => (isMissingNumeric(v) ? 0 : norms(v)));
    const hasMissing = values.some(isMissingNumeric);
    return {
      mode: 'column',
      column,
      type: 'numeric',
      values,
      norm,
      extent: [min, max],
      interpolator: numericInterpolator,
      missingColor: hasMissing ? MISSING_COLOR : undefined,
      legend: {
        type: 'numeric',
        column,
        extent: [min, max],
        interpolator: numericInterpolator,
        missingColor: hasMissing ? MISSING_COLOR : undefined,
      },
    };
  }

  // categorical — reserve index 0 for the neutral "no value" color and shift
  // real categories to 1..n, so the backend's -1 (missing) maps to neutral
  // instead of an out-of-range/arbitrary category color.
  const categories = colorData.categorical?.categories || [];
  const counts = colorData.categorical?.counts || [];
  const n = categories.length;
  const catColors = categories.map((_, i) => categoricalColorHex(i, n));
  const hasMissing = values.some((v) => v == null || v < 0);
  const colorRange = [MISSING_COLOR, ...catColors];
  const colorDomain = [0, ...categories.map((_, i) => i + 1)];
  return {
    mode: 'column',
    column,
    type: 'categorical',
    values,
    colorRange,
    colorDomain,
    legend: {
      type: 'categorical',
      column,
      categories: [
        ...categories.map((label, i) => ({ label, color: catColors[i], count: counts[i] })),
        ...(hasMissing ? [{ label: '(no value)', color: MISSING_COLOR }] : []),
      ],
    },
  };
}

/**
 * Build the [x, y, valueA, valueB] display points for a set of xy points when
 * a column color-by is active, encoding the column value into the channel the
 * Scatter's `colorScaleType` expects (valueB for continuous, valueA for
 * categorical).
 */
export function buildColorPoints(points, config) {
  if (!points?.length || !config) return [];
  if (config.type === 'numeric') {
    const norm = config.norm || [];
    const vals = config.values || [];
    // When a neutral slot is reserved (missingColor set, Scatter prepends it at
    // valueB≈0), push real values into [NEUTRAL_RESERVE, 1] and send missing
    // rows to valueB 0 (the neutral). Otherwise pass norm straight through.
    const reserve = config.missingColor ? NEUTRAL_RESERVE : 0;
    return points.map((p, i) => {
      const vb = isMissingNumeric(vals[i]) ? 0 : reserve + (norm[i] ?? 0) * (1 - reserve);
      return [p[0], p[1], 1, vb];
    });
  }
  // categorical: real category k -> valueA k+1 (colorRange[k+1]); missing
  // (null/-1) -> valueA 0 (colorRange[0] = neutral).
  const values = config.values || [];
  return points.map((p, i) => {
    const v = values[i];
    const valueA = v == null || v < 0 ? 0 : v + 1;
    return [p[0], p[1], valueA, 0];
  });
}
