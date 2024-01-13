import React, { useEffect, useRef } from 'react';
import createScatterplot from 'regl-scatterplot';
import { scaleLinear } from 'd3-scale';

import "./Scatter.css"

const ScatterPlot = ({ 
  points, 
  pointsLoading, 
  width, 
  height, 
  onView,
  onSelect,
  // onHover,
}) => {
  const container = useRef();
  const xDomain = useRef([-1, 1]);
  const yDomain = useRef([-1, 1]);
  const xScale = scaleLinear()
    .domain(xDomain.current)
  const yScale = scaleLinear()
    .domain(yDomain.current)

  useEffect(() => {
    const scatterplot = createScatterplot({ 
      canvas: container.current,
      width,
      height,
      pointSize: 3,
      opacity: 0.75,
      xScale,
      yScale,
    });

    scatterplot.draw(points);

    onView(xScale, yScale)
    scatterplot.subscribe(
      "view",
      ({ camera, view, xScale: xs, yScale: ys }) => {
        xDomain.current = xs.domain();
        yDomain.current = ys.domain();
        onView(xDomain.current, yDomain.current)
     }
    );
    scatterplot.subscribe("select", ({ points }) => {
      onSelect(points)
    });
    scatterplot.subscribe("deselect", () => {
      onSelect([])
    });
    // scatterplot.subscribe("pointOver", (pointIndex) => {
    //   onHover(pointIndex)
    // });
    // scatterplot.subscribe("pointOut", () => {
    //   onHover(null)
    // });

    return () => {
      scatterplot.destroy();
    };
  }, [points]);

  return <canvas className="scatter" ref={container} />;
};

export default ScatterPlot;
