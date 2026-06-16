import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { atlasTileUrl } from '../../lib/atlasUrl';
import { atlasLod } from '../../lib/atlasLod';

/**
 * Renders a tiled representative-image atlas pyramid over the map's [-1,1] box.
 *
 * Each resolution is split into tiles; only the tiles that are populated AND in
 * view are mounted. All tiles for a resolution live in one inner <div> whose CSS
 * transform mirrors the d3 zoom (translate + scale) — so pan/zoom is a single
 * compositor transform, no per-frame layout. The generator bakes in the vertical
 * flip, so a tile maps directly onto its sub-rectangle of the box.
 *
 * On a resolution change the previous level stays mounted until the new level's
 * visible tiles have decoded, so crossing a level never flashes a gap.
 */
function AtlasOverlay({
  dataset,
  scopeId,
  imageColumn,
  xDomain,
  yDomain,
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

  const resByNum = useMemo(() => {
    const m = new Map();
    if (manifest?.generated) (manifest.resolutions || []).forEach((e) => m.set(e.num_tiles, e));
    return m;
  }, [manifest]);
  const resolutions = useMemo(() => [...resByNum.keys()], [resByNum]);

  const target = useMemo(() => {
    if (!enabled) return null;
    return atlasLod(k, width, resolutions).resolution;
  }, [enabled, resolutions, width, k]);

  // Visible, populated tiles for a resolution entry, with base (identity) screen
  // rects. Partial last tiles (when the grid isn't a multiple of tile_cells) are
  // handled via per-tile cell ranges.
  const visibleTilesFor = useCallback(
    (entry) => {
      if (!entry || !xDomain || !yDomain) return [];
      const R = entry.num_tiles;
      const tc = entry.tile_cells;
      const xlo = Math.min(xDomain[0], xDomain[1]);
      const xhi = Math.max(xDomain[0], xDomain[1]);
      const ylo = Math.min(yDomain[0], yDomain[1]);
      const yhi = Math.max(yDomain[0], yDomain[1]);
      const out = [];
      for (const t of entry.tiles || []) {
        const cx0 = t.tx * tc;
        const cx1 = Math.min((t.tx + 1) * tc, R);
        const cy0 = t.ty * tc; // image rows (0 = top = y max)
        const cy1 = Math.min((t.ty + 1) * tc, R);
        const fx0 = cx0 / R;
        const fx1 = cx1 / R;
        const fy0 = cy0 / R;
        const fy1 = cy1 / R;
        const dX0 = -1 + 2 * fx0;
        const dX1 = -1 + 2 * fx1;
        const dYtop = 1 - 2 * fy0;
        const dYbot = 1 - 2 * fy1;
        if (dX1 < xlo || dX0 > xhi || dYtop < ylo || dYbot > yhi) continue;
        out.push({
          key: `${R}:${t.tx}:${t.ty}`,
          res: R,
          tx: t.tx,
          ty: t.ty,
          left: fx0 * width,
          top: fy0 * height,
          w: (fx1 - fx0) * width,
          h: (fy1 - fy0) * height,
        });
      }
      return out;
    },
    [xDomain, yDomain, width, height]
  );

  // Track which tiles have decoded so we can promote target -> shown without a gap.
  const [shown, setShown] = useState(null);
  const loadedRef = useRef(new Set());
  useEffect(() => {
    if (target == null) setShown(null);
  }, [target]);
  useEffect(() => {
    setShown(null);
    loadedRef.current = new Set();
  }, [scopeId, imageColumn, sheet]);

  const targetTiles = useMemo(
    () => visibleTilesFor(resByNum.get(target)),
    [visibleTilesFor, resByNum, target]
  );
  const shownTiles = useMemo(
    () => (shown != null && shown !== target ? visibleTilesFor(resByNum.get(shown)) : []),
    [visibleTilesFor, resByNum, shown, target]
  );

  // Promote when every visible target tile has loaded (cached loads fire onLoad
  // synchronously, so check after render too).
  const promoteIfReady = useCallback(() => {
    if (target != null && targetTiles.length > 0) {
      const allLoaded = targetTiles.every((t) => loadedRef.current.has(t.key));
      if (allLoaded) setShown(target);
    }
  }, [target, targetTiles]);
  useEffect(() => {
    promoteIfReady();
  }, [promoteIfReady]);

  if (target == null && shown == null) return null;

  const innerStyle = {
    position: 'absolute',
    left: 0,
    top: 0,
    width,
    height,
    transform: `translate(${tx}px, ${ty}px) scale(${k})`,
    transformOrigin: '0 0',
    willChange: 'transform',
  };

  const renderTile = (t, isTarget) => (
    <img
      key={t.key}
      src={atlasTileUrl(dataset.id, scopeId, imageColumn, t.res, t.tx, t.ty, sheet)}
      alt=""
      decoding="async"
      onLoad={() => {
        loadedRef.current.add(t.key);
        if (isTarget) promoteIfReady();
      }}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
      style={{
        position: 'absolute',
        left: t.left,
        top: t.top,
        width: t.w,
        height: t.h,
        pointerEvents: 'none',
      }}
    />
  );

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
      {shownTiles.length > 0 && <div style={innerStyle}>{shownTiles.map((t) => renderTile(t, false))}</div>}
      {target != null && <div style={innerStyle}>{targetTiles.map((t) => renderTile(t, true))}</div>}
    </div>
  );
}

export default AtlasOverlay;
