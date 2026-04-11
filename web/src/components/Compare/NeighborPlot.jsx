import { useEffect, useRef } from 'react';
import { scaleLinear, scaleOrdinal } from 'd3-scale';
import { schemeTableau10 } from 'd3-scale-chromatic';
import '../AnnotationPlot.css';

/**
 * Canvas overlay that draws k nearest neighbors as colored circles,
 * each with a unique color from a d3 categorical scale.
 * Also draws the selected point as a larger blue circle.
 */
function NeighborPlot({
  points,
  selectedIndex,
  neighborIndices,
  xDomain,
  yDomain,
  width,
  height,
}) {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    if (!points?.length || !xDomain || !yDomain) return;
    if (selectedIndex == null && (!neighborIndices || !neighborIndices.length)) return;

    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    const colorScale = scaleOrdinal(schemeTableau10);

    // Draw neighbor circles with unique colors
    if (neighborIndices) {
      neighborIndices.forEach((idx, rank) => {
        const pt = points[idx];
        if (!pt) return;
        const px = xScale(pt[0]);
        const py = yScale(pt[1]);
        const color = colorScale(rank);

        // Filled circle
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, 2 * Math.PI);
        ctx.fill();

        // Border
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Rank label
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rank + 1, px, py);
      });
    }

    // Draw selected point
    if (selectedIndex != null) {
      const pt = points[selectedIndex];
      if (pt) {
        const px = xScale(pt[0]);
        const py = yScale(pt[1]);

        // Crosshair
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(width, py);
        ctx.stroke();

        // Circle
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#4488ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#4488ff';
        ctx.fill();
      }
    }
  }, [points, selectedIndex, neighborIndices, xDomain, yDomain, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="annotation-plot"
      width={width}
      height={height}
    />
  );
}

export default NeighborPlot;
