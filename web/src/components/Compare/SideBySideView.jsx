import { useState, useEffect, useCallback, useRef } from 'react';
import { interpolateReds } from 'd3-scale-chromatic';
import Scatter from '../Scatter';
import AnnotationPlot from '../AnnotationPlot';
import styles from './Compare.module.css';

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

function SideBySideView({
  leftPoints,
  rightPoints,
  drawPoints,
  width,
  height,
  onScatter,
  onSelect,
  onHover,
  searchAnnotations,
  hoverAnnotations,
  pointSizeRange,
  opacityRange,
  hoveredIndex,
}) {
  const [leftScatter, setLeftScatter] = useState(null);
  const [rightScatter, setRightScatter] = useState(null);
  const [linkZoom, setLinkZoom] = useState(true);

  const [leftXDomain, setLeftXDomain] = useState([-1, 1]);
  const [leftYDomain, setLeftYDomain] = useState([-1, 1]);
  const [rightXDomain, setRightXDomain] = useState([-1, 1]);
  const [rightYDomain, setRightYDomain] = useState([-1, 1]);

  // Track which side initiated zoom to avoid infinite loops
  const zoomSourceRef = useRef(null);

  // Build display points for each side
  const [leftDisplayPoints, setLeftDisplayPoints] = useState([]);
  const [rightDisplayPoints, setRightDisplayPoints] = useState([]);

  useEffect(() => {
    if (!drawPoints?.length || !leftPoints?.length) return;
    setLeftDisplayPoints(
      leftPoints.map((p, i) => {
        const dp = drawPoints[i];
        return [p[0], p[1], dp ? dp[2] : 0, dp ? dp[3] : 0];
      })
    );
  }, [leftPoints, drawPoints]);

  useEffect(() => {
    if (!drawPoints?.length || !rightPoints?.length) return;
    setRightDisplayPoints(
      rightPoints.map((p, i) => {
        const dp = drawPoints[i];
        return [p[0], p[1], dp ? dp[2] : 0, dp ? dp[3] : 0];
      })
    );
  }, [rightPoints, drawPoints]);

  // Expose the left scatter as the primary scatter for selection/zoom-to-points
  useEffect(() => {
    if (leftScatter) {
      onScatter && onScatter(leftScatter);
    }
  }, [leftScatter, onScatter]);

  const handleLeftView = useCallback(
    (xd, yd) => {
      setLeftXDomain(xd);
      setLeftYDomain(yd);
      if (linkZoom && zoomSourceRef.current !== 'right') {
        zoomSourceRef.current = 'left';
        setRightXDomain(xd);
        setRightYDomain(yd);
        if (rightScatter) {
          const padding = 0.0;
          rightScatter.zoomToArea({
            x: xd[0] - padding,
            y: yd[0] - padding,
            width: xd[1] - xd[0] + padding * 2,
            height: yd[1] - yd[0] + padding * 2,
          });
        }
        setTimeout(() => {
          zoomSourceRef.current = null;
        }, 50);
      }
    },
    [linkZoom, rightScatter]
  );

  const handleRightView = useCallback(
    (xd, yd) => {
      setRightXDomain(xd);
      setRightYDomain(yd);
      if (linkZoom && zoomSourceRef.current !== 'left') {
        zoomSourceRef.current = 'right';
        setLeftXDomain(xd);
        setLeftYDomain(yd);
        if (leftScatter) {
          const padding = 0.0;
          leftScatter.zoomToArea({
            x: xd[0] - padding,
            y: yd[0] - padding,
            width: xd[1] - xd[0] + padding * 2,
            height: yd[1] - yd[0] + padding * 2,
          });
        }
        setTimeout(() => {
          zoomSourceRef.current = null;
        }, 50);
      }
    },
    [linkZoom, leftScatter]
  );

  // Compute hover annotations for each side using their own points
  const leftHoverAnnotations =
    hoveredIndex != null && leftPoints[hoveredIndex]
      ? [leftPoints[hoveredIndex]]
      : [];
  const rightHoverAnnotations =
    hoveredIndex != null && rightPoints[hoveredIndex]
      ? [rightPoints[hoveredIndex]]
      : [];

  // Search annotations mapped to each side's coordinates
  const leftSearchAnnotations = searchAnnotations
    .map((_, i) => leftPoints[i])
    .filter(Boolean);
  const rightSearchAnnotations = searchAnnotations
    .map((_, i) => rightPoints[i])
    .filter(Boolean);

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
        <span className={styles['side-label']}>← Left</span>
        <span className={styles['side-label']}>Right →</span>
      </div>
      <div className={styles['side-by-side-container']}>
        <div className={styles['scatter-panel']}>
          <div className={styles['scatter-container']} style={{ width: halfWidth, height }}>
            {leftDisplayPoints.length > 0 && (
              <>
                <div className={styles['scatter']}>
                  {!isIOS() ? (
                    <Scatter
                      points={leftDisplayPoints}
                      duration={0}
                      pointScale={1}
                      pointSizeRange={pointSizeRange}
                      opacityRange={opacityRange}
                      width={halfWidth}
                      height={height}
                      colorScaleType="continuous"
                      colorInterpolator={interpolateReds}
                      opacityBy="valueA"
                      onScatter={setLeftScatter}
                      onView={handleLeftView}
                      onSelect={onSelect}
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
                <AnnotationPlot
                  points={leftHoverAnnotations}
                  stroke="black"
                  fill="orange"
                  size="16"
                  xDomain={leftXDomain}
                  yDomain={leftYDomain}
                  width={halfWidth}
                  height={height}
                />
              </>
            )}
          </div>
        </div>
        <div className={styles['scatter-panel']}>
          <div className={styles['scatter-container']} style={{ width: halfWidth, height }}>
            {rightDisplayPoints.length > 0 && (
              <>
                <div className={styles['scatter']}>
                  {!isIOS() ? (
                    <Scatter
                      points={rightDisplayPoints}
                      duration={0}
                      pointScale={1}
                      pointSizeRange={pointSizeRange}
                      opacityRange={opacityRange}
                      width={halfWidth}
                      height={height}
                      colorScaleType="continuous"
                      colorInterpolator={interpolateReds}
                      opacityBy="valueA"
                      onScatter={setRightScatter}
                      onView={handleRightView}
                      onSelect={onSelect}
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
                <AnnotationPlot
                  points={rightHoverAnnotations}
                  stroke="black"
                  fill="orange"
                  size="16"
                  xDomain={rightXDomain}
                  yDomain={rightYDomain}
                  width={halfWidth}
                  height={height}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SideBySideView;
