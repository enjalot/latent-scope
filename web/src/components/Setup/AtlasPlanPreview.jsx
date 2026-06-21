import { useRef, useEffect } from 'react';
import { scaleSequential } from 'd3-scale';
import { interpolateOranges } from 'd3-scale-chromatic';

/**
 * Renders the scope's density heatmap from a plan's density grid, with an
 * overlay for the selected resolution showing the tile grid and shading the
 * tiles that would actually be generated (populated). Orientation matches the
 * map: data y increases upward, and tile (tx, ty=0) is the top row.
 */
function AtlasPlanPreview({ plan, selectedRes, size = 360 }) {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (!plan?.density) return;

    const { res, counts } = plan.density;
    let maxC = 0;
    for (const row of counts) for (const v of row) if (v > maxC) maxC = v;
    const color = scaleSequential(interpolateOranges).domain([0, Math.sqrt(maxC) || 1]);
    const cw = size / res;
    for (let row = 0; row < res; row++) {
      for (let col = 0; col < res; col++) {
        const v = counts[row][col];
        if (!v) continue;
        ctx.fillStyle = color(Math.sqrt(v));
        // flip: high data-y (high row) at the top
        ctx.fillRect(col * cw, (res - 1 - row) * cw, cw + 0.5, cw + 0.5);
      }
    }

    const entry = (plan.resolutions || []).find((e) => e.num_tiles === selectedRes);
    if (entry) {
      const T = entry.tiles_per_axis;
      const tw = size / T;
      if (entry.tile_coords) {
        ctx.fillStyle = 'rgba(40, 90, 200, 0.18)';
        for (const [tx, ty] of entry.tile_coords) {
          ctx.fillRect(tx * tw, ty * tw, tw, tw); // image-space ty=0 = top
        }
      }
      ctx.strokeStyle = 'rgba(40, 90, 200, 0.55)';
      ctx.lineWidth = 0.75;
      for (let i = 0; i <= T; i++) {
        ctx.beginPath();
        ctx.moveTo(i * tw, 0);
        ctx.lineTo(i * tw, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * tw);
        ctx.lineTo(size, i * tw);
        ctx.stroke();
      }
    }
  }, [plan, selectedRes, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, border: '1px solid #ddd', borderRadius: 4 }}
    />
  );
}

export default AtlasPlanPreview;
