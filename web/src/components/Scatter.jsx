import { useEffect, useRef, useCallback } from 'react';
import createScatterplot from 'regl-scatterplot';
import { scaleSequential, scaleLinear, scaleLog } from 'd3-scale';
import { range, groups, extent } from 'd3-array';
import { rgb } from 'd3-color';
import {
  interpolateViridis,
  interpolateTurbo,
  interpolateCool,
  interpolateReds,
  interpolateOranges,
} from 'd3-scale-chromatic';
import { SELECT } from '../pages/FullScreenExplore';

import styles from './Scatter.module.css';

import PropTypes from 'prop-types';
ScatterPlot.propTypes = {
  points: PropTypes.array.isRequired, // an array of [x,y] points
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  pointScale: PropTypes.number,
  colorDomain: PropTypes.array,
  colorRange: PropTypes.array,
  colorInterpolator: PropTypes.func,
  opacityBy: PropTypes.string,
  opacityRange: PropTypes.array,
  pointSizeRange: PropTypes.array,
  duration: PropTypes.number,
  onScatter: PropTypes.func,
  onView: PropTypes.func,
  onSelect: PropTypes.func,
  onHover: PropTypes.func,
};

const calculatePointSize = (numPoints) => {
  const minPoints = 100; // Minimum number of points to start scaling
  const maxPoints = 1000000;
  const minSize = 6; // Minimum size of points
  const maxSize = 1; // Maximum size of points when number of points is very large
  const scale = scaleLog().domain([minPoints, maxPoints]).range([minSize, maxSize]).clamp(true);
  return scale(numPoints);
};
const calculatePointOpacity = (numPoints) => {
  const minPoints = 100; // Minimum number of points to start scaling
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
  // colorInterpolator = interpolateCool,
  colorInterpolator = interpolateOranges,
  colorDomain = null,
  colorRange = null,
  opacityBy,
  opacityRange = null,
  pointSizeRange = null,
  onScatter,
  onView,
  onSelect,
  onHover,
  activeFilterTab,
  scope,
}) {
  const { sae: { max_activations = [] } = {} } = scope || {};

  const container = useRef();
  const xDomain = useRef([-1, 1]);
  const yDomain = useRef([-1, 1]);
  const scatterplotRef = useRef(null);

  const handleMouseLeave = useCallback(() => {
    onHover && onHover(null);
  }, [onHover]);

  // setup the scatterplot on first render
  useEffect(() => {
    // console.log('===setting up scatterplot===');
    const xScale = scaleLinear()
      // .domain(xDomain.current)
      .domain([-1, 1]);
    const yScale = scaleLinear()
      // .domain(yDomain.current)
      .domain([-1, 1]);
    const scatterSettings = {
      canvas: container.current,
      width,
      height,
      pointColorHover: [0.1, 0.1, 0.1, 0.5],
      xScale,
      yScale,
    };
    // console.log("creating scatterplot", xDomain.current)
    const scatterplot = createScatterplot(scatterSettings);
    scatterplotRef.current = scatterplot;

    // padding around the points and the border of the canvas
    const padding = 0.05;

    // center the view on the canvas
    scatterplot.zoomToArea({
      x: -1 - padding,
      y: -1 - padding,
      width: 2 + padding * 2,
      height: 2 + padding * 2,
    });

    onView && onView(xDomain.current, yDomain.current);
    scatterplot.subscribe('view', ({ camera, view, xScale: xs, yScale: ys }) => {
      xDomain.current = xs.domain();
      yDomain.current = ys.domain();
      onView && onView(xDomain.current, yDomain.current);
    });
    scatterplot.subscribe('select', ({ points }) => {
      onSelect && onSelect(points);
    });
    scatterplot.subscribe('deselect', () => {
      onSelect && onSelect([]);
    });
    scatterplot.subscribe('pointOver', (pointIndex) => {
      onHover && onHover(pointIndex);
    });
    scatterplot.subscribe('pointOut', () => {
      onHover && onHover(null);
    });

    // const canvas = container.current;
    // canvas.addEventListener('mouseleave', handleMouseLeave);

    onScatter && onScatter(scatterplot);

    return () => {
      scatterplotRef.current = null;
      scatterplot.destroy();
      // canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [onScatter, onView, onSelect, onHover, width, height, activeFilterTab]);

  const prevPointsRef = useRef();
  useEffect(() => {
    const scatterplot = scatterplotRef.current;
    const prevPoints = prevPointsRef.current;
    if (scatterplot && points && points.length) {
      const pointSize = calculatePointSize(points.length) * pointScale;
      const opacity = calculatePointOpacity(points.length);
      // console.log("point size", pointSize, opacity)
      // let pointColor = [250/255, 128/255, 114/255, 1] //salmon
      let pointColor = [122 / 255, 217 / 255, 255 / 255, 1]; //salmon
      // let pointColor = '#7AD9FF';

      // 224, 239, 255

      // let drawPoints = points
      // let categories = points[0].length === 3 ? true : false
      // console.log({ colorScaleType, colorDomain, colorRange });

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
          pointColor = range(uniques).map((u) => rgb(colorScale(u)).hex());
        } else {
          pointColor = colorRange;
        }
        scatterplot.set({ colorBy: 'valueA' });
      } else if (colorScaleType === 'continuous') {
        let r = range(0, 50);
        const colorScale = scaleSequential(colorInterpolator).domain([0, 50]);
        pointColor = r.map((i) => rgb(colorScale(i)).hex());
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
          // don't color till after
          scatterplot.set({
            pointColor: pointColor,
          });
          scatterplot.draw(points, { transition: false });
        });
      } else {
        console.log('=== fresh draw scatterplot ===');
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
    pointScale,
    opacityRange,
    pointSizeRange,
  ]);

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
