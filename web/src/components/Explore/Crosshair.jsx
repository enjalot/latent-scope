import { useEffect, useRef } from 'react';
import scaleCanvas from '../../lib/canvas';
import { useColorMode } from '@/hooks/useColorMode';

const CrossHair = ({ xDomain, yDomain, width, height }) => {
  const canvasRef = useRef();
  const { isDark } = useColorMode();

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
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 0.25;

      // Chrome color lives in a CSS token; re-read on theme change.
      const crosshairColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--ls-color-crosshair')
        .trim();

      ctx.lineWidth = 2;
      ctx.strokeStyle = crosshairColor || '#9a938a';
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }
  }, [xDomain, yDomain, width, height, isDark]);

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
