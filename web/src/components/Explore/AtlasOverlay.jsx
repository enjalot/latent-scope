import { useMemo, useState, useEffect } from 'react';
import { atlasSheetUrl } from '../../lib/atlasUrl';
import { atlasLod } from '../../lib/atlasLod';

/**
 * Renders a representative-image sprite-sheet atlas as a SINGLE <img> covering
 * the map's [-1, 1] box. Pan/zoom is applied as a CSS transform that mirrors the
 * d3 zoom (translate + scale), so the browser compositor handles it — no
 * per-frame layout/repaint. The generator bakes in the vertical flip, so the
 * sheet maps directly onto the box.
 *
 * At the identity transform the box spans screen [0,width]x[0,height] (data -1->0,
 * +1->width for x; +1->0, -1->height for y). The d3 transform {k,x,y} then maps a
 * base screen position s to s*k + offset — exactly `translate(x,y) scale(k)` with
 * a top-left origin, matching the ScatterGL shader and the heatmap projection.
 *
 * As you zoom we swap resolution (64 -> 128 -> 256). The previous sheet stays
 * mounted until the new one has decoded (decoding="async"), so crossing a level
 * never flashes a gap.
 */
function AtlasOverlay({
  dataset,
  scopeId,
  imageColumn,
  width,
  height,
  transform,
  enabled,
  manifest,
  sheet = 0,
}) {
  const k = transform?.k || 1;
  const tx = transform?.x || 0;
  const ty = transform?.y || 0;

  const resolutions = useMemo(() => {
    if (!manifest?.generated) return [];
    return (manifest.resolutions || []).map((r) => r.num_tiles);
  }, [manifest]);

  // Target resolution at this zoom; null (zoomed out / disabled) -> nothing.
  const target = useMemo(() => {
    if (!enabled) return null;
    return atlasLod(k, width, resolutions).resolution;
  }, [enabled, resolutions, width, k]);

  // The resolution currently displayed (last one that finished decoding). Kept
  // mounted under the target so a swap never leaves a gap.
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (target == null) setShown(null);
  }, [target]);
  // Reset when the underlying sheets change.
  useEffect(() => {
    setShown(null);
  }, [scopeId, imageColumn, sheet]);

  if (target == null && shown == null) return null;

  const css = `translate(${tx}px, ${ty}px) scale(${k})`;
  const layers = [];
  if (shown != null) layers.push(shown);
  if (target != null && target !== shown) layers.push(target);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {layers.map((res) => (
        <img
          key={res}
          src={atlasSheetUrl(dataset.id, scopeId, imageColumn, res, sheet)}
          alt=""
          decoding="async"
          onLoad={() => setShown(res)}
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden';
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height,
            transform: css,
            transformOrigin: '0 0',
            willChange: 'transform',
            pointerEvents: 'none',
            // The incoming target stays invisible until it has decoded; the old
            // sheet underneath remains visible until then.
            opacity: res === shown ? 1 : 0,
          }}
        />
      ))}
    </div>
  );
}

export default AtlasOverlay;
