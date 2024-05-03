import { create } from "../../_npm/d3-selection@3.0.0/_esm.js"
import { scaleLinear } from "../../_npm/d3-scale@4.0.2/_esm.js"


export function tooltip({
} = {}) {
  const tooltip = create("div")
    .attr("class", "tooltip")

  function show(p, map, html) {
    tooltip.html(html)
    tooltip.style("display", "block")
    let x = scaleLinear().domain(map.xd).range([0, map.width])
    let y = scaleLinear().domain(map.yd).range([map.height, 0])
    tooltip.style("left", `${x(p.x) + 10}px`)
    tooltip.style("top", `${y(p.y)}px`)
  }
  function hide() {
    tooltip.style("display", "none")
  }

  return Object.assign(tooltip.node(), {
    show,
    hide
  })
}

