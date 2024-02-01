import React, { useEffect, useRef } from 'react';
import { scaleLinear } from 'd3-scale';

import "./HullPlot.css"

const HullPlot = ({ 
  points, 
  hulls,
  fill,
  stroke,
  size,
  symbol,
  xDomain, 
  yDomain, 
  width, 
  height
}) => {
  const container = useRef();
  
  useEffect(() => {
    if(xDomain && yDomain) {
      const xScale = scaleLinear()
        .domain(xDomain)
        .range([0, width])
      const yScale = scaleLinear()
        .domain(yDomain)
        .range([height, 0])

      const zScale = (t) => t/(.1 + xDomain[1] - xDomain[0])
      const canvas = container.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = fill 
      ctx.strokeStyle = stroke
      ctx.font = `${zScale(size)}px monospace`
      ctx.globalAlpha = 0.75
      let rw = zScale(size)
      if(!hulls.length || !points.length) return
      hulls.forEach(hull => {
        // a hull is a list of indices into points
        if(!hull) return;
        ctx.beginPath()
        hull.forEach((index, i) => {
          if(i === 0) {
            ctx.moveTo(xScale(points[index][0]), yScale(points[index][1]))
          } else {
            ctx.lineTo(xScale(points[index][0]), yScale(points[index][1]))
          }
        })
        ctx.lineTo(xScale(points[hull[0]][0]), yScale(points[hull[0]][1]))
        if(fill)
          ctx.fill()
        if(stroke)
          ctx.stroke()
      })
    }

  }, [points, hulls, fill, stroke, size, xDomain, yDomain, width, height])

  return <canvas 
    className="hull-plot"
    ref={container} 
    width={width} 
    height={height} />;
};

export default HullPlot;
