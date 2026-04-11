import { useEffect, useRef, useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import '../AnnotationPlot.css';

/**
 * Canvas overlay that draws slightly larger green dots for all filtered points
 * (the full set, not just the paginated table rows).
 * Only renders when a filter is active and there are more filtered points
 * than the shown (table) subset.
 */
function FilteredPointsOverlay({
  scopeRows,
  filteredIndices,
  shownIndices,
  xDomain,
  yDomain,
  width,
  height,
}) {
  const canvasRef = useRef();

  // Build the set of indices to highlight: filteredIndices minus shownIndices
  // (shownIndices already have numbered labels, so we skip those)
  const highlightIndices = useMemo(() => {
    if (!filteredIndices?.length) return [];
    const shownSet = new Set(shownIndices || []);
    return filteredIndices.filter((i) => !shownSet.has(i));
  }, [filteredIndices, shownIndices]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    if (!highlightIndices.length || !xDomain || !yDomain || !scopeRows?.length) return;

    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    ctx.fillStyle = '#5cb85c';
    ctx.globalAlpha = 0.6;

    const r = 3;
    for (let j = 0; j < highlightIndices.length; j++) {
      const row = scopeRows[highlightIndices[j]];
      if (!row || row.deleted) continue;
      const px = xScale(row.x);
      const py = yScale(row.y);
      // Skip points outside viewport
      if (px < -r || px > width + r || py < -r || py > height + r) continue;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [highlightIndices, scopeRows, xDomain, yDomain, width, height]);

  if (!highlightIndices.length) return null;

  return (
    <canvas
      ref={canvasRef}
      className="annotation-plot"
      width={width}
      height={height}
    />
  );
}

export default FilteredPointsOverlay;
