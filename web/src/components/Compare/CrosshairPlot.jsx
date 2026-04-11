import { useEffect, useRef } from 'react';
import { scaleLinear } from 'd3-scale';
import '../AnnotationPlot.css';

/**
 * Canvas overlay that draws a blue dotted crosshair (full-width horizontal
 * and vertical lines) with a small blue circle at the intersection.
 * Used for hover/click indication on the Compare scatter views.
 */
function CrosshairPlot({ point, xDomain, yDomain, width, height }) {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    if (!point || !xDomain || !yDomain) return;

    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    const px = xScale(point[0]);
    const py = yScale(point[1]);

    // Dotted crosshair lines
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#4488ff';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();

    // Blue circle at intersection
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#4488ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#4488ff';
    ctx.fill();
  }, [point, xDomain, yDomain, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="annotation-plot"
      width={width}
      height={height}
    />
  );
}

export default CrosshairPlot;
