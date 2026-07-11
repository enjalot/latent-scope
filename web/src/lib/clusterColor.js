import { rgb } from 'd3-color';
import { schemeTableau10, interpolateRainbow } from 'd3-scale-chromatic';

// Cluster coloring shared by the 3D scatter and the voxel view so a cluster
// reads as the SAME hue across every modality. This mirrors the categorical
// palette in hooks/useColorBy.js (Tableau10 for <=10 categories, otherwise
// hues spread around the rainbow) — one palette, one meaning.
export const clusterColorHex = (i, n) => {
  if (i == null || i < 0) return '#9aa0a6'; // noise / no cluster -> neutral gray
  if (n <= schemeTableau10.length) {
    return schemeTableau10[i % schemeTableau10.length];
  }
  return interpolateRainbow((i % n) / n);
};

// [r, g, b] in 0..1 (what a WebGL / three.js color buffer expects).
export const clusterColorRgb = (i, n) => {
  const c = rgb(clusterColorHex(i, n));
  return [c.r / 255, c.g / 255, c.b / 255];
};
