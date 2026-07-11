import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { groups } from 'd3-array';
import Scatter from './ScatterGL';
import AnnotationPlot from '../AnnotationPlot';
import HullPlot from '../HullPlot';
import TilePlot from '../TilePlot';
import CrossHair from './Crosshair';
import { processHulls } from './util';
import FilteredPointsOverlay from './FilteredPointsOverlay';
import PointLabel from './PointLabel';
import { filterConstants } from './Search/utils';

import { useScope } from '../../contexts/ScopeContext';
import { useFilter } from '../../contexts/FilterContext';

import { mapSelectionKey } from '../../lib/colors';
import { imageUrlFor } from '../../lib/imageUrl';
import { fetchAtlasStatus } from '../../lib/atlasUrl';
import { atlasLod, MIN_CELL_PX, POINTS_HANDOFF_CELL_PX } from '../../lib/atlasLod';
import HoverThumbnail from './HoverThumbnail';
import AtlasOverlay from './AtlasOverlay';
import PointsOverlay from './PointsOverlay';
import ColorLegend from './ColorLegend';
import styles from './VisualizationPane.module.scss';
import ConfigurationPanel from './ConfigurationPanel';
import { useColorBy } from '../../hooks/useColorBy';
import { useCellMembers } from '../../hooks/useCellMembers';
import MembersTooltip from './MembersTooltip';
import CellDetail from './CellDetail';
import Scatter3D from './Scatter3D';
import VoxelView from './VoxelView';
import { Readout, Spinner } from '../ui';

// Signature #1 — viewport reticle ticks: four corner L-marks that turn amber
// while a selection/filter is active. Pure chrome: pointer-events none.
function ViewportReticle({ active }) {
  return (
    <div
      className={`${styles.reticle} ${active ? styles.reticleActive : ''}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function VisualizationPane({
  width,
  height,
  hovered,
  hoveredIndex,
  onHover,
  onSelect,
  hoverAnnotations,
  selectedAnnotations,
  hoveredCluster,
  isSmallScreen = false,
}) {
  const { scopeRows, clusterLabels, scope, features, dataset } = useScope();

  // 3D scopes (umap run with --dimensions 3) carry a z coordinate + voxel
  // indices, unlocking a [2D · 3D · Voxels] view toggle. 2D scopes keep the
  // classic ScatterGL projection untouched (zero regression).
  const is3D = scope?.dimensions === 3;
  const [viewMode, setViewMode] = useState('2d');
  useEffect(() => {
    // default 3D scopes to the 3D scatter; keep 2D scopes on the 2D map.
    setViewMode(is3D ? '3d' : '2d');
  }, [is3D, scope?.id]);

  // first binary image column (if any) for the hover thumbnail
  const hoverImageColumn = useMemo(() => {
    const columnMetadata = dataset?.column_metadata || {};
    return Object.keys(columnMetadata).find((col) => columnMetadata[col]?.type === 'image');
  }, [dataset]);

  // ====================================================================================================
  // Image map: heatmap -> representative-image atlas -> points, as one LOD.
  // The atlas (sprite sheets keyed to the heatmap grid) is generated as a
  // post-scope step; when present, an image dataset defaults to this view.
  // ====================================================================================================
  const [atlasStatus, setAtlasStatus] = useState({ generated: false });
  useEffect(() => {
    let cancelled = false;
    if (!dataset?.id || !scope?.id || !hoverImageColumn) {
      setAtlasStatus({ generated: false });
      return;
    }
    fetchAtlasStatus(dataset.id, scope.id, hoverImageColumn)
      .then((status) => {
        if (!cancelled) setAtlasStatus(status);
      })
      .catch(() => {
        if (!cancelled) setAtlasStatus({ generated: false });
      });
    return () => {
      cancelled = true;
    };
  }, [dataset?.id, scope?.id, hoverImageColumn]);

  // An image dataset with a generated atlas defaults to the image map (heatmap
  // -> images -> points). The master toggle lets the user fall back to a plain
  // scatter; "always show points" keeps individual points drawn on top.
  const isImageDataset = !!hoverImageColumn && !!atlasStatus.generated;
  const [imageMode, setImageMode] = useState(false);
  const [alwaysShowPoints, setAlwaysShowPoints] = useState(false);
  useEffect(() => {
    setImageMode(isImageDataset);
  }, [isImageDataset]);

  const toggleImageMode = useCallback(() => setImageMode((p) => !p), []);
  const toggleAlwaysShowPoints = useCallback(() => setAlwaysShowPoints((p) => !p), []);

  const atlasResolutions = useMemo(
    () => (atlasStatus.resolutions || []).map((r) => r.num_tiles),
    [atlasStatus]
  );

  const {
    featureFilter,
    clusterFilter,
    shownIndices,
    filteredIndices,
    filterConfig,
    filterActive,
    // The current table page's rows (with sae_indices/sae_acts when an SAE is
    // active) — drives the feature activation coloring below.
    dataTableRows,
  } = useFilter();

  // only show the hull if we are filtering by cluster
  const showHull = filterConfig?.type === filterConstants.CLUSTER;

  const maxZoom = 64;

  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
  const handleView = useCallback(
    (xDomain, yDomain, transform) => {
      setXDomain(xDomain);
      setYDomain(yDomain);
      setTransform(transform);
    },
    [setXDomain, setYDomain]
  );

  // const [isFullScreen, setIsFullScreen] = useState(false);
  const [isFullScreen] = useState(true);
  const umapRef = useRef(null);

  const featureIsSelected = featureFilter.feature !== -1;

  // Add new memoized feature activation lookup
  const featureActivationMap = useMemo(() => {
    if (!featureIsSelected || !dataTableRows || !shownIndices) {
      return new Map();
    }

    const lookup = new Map();
    dataTableRows.forEach((data) => {
      const activatedIdx = data.sae_indices ? data.sae_indices.indexOf(featureFilter.feature) : -1;
      if (activatedIdx !== -1) {
        const activatedFeature = data.sae_acts[activatedIdx];
        // normalize the activation to be between 0 and 1
        const min = 0.0;
        const max = features?.[featureFilter.feature]?.dataset_max || 1.0;
        const normalizedActivation = (activatedFeature - min) / (max - min);
        lookup.set(data.ls_index, normalizedActivation);
      }
    });
    return lookup;
  }, [featureIsSelected, dataTableRows, featureFilter.feature, features]);

  // Set view of shownIndices for O(1) membership checks: an Array.includes
  // per point would make this O(N·page) — a real hotspot for token scopes
  // with ~1M points.
  const shownIndicesSet = useMemo(() => new Set(shownIndices), [shownIndices]);

  const drawingPoints = useMemo(() => {
    return scopeRows.map((p, i) => {
      if (featureIsSelected) {
        if (shownIndicesSet.has(i)) {
          const activation = featureActivationMap.get(p.ls_index);
          return activation !== undefined
            ? [p.x, p.y, mapSelectionKey.selected, activation]
            : [p.x, p.y, mapSelectionKey.notSelected, 0.0];
        }
        return [p.x, p.y, mapSelectionKey.notSelected, 0.0];
      }

      if (p.deleted) {
        return [-10, -10, mapSelectionKey.hidden, 0.0];
        //   } else if (hoveredIndex === i) {
        //     return [p.x, p.y, mapSelectionKey.hovered, 0.0];
      } else if (shownIndicesSet.has(i)) {
        return [p.x, p.y, mapSelectionKey.selected, 0.0];
      } else if (shownIndicesSet.size) {
        return [p.x, p.y, mapSelectionKey.notSelected, 0.0];
      } else {
        return [p.x, p.y, mapSelectionKey.normal, 0.0];
      }
    });
  }, [scopeRows, shownIndicesSet, featureActivationMap, featureIsSelected]);

  // ====================================================================================================
  // Color-by column (#131): drive point hue from a numeric/categorical column.
  // Values come back aligned to the scope's ls_index order — the same order as
  // scopeRows / drawingPoints — so they index-align 1:1 with the draw points.
  // ====================================================================================================
  const {
    column: colorByColumn,
    setColumn: setColorByColumn,
    pointColors: colorByColors,
    legend: colorByLegend,
  } = useColorBy(dataset?.id, scope?.id);

  // Columns offered in the picker: numeric columns, plus categorical string
  // columns (those ingest tagged with a bounded set of `categories`). Image /
  // url / array / high-cardinality string columns are not colorable.
  const colorableColumns = useMemo(() => {
    const cm = dataset?.column_metadata || {};
    return Object.keys(cm).filter((col) => {
      const m = cm[col];
      if (!m) return false;
      if (m.image || m.type === 'array' || m.type === 'image') return false;
      if (m.type === 'number') return true;
      if (m.categories) return true;
      return false;
    });
  }, [dataset]);

  // Only hand color hues to the scatter when the fetched values line up with the
  // points we're drawing; otherwise fall back to selection coloring.
  const scatterPointColors = useMemo(() => {
    if (!colorByColumn || !colorByColors) return null;
    if (colorByColors.length !== drawingPoints.length) return null;
    return colorByColors;
  }, [colorByColumn, colorByColors, drawingPoints.length]);

  const hulls = useMemo(() => {
    return processHulls(clusterLabels, scopeRows, (d) => (d.deleted ? null : [d.x, d.y]));
  }, [scopeRows, clusterLabels]);

  // derive the hulls from the cluster, and filter deleted points via an accessor
  const clusterHulls = useMemo(() => {
    if (!clusterFilter.cluster || !scopeRows) return [];
    return processHulls([clusterFilter.cluster], scopeRows, (d) => (d.deleted ? null : [d.x, d.y]));
  }, [clusterFilter.cluster, scopeRows]);

  const hoveredHulls = useMemo(() => {
    if (!hoveredCluster || !scopeRows) return [];
    return processHulls([hoveredCluster], scopeRows, (d) => (d.deleted ? null : [d?.x, d?.y]));
  }, [hoveredCluster, scopeRows]);

  // TODO: these should just be based on which tile we choose, 32, 64 or 128
  const tileMeta = useMemo(() => {
    return {
      size: 2 / 64,
      cols: 64,
    };
  }, []);
  const tiles = useMemo(() => {
    return groups(scopeRows, (d) => d.tile_index_64).map((tile) => {
      return {
        tile_index: tile[0],
        points: tile[1],
      };
    });
  }, [scopeRows]);

  // ====================================================================================================
  // Members-in-cell tooltip for the 2D heatmap. TilePlot is pointer-events:none
  // (ScatterGL owns hover), so we derive the hovered cell from the existing
  // point-hover: the hovered point's tile_index_64. The tooltip follows the
  // cursor, whose position we track on the pane. Same reusable hook the voxel
  // view uses (useCellMembers) -> one members-tooltip implementation.
  // ====================================================================================================
  const tileCellKeyOf = useCallback((row) => row.tile_index_64, []);
  const {
    setActiveCell: setTileActiveCell,
    active: tileActive,
    snippets: tileSnippets,
    loadingSnippets: tileLoadingSnippets,
  } = useCellMembers({ scopeRows, scope, cellKeyOf: tileCellKeyOf });
  const mouseRef = useRef({ x: 0, y: 0 });
  const [tileTooltipPos, setTileTooltipPos] = useState(null);

  // ====================================================================================================
  // Cell detail drawer (#154): clicking a heatmap tile (2D) or a voxel (3D)
  // opens a drawer listing every datapoint in that cell. { key, column } names
  // the cell; CellDetail derives membership from scopeRows itself.
  // ====================================================================================================
  const [selectedCell, setSelectedCell] = useState(null);
  // Voxel view -> open the cell drawer for a clicked voxel.
  const onCellSelect = useCallback((key, column) => {
    if (key === null || key === undefined) setSelectedCell(null);
    else setSelectedCell({ key, column });
  }, []);
  // 2D map select: when the heatmap is showing, a click opens the tile's cell
  // drawer (the tile under the clicked point); otherwise it opens PointDetail
  // via the original onSelect (zero change to the non-heatmap flow).
  const handleScatterSelect = useCallback(
    (indices) => {
      const idx = indices?.[0];
      if (heatmapVisibleRef.current && idx !== undefined && idx !== -1 && scopeRows?.[idx]) {
        setSelectedCell({ key: scopeRows[idx].tile_index_64, column: 'tile_index_64' });
      } else {
        onSelect(indices);
      }
    },
    [scopeRows, onSelect]
  );
  // Deep-link a cell entry into the full PointDetail drawer.
  const openPointFromCell = useCallback(
    (pos) => {
      setSelectedCell(null);
      onSelect([pos]);
    },
    [onSelect]
  );

  // ====================================================================================================
  // Configuration Panel
  // ====================================================================================================
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [vizConfig, setVizConfig] = useState({
    showHeatMap: false,
    showClusterOutlines: true,
    pointSize: 1,
    pointOpacity: 1,
    // Image-map LOD tuning: on-screen px at which a finer level kicks in, and
    // how big the finest cells may grow before points take over.
    atlasSwitchPx: MIN_CELL_PX,
    atlasPointsPx: POINTS_HANDOFF_CELL_PX,
  });

  useEffect(() => {
    if (scopeRows?.length <= 1000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 2.25 }));
    } else if (scopeRows?.length <= 10000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 1.25 }));
    } else if (scopeRows?.length <= 100000) {
      setVizConfig((prev) => ({ ...prev, pointSize: 0.75 }));
    } else {
      setVizConfig((prev) => ({ ...prev, pointSize: 0.5 }));
    }
  }, [scopeRows]);

  const toggleShowHeatMap = useCallback(() => {
    setVizConfig((prev) => ({ ...prev, showHeatMap: !prev.showHeatMap }));
  }, []);

  const toggleShowClusterOutlines = useCallback(() => {
    setVizConfig((prev) => ({ ...prev, showClusterOutlines: !prev.showClusterOutlines }));
  }, []);

  const updatePointSize = useCallback((value) => {
    setVizConfig((prev) => ({ ...prev, pointSize: value }));
  }, []);

  const updatePointOpacity = useCallback((value) => {
    setVizConfig((prev) => ({ ...prev, pointOpacity: value }));
  }, []);

  const updateAtlasSwitchPx = useCallback((value) => {
    setVizConfig((prev) => ({ ...prev, atlasSwitchPx: value }));
  }, []);
  const updateAtlasPointsPx = useCallback((value) => {
    setVizConfig((prev) => ({ ...prev, atlasPointsPx: value }));
  }, []);

  // Level of detail for the image map at the current zoom (tunable thresholds).
  const lod = useMemo(
    () =>
      atlasLod(
        transform?.k || 1,
        width,
        atlasResolutions,
        vizConfig.atlasSwitchPx,
        vizConfig.atlasPointsPx
      ),
    [transform, width, atlasResolutions, vizConfig.atlasSwitchPx, vizConfig.atlasPointsPx]
  );
  // Points drawn on top of the atlas: past the deepest grid, or always-on.
  const pointsVisible = imageMode && (lod.deepest || alwaysShowPoints);

  // The 2D heatmap is showing when: image-mode zoomed out, or the manual
  // toggle for non-image scopes. Members tooltip is only active then.
  const heatmapVisible =
    viewMode === '2d' &&
    (imageMode ? !lod.active : vizConfig.showHeatMap) &&
    tiles?.length > 1;
  // Mirror into a ref so the (stable) select handler reads the live value
  // without being torn down/recreated on every heatmap toggle.
  const heatmapVisibleRef = useRef(heatmapVisible);
  heatmapVisibleRef.current = heatmapVisible;

  // Drive the tile members tooltip from the existing point-hover.
  useEffect(() => {
    if (
      heatmapVisible &&
      hoveredIndex !== null &&
      hoveredIndex !== undefined &&
      scopeRows?.[hoveredIndex]
    ) {
      setTileActiveCell(scopeRows[hoveredIndex].tile_index_64);
      setTileTooltipPos({ x: mouseRef.current.x, y: mouseRef.current.y });
    } else {
      setTileActiveCell(null);
      setTileTooltipPos(null);
    }
  }, [heatmapVisible, hoveredIndex, scopeRows, setTileActiveCell]);

  // Cluster hull layers, shared between the text-mode position (under the
  // atlas/heatmap) and the image-mode position (above them). In image mode
  // the all-clusters outline is drawn thinner and more transparent so it
  // reads as a subtle boundary over the imagery rather than a drawn shape.
  const hullLayers = (
    <>
      {vizConfig.showClusterOutlines && hulls.length > 0 && (
        <HullPlot
          hulls={hulls}
          // stroke="#E7C7AA"
          // stroke={cluster && cluster.hull ? 'lightgray' : '#E7C7AA'}
          // stroke={isDark ? '#E0EFFF' : '#d4b297'}
          stroke="#d4b297"
          // stroke={'#E0EFFF'}
          fill="none"
          duration={200}
          strokeWidth={imageMode ? 0.5 : 0.75}
          opacity={imageMode ? 0.45 : 0.75}
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
        />
      )}
      {hoveredCluster && hoveredHulls?.length > 0 && scope.cluster_labels_lookup && (
        <HullPlot
          hulls={hoveredHulls}
          fill="#8bcf66"
          stroke="#6aa64f"
          strokeWidth={2.5}
          // if there are selected indices already, that means other points will be less visible
          // so we can make the hull a bit more transparent
          opacity={imageMode ? 0.15 : 0.2}
          duration={0}
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
          label={scope.cluster_labels_lookup[hoveredCluster.cluster]}
          k={transform.k}
          maxZoom={maxZoom}
        />
      )}
      {/* Cluster is selected via filter */}
      {showHull &&
        clusterFilter.cluster &&
        clusterFilter.cluster.hull?.length > 0 &&
        !scope.ignore_hulls &&
        scope.cluster_labels_lookup && (
          <HullPlot
            hulls={clusterHulls}
            fill="#D3965E"
            stroke="#C77C37"
            strokeWidth={3}
            opacity={imageMode ? 0.18 : 0.25}
            duration={0}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
            label={scope.cluster_labels_lookup[clusterFilter.cluster.cluster]}
          />
        )}
    </>
  );

  // ensure the order of selectedPoints
  // exactly matches the ordering of indexes in shownIndices.
  const selectedPoints = useMemo(() => {
    if (!shownIndices || !scopeRows) return [];
    return shownIndices
      .map((ls_index, i) => {
        // scopeRows[i].ls_index === i (scope invariant), so index directly
        // instead of an O(N) find per shown row — token scopes can have ~1M
        // points.
        const point = scopeRows[ls_index];
        return point ? { ...point, index: i } : null;
      })
      .filter((point) => point !== null);
  }, [shownIndices, scopeRows]);

  // Signature #2 — mono telemetry: shown/total point counts + zoom factor.
  const totalPoints = scopeRows?.length || 0;
  const shownCount = shownIndices?.length;
  const ptsValue =
    shownCount != null && shownCount > 0 && shownCount !== totalPoints
      ? `${shownCount.toLocaleString()}/${totalPoints.toLocaleString()}`
      : totalPoints.toLocaleString();
  const zoomValue = `${(transform?.k || 1).toFixed(1)}×`;

  const selectionActive = filterActive || selectedAnnotations?.length > 0;

  return (
    <div ref={umapRef} className={styles.visualizationPane}>
      {!scopeRows?.length && (
        <div className="ls-scrim">
          <Spinner label="LOADING MAP…" />
        </div>
      )}
      <ViewportReticle active={selectionActive} />
      <div className={styles.configToggleContainer}>
        <button
          type="button"
          className={`ls-icon-btn ${styles.configToggle}`}
          onClick={() => setIsPanelOpen(!isPanelOpen)}
          aria-label="Chart settings"
          title="Chart settings"
          aria-expanded={isPanelOpen}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
        </button>

        <div className={styles.telemetry}>
          <Readout label="PTS" value={ptsValue} />
          <Readout label="ZOOM" value={zoomValue} />
        </div>

        <ConfigurationPanel
          isOpen={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
          title="View Settings"
          vizConfig={vizConfig}
          toggleShowHeatMap={toggleShowHeatMap}
          toggleShowClusterOutlines={toggleShowClusterOutlines}
          updatePointSize={updatePointSize}
          updatePointOpacity={updatePointOpacity}
          isImageDataset={isImageDataset}
          imageMode={imageMode}
          toggleImageMode={toggleImageMode}
          alwaysShowPoints={alwaysShowPoints}
          toggleAlwaysShowPoints={toggleAlwaysShowPoints}
          updateAtlasSwitchPx={updateAtlasSwitchPx}
          updateAtlasPointsPx={updateAtlasPointsPx}
        />
      </div>

      {/* Color-by column picker + legend (#131). Only shown when the dataset
          exposes colorable columns and we're not in the image map. */}
      {colorableColumns.length > 0 && !imageMode && (
        <div className={styles.colorByContainer}>
          <label className={`${styles.colorByPicker} ls-panel ls-panel--floating`}>
            <span className={styles.colorByLabel}>Color by</span>
            <select
              className="ls-select"
              value={colorByColumn || ''}
              onChange={(e) => setColorByColumn(e.target.value || null)}
            >
              <option value="">None (selection)</option>
              {colorableColumns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </label>
          {colorByColumn && colorByLegend && <ColorLegend legend={colorByLegend} />}
        </div>
      )}

      {/* 3D view toggle — only for 3D scopes (dimensions === 3). Floating HUD
          panel with the ONE tab primitive as a segmented mode switch. */}
      {is3D && (
        <div
          className="ls-panel ls-panel--floating"
          role="tablist"
          aria-label="View mode"
          style={{
            position: 'absolute',
            top: 'var(--ls-space-2)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 'var(--ls-space-1)',
            padding: 'var(--ls-space-1) var(--ls-space-2)',
          }}
        >
          {[
            ['2d', '2D'],
            ['3d', '3D'],
            ['voxels', 'Voxels'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              className="ls-tab"
              onClick={() => setViewMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div
        className={styles.scatters + ' ' + (isFullScreen ? styles.fullScreen : '')}
        onMouseMove={(e) => {
          mouseRef.current = { x: e.clientX, y: e.clientY };
        }}
      >
        {/* 3D scatter (three.js soft splats) for 3D scopes */}
        {viewMode === '3d' && scope && (
          <Scatter3D
            scopeRows={scopeRows}
            width={width}
            height={height}
            scope={scope}
            clusterLabels={clusterLabels}
            selectedCluster={clusterFilter.cluster}
            hoveredIndex={hoveredIndex}
            onHover={onHover}
            onSelect={onSelect}
            pointScale={vizConfig.pointSize}
            pointColors={scatterPointColors}
          />
        )}
        {/* Voxel heatmap (aggregated cubes + slice plane) for 3D scopes */}
        {viewMode === 'voxels' && scope && (
          <VoxelView
            scopeRows={scopeRows}
            width={width}
            height={height}
            scope={scope}
            clusterLabels={clusterLabels}
            pointColors={scatterPointColors}
            onCellSelect={onCellSelect}
          />
        )}
        {viewMode === '2d' && (
          <>
        {scope && (
          <Scatter
            points={drawingPoints}
            width={width}
            height={height}
            onView={handleView}
            onSelect={handleScatterSelect}
            onHover={onHover}
            featureIsSelected={featureIsSelected}
            maxZoom={maxZoom}
            isSmallScreen={isSmallScreen}
            pointScale={vizConfig.pointSize}
            pointOpacity={vizConfig.pointOpacity}
            pointColors={scatterPointColors}
            // In image mode the visible points come from the PointsOverlay (on
            // top of the atlas); the GPU layer stays for zoom/hover/select only.
            hidePoints={imageMode}
          />
        )}
        {/* green dots for all filtered points beyond the table page */}
        {filterActive && (
          <FilteredPointsOverlay
            scopeRows={scopeRows}
            filteredIndices={filteredIndices}
            shownIndices={shownIndices}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
          />
        )}
        {/* Cluster hulls render here (under the atlas) for text scopes; in
            image mode they render later, above the atlas/heatmap tiles, so
            boundaries stay visible over the imagery. */}
        {!imageMode && hullLayers}
        {/* Image map: the atlas sheet (representative image per heatmap cell)
            takes over from the heatmap as you zoom in. */}
        {imageMode && scope?.id && atlasStatus.generated && (
          <AtlasOverlay
            dataset={dataset}
            scopeId={scope.id}
            imageColumn={hoverImageColumn}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
            transform={transform}
            enabled={imageMode}
            manifest={atlasStatus}
            minCellPx={vizConfig.atlasSwitchPx}
          />
        )}
        {/* Points drawn on top of the image grid (past the deepest grid, or
            when "always show points" is on) so they can be hovered. */}
        {pointsVisible && (
          <PointsOverlay
            scopeRows={scopeRows}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
            enabled={pointsVisible}
            opacity={vizConfig.pointOpacity}
            pointSize={vizConfig.pointSize}
          />
        )}
        <AnnotationPlot
          points={hoverAnnotations}
          stroke="black"
          fill="#8bcf66"
          size="16"
          fixedSize
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
        />
        <AnnotationPlot
          points={selectedAnnotations}
          stroke="black"
          fill="purple"
          size="16"
          fixedSize
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
        />
        {/* Heatmap: the zoomed-out base in image mode (the atlas takes over as
            you zoom), or the manual toggle for non-image scopes. */}
        {(imageMode ? !lod.active : vizConfig.showHeatMap) && tiles?.length > 1 && (
          <TilePlot
            tiles={tiles}
            tileMeta={tileMeta}
            xDomain={xDomain}
            yDomain={yDomain}
            width={width}
            height={height}
            fill="gray"
            // stroke="black"
          />
        )}
        {/* In image mode the hulls sit above the atlas/heatmap imagery */}
        {imageMode && hullLayers}
        <PointLabel
          selectedPoints={selectedPoints}
          hovered={hovered}
          xDomain={xDomain}
          yDomain={yDomain}
          width={width}
          height={height}
          k={transform.k}
          maxZoom={maxZoom}
          muted={imageMode}
        />
        {isSmallScreen && (
          <CrossHair xDomain={xDomain} yDomain={yDomain} width={width} height={height} />
        )}
          </>
        )}
      </div>

      {/* Members-in-cell tooltip over the 2D heatmap (N datapoints · dominant
          cluster + sampled snippets). Same hook/presentation as the voxel view. */}
      {tileTooltipPos && tileActive && (
        <MembersTooltip
          x={tileTooltipPos.x}
          y={tileTooltipPos.y}
          summary={tileActive.summary}
          snippets={tileSnippets}
          loading={tileLoadingSnippets}
        />
      )}

      {/* Cell detail drawer (#154): all datapoints in a clicked tile/voxel. */}
      <CellDetail
        selectedCell={selectedCell}
        onClose={() => setSelectedCell(null)}
        onOpenPoint={openPointFromCell}
      />

      {/* Hover information display — a floating Panel pinned top-right */}
      {hovered && (
        <div className={`${styles.hoverCard} ls-panel ls-panel--floating`}>
          {/* Token scopes: the hovered point is a token — show its cleaned
              surface string prominently, above the cluster line. */}
          {hovered.token !== undefined && hovered.token !== null && (
            <span className={styles.hoverCardToken}>{hovered.token}</span>
          )}
          {hoveredCluster && (
            <span className={styles.hoverCardCluster}>
              Cluster {hoveredCluster.cluster}: {hoveredCluster.label}
            </span>
          )}
          <Readout label="INDEX" value={hovered.index} />
          {hoverImageColumn && hovered.index !== null && hovered.index !== undefined && (
            <HoverThumbnail
              src={imageUrlFor(dataset.id, hoverImageColumn, hovered.index, 150)}
              alt={`${hoverImageColumn} ${hovered.index}`}
              size={150}
            />
          )}
          <p className={styles.hoverCardText}>
            {hovered.loading && !hovered.text ? (
              <em>loading…</em>
            ) : hovered.tokenSnippet ? (
              /* Token scopes: passage context with the token highlighted */
              <>
                {hovered.tokenSnippet.truncatedStart ? '…' : ''}
                {hovered.tokenSnippet.before}
                <mark className={styles.hoverCardTokenMark}>{hovered.tokenSnippet.match}</mark>
                {hovered.tokenSnippet.after}
                {hovered.tokenSnippet.truncatedEnd ? '…' : ''}
              </>
            ) : (
              hovered.text
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default VisualizationPane;
