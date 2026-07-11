import { useEffect, useRef } from 'react';
import { select } from 'd3-selection';
import styles from './PointLabel.module.scss';
import { useColorMode } from '@/hooks/useColorMode';

function PointLabel({
  selectedPoints, // array of {x, y, index} objects
  hovered,
  xDomain,
  yDomain,
  width,
  height,
  textColor = 'white',
  k,
  maxZoom,
  // Tone the dots down (smaller, translucent) so they don't cover the
  // imagery on image-map scopes. The hovered dot stays fully opaque.
  muted = false,
}) {
  const svgRef = useRef();
  const { isDark } = useColorMode();

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

  useEffect(() => {
    const svg = select(svgRef.current);

    let sf = 1.25 + (k / maxZoom) * 4;
    // muted dots also stop growing with zoom so they never eclipse an image cell
    if (muted) sf = Math.min(sf, 2.5) * 0.7;

    // Remove existing elements
    svg.selectAll('circle.point-label-circle').remove();
    svg.selectAll('text.point-label').remove();

    if (!xDomain || !yDomain || !selectedPoints?.length) return;

    // Selection chrome colors live in CSS tokens; re-read at draw time so a
    // theme change (isDark dep below) repaints with the right values.
    const rootStyle = getComputedStyle(document.documentElement);
    const selectionColor = rootStyle.getPropertyValue('--ls-color-selection').trim() || '#2f7a8e';
    const ringColor = rootStyle.getPropertyValue('--text-color-text-main').trim() || '#26221c';

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
      .attr('fill', selectionColor)
      .attr('fill-opacity', (d) =>
        muted ? (hovered && d.ls_index === hovered.index ? 0.95 : 0.55) : 1
      )
      .attr('stroke', (d) => (hovered && d.ls_index === hovered.index ? ringColor : 'none'))
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
      // font-family comes from the stylesheet (--ls-font-mono via the module)
      .attr('dominant-baseline', 'middle')
      .attr('font-size', fontSize)
      .attr('fill-opacity', (d) =>
        muted ? (hovered && d.ls_index === hovered.index ? 1 : 0.85) : 1
      )
      .text((d) => d.index + 1);
  }, [selectedPoints, xDomain, yDomain, width, height, textColor, hovered, muted, isDark]);

  return (
    <svg ref={svgRef} className={styles.pointLabelPlot} width={width} height={height}>
      <g className="point-label-container"></g>
    </svg>
  );
}

export default PointLabel;
