import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { interpolateReds } from 'd3-scale-chromatic';
import { Tooltip } from 'react-tooltip';
import Scatter from '../Scatter';
import AnnotationPlot from '../AnnotationPlot';
import CrosshairPlot from './CrosshairPlot';
import NeighborPlot from './NeighborPlot';
import styles from './Compare.module.css';

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

  // Build display points for each side
  const leftDisplayPoints = useMemo(() => {
    if (!drawPoints?.length || !leftPoints?.length) return [];
    // When in neighbor mode, dim all metric points
    if (clickedIndex != null) {
      return leftPoints.map((p) => [p[0], p[1], 0, 0]);
    }
    return leftPoints.map((p, i) => {
      const dp = drawPoints[i];
      return [p[0], p[1], dp ? dp[2] : 0, dp ? dp[3] : 0];
    });
  }, [leftPoints, drawPoints, clickedIndex]);

  const rightDisplayPoints = useMemo(() => {
    if (!drawPoints?.length || !rightPoints?.length) return [];
    if (clickedIndex != null) {
      return rightPoints.map((p) => [p[0], p[1], 0, 0]);
    }
    return rightPoints.map((p, i) => {
      const dp = drawPoints[i];
      return [p[0], p[1], dp ? dp[2] : 0, dp ? dp[3] : 0];
    });
  }, [rightPoints, drawPoints, clickedIndex]);

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

  // Clear neighbor mode when UMAPs change
  useEffect(() => {
    setClickedIndex(null);
    setClickedSide(null);
    setNeighborIndices([]);
  }, [left, right]);

  // Hover crosshair points
  const leftHoverPoint =
    hoveredIndex != null && leftPoints[hoveredIndex] ? leftPoints[hoveredIndex] : null;
  const rightHoverPoint =
    hoveredIndex != null && rightPoints[hoveredIndex] ? rightPoints[hoveredIndex] : null;

  // Clicked crosshair points
  const leftClickedPoint =
    clickedIndex != null && leftPoints[clickedIndex] ? leftPoints[clickedIndex] : null;
  const rightClickedPoint =
    clickedIndex != null && rightPoints[clickedIndex] ? rightPoints[clickedIndex] : null;

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
                      colorScaleType="continuous"
                      colorInterpolator={interpolateReds}
                      opacityBy="valueA"
                      onScatter={handleLeftScatter}
                      onView={handleLeftView}
                      onSelect={handleLeftClick}
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
                      colorScaleType="continuous"
                      colorInterpolator={interpolateReds}
                      opacityBy="valueA"
                      onScatter={handleRightScatter}
                      onView={handleRightView}
                      onSelect={handleRightClick}
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
