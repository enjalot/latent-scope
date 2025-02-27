import { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import styles from './PointLabel.module.scss';
import { contrastColor } from '../../../lib/colors';

function PointLabel({
  selectedPoints, // array of {x, y, index} objects
  hovered,
  xDomain,
  yDomain,
  width,
  height,
  fill = '#7baf5a', // same as HullPlot default
  textColor = 'white',
  k,
  maxZoom,
}) {
  const svgRef = useRef();

  // Reuse HullPlot's coordinate transformation helper
  const pointToSvgCoordinate = (point, xDomain, yDomain, width, height) => {
    const xScaleFactor = width / (xDomain[1] - xDomain[0]);
    const yScaleFactor = height / (yDomain[1] - yDomain[0]);
    const xOffset = width / 2 - (xScaleFactor * (xDomain[1] + xDomain[0])) / 2;
    const yOffset = height / 2 + (yScaleFactor * (yDomain[1] + yDomain[0])) / 2;

    return {
      x: point.x * xScaleFactor + xOffset,
      y: -point.y * yScaleFactor + yOffset,
    };
  };

  // Reuse HullPlot's font size calculation
  const calculateScaledFontSize = (width, height) => {
    const baseFontSize = 2;
    const FACTOR = 900;
    const scaleFactor = Math.min(width, height) / FACTOR;
    return Math.max(baseFontSize * scaleFactor, 8);
  };

  const calculateTextWidth = (text, fontSize) => {
    const charWidth = fontSize * 0.6;
    return text.length * charWidth + 2 * fontSize;
  };

  useEffect(() => {
    const svg = select(svgRef.current);

    let sf = 1.25 + (k / maxZoom) * 4;

    // Remove existing elements
    svg.selectAll('circle.point-label-circle').remove();
    svg.selectAll('text.point-label').remove();

    if (!xDomain || !yDomain || !selectedPoints?.length) return;

    const fontSize = calculateScaledFontSize(width, height) * sf;

    // Add circles first (so they appear under text)
    let circleSel = svg.selectAll('circle.point-label-circle').data(selectedPoints);

    circleSel.exit().remove();

    circleSel
      .enter()
      .append('circle')
      .attr('class', 'point-label-circle')
      .merge(circleSel)
      .attr('cx', (d) => {
        const coord = pointToSvgCoordinate(d, xDomain, yDomain, width, height);
        return coord.x;
      })
      .attr('cy', (d) => {
        const coord = pointToSvgCoordinate(d, xDomain, yDomain, width, height);
        return coord.y;
      })
      .attr('r', (d) => (hovered && d.ls_index === hovered.index ? 8 * sf : 6 * sf))
      .attr('fill', contrastColor)
      .attr('stroke', (d) => (hovered && d.ls_index === hovered.index ? '#111' : 'none'))
      .attr('stroke-width', 2);

    // Add text labels (same as before)
    let labelSel = svg.selectAll('text.point-label').data(selectedPoints);

    labelSel.exit().remove();

    labelSel
      .enter()
      .append('text')
      .attr('class', 'point-label')
      .merge(labelSel)
      .attr('x', (d) => {
        const coord = pointToSvgCoordinate(d, xDomain, yDomain, width, height);
        return coord.x;
      })
      .attr('y', (d) => {
        const coord = pointToSvgCoordinate(d, xDomain, yDomain, width, height);
        return coord.y;
      })
      .attr('text-anchor', 'middle')
      .attr('fill', textColor)
      .attr('font-family', 'monospace')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', fontSize)
      .text((d) => d.index + 1);
  }, [selectedPoints, xDomain, yDomain, width, height, textColor, hovered]);

  return (
    <svg ref={svgRef} className={styles.pointLabelPlot} width={width} height={height}>
      <g className="point-label-container"></g>
    </svg>
  );
}

export default PointLabel;
