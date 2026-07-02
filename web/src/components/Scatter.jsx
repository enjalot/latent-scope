import { useEffect, useRef, useCallback } from 'react';
import createScatterplot from 'regl-scatterplot';
import { scaleSequential, scaleLinear, scaleLog } from 'd3-scale';
import { range, groups, extent } from 'd3-array';
import { rgb } from 'd3-color';
import { interpolateOranges } from 'd3-scale-chromatic';

import styles from './Scatter.module.css';

import PropTypes from 'prop-types';
ScatterPlot.propTypes = {
  points: PropTypes.array.isRequired, // an array of [x,y] points
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  pointScale: PropTypes.number,
  colorScaleType: PropTypes.oneOf(['categorical', 'continuous']),
  colorDomain: PropTypes.array,
  colorRange: PropTypes.array,
  colorInterpolator: PropTypes.func,
  // Neutral color for missing values; when set on a continuous scale it is
  // prepended to the ramp so callers can route missing rows to valueB≈0.
  missingColor: PropTypes.string,
  opacityBy: PropTypes.string,
  opacityRange: PropTypes.array,
  pointSizeRange: PropTypes.array,
  duration: PropTypes.number,
  // When true, shift+drag draws a lasso and fires onSelect with the enclosed
  // point indices (regl-scatterplot's built-in lasso). Selection styling
  // (dim-the-rest) is always configured; the prop mainly signals intent.
  enableLasso: PropTypes.bool,
  // Controlled selection: an array of point indices to highlight. Selected
  // points stay opaque while the rest dim (opacityInactiveScale), matching the
  // app's selected-vs-not visual language. Cross-pane linking is achieved by
  // feeding the same array to multiple ScatterPlots.
  selectedIndices: PropTypes.array,
  onScatter: PropTypes.func,
  onView: PropTypes.func,
  onSelect: PropTypes.func,
  onHover: PropTypes.func,
  activeFilterTab: PropTypes.any,
};

// Selected points keep full opacity; everything else dims to this scale so a
// brush selection reads the same way as elsewhere in the app.
const SELECTED_OPACITY_INACTIVE_SCALE = 0.2;
// #5cb85c (colors.js "selected" green) as an rgba triple; only visible when
// colorBy is uniform (Compare always drives colorBy, so the dimming carries
// the signal), but set for correctness / other Scatter consumers.
const SELECTED_COLOR = [92 / 255, 184 / 255, 92 / 255, 1];

const calculatePointSize = (numPoints) => {
  const minPoints = 100;
  const maxPoints = 1000000;
  const minSize = 6;
  const maxSize = 1;
  const scale = scaleLog().domain([minPoints, maxPoints]).range([minSize, maxSize]).clamp(true);
  return scale(numPoints);
};
const calculatePointOpacity = (numPoints) => {
  const minPoints = 100;
  const maxPoints = 1000000;
  const minOpacity = 0.2;
  const maxOpacity = 0.7;
  const scale = scaleLog()
    .domain([minPoints, maxPoints])
    .range([maxOpacity, minOpacity])
    .clamp(true);
  return scale(numPoints);
};

function ScatterPlot({
  points,
  width,
  height,
  duration = 0,
  pointScale = 1,
  colorScaleType = null,
  colorInterpolator = interpolateOranges,
  colorDomain = null,
  colorRange = null,
  missingColor = null,
  opacityBy,
  opacityRange = null,
  pointSizeRange = null,
  enableLasso = false,
  selectedIndices = null,
  onScatter,
  onView,
  onSelect,
  onHover,
  activeFilterTab,
}) {
  const container = useRef();
  const xDomain = useRef([-1, 1]);
  const yDomain = useRef([-1, 1]);
  const scatterplotRef = useRef(null);

  // Store callbacks in refs so they never trigger effect re-runs.
  // Recreating the scatterplot destroys the WebGL context and causes
  // "double destroy texture" errors when the draw effect races cleanup.
  const onScatterRef = useRef(onScatter);
  const onViewRef = useRef(onView);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  onScatterRef.current = onScatter;
  onViewRef.current = onView;
  onSelectRef.current = onSelect;
  onHoverRef.current = onHover;

  const handleMouseLeave = useCallback(() => {
    onHoverRef.current && onHoverRef.current(null);
  }, []);

  // Setup the scatterplot — only recreate on true structural changes
  useEffect(() => {
    if (!container.current || !width || !height) return;

    const xScale = scaleLinear().domain([-1, 1]);
    const yScale = scaleLinear().domain([-1, 1]);
    const scatterplot = createScatterplot({
      canvas: container.current,
      width,
      height,
      pointColorHover: [0.1, 0.1, 0.1, 0.5],
      // regl-scatterplot maps SHIFT -> lasso by default; keep it explicit when
      // lasso is requested so a shift+drag brushes points and fires `select`.
      ...(enableLasso ? { keyMap: { shift: 'lasso', alt: 'rotate' } } : {}),
      pointColorActive: SELECTED_COLOR,
      opacityInactiveScale: SELECTED_OPACITY_INACTIVE_SCALE,
      xScale,
      yScale,
    });
    scatterplotRef.current = scatterplot;

    const padding = 0.05;
    scatterplot.zoomToArea({
      x: -1 - padding,
      y: -1 - padding,
      width: 2 + padding * 2,
      height: 2 + padding * 2,
    });

    onViewRef.current && onViewRef.current(xDomain.current, yDomain.current);
    scatterplot.subscribe('view', ({ xScale: xs, yScale: ys }) => {
      xDomain.current = xs.domain();
      yDomain.current = ys.domain();
      onViewRef.current && onViewRef.current(xDomain.current, yDomain.current);
    });
    scatterplot.subscribe('select', ({ points }) => {
      onSelectRef.current && onSelectRef.current(points);
    });
    scatterplot.subscribe('deselect', () => {
      onSelectRef.current && onSelectRef.current([]);
    });
    scatterplot.subscribe('pointOver', (pointIndex) => {
      onHoverRef.current && onHoverRef.current(pointIndex);
    });
    scatterplot.subscribe('pointOut', () => {
      onHoverRef.current && onHoverRef.current(null);
    });

    onScatterRef.current && onScatterRef.current(scatterplot);

    return () => {
      scatterplotRef.current = null;
      scatterplot.destroy();
    };
  }, [width, height, activeFilterTab, enableLasso]);

  const prevPointsRef = useRef();
  useEffect(() => {
    const scatterplot = scatterplotRef.current;
    const prevPoints = prevPointsRef.current;
    if (scatterplot && points && points.length) {
      const pointSize = calculatePointSize(points.length) * pointScale;
      const opacity = calculatePointOpacity(points.length);
      let pointColor = [122 / 255, 217 / 255, 255 / 255, 1];

      if (colorScaleType === 'categorical') {
        let uniques = colorDomain;
        if (!uniques) {
          uniques = groups(
            points.map((d) => d[2]),
            (d) => d
          )
            .map((d) => d[0])
            .sort((a, b) => a - b);
        }
        let domain = extent(uniques).reverse();
        if (!colorRange) {
          const colorScale = scaleSequential(colorInterpolator).domain(domain);
          pointColor = uniques.map((u) => rgb(colorScale(u)).hex());
        } else {
          pointColor = colorRange;
        }
        scatterplot.set({ colorBy: 'valueA' });
      } else if (colorScaleType === 'continuous') {
        let r = range(0, 50);
        const colorScale = scaleSequential(colorInterpolator).domain([0, 50]);
        pointColor = r.map((i) => rgb(colorScale(i)).hex());
        // Reserve index 0 for the neutral no-value color; callers map missing
        // rows to valueB≈0 so they render neutral instead of the ramp minimum.
        if (missingColor) pointColor = [missingColor, ...pointColor];
        scatterplot.set({ colorBy: 'valueB' });
      }

      if (opacityBy) {
        scatterplot.set({
          opacityBy,
          sizeBy: opacityBy,
          opacity: opacityRange || [0.1, 0.2, 0.3, 0.4, 0.5, 1],
          pointSize: pointSizeRange || [2, 4, 5, 6, pointSize],
        });
      } else {
        scatterplot.set({
          opacity: opacity,
          pointSize: pointSize,
        });
      }
      if (prevPoints && prevPoints.length === points.length) {
        scatterplot.draw(points, { transition: true, transitionDuration: duration }).then(() => {
          scatterplot.set({
            pointColor: pointColor,
          });
          scatterplot.draw(points, { transition: false });
        });
      } else {
        scatterplot.set({
          pointColor: pointColor,
        });
      }
      scatterplot.draw(points, { transition: false });
    }
    prevPointsRef.current = points;
  }, [
    points,
    width,
    height,
    colorScaleType,
    duration,
    colorInterpolator,
    missingColor,
    pointScale,
    opacityRange,
    pointSizeRange,
  ]);

  // Controlled selection: apply `selectedIndices` to the native regl selection
  // so selected points stay opaque and the rest dim. Re-applied when `points`
  // change because a redraw can re-render without the highlight. `preventEvent`
  // avoids echoing back into onSelect (which would loop across linked panes).
  useEffect(() => {
    const scatterplot = scatterplotRef.current;
    if (!scatterplot) return;
    // `null`/`undefined` = uncontrolled: leave the native selection (driven by
    // the component's own onSelect handling) untouched. An array (even empty)
    // opts into controlled selection.
    if (selectedIndices == null) return;
    if (selectedIndices.length) {
      scatterplot.select(selectedIndices, { preventEvent: true });
    } else {
      scatterplot.deselect({ preventEvent: true });
    }
  }, [selectedIndices, points]);

  return (
    <canvas
      style={{ width, height }}
      className={styles.scatter}
      ref={container}
      onMouseLeave={handleMouseLeave}
    />
  );
}

export default ScatterPlot;
