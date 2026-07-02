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
    const norm = values.map((v) => (v == null || Number.isNaN(v) ? 0 : norms(v)));
    return {
      mode: 'column',
      column,
      type: 'numeric',
      values,
      norm,
      extent: [min, max],
      interpolator: numericInterpolator,
      legend: {
        type: 'numeric',
        column,
        extent: [min, max],
        interpolator: numericInterpolator,
      },
    };
  }

  // categorical
  const categories = colorData.categorical?.categories || [];
  const counts = colorData.categorical?.counts || [];
  const n = categories.length;
  const colorRange = categories.map((_, i) => categoricalColorHex(i, n));
  const colorDomain = categories.map((_, i) => i);
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
      categories: categories.map((label, i) => ({
        label,
        color: colorRange[i],
        count: counts[i],
      })),
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
    return points.map((p, i) => [p[0], p[1], 1, norm[i] ?? 0]);
  }
  const values = config.values || [];
  return points.map((p, i) => [p[0], p[1], values[i] ?? 0, 0]);
}
