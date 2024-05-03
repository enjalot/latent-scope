// import * as Plot from "npm:@observablehq/plot";
import createScatterplot from "../../_npm/regl-scatterplot@1.8.5/_esm.js";
import { scaleLinear, scaleSequential } from "../../_npm/d3-scale@4.0.2/_esm.js";
import { interpolateViridis, interpolateTurbo, interpolateCool } from "../../_npm/d3-scale-chromatic@3.1.0/_esm.js";
import { extent, range } from "../../_npm/d3-array@3.2.4/_esm.js";
import { rgb } from "../../_npm/d3-color@3.1.0/_esm.js";

const scatterCache = new WeakMap();

export function scatter(data, {
  canvas = document.createElement("canvas"),
  width, 
  height,
  x = (d) => d.x,
  y = (d) => d.y,
  color = null,
  size = null,
  colorInterpolator = interpolateCool,
  pointSize = 3,
  pointOpacity = 0.75
} = {}) {
  let scatterplot;
  if(!scatterCache.has(canvas)) {
    // create the scatterplot
    const scatterSettings = { 
      canvas,
      width,
      height,
      pointColorHover: [0.1, 0.1, 0.1, 0.5],
      pointSize,
      pointOpacity,
      xScale: scaleLinear().domain([-1, 1]),
      yScale: scaleLinear().domain([-1, 1]),
    }
    scatterplot = createScatterplot(scatterSettings);
    scatterCache.set(canvas, scatterplot)
    canvas.value = { 
      xd: [-1, 1], 
      yd: [-1, 1], 
      selected: [],
      hovered: [], 
      width, 
      height 
    }

    scatterplot.subscribe(
      "view",
      ({ camera, view, xScale: xs, yScale: ys }) => {
        let xd = xs.domain();
        let yd = ys.domain();
        canvas.value.xd = xd
        canvas.value.yd = yd
        canvas.dispatchEvent(new Event("input"));
    }
    );
    scatterplot.subscribe("select", ({ points }) => {
      canvas.value.selected= points
      canvas.dispatchEvent(new Event("input"));
    });
    scatterplot.subscribe("deselect", () => {
      canvas.value.selected = []
      canvas.dispatchEvent(new Event("input"));
    });
    scatterplot.subscribe("pointOver", (pointIndex) => {
      canvas.value.hovered = [pointIndex]
      canvas.dispatchEvent(new Event("input"));
    });
    scatterplot.subscribe("pointOut", (pointIndex) => {
      canvas.value.hovered = []
      canvas.dispatchEvent(new Event("input"));
    });
    canvas.scatter = scatterplot
  } else {
    // update the scatterplot
    scatterplot = scatterCache.get(canvas)
    scatterplot.set({ width, height });
    canvas.value.width = width
    canvas.value.height = height
    canvas.dispatchEvent(new Event("input"));
  }

  const points = data.map(d => [
    x(d), y(d), color && color(d), size && size(d)
  ].filter(x => x !== null))

  if(color) {
    scatterplot.set({colorBy: 'valueA'})
    // determine if the values in ordinal or continuous
    const valueSet = new Set(points.map(p => p[2]));
    const isOrdinal = [...valueSet].every(val => typeof val === 'string' || (typeof val === 'number' && !Number.isInteger(val) && val % 1 !== 0));
    if (isOrdinal) {
      // create a color for each unique value
      const uniqueValues = [...valueSet].sort();
      const colorScale = scaleSequential(colorInterpolator)
          .domain([0, uniqueValues.length]);
      const pointColor = uniqueValues.map((u,i) => rgb(colorScale(i)).hex())

      // update the points to use the index of the unique value (for regl-scatterplot)
      points.forEach(p => p[2] = uniqueValues.indexOf(p[2]))

      scatterplot.set({ pointColor });
    } else {

      //make sure the points scale from 0 to 1 for regl-scatter
      const values = [...valueSet]
      const scale = scaleLinear().domain(extent(values)).range([0, 1])
      points.forEach(p => p[2] = scale(p[2]))

      let r = range(0, 100)
      const colorScale = scaleSequential(colorInterpolator)
        .domain([0, 100]);
      const pointColor = r.map(i => rgb(colorScale(i)).hex())

      scatterplot.set({ pointColor }); // getContinuousColorScale is a hypothetical function
    }
  }
  if(size) {
    if(color) {
      scatterplot.set({sizeBy: 'valueB'})
    } else {
      scatterplot.set({sizeBy: 'valueA'})
    }
  }

  scatterplot.draw(points, { transition: false });
  return canvas
}
