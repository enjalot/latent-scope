import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { interpolateReds } from 'd3-scale-chromatic';
import { extent } from 'd3-array';
import { Tooltip } from 'react-tooltip';
import Scatter from '../Scatter';
import AnnotationPlot from '../AnnotationPlot';
import CrosshairPlot from './CrosshairPlot';
import NeighborPlot from './NeighborPlot';
import { buildColorPoints } from './colorBy';
import styles from './Compare.module.css';

// Spread stat: diagonal of the bounding box of the given indices in a point
// set, giving a quick sense of how dispersed a brush selection is per pane.
function selectionSpread(points, indices) {
  if (!points?.length || !indices?.length) return null;
  const xs = [];
  const ys = [];
  for (const i of indices) {
    const p = points[i];
    if (p) {
      xs.push(p[0]);
      ys.push(p[1]);
    }
  }
  if (!xs.length) return null;
  const [x0, x1] = extent(xs);
  const [y0, y1] = extent(ys);
  return Math.hypot(x1 - x0, y1 - y0);
}

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

const apiUrl = import.meta.env.VITE_API_URL;

function SideBySideView({
  datasetId,
  dataset,
  left,
  right,
  leftPoints,
  rightPoints,
  drawPoints,
  displacementData,
  width,
  height,
  onScatter,
  onSelect,
  onHover,
  onNeighborSelect,
  pointSizeRange,
  opacityRange,
  hoveredIndex,
  metricK,
  selectedIndices,
  colorConfig,
}) {
  const leftScatterRef = useRef(null);
  const rightScatterRef = useRef(null);
  const [linkZoom, setLinkZoom] = useState(true);

  const [leftXDomain, setLeftXDomain] = useState([-1, 1]);
  const [leftYDomain, setLeftYDomain] = useState([-1, 1]);
  const [rightXDomain, setRightXDomain] = useState([-1, 1]);
  const [rightYDomain, setRightYDomain] = useState([-1, 1]);

  const zoomSourceRef = useRef(null);

  // Click/neighbor state
  const [clickedIndex, setClickedIndex] = useState(null);
  const [clickedSide, setClickedSide] = useState(null);
  const [neighborIndices, setNeighborIndices] = useState([]);

  // Hover tooltip state
  const [hoverText, setHoverText] = useState(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const hoverFetchRef = useRef(0);

  // Build display points for each side. Three modes, in priority order:
  //   1. neighbor mode (a point was clicked): dim all metric points so the
  //      NeighborPlot overlay stands out.
  //   2. color-by-column mode: encode the column value into the color channel.
  //   3. drift mode (default): encode the drift metric into the color channel.
  const buildDisplay = useCallback(
    (pts) => {
      if (!pts?.length) return [];
      if (clickedIndex != null) {
        return pts.map((p) => [p[0], p[1], 0, 0]);
      }
      if (colorConfig) {
        return buildColorPoints(pts, colorConfig);
      }
      if (!drawPoints?.length) return [];
      return pts.map((p, i) => {
        const dp = drawPoints[i];
        return [p[0], p[1], dp ? dp[2] : 0, dp ? dp[3] : 0];
      });
    },
    [drawPoints, clickedIndex, colorConfig]
  );

  const leftDisplayPoints = useMemo(() => buildDisplay(leftPoints), [leftPoints, buildDisplay]);
  const rightDisplayPoints = useMemo(() => buildDisplay(rightPoints), [rightPoints, buildDisplay]);

  // Color / opacity encoding for the Scatter, shared by both panes. Neighbor
  // mode keeps the drift-style dim; color-by mode drives hue from the column.
  const scatterColorProps = useMemo(() => {
    if (clickedIndex != null) {
      return {
        colorScaleType: 'continuous',
        colorInterpolator: interpolateReds,
        colorRange: undefined,
        colorDomain: undefined,
        opacityBy: 'valueA',
      };
    }
    if (colorConfig?.type === 'categorical') {
      return {
        colorScaleType: 'categorical',
        colorInterpolator: undefined,
        colorRange: colorConfig.colorRange,
        colorDomain: colorConfig.colorDomain,
        opacityBy: undefined,
      };
    }
    if (colorConfig?.type === 'numeric') {
      return {
        colorScaleType: 'continuous',
        colorInterpolator: colorConfig.interpolator,
        colorRange: undefined,
        colorDomain: undefined,
        opacityBy: undefined,
      };
    }
    return {
      colorScaleType: 'continuous',
      colorInterpolator: interpolateReds,
      colorRange: undefined,
      colorDomain: undefined,
      opacityBy: 'valueA',
    };
  }, [clickedIndex, colorConfig]);

  const handleLeftScatter = useCallback(
    (s) => {
      leftScatterRef.current = s;
      onScatter && onScatter(s);
    },
    [onScatter]
  );

  const handleRightScatter = useCallback((s) => {
    rightScatterRef.current = s;
  }, []);

  const handleLeftView = useCallback(
    (xd, yd) => {
      setLeftXDomain(xd);
      setLeftYDomain(yd);
      if (linkZoom && zoomSourceRef.current !== 'right') {
        zoomSourceRef.current = 'left';
        setRightXDomain(xd);
        setRightYDomain(yd);
        try {
          rightScatterRef.current?.zoomToArea({
            x: xd[0],
            y: yd[0],
            width: xd[1] - xd[0],
            height: yd[1] - yd[0],
          })?.catch?.(() => {});
        } catch (e) { /* scatter not ready yet */ }
        setTimeout(() => {
          zoomSourceRef.current = null;
        }, 50);
      }
    },
    [linkZoom]
  );

  const handleRightView = useCallback(
    (xd, yd) => {
      setRightXDomain(xd);
      setRightYDomain(yd);
      if (linkZoom && zoomSourceRef.current !== 'left') {
        zoomSourceRef.current = 'right';
        setLeftXDomain(xd);
        setLeftYDomain(yd);
        try {
          leftScatterRef.current?.zoomToArea({
            x: xd[0],
            y: yd[0],
            width: xd[1] - xd[0],
            height: yd[1] - yd[0],
          })?.catch?.(() => {});
        } catch (e) { /* scatter not ready yet */ }
        setTimeout(() => {
          zoomSourceRef.current = null;
        }, 50);
      }
    },
    [linkZoom]
  );

  // Fetch hover text for tooltip
  useEffect(() => {
    if (hoveredIndex == null || !dataset) {
      setHoverText(null);
      setHoverLoading(false);
      return;
    }
    setHoverLoading(true);
    const fetchId = ++hoverFetchRef.current;
    fetch(`${apiUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: datasetId, indices: [hoveredIndex], page: 0 }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (fetchId !== hoverFetchRef.current) return;
        const text = data.rows?.[0]?.[dataset.text_column];
        setHoverText(text);
        setHoverLoading(false);
      })
      .catch(() => {
        setHoverText(null);
        setHoverLoading(false);
      });
  }, [hoveredIndex, datasetId, dataset]);

  const clearNeighbors = useCallback(() => {
    setClickedIndex(null);
    setClickedSide(null);
    setNeighborIndices([]);
    onNeighborSelect && onNeighborSelect(null, []);
  }, [onNeighborSelect]);

  // Handle click on a scatter — toggle neighbor mode
  const handleLeftClick = useCallback(
    (indices) => {
      if (!indices?.length) return;
      const idx = indices[0];
      if (clickedIndex === idx && clickedSide === 'left') {
        clearNeighbors();
        return;
      }
      setClickedIndex(idx);
      setClickedSide('left');
      fetch(
        `${apiUrl}/search/compare/neighbors?dataset=${datasetId}&umap_left=${left.id}&umap_right=${right.id}&point_index=${idx}&side=left&k=${metricK}`
      )
        .then((r) => r.json())
        .then((data) => {
          setNeighborIndices(data.neighbor_indices);
          onNeighborSelect && onNeighborSelect(idx, data.neighbor_indices);
        });
    },
    [clickedIndex, clickedSide, datasetId, left, right, metricK, clearNeighbors, onNeighborSelect]
  );

  const handleRightClick = useCallback(
    (indices) => {
      if (!indices?.length) return;
      const idx = indices[0];
      if (clickedIndex === idx && clickedSide === 'right') {
        clearNeighbors();
        return;
      }
      setClickedIndex(idx);
      setClickedSide('right');
      fetch(
        `${apiUrl}/search/compare/neighbors?dataset=${datasetId}&umap_left=${left.id}&umap_right=${right.id}&point_index=${idx}&side=right&k=${metricK}`
      )
        .then((r) => r.json())
        .then((data) => {
          setNeighborIndices(data.neighbor_indices);
          onNeighborSelect && onNeighborSelect(idx, data.neighbor_indices);
        });
    },
    [clickedIndex, clickedSide, datasetId, left, right, metricK, clearNeighbors, onNeighborSelect]
  );

  // Distinguish a lasso/brush (>1 point) from a single-point click (==1, the
  // kNN neighbor path). A regl `select` event carries the enclosed indices for
  // a lasso and a single index for a click; a `deselect` arrives as [].
  const handleClearBrush = useCallback(() => {
    onSelect && onSelect([]);
  }, [onSelect]);

  const handleLeftSelect = useCallback(
    (indices) => {
      if (indices && indices.length > 1) {
        clearNeighbors();
        onSelect && onSelect(indices);
      } else if (indices && indices.length === 1) {
        handleLeftClick(indices);
      } else {
        handleClearBrush();
      }
    },
    [handleLeftClick, clearNeighbors, onSelect, handleClearBrush]
  );

  const handleRightSelect = useCallback(
    (indices) => {
      if (indices && indices.length > 1) {
        clearNeighbors();
        onSelect && onSelect(indices);
      } else if (indices && indices.length === 1) {
        handleRightClick(indices);
      } else {
        handleClearBrush();
      }
    },
    [handleRightClick, clearNeighbors, onSelect, handleClearBrush]
  );

  // Clear neighbor mode when UMAPs change
  useEffect(() => {
    setClickedIndex(null);
    setClickedSide(null);
    setNeighborIndices([]);
  }, [left, right]);

  const leftSpread = useMemo(
    () => selectionSpread(leftPoints, selectedIndices),
    [leftPoints, selectedIndices]
  );
  const rightSpread = useMemo(
    () => selectionSpread(rightPoints, selectedIndices),
    [rightPoints, selectedIndices]
  );

  // Hover crosshair points
  const leftHoverPoint =
    hoveredIndex != null && leftPoints[hoveredIndex] ? leftPoints[hoveredIndex] : null;
  const rightHoverPoint =
    hoveredIndex != null && rightPoints[hoveredIndex] ? rightPoints[hoveredIndex] : null;

  // Displacement value for hovered point
  const hoveredDisplacement =
    hoveredIndex != null && displacementData?.[hoveredIndex] != null
      ? displacementData[hoveredIndex].toFixed(3)
      : null;

  const halfWidth = Math.floor((width - 12) / 2);

  return (
    <div className={styles['side-by-side-view']}>
      <div className={styles['view-toolbar']}>
        <label className={styles['link-zoom-toggle']}>
          <input
            type="checkbox"
            checked={linkZoom}
            onChange={(e) => setLinkZoom(e.target.checked)}
          />
          Link zoom
        </label>
        {clickedIndex != null && (
          <span className={styles['neighbor-info']}>
            Showing k={metricK} neighbors from {clickedSide} map (point {clickedIndex})
            <button
              className={styles['clear-neighbors']}
              onClick={clearNeighbors}
            >
              Clear
            </button>
          </span>
        )}
        {clickedIndex == null && selectedIndices?.length > 0 && (
          <span className={styles['neighbor-info']}>
            {selectedIndices.length} selected
            {leftSpread != null && ` · spread L ${leftSpread.toFixed(2)}`}
            {rightSpread != null && ` / R ${rightSpread.toFixed(2)}`}
            <button className={styles['clear-neighbors']} onClick={handleClearBrush}>
              Clear
            </button>
          </span>
        )}
        {clickedIndex == null && !selectedIndices?.length && (
          <span className={styles['lasso-hint']}>shift + drag to lasso</span>
        )}
        <span className={styles['side-label']}>← Left</span>
        <span className={styles['side-label']}>Right →</span>
      </div>
      <div className={styles['side-by-side-container']}>
        {/* Left scatter */}
        <div className={styles['scatter-panel']}>
          <div
            className={styles['scatter-container']}
            style={{ width: halfWidth, height }}
            data-tooltip-id="compare-hover-tooltip"
          >
            {leftDisplayPoints.length > 0 && (
              <>
                <div className={styles['scatter']}>
                  {!isIOS() ? (
                    <Scatter
                      points={leftDisplayPoints}
                      duration={0}
                      pointScale={1}
                      pointSizeRange={pointSizeRange}
                      opacityRange={clickedIndex != null ? [0.15, 0.15] : opacityRange}
                      width={halfWidth}
                      height={height}
                      colorScaleType={scatterColorProps.colorScaleType}
                      colorInterpolator={scatterColorProps.colorInterpolator}
                      colorRange={scatterColorProps.colorRange}
                      colorDomain={scatterColorProps.colorDomain}
                      opacityBy={scatterColorProps.opacityBy}
                      enableLasso
                      selectedIndices={selectedIndices}
                      onScatter={handleLeftScatter}
                      onView={handleLeftView}
                      onSelect={handleLeftSelect}
                      onHover={onHover}
                    />
                  ) : (
                    <AnnotationPlot
                      points={leftPoints}
                      fill="gray"
                      size="8"
                      xDomain={leftXDomain}
                      yDomain={leftYDomain}
                      width={halfWidth}
                      height={height}
                    />
                  )}
                </div>
                {clickedIndex != null ? (
                  <NeighborPlot
                    points={leftPoints}
                    selectedIndex={clickedIndex}
                    neighborIndices={neighborIndices}
                    xDomain={leftXDomain}
                    yDomain={leftYDomain}
                    width={halfWidth}
                    height={height}
                  />
                ) : (
                  <CrosshairPlot
                    point={leftHoverPoint}
                    xDomain={leftXDomain}
                    yDomain={leftYDomain}
                    width={halfWidth}
                    height={height}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Right scatter */}
        <div className={styles['scatter-panel']}>
          <div
            className={styles['scatter-container']}
            style={{ width: halfWidth, height }}
            data-tooltip-id="compare-hover-tooltip"
          >
            {rightDisplayPoints.length > 0 && (
              <>
                <div className={styles['scatter']}>
                  {!isIOS() ? (
                    <Scatter
                      points={rightDisplayPoints}
                      duration={0}
                      pointScale={1}
                      pointSizeRange={pointSizeRange}
                      opacityRange={clickedIndex != null ? [0.15, 0.15] : opacityRange}
                      width={halfWidth}
                      height={height}
                      colorScaleType={scatterColorProps.colorScaleType}
                      colorInterpolator={scatterColorProps.colorInterpolator}
                      colorRange={scatterColorProps.colorRange}
                      colorDomain={scatterColorProps.colorDomain}
                      opacityBy={scatterColorProps.opacityBy}
                      enableLasso
                      selectedIndices={selectedIndices}
                      onScatter={handleRightScatter}
                      onView={handleRightView}
                      onSelect={handleRightSelect}
                      onHover={onHover}
                    />
                  ) : (
                    <AnnotationPlot
                      points={rightPoints}
                      fill="gray"
                      size="8"
                      xDomain={rightXDomain}
                      yDomain={rightYDomain}
                      width={halfWidth}
                      height={height}
                    />
                  )}
                </div>
                {clickedIndex != null ? (
                  <NeighborPlot
                    points={rightPoints}
                    selectedIndex={clickedIndex}
                    neighborIndices={neighborIndices}
                    xDomain={rightXDomain}
                    yDomain={rightYDomain}
                    width={halfWidth}
                    height={height}
                  />
                ) : (
                  <CrosshairPlot
                    point={rightHoverPoint}
                    xDomain={rightXDomain}
                    yDomain={rightYDomain}
                    width={halfWidth}
                    height={height}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Tooltip
        id="compare-hover-tooltip"
        isOpen={hoveredIndex != null && clickedIndex == null}
        float={true}
        offset={15}
        className={styles['hover-tooltip']}
        noArrow
      >
        {hoverLoading && !hoverText && (
          <div className={styles['tooltip-loading']}>Loading...</div>
        )}
        {hoverText && (
          <div className={styles['tooltip-text']}>
            {hoverText.length > 200 ? hoverText.slice(0, 200) + '...' : hoverText}
          </div>
        )}
        {hoveredDisplacement != null && (
          <div className={styles['tooltip-metric']}>
            Metric: {hoveredDisplacement}
          </div>
        )}
        {hoveredIndex != null && (
          <div className={styles['tooltip-index']}>
            Point {hoveredIndex}
          </div>
        )}
      </Tooltip>
    </div>
  );
}

export default SideBySideView;
