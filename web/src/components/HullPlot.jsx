import { useEffect, useRef } from 'react';
// import { scaleLinear } from 'd3-scale';
import { line, curveLinearClosed } from 'd3-shape';
import { select } from 'd3-selection';
// import { interpolate } from 'flubber';

import './HullPlot.css';

function calculateCentroid(points) {
  if (!points || points.length === 0) {
    return null;
  }

  let xSum = 0;
  let ySum = 0;

  points.forEach((point) => {
    xSum += point[0];
    ySum += point[1];
  });

  const centroidX = xSum / points.length;
  const centroidY = ySum / points.length;

  return [centroidX, centroidY];
}

function findHighestPoint(points) {
  if (!points || points.length === 0) {
    return null;
  }

  // Find the point with the maximum y-coordinate (points[1]), and then return the entire point
  const y = Math.max(...points.map((point) => point[1]));
  return points.find((point) => point[1] === y);
}

const HullPlot = ({
  hulls,
  fill,
  stroke,
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
  const prevHulls = useRef();

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

  // Add this helper function near the top of the component
  const calculateScaledFontSize = (width, height) => {
    const baseFontSize = 12;
    // Scale based on the smaller dimension to maintain readability
    const FACTOR = 900; // smaller is bigger
    const scaleFactor = Math.min(width, height) / FACTOR;
    return Math.max(baseFontSize * scaleFactor, 8); // Ensure minimum font size of 8px
  };

  // Approximate width per character (assuming monospace font)
  const calculateTextWidth = (text, fontSize) => {
    const charWidth = fontSize * 0.6; // Monospace fonts are typically ~60% as wide as they are tall
    return text.length * charWidth + 2 * fontSize; // Add padding of 1 character width on each side
  };

  // Draw (or reposition) the label pill + text for each hull in screen
  // coordinates. Called from BOTH effects — on hull changes and on every
  // zoom/pan — so the background rect and the text always move together.
  const renderLabels = (svg) => {
    let labelBgSel = svg.selectAll('rect.hull-label-bg').data(label ? hulls : []);
    labelBgSel.exit().remove();
    let labelSel = svg.selectAll('text.hull-label').data(label ? hulls : []);
    labelSel.exit().remove();
    if (!label) return;

    const fontSize = calculateScaledFontSize(width, height);
    const textWidth = calculateTextWidth(labelToShow, fontSize);
    const pillHeight = fontSize * 2;
    // The pill sits above the hull's highest point; the text is anchored to
    // the pill's exact vertical center so the two stay aligned at any font
    // size (previously the text hung from a fixed baseline offset while the
    // pill's box scaled with the font).
    const pillTop = (d) =>
      hullToSvgCoordinate(findHighestPoint(d), xDomain, yDomain, width, height).y -
      8 -
      pillHeight;

    // background rects first so the text (appended after) paints on top
    labelBgSel
      .enter()
      .append('rect')
      .attr('class', 'hull-label-bg')
      .merge(labelBgSel)
      .attr('fill', '#7baf5a')
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('opacity', 0.85)
      .attr('x', (d) => {
        const centroid = hullToSvgCoordinate(calculateCentroid(d), xDomain, yDomain, width, height);
        return centroid.x - textWidth / 2; // Center the background
      })
      .attr('y', pillTop)
      .attr('width', textWidth)
      .attr('height', pillHeight);

    labelSel
      .enter()
      .append('text')
      .attr('class', 'hull-label')
      .merge(labelSel)
      .attr('dy', null) // clear the legacy baseline nudge on merged elements
      .attr(
        'x',
        (d) => hullToSvgCoordinate(calculateCentroid(d), xDomain, yDomain, width, height).x
      )
      .attr('y', (d) => pillTop(d) + pillHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .attr('font-family', 'monospace')
      .attr('dominant-baseline', 'central')
      .attr('font-size', fontSize)
      .text(labelToShow);
  };

  useEffect(() => {
    const validHulls = hulls.filter((h) => h && h.length > 0);
    if (!xDomain || !yDomain || !validHulls.length) return;

    // console.log("NO PRE HULLS CURRENT", !prevHulls.current)
    // Compare a cheap signature of ALL hulls — sampling only the first N
    // missed changes in later hulls (stale outlines with many clusters).
    const hullSignature = (hs) =>
      `${hs.length}:` + hs.map((h) => `${h.length},${h[0]},${h[h.length - 1]}`).join('|');
    const hullsChanged =
      !prevHulls.current || hullSignature(hulls) !== hullSignature(prevHulls.current);
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

    sel
      .exit()
      // .transition()
      // .duration(duration)
      // .delay(delay)
      // .ease(easeExpOut)
      // .style("opacity", 0)
      .remove();

    sel
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

    sel
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

    // Handle hull labels (pill + text together)
    renderLabels(svg);

    setTimeout(() => {
      prevHulls.current = hulls;
      // prevHulls.current = mod
      // prevPoints.current = points
    }, duration);
  }, [hulls]);

  // This effect will rerender instantly when the fill, stroke, strokeWidth, or domain changes
  useEffect(() => {
    if (!xDomain || !yDomain || !hulls.filter((h) => h && h.length > 0).length) return;
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

    // Handle hull labels: reposition the pill AND the text on every zoom/pan
    // (previously only the text moved, so the label background stayed behind
    // at its old position while zooming).
    renderLabels(svg);

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
