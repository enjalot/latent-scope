import { useEffect, useRef } from 'react';
// import { scaleLinear } from 'd3-scale';
import { line, curveLinearClosed, curveCatmullRomClosed } from 'd3-shape';
import { select } from 'd3-selection';
import { transition } from 'd3-transition';
import { easeExpOut, easeExpIn, easeCubicInOut} from 'd3-ease';
// import { interpolate } from 'flubber';

import "./HullPlot.css"


const HullPlot = ({
  hulls,
  fill,
  stroke,
  delay = 0,
  duration = 2000,
  strokeWidth,
  opacity = 0.75,
  xDomain,
  yDomain,
  width,
  height,
  label = undefined,
}) => {
  const svgRef = useRef();
  const prevPoints = useRef();
  const prevHulls = useRef();
  const prevMod = useRef();

  console.log('=== hulls ===', hulls);

  const hasLabel = label !== undefined;
  let labelToShow = label;
  if (hasLabel) {
    labelToShow = label.label;
  }

  // Add this helper function to the component
  const hullToSvgCoordinate = (point, xDomain, yDomain, width, height) => {
    // Calculate scale factors
    const xScaleFactor = width / (xDomain[1] - xDomain[0]);
    const yScaleFactor = height / (yDomain[1] - yDomain[0]);

    // Calculate offsets to center the visualization
    const xOffset = width / 2 - (xScaleFactor * (xDomain[1] + xDomain[0])) / 2;
    const yOffset = height / 2 + (yScaleFactor * (yDomain[1] + yDomain[0])) / 2;

    // Convert the point
    return {
      x: point[0] * xScaleFactor + xOffset,
      y: -point[1] * yScaleFactor + yOffset, // Negate y to flip coordinate system
    };
  };

  useEffect(() => {
    if (!xDomain || !yDomain || !hulls.length) return;

    // console.log("NO PRE HULLS CURRENT", !prevHulls.current)
    const hullsChanged =
      !prevHulls.current ||
      JSON.stringify(hulls.slice(0, 10)) !== JSON.stringify(prevHulls.current.slice(0, 10));
    // const pointsChanged = !prevPoints.current || (JSON.stringify(points[0]) !== JSON.stringify(prevPoints.current[0]))

    if (!hullsChanged) return;
    // if(!hullsChanged || !pointsChanged) {
    //   return
    // }

    const svg = select(svgRef.current);
    // Calculate scale factors
    // The scale factors are calculated to fit the -1 to 1 domain within the current xDomain and yDomain
    const xScaleFactor = width / (xDomain[1] - xDomain[0]);
    const yScaleFactor = height / (yDomain[1] - yDomain[0]);

    // Calculate translation to center the drawing at (0,0)
    // This centers the view at (0,0) and accounts for the SVG's inverted y-axis
    const xOffset = width / 2 - (xScaleFactor * (xDomain[1] + xDomain[0])) / 2;
    const yOffset = height / 2 + (yScaleFactor * (yDomain[1] + yDomain[0])) / 2;

    // Calculate a scaled stroke width
    const scaledStrokeWidth = strokeWidth / Math.sqrt(xScaleFactor * yScaleFactor);

    const g = svg.select('g.hull-container');
    g.attr(
      'transform',
      `translate(${xOffset}, ${yOffset}) scale(${xScaleFactor}, ${yScaleFactor})`
    );

    const draw = line()
      .x((d) => d?.[0])
      .y((d) => -d?.[1])
      .curve(curveLinearClosed);

    let sel = g.selectAll('path.hull').data(hulls);

    // Add base font size calculation
    const baseFontSize = 12;
    const scaledFontSize = baseFontSize / Math.sqrt(xScaleFactor * yScaleFactor);

    const exit = sel
      .exit()
      // .transition()
      // .duration(duration)
      // .delay(delay)
      // .ease(easeExpOut)
      // .style("opacity", 0)
      .remove();

    const enter = sel
      .enter()
      .append('path')
      .classed('hull', true)
      .attr('d', draw)
      .style('fill', fill)
      .style('stroke', stroke)
      .style('stroke-width', scaledStrokeWidth)
      .style('opacity', 0)
      // .transition()
      //   .delay(delay + 100)
      //   .duration(duration - 100)
      //   .ease(easeExpOut)
      .style('opacity', opacity);

    const update = sel
      // .transition()
      // .duration(duration)
      // .delay(delay)
      // .ease(easeCubicInOut)
      .style('opacity', opacity)
      .attr('d', draw);
    // .attrTween("d", function(d,i) {
    //   // console.log("d,i", d, i)
    //   // console.log(d.hull, prevHulls.current.find(h => h.index == d.index).hull)
    //   const prev = prevHulls.current ? prevHulls.current[i] : null
    //   // console.log(d, prev)
    //   if(!prev) return () => draw(d)
    //   const inter = interpolate(
    //     draw(prev),
    //     draw(d)
    //   );
    //   return function(t) {
    //     return inter(t)
    //   }
    // })

    // Handle hull labels
    let labelSel = svg.selectAll('text.hull-label').data(hulls);

    labelSel.exit().remove();

    if (label) {
      labelSel
        .enter()
        .append('text')
        .attr('class', 'hull-label')
        .merge(labelSel)
        .attr('dx', 5)
        .attr('dy', 5)
        .attr('x', (d) => hullToSvgCoordinate(d[0], xDomain, yDomain, width, height).x)
        .attr('y', (d) => hullToSvgCoordinate(d[0], xDomain, yDomain, width, height).y)
        .attr('text-anchor', 'end')
        .attr('fill', 'white')
        .attr('alignment-baseline', 'middle')
        .attr('font-size', 12)
        .text(label.label);
    }

    setTimeout(() => {
      prevHulls.current = hulls;
      // prevHulls.current = mod
      // prevPoints.current = points
    }, duration);
  }, [hulls]);

  // This effect will rerender instantly when the fill, stroke, strokeWidth, or domain changes
  useEffect(() => {
    if (!xDomain || !yDomain || !hulls.length) return;
    const svg = select(svgRef.current);

    // Calculate scale factors
    // The scale factors are calculated to fit the -1 to 1 domain within the current xDomain and yDomain
    const xScaleFactor = width / (xDomain[1] - xDomain[0]);
    const yScaleFactor = height / (yDomain[1] - yDomain[0]);

    // Calculate translation to center the drawing at (0,0)
    // This centers the view at (0,0) and accounts for the SVG's inverted y-axis
    const xOffset = width / 2 - (xScaleFactor * (xDomain[1] + xDomain[0])) / 2;
    const yOffset = height / 2 + (yScaleFactor * (yDomain[1] + yDomain[0])) / 2;

    // Calculate a scaled stroke width
    const scaledStrokeWidth = strokeWidth / Math.sqrt(xScaleFactor * yScaleFactor);

    const baseFontSize = 12;
    const fontSize = baseFontSize / Math.sqrt(xScaleFactor * yScaleFactor);

    // Update labels
    // let labelSel = svg.selectAll('text.hull-label').data(hulls);

    // if (label) {
    //   labelSel
    //     .enter()
    //     .append('text')
    //     .attr('class', 'hull-label')
    //     .merge(labelSel)
    //     .attr('x', (d) => {
    //       return d?.[0]?.[0] * xScaleFactor;
    //     })
    //     .attr('y', (d) => d?.[0]?.[1] * yScaleFactor)
    //     .attr('text-anchor', 'start')
    //     .attr('alignment-baseline', 'middle')
    //     .attr('font-family', 'monospace')
    //     .attr('font-weight', 'bold')
    //     .attr('font-size', 12)
    //     .attr('fill', 'white')
    //     .text(label.label);
    // }

    const g = svg.select('g.hull-container');
    g.attr(
      'transform',
      // `translate(${xOffset}, ${yOffset})`
      `translate(${xOffset}, ${yOffset}) scale(${xScaleFactor}, ${yScaleFactor})`
    );

    const draw = line()
      .x((d) => d?.[0])
      .y((d) => -d?.[1])
      // .curve(curveCatmullRomClosed);
      .curve(curveLinearClosed);

    // Draw hulls
    let sel = g.selectAll('path.hull').data(hulls);
    sel
      .enter()
      .append('path')
      .classed('hull', true)
      .attr('d', draw)
      .style('fill', fill)
      .style('stroke', stroke)
      .attr('stroke-width', scaledStrokeWidth)
      .style('opacity', opacity);

    sel.exit().remove();

    sel
      .attr('d', draw)
      .style('fill', fill)
      .style('stroke', stroke)
      .attr('stroke-width', scaledStrokeWidth)
      .style('opacity', opacity);

    // labelSel.exit().remove();
  }, [fill, stroke, strokeWidth, xDomain, yDomain, width, height]);

  return (
    <svg ref={svgRef} className="hull-plot" width={width} height={height}>
      <g className="hull-container"></g>
    </svg>
  );
};

export default HullPlot;



// const HullPlotCanvas = ({ 
//   points, 
//   hulls,
//   fill,
//   stroke,
//   strokeWidth,
//   symbol,
//   xDomain, 
//   yDomain, 
//   width, 
//   height
// }) => {
//   const container = useRef();
  
//   useEffect(() => {
//     if(xDomain && yDomain) {
//       const xScale = scaleLinear()
//         .domain(xDomain)
//         .range([0, width])
//       const yScale = scaleLinear()
//         .domain(yDomain)
//         .range([height, 0])

//       const zScale = (t) => t/(.1 + xDomain[1] - xDomain[0])
//       const canvas = container.current
//       const ctx = canvas.getContext('2d')
//       ctx.clearRect(0, 0, width, height)
//       ctx.fillStyle = fill 
//       ctx.strokeStyle = stroke
//       ctx.font = `${zScale(strokeWidth)}px monospace`
//       ctx.globalAlpha = 0.75
//       let rw = zScale(strokeWidth)
//       if(!hulls.length || !points.length) return
//       hulls.forEach(hull => {
//         // a hull is a list of indices into points
//         if(!hull) return;
//         ctx.beginPath()
//         hull.forEach((index, i) => {
//           if(i === 0) {
//             ctx.moveTo(xScale(points[index][0]), yScale(points[index][1]))
//           } else {
//             ctx.lineTo(xScale(points[index][0]), yScale(points[index][1]))
//           }
//         })
//         ctx.lineTo(xScale(points[hull[0]][0]), yScale(points[hull[0]][1]))
//         if(fill)
//           ctx.fill()
//         if(stroke)
//           ctx.stroke()
//       })
//     }

//   }, [points, hulls, fill, stroke, strokeWidth, xDomain, yDomain, width, height])

//   return <canvas 
//     className="hull-plot"
//     ref={container} 
//     width={width} 
//     height={height} />;
// };

// export default HullPlot;
