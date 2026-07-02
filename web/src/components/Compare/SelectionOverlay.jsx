import { useEffect, useRef } from 'react';
import { scaleLinear } from 'd3-scale';
import '../AnnotationPlot.css';

// Match Explore's selection green (mapSelectionColorsLight[selected] in lib/colors.js).
const SELECTION_COLOR = '#5cb85c';
// Cap how many points we stroke per frame so a huge brush can't stall panning;
// the selection table/spread stat still reflect the full set.
const MAX_DRAWN = 20000;

/**
 * Canvas overlay that paints a set of highlighted points on top of a Compare
 * scatter pane, in the same visual language as Explore's selection. Used both
 * for the shared brush selection (green) and for similarity-search hits (blue),
 * so highlighting in one context lights up the same rows in both panes.
 */
function SelectionOverlay({
  points,
  selectedIndices,
  xDomain,
  yDomain,
  width,
  height,
  color = SELECTION_COLOR,
  stroke = '#2d6a2d',
}) {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    if (!selectedIndices?.length || !points?.length || !xDomain || !yDomain) return;

    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    ctx.fillStyle = color;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.75;
    ctx.globalAlpha = 0.9;

    const count = Math.min(selectedIndices.length, MAX_DRAWN);
    for (let i = 0; i < count; i++) {
      const p = points[selectedIndices[i]];
      if (!p) continue;
      const px = xScale(p[0]);
      const py = yScale(p[1]);
      if (px < -4 || px > width + 4 || py < -4 || py > height + 4) continue;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  }, [points, selectedIndices, xDomain, yDomain, width, height, color, stroke]);

  return <canvas ref={canvasRef} className="annotation-plot" width={width} height={height} />;
}

export default SelectionOverlay;
