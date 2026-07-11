import { useEffect, useRef } from 'react';
import { line, curveLinearClosed } from 'd3-shape';
import { select } from 'd3-selection';
import { useColorMode } from '@/hooks/useColorMode';

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
  // Label pill chrome. When not provided, the values are read from the theme
  // tokens (inverse "badge" surface) at render time so they flip with the
  // color scheme. Pass explicit values to override per call site.
  labelFill = undefined,
  labelTextColor = undefined,
}) => {
  const svgRef = useRef();
  const prevHulls = useRef();
  // re-render the token-colored labels when the theme flips
  const { colorMode } = useColorMode();

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

    // Chrome colors + mono stack come from the theme tokens unless the caller
    // passed explicit values (fallbacks match the light-mode token values).
    const rootStyle = getComputedStyle(document.documentElement);
    const pillFill =
      labelFill || rootStyle.getPropertyValue('--color-badge-primary-bg').trim() || '#26221c';
    const pillTextColor =
      labelTextColor ||
      rootStyle.getPropertyValue('--color-badge-primary-text').trim() ||
      '#f6f4f1';
    const monoFont = rootStyle.getPropertyValue('--ls-font-mono').trim() || 'monospace';

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
      .attr('fill', pillFill)
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
      .attr('fill', pillTextColor)
      .attr('font-family', monoFont)
      .attr('dominant-baseline', 'central')
      .attr('font-size', fontSize)
      .text(labelToShow);
  };

  useEffect(() => {
    const validHulls = hulls.filter((h) => h && h.length > 0);
    if (!xDomain || !yDomain || !validHulls.length) return;

    // Compare a cheap signature of ALL hulls — sampling only the first N
    // missed changes in later hulls (stale outlines with many clusters).
    const hullSignature = (hs) =>
      `${hs.length}:` + hs.map((h) => `${h.length},${h[0]},${h[h.length - 1]}`).join('|');
    const hullsChanged =
      !prevHulls.current || hullSignature(hulls) !== hullSignature(prevHulls.current);

    if (!hullsChanged) return;

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

    sel.exit().remove();

    sel
      .enter()
      .append('path')
      .classed('hull', true)
      .attr('d', draw)
      .style('fill', fill)
      .style('stroke', stroke)
      .style('stroke-width', scaledStrokeWidth)
      .style('opacity', opacity);

    sel.style('opacity', opacity).attr('d', draw);

    // Handle hull labels (pill + text together)
    renderLabels(svg);

    setTimeout(() => {
      prevHulls.current = hulls;
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
      `translate(${xOffset}, ${yOffset}) scale(${xScaleFactor}, ${yScaleFactor})`
    );

    const draw = line()
      .x((d) => d?.[0])
      .y((d) => -d?.[1])
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
  }, [fill, stroke, strokeWidth, xDomain, yDomain, width, height, colorMode, labelFill, labelTextColor]);

  return (
    <svg ref={svgRef} className="hull-plot" width={width} height={height}>
      <g className="hull-container"></g>
    </svg>
  );
};

export default HullPlot;
