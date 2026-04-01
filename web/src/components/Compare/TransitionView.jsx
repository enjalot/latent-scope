import { useState, useEffect, useRef, useCallback } from 'react';
import { interpolateReds } from 'd3-scale-chromatic';
import Scatter from '../Scatter';
import AnnotationPlot from '../AnnotationPlot';
import styles from './Compare.module.css';

// unfortunately regl-scatter doesn't even render in iOS
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

function TransitionView({
  leftPoints,
  rightPoints,
  drawPoints,
  width,
  height,
  direction,
  onDirectionChange,
  onScatter,
  onView,
  onSelect,
  onHover,
  xDomain,
  yDomain,
  searchAnnotations,
  hoverAnnotations,
  pointSizeRange,
  opacityRange,
}) {
  // Build the displayed points based on direction
  const [displayPoints, setDisplayPoints] = useState([]);

  useEffect(() => {
    if (!drawPoints || !drawPoints.length) return;
    const sourcePoints = direction === 'left' ? leftPoints : rightPoints;
    if (!sourcePoints || !sourcePoints.length) return;

    // Use displacement values from drawPoints but coordinates from the active direction
    const pts = sourcePoints.map((p, i) => {
      const dp = drawPoints[i];
      return [p[0], p[1], dp ? dp[2] : 0, dp ? dp[3] : 0];
    });
    setDisplayPoints(pts);
  }, [direction, leftPoints, rightPoints, drawPoints]);

  const handleSwap = useCallback(() => {
    onDirectionChange(direction === 'left' ? 'right' : 'left');
  }, [direction, onDirectionChange]);

  return (
    <div className={styles['transition-view']}>
      <div className={styles['view-toolbar']}>
        <button className={styles['swap-button']} onClick={handleSwap}>
          {direction === 'left' ? '← Showing Left' : 'Showing Right →'}
          {' · Click to swap'}
        </button>
      </div>
      <div className={styles['scatter-container']} style={{ width, height }}>
        {displayPoints.length > 0 && (
          <>
            <div className={styles['scatter']}>
              {!isIOS() ? (
                <Scatter
                  points={displayPoints}
                  duration={2000}
                  pointScale={1}
                  pointSizeRange={pointSizeRange}
                  opacityRange={opacityRange}
                  width={width}
                  height={height}
                  colorScaleType="continuous"
                  colorInterpolator={interpolateReds}
                  opacityBy="valueA"
                  onScatter={onScatter}
                  onView={onView}
                  onSelect={onSelect}
                  onHover={onHover}
                />
              ) : (
                <AnnotationPlot
                  points={leftPoints}
                  fill="gray"
                  size="8"
                  xDomain={xDomain}
                  yDomain={yDomain}
                  width={width}
                  height={height}
                />
              )}
            </div>
            <AnnotationPlot
              points={searchAnnotations}
              stroke="black"
              fill="steelblue"
              size="8"
              xDomain={xDomain}
              yDomain={yDomain}
              width={width}
              height={height}
            />
            <AnnotationPlot
              points={hoverAnnotations}
              stroke="black"
              fill="orange"
              size="16"
              xDomain={xDomain}
              yDomain={yDomain}
              width={width}
              height={height}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default TransitionView;
