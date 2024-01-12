import React, { useEffect, useRef } from 'react';
import createScatterplot from 'regl-scatterplot';
import { scaleLinear } from 'd3-scale';

const ScatterPlot = ({ points, pointsLoading, width, height}) => {
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

    scatterplot.subscribe(
      "view",
      ({ camera, view, xScale: xs, yScale: ys }) => {
        xDomain.current = xs.domain();
        yDomain.current = ys.domain();
        // onView()
     }
    );
    scatterplot.subscribe("select", ({ points }) => {
      // console.log("points", points, props.embeddings)
    });
    scatterplot.subscribe("deselect", () => {
    });

    return () => {
      scatterplot.destroy();
    };
  }, [points]);

  return <canvas ref={container} />;
};

export default ScatterPlot;
