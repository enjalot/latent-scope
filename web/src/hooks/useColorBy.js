import { useState, useEffect, useMemo } from 'react';
import { rgb } from 'd3-color';
import { scaleSequential } from 'd3-scale';
import { interpolateViridis, schemeTableau10, interpolateRainbow } from 'd3-scale-chromatic';
import { apiService } from '@/lib/apiService';

// Palette for categorical color-by. <=10 categories get the distinct Tableau10
// swatches; beyond that we spread hues around the rainbow so every category is
// still visually distinguishable (rather than colliding on a 10-color cycle).
const categoricalColorHex = (i, n) => {
  if (n <= schemeTableau10.length) {
    return schemeTableau10[i % schemeTableau10.length];
  }
  return interpolateRainbow((i % n) / n);
};

// Normalize a d3 color string to an [r, g, b] triple in 0..1 (what the REGL
// color buffer expects).
const toGlRgb = (colorStr) => {
  const c = rgb(colorStr);
  return [c.r / 255, c.g / 255, c.b / 255];
};

/**
 * Color-by-column hook for the Explore map.
 *
 * Holds the active color-by column, fetches its per-point values via
 * `apiService.fetchColumnValues` (aligned to the scope's ls_index order), and
 * derives:
 *   - `pointColors`: per-point [r,g,b] (0..1) triples the scatter uses to drive
 *     hue, or `null` for a point with a missing/out-of-range value, or `null`
 *     for the whole array when color-by is OFF (scatter falls back to selection
 *     coloring).
 *   - `legend`: metadata for `ColorLegend` (numeric ramp + extent, or category
 *     swatches with counts).
 *
 * @param {string} datasetId
 * @param {string} idOrScope   scope/umap id used to subset+align the values
 * @param {string|null} initialColumn
 */
export function useColorBy(datasetId, idOrScope, initialColumn = null) {
  const [column, setColumn] = useState(initialColumn);
  const [data, setData] = useState(null); // { column, values, extent?, type, categorical? }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Null column = "off": clear any previously fetched data so the scatter
    // reverts to selection coloring.
    if (!column || !datasetId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiService
      .fetchColumnValues(datasetId, idOrScope, column)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`Error fetching color-by column ${column}`, err);
        setError(err);
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, idOrScope, column]);

  // Continuous scale for numeric columns (used both for point colors and the
  // legend ramp). Categorical columns map index -> palette directly.
  const numericScale = useMemo(() => {
    if (!data || data.type !== 'numeric') return null;
    const extent = data.extent || [0, 1];
    const min = extent[0] == null ? 0 : extent[0];
    const max = extent[1] == null ? 1 : extent[1];
    // Degenerate extent (all-equal values): widen so the scale doesn't collapse.
    const domain = min === max ? [min, min + 1] : [min, max];
    return scaleSequential(interpolateViridis).domain(domain);
  }, [data]);

  // Precomputed [r,g,b] triples per category (categorical only).
  const categoryGlColors = useMemo(() => {
    if (!data || data.type !== 'categorical') return null;
    const cats = data.categorical?.categories || [];
    return cats.map((_, i) => toGlRgb(categoricalColorHex(i, cats.length)));
  }, [data]);

  const pointColors = useMemo(() => {
    if (!data) return null;
    const values = data.values || [];
    const N = values.length;
    const out = new Array(N);
    if (data.type === 'numeric' && numericScale) {
      for (let i = 0; i < N; i++) {
        const v = values[i];
        if (v === null || v === undefined || Number.isNaN(v)) {
          out[i] = null;
          continue;
        }
        out[i] = toGlRgb(numericScale(v));
      }
      return out;
    }
    if (data.type === 'categorical' && categoryGlColors) {
      const n = categoryGlColors.length;
      for (let i = 0; i < N; i++) {
        const idx = values[i];
        out[i] = idx >= 0 && idx < n ? categoryGlColors[idx] : null;
      }
      return out;
    }
    return null;
  }, [data, numericScale, categoryGlColors]);

  const legend = useMemo(() => {
    if (!data) return null;
    if (data.type === 'numeric') {
      const extent = data.extent || [null, null];
      return {
        type: 'numeric',
        column: data.column,
        extent,
        interpolator: interpolateViridis,
      };
    }
    if (data.type === 'categorical') {
      const cats = data.categorical?.categories || [];
      const counts = data.categorical?.counts || [];
      return {
        type: 'categorical',
        column: data.column,
        categories: cats.map((label, i) => ({
          label,
          count: counts[i],
          color: rgb(categoricalColorHex(i, cats.length)).formatHex(),
        })),
      };
    }
    return null;
  }, [data]);

  return {
    column,
    setColumn,
    pointColors,
    legend,
    type: data?.type || null,
    loading,
    error,
  };
}

export default useColorBy;
