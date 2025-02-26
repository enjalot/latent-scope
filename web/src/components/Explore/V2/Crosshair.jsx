import React, { useEffect, useRef } from 'react';
import { scaleLinear } from 'd3-scale';
import scaleCanvas from '../../../lib/canvas';

const CrossHair = ({ xDomain, yDomain, width, height }) => {
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    scaleCanvas(canvas, context, width, height);
  }, [width, height]);

  useEffect(() => {
    if (xDomain && yDomain) {
      // const xScale = scaleLinear().domain(xDomain).range([0, width]);
      // const yScale = scaleLinear().domain(yDomain).range([height, 0]);

      // const zScale = (t) => t / (0.1 + xDomain[1] - xDomain[0]);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      // ctx.font = `${zScale(size)}px monospace`;
      ctx.globalAlpha = 0.25;

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'lightgray';
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }
  }, [xDomain, yDomain, width, height]);

  return (
    <canvas
      className="mobile-hud"
      style={{ position: 'absolute', pointerEvents: 'none' }}
      ref={canvasRef}
      width={width}
      height={height}
    />
  );
};

export default CrossHair;
