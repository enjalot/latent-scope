import { useEffect, useRef } from 'react';
import createScatterplot from 'regl-scatterplot';
import { scaleSequential, scaleLinear, scaleLog } from 'd3-scale';
import { groups, extent } from 'd3-array';
import { rgb } from 'd3-color';
import { interpolateViridis, interpolateTurbo, interpolateCool } from 'd3-scale-chromatic';

import styles from  "./Scatter.module.css"


import PropTypes from 'prop-types';
ScatterPlot.propTypes = {
  points: PropTypes.array.isRequired,   // an array of [x,y] points
  colors: PropTypes.array,              // an array of integer values
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
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
  categories,
  width, 
  height, 
  duration = 0,
  onScatter,
  onView,
  onSelect,
  onHover,
}) {

  const container = useRef();
  const xDomain = useRef([-1, 1]);
  const yDomain = useRef([-1, 1]);
  const xScale = scaleLinear()
    .domain(xDomain.current)
  const yScale = scaleLinear()
    .domain(yDomain.current)

  const scatterplotRef = useRef(null);
  // setup the scatterplot on first render
  useEffect(() => {
    const scatterSettings = { 
      canvas: container.current,
      width,
      height,
      pointColorHover: [0.1, 0.1, 0.1, 0.5],
      xScale,
      yScale,
    }
    const scatterplot = createScatterplot(scatterSettings);
    scatterplotRef.current = scatterplot;

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
    
      const pointSize = calculatePointSize(points.length);
      const opacity = calculatePointOpacity(points.length);
      // console.log("point size", pointSize, opacity)
      let pointColor = [250/255, 128/255, 114/255, 1] //salmon

      // let drawPoints = points
      let categories = points[0].length === 3 ? true : false
      if(categories) {
        // drawPoints = points.map((p, i) => {
        //   return [p[0], p[1], categories[i]]
        // })
        const uniques = groups(points.map(d => d[2]), d => d).map(d => d[0]).sort((a,b) => a - b)
        // TODO: colors should already be chosen before passing in here
        // const colorScale = scaleSequential(interpolateViridis)
        // const colorScale = scaleSequential(interpolateTurbo)
        const colorScale = scaleSequential(interpolateCool)
          .domain(extent(uniques).reverse());
        pointColor = uniques.map(u => rgb(colorScale(u)).hex())
      }

      scatterplot.set({
        opacity: opacity,
        pointSize: pointSize,
      })
      if(categories){
        scatterplot.set({colorBy: 'valueA'});
      }
      if(prevPoints && prevPoints.length === points.length) {
        // console.log("transitioning scatterplot")
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
  }, [points, categories, width, height]);

  return <canvas className={styles.scatter} ref={container} />;
}

export default ScatterPlot;
