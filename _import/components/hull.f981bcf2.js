import { create, select } from "../../_npm/d3-selection@3.0.0/_esm.js";
import { transition } from "../../_npm/d3-transition@3.0.1/_esm.js";
import { line, curveLinearClosed, curveCatmullRomClosed } from "../../_npm/d3-shape@3.2.0/_esm.js";
import { easeCubicInOut, easeExpOut } from "../../_npm/d3-ease@3.0.1/_esm.js";
import { scaleLinear, scaleSequential } from "../../_npm/d3-scale@4.0.2/_esm.js";
import { extent, range } from "../../_npm/d3-array@3.2.4/_esm.js";
import { rgb } from "../../_npm/d3-color@3.1.0/_esm.js";

export function hull(hulls, {
  // TODO: make this not rerender every time
  // svg = document.createElement("svg"),
  width, 
  height,
  xd = [-1, 1],
  yd = [-1, 1],
  x = (d) => d.x,
  y = (d) => d.y,
  strokeWidth = 2,
  fill = "none",
  stroke = "black",
  duration = 1000,
  delay = 0,
  ease = easeCubicInOut
} = {}) {
  
  const svgs = create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto; display: block;")
  

  const xScaleFactor = width / (xd[1] - xd[0]);
  const yScaleFactor = height / (yd[1] - yd[0]);

  // Calculate translation to center the drawing at (0,0)
  // This centers the view at (0,0) and accounts for the SVG's inverted y-axis
  const xOffset = width / 2 - (xScaleFactor * (xd[1] + xd[0]) / 2);
  const yOffset = height / 2 + (yScaleFactor * (yd[1] + yd[0]) / 2);

  // Calculate a scaled stroke width
  const scaledStrokeWidth = strokeWidth / Math.sqrt(xScaleFactor * yScaleFactor) / 2;

  const g = svgs.append("g")
  g.attr('transform', `translate(${xOffset}, ${yOffset}) scale(${xScaleFactor}, ${yScaleFactor})`);

  const draw = line()
    .x(d => d.x)
    .y(d => -d.y)
    // .curve(curveCatmullRomClosed);
    .curve(curveLinearClosed);

  let sel = g.selectAll("path.hull")
    .data(hulls)
  
  const exit = sel.exit()
    // .transition()
    // .duration(duration)
    // .delay(delay)
    // .ease(easeExpOut)
    .style("opacity", 0)
      .remove()

  const enter = sel.enter()
    .append("path")
      .classed("hull", true)
      .attr("d", draw)
      .style("fill", fill)
      .style("stroke", stroke)
      .style("stroke-width", scaledStrokeWidth)
      // .style("opacity", 0.)
      // .transition()
      //   .delay(delay + 100)
      //   .duration(duration - 100)
      //   .ease(easeExpOut)
        .style("opacity", 0.75)

  const update = sel
    // .transition() 
    // .duration(duration)
    // .delay(delay)
    // .ease(easeCubicInOut)
    .style("opacity", 0.75)
    .attr("d", draw)

  
  return svgs.node()
}
