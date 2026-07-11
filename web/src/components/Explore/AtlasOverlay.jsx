import { useMemo, useCallback, useRef, useReducer, useEffect } from 'react';
import { atlasTileUrl } from '../../lib/atlasUrl';
import { atlasLod } from '../../lib/atlasLod';

/**
 * Renders a tiled representative-image atlas pyramid over the map's [-1,1] box.
 *
 * Two adjacent levels are drawn at once: the level immediately COARSER than the
 * target acts as a continuity backdrop (so a tile is at most ~2x upscaled while
 * the finer one loads — never stretched several levels like a single held
 * layer), and the target level fades in sharply on top as its tiles decode.
 *
 * Each level's visible, populated tiles live in one inner <div> whose CSS
 * transform mirrors the d3 zoom (translate + scale) — pan/zoom is a single
 * compositor transform, no per-frame layout. The generator bakes in the
 * vertical flip, so a tile maps directly onto its sub-rectangle of the box.
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
  minCellPx,
}) {
  const k = transform?.k || 1;
  const tx = transform?.x || 0;
  const ty = transform?.y || 0;

  const resByNum = useMemo(() => {
    const m = new Map();
    if (manifest?.generated) (manifest.resolutions || []).forEach((e) => m.set(e.num_tiles, e));
    return m;
  }, [manifest]);
  const resolutions = useMemo(() => [...resByNum.keys()].sort((a, b) => a - b), [resByNum]);

  const target = useMemo(() => {
    if (!enabled) return null;
    return atlasLod(k, width, resolutions, minCellPx).resolution;
  }, [enabled, resolutions, width, k, minCellPx]);

  // The level immediately coarser than the target — a <=2x backdrop while the
  // target's tiles load.
  const backdrop = useMemo(() => {
    if (target == null) return null;
    const coarser = resolutions.filter((r) => r < target);
    return coarser.length ? coarser[coarser.length - 1] : null;
  }, [resolutions, target]);

  // Visible, populated tiles for a resolution entry, with base (identity) screen
  // rects. Partial last tiles are handled via per-tile cell ranges.
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
        const fx0 = (t.tx * tc) / R;
        const fx1 = Math.min((t.tx + 1) * tc, R) / R;
        const fy0 = (t.ty * tc) / R;
        const fy1 = Math.min((t.ty + 1) * tc, R) / R;
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

  const backdropTiles = useMemo(
    () => visibleTilesFor(resByNum.get(backdrop)),
    [visibleTilesFor, resByNum, backdrop]
  );
  const targetTiles = useMemo(
    () => visibleTilesFor(resByNum.get(target)),
    [visibleTilesFor, resByNum, target]
  );

  // Track which tiles have decoded so the backdrop can drop out once the target
  // is fully shown — otherwise the coarser level keeps showing through the
  // target's empty cells (two levels at once, worst at the finest zoom).
  const loadedRef = useRef(new Set());
  const [, bumpLoaded] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    loadedRef.current = new Set();
    bumpLoaded();
  }, [scopeId, imageColumn, sheet]);
  const markLoaded = useCallback((key) => {
    if (!loadedRef.current.has(key)) {
      loadedRef.current.add(key);
      bumpLoaded();
    }
  }, []);

  if (target == null) return null;

  // Backdrop is only a placeholder while the target's visible tiles load. Once
  // the target is ready it fades out (rather than vanishing) so layer changes
  // aren't an abrupt switch.
  const targetReady =
    targetTiles.length > 0 && targetTiles.every((t) => loadedRef.current.has(t.key));
  const hasBackdrop = backdrop != null && backdropTiles.length > 0;

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

  const renderTile = (t, fade) => (
    <img
      key={t.key}
      src={atlasTileUrl(dataset.id, scopeId, imageColumn, t.res, t.tx, t.ty, sheet)}
      alt=""
      decoding="async"
      onLoad={(e) => {
        if (fade) e.currentTarget.style.opacity = 1;
        if (fade) markLoaded(t.key);
      }}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
        if (fade) markLoaded(t.key); // don't wedge the backdrop on a missing tile
      }}
      style={{
        position: 'absolute',
        left: t.left,
        top: t.top,
        width: t.w,
        height: t.h,
        pointerEvents: 'none',
        // Target tiles fade in over the backdrop as they decode (smooths the
        // content change between levels); the backdrop shows immediately.
        ...(fade
          ? { opacity: 0, transition: 'opacity var(--ls-dur-fast) var(--ls-ease-out)' }
          : null),
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
      {hasBackdrop && (
        <div
          style={{
            ...innerStyle,
            // Visible while loading; fades out once the target is ready. No
            // transition on the way in so it provides continuity immediately.
            opacity: targetReady ? 0 : 1,
            transition: targetReady
              ? 'opacity var(--ls-dur-slow) var(--ls-ease-out)'
              : 'none',
          }}
        >
          {backdropTiles.map((t) => renderTile(t, false))}
        </div>
      )}
      <div style={innerStyle}>{targetTiles.map((t) => renderTile(t, true))}</div>
    </div>
  );
}

export default AtlasOverlay;
