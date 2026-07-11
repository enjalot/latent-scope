import { useEffect, useRef } from 'react';
import { scaleLinear } from 'd3-scale';
import { useColorMode } from '../../hooks/useColorMode';
import '../AnnotationPlot.css';

// Chrome colors live in the token layer; canvas code reads them at draw time
// and re-renders when the color mode flips.
const readToken = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Canvas overlay that draws a selection-toned dotted crosshair (full-width
 * horizontal and vertical lines) with a small circle at the intersection.
 * Used for hover/click indication on the Compare scatter views.
 */
function CrosshairPlot({ point, xDomain, yDomain, width, height }) {
  const canvasRef = useRef();
  const { colorMode } = useColorMode();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    if (!point || !xDomain || !yDomain) return;

    const selectionColor = readToken('--ls-color-selection');
    const selectionFill = readToken('--ls-color-selection-fill');

    const xScale = scaleLinear().domain(xDomain).range([0, width]);
    const yScale = scaleLinear().domain(yDomain).range([height, 0]);

    const px = xScale(point[0]);
    const py = yScale(point[1]);

    // Dotted crosshair lines
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = selectionColor;
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

    // Circle at intersection
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = selectionColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = selectionFill;
    ctx.fill();
  }, [point, xDomain, yDomain, width, height, colorMode]);

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
