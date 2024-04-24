import { useEffect, useRef } from 'react';
import createScatterplot from 'regl-scatterplot';
import { scaleSequential, scaleLinear, scaleLog } from 'd3-scale';
import { range, groups, extent } from 'd3-array';
import { rgb } from 'd3-color';
import { interpolateViridis, interpolateTurbo, interpolateCool } from 'd3-scale-chromatic';

import styles from  "./Scatter.module.css"


import PropTypes from 'prop-types';
ScatterPlot.propTypes = {
  points: PropTypes.array.isRequired,   // an array of [x,y] points
  colors: PropTypes.array,              // an array of integer values
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  pointScale: PropTypes.number,
  colorScaleType: PropTypes.oneOf(["categorical", "continuous"]),
  colorInterpolator: PropTypes.func,
  opacityBy: PropTypes.string,
  duration: PropTypes.number,
  onScatter: PropTypes.func,
  onView: PropTypes.func,
  onSelect: PropTypes.func,
  onHover: PropTypes.func,
};

const calculatePointSize = (numPoints) => {
  const minPoints = 100; // Minimum number of points to start scaling
  const maxPoints = 1000000
  const minSize = 6; // Minimum size of points
  const maxSize = 1; // Maximum size of points when number of points is very large
  const scale = scaleLog()
    .domain([minPoints, maxPoints])
    .range([minSize, maxSize])
    .clamp(true);
  return scale(numPoints);
};
const calculatePointOpacity = (numPoints) => {
  const minPoints = 100; // Minimum number of points to start scaling
  const maxPoints = 1000000
  const minOpacity = 0.2; 
  const maxOpacity = 0.7; 
  const scale = scaleLog()
    .domain([minPoints, maxPoints])
    .range([maxOpacity, minOpacity])
    .clamp(true);
  return scale(numPoints);
};


function ScatterPlot ({ 
  points, 
  width, 
  height, 
  duration = 0,
  pointScale = 1,
  colorScaleType = null,
  colorInterpolator = interpolateCool,
  opacityBy,
  onScatter,
  onView,
  onSelect,
  onHover,
}) {

  const container = useRef();
  const xDomain = useRef([-1, 1]);
  const yDomain = useRef([-1, 1]);
  const scatterplotRef = useRef(null);

  // setup the scatterplot on first render
  useEffect(() => {
    const xScale = scaleLinear()
      // .domain(xDomain.current)
      .domain([-1, 1])
    const yScale = scaleLinear()
      // .domain(yDomain.current)
      .domain([-1, 1])
    const scatterSettings = { 
      canvas: container.current,
      width,
      height,
      pointColorHover: [0.1, 0.1, 0.1, 0.5],
      xScale,
      yScale,
    }
    // console.log("creating scatterplot", xDomain.current)
    const scatterplot = createScatterplot(scatterSettings);
    scatterplotRef.current = scatterplot;

    scatterplot.zoomToArea({
      x: xDomain.current[0],
      y: yDomain.current[0],
      width: xDomain.current[1] - xDomain.current[0],
      height: yDomain.current[1] - yDomain.current[0],
    })

    onView && onView(xScale, yScale)
    scatterplot.subscribe(
      "view",
      ({ camera, view, xScale: xs, yScale: ys }) => {
        xDomain.current = xs.domain();
        yDomain.current = ys.domain();
        onView && onView(xDomain.current, yDomain.current)
    }
    );
    scatterplot.subscribe("select", ({ points }) => {
      onSelect && onSelect(points)
    });
    scatterplot.subscribe("deselect", () => {
      onSelect && onSelect([])
    });
    scatterplot.subscribe("pointOver", (pointIndex) => {
      onHover && onHover(pointIndex)
    });
    scatterplot.subscribe("pointOut", () => {
      onHover && onHover(null)
    });
  
    onScatter && onScatter(scatterplot)

    return () => {
      scatterplotRef.current = null;
      scatterplot.destroy();
    };
  }, [width, height, onScatter, onView, onSelect, onHover])

  const prevPointsRef = useRef();
  useEffect(() => {
    const scatterplot = scatterplotRef.current;
    const prevPoints = prevPointsRef.current;
    if(scatterplot && points && points.length){
    
      const pointSize = calculatePointSize(points.length) * pointScale;
      const opacity = calculatePointOpacity(points.length);
      // console.log("point size", pointSize, opacity)
      let pointColor = [250/255, 128/255, 114/255, 1] //salmon

      // let drawPoints = points
      // let categories = points[0].length === 3 ? true : false
      if(colorScaleType === "categorical") {
        const uniques = groups(points.map(d => d[2]), d => d).map(d => d[0]).sort((a,b) => a - b)
        const colorScale = scaleSequential(colorInterpolator)
          .domain(extent(uniques).reverse());
        pointColor = uniques.map(u => rgb(colorScale(u)).hex())
      } else if(colorScaleType === "continuous") {
        let r = range(0, 100)
        const colorScale = scaleSequential(colorInterpolator)
          .domain([0, 100]);
        pointColor = r.map(i => rgb(colorScale(i)).hex())
      }

      if(colorScaleType){
        scatterplot.set({colorBy: 'valueA'});
      }
      if(opacityBy) {
        scatterplot.set({
          opacityBy,
          sizeBy: opacityBy,
          opacity: [0.1, .2, .3, .4, .5,  1],
          pointSize: [2, 4, 5, 6,  pointSize]
        })
      } else {
        scatterplot.set({
          opacity: opacity,
          pointSize: pointSize,
        })
      }
      if(prevPoints && prevPoints.length === points.length) {
        // console.log("transitioning scatterplot" )
        scatterplot.draw(points, { transition: true, transitionDuration: duration}).then(() => {
          // don't color till after
          scatterplot.set({
            pointColor: pointColor,
          })
          scatterplot.draw(points, { transition: false });
        })
      } else {
        // console.log("fresh draw scatterplot")
        scatterplot.set({
          pointColor: pointColor,
        })
        scatterplot.draw(points, { transition: false });
      }
      prevPointsRef.current = points;
    }
  }, [points, width, height, colorScaleType, colorInterpolator, duration, pointScale]);

  return <canvas className={styles.scatter} ref={container} />;
}

export default ScatterPlot;
