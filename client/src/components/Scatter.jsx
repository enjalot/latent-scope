import { useEffect, useRef } from 'react';
import createScatterplot from 'regl-scatterplot';
import { scaleLinear, scaleLog } from 'd3-scale';
import PropTypes from 'prop-types';

import "./Scatter.css"

ScatterPlot.propTypes = {
  points: PropTypes.array.isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onScatter: PropTypes.func,
  onView: PropTypes.func,
  onSelect: PropTypes.func,
  onHover: PropTypes.func,
};

const calculatePointSize = (numPoints) => {
      const minPoints = 100; // Minimum number of points to start scaling
      const minSize = 8; // Minimum size of points
      const maxSize = 1; // Maximum size of points when number of points is very large
      const scale = scaleLog()
        .domain([minPoints, Infinity])
        .range([minSize, maxSize])
        .clamp(true);
      return scale(numPoints);
    };

function ScatterPlot ({ 
  points, 
  width, 
  height, 
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

  useEffect(() => {
    
    const pointSize = calculatePointSize(points.length);
    console.log("point size", pointSize)
    const scatterplot = createScatterplot({ 
      canvas: container.current,
      width,
      height,
      pointSize,
      opacity: 0.75,
      pointColorHover: [0.1, 0.1, 0.1, 0.9],
      xScale,
      yScale,
    });

    scatterplot.draw(points);

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

    // TODO: this may not be proper React
    onScatter && onScatter(scatterplot)

    return () => {
      scatterplot.destroy();
    };
  }, [points]);

  return <canvas className="scatter" ref={container} />;
}

export default ScatterPlot;
