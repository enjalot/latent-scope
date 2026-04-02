import { useEffect, useRef, useCallback } from 'react';
import { scaleSequential } from 'd3-scale';
import { interpolateBlues } from 'd3-scale-chromatic';

import './OverlapHeatmap.css';

const MARGIN = { top: 40, right: 10, bottom: 10, left: 50 };

function OverlapHeatmap({ matrix, leftLabels, rightLabels, width, height, onCellClick }) {
  const canvasRef = useRef(null);
  const hoveredCellRef = useRef(null);

  const maxVal = matrix.reduce(
    (max, row) => Math.max(max, ...row),
    0
  );

  const colorScale = scaleSequential(interpolateBlues).domain([0, maxVal || 1]);

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;
  const cellWidth = leftLabels.length > 0 ? innerWidth / rightLabels.length : 0;
  const cellHeight = rightLabels.length > 0 ? innerHeight / leftLabels.length : 0;

  const draw = useCallback(
    (hoveredRow, hoveredCol) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      if (!matrix.length || !leftLabels.length || !rightLabels.length) return;

      // Draw cells
      for (let i = 0; i < leftLabels.length; i++) {
        for (let j = 0; j < rightLabels.length; j++) {
          const x = MARGIN.left + j * cellWidth;
          const y = MARGIN.top + i * cellHeight;
          const val = matrix[i][j];

          ctx.fillStyle = val > 0 ? colorScale(val) : '#f8f8f8';
          ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);

          // Highlight hovered cell
          if (i === hoveredRow && j === hoveredCol) {
            ctx.strokeStyle = '#ff6600';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cellWidth - 1, cellHeight - 1);
          }

          // Draw count in cell if cells are large enough
          if (cellWidth > 25 && cellHeight > 15 && val > 0) {
            ctx.fillStyle = val > maxVal * 0.6 ? '#fff' : '#333';
            ctx.font = `${Math.min(cellHeight * 0.5, 11)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(val, x + cellWidth / 2, y + cellHeight / 2);
          }
        }
      }

      // Column labels (right clusters) — top
      ctx.fillStyle = '#666';
      ctx.font = `${Math.min(cellWidth * 0.6, 10)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (let j = 0; j < rightLabels.length; j++) {
        const x = MARGIN.left + j * cellWidth + cellWidth / 2;
        ctx.save();
        ctx.translate(x, MARGIN.top - 4);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(rightLabels[j], 0, 0);
        ctx.restore();
      }

      // Row labels (left clusters) — left
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.min(cellHeight * 0.6, 10)}px sans-serif`;
      for (let i = 0; i < leftLabels.length; i++) {
        const y = MARGIN.top + i * cellHeight + cellHeight / 2;
        ctx.fillText(leftLabels[i], MARGIN.left - 4, y);
      }
    },
    [matrix, leftLabels, rightLabels, width, height, cellWidth, cellHeight, colorScale, maxVal]
  );

  useEffect(() => {
    draw(null, null);
  }, [draw]);

  const getCellFromEvent = useCallback(
    (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - MARGIN.left;
      const y = e.clientY - rect.top - MARGIN.top;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);
      if (row >= 0 && row < leftLabels.length && col >= 0 && col < rightLabels.length) {
        return { row, col };
      }
      return null;
    },
    [cellWidth, cellHeight, innerWidth, innerHeight, leftLabels.length, rightLabels.length]
  );

  const handleMouseMove = useCallback(
    (e) => {
      const cell = getCellFromEvent(e);
      const prevCell = hoveredCellRef.current;
      if (cell?.row !== prevCell?.row || cell?.col !== prevCell?.col) {
        hoveredCellRef.current = cell;
        draw(cell?.row ?? null, cell?.col ?? null);
      }
    },
    [getCellFromEvent, draw]
  );

  const handleMouseLeave = useCallback(() => {
    hoveredCellRef.current = null;
    draw(null, null);
  }, [draw]);

  const handleClick = useCallback(
    (e) => {
      const cell = getCellFromEvent(e);
      if (cell && onCellClick) {
        onCellClick(leftLabels[cell.row], rightLabels[cell.col], matrix[cell.row][cell.col]);
      }
    },
    [getCellFromEvent, onCellClick, leftLabels, rightLabels, matrix]
  );

  return (
    <canvas
      ref={canvasRef}
      className="overlap-heatmap"
      style={{ width, height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    />
  );
}

export default OverlapHeatmap;
