import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { max } from 'd3-array';
import { scalePow } from 'd3-scale';
import { useColorMode } from '@/hooks/useColorMode';
import FeatureModal from './FeatureModal';

// Chrome colors live in CSS tokens; canvas code reads them at draw time and
// re-renders on theme change (same pattern as ScatterGL).
const readChromeTokens = () => {
  const rootStyle = getComputedStyle(document.documentElement);
  const read = (name) => rootStyle.getPropertyValue(name).trim();
  return {
    accent: read('--interactions---primary-color-interaction-primary'),
    dimmed: read('--borders-color-border-2'),
    faint: read('--neutrals-color-neutral-2'),
    tick: read('--text-color-text-subtle'),
    mono: read('--ls-font-mono'),
  };
};

function FeaturePlot({
  row,
  feature,
  features,
  width,
  handleFeatureClick,
  setFeatureTooltipContent,
}) {
  const { idx } = row;
  const showTicks = idx !== undefined;
  const { isDark } = useColorMode();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const canvasRef = useRef(null);

  const height = 45;
  const padding = useMemo(
    () => ({ left: 10, right: 20, top: 2.5, bottom: showTicks ? 15 : 1.5 }),
    [showTicks]
  );

  // const activations = row.sae_acts || [];
  const dataset_max = useMemo(() => max(features, (f) => f.dataset_max), [features]);

  const logScale = useMemo(
    () =>
      scalePow()
        .exponent(2.5)
        .domain([0, dataset_max])
        .range([padding.left, width - padding.right]),
    [dataset_max, padding, width]
  );

  // Prepare feature data
  const featuresToActivations = useMemo(() => {
    let data = row.sae_indices.map((idx, i) => ({
      feature: idx,
      activation: row.sae_acts[i],
    }));

    if (feature !== -1) {
      const nonSelected = data.filter(({ feature: feat_idx }) => feat_idx !== feature);
      const selected = data.filter(({ feature: feat_idx }) => feat_idx === feature);
      return [...nonSelected, ...selected];
    }
    return data;
  }, [row.sae_indices, row.sae_acts, feature]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas DPI for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const tokens = readChromeTokens();

    // Draw lines
    featuresToActivations.forEach(({ feature: feat_idx, activation }, idx) => {
      const x = logScale(activation);

      ctx.beginPath();
      ctx.moveTo(x, height - padding.bottom);
      ctx.lineTo(x, padding.top);

      const featureColor = tokens.accent;

      // Set line style based on hover/feature state
      if (hoveredIdx !== null) {
        if (idx === hoveredIdx) {
          ctx.strokeStyle = featureColor;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
        } else {
          ctx.strokeStyle = tokens.dimmed;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.25;
        }
      } else if (feature === -1) {
        ctx.strokeStyle = featureColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
      } else if (feat_idx === feature) {
        ctx.strokeStyle = featureColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
      } else {
        ctx.strokeStyle = tokens.faint;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
      }

      ctx.stroke();
    });

    // Draw ticks (numeric readouts — mono)
    if (showTicks) {
      ctx.font = `8px ${tokens.mono || 'monospace'}`;
      ctx.fillStyle = tokens.tick;
      ctx.textAlign = 'center';

      [0, dataset_max].forEach((tick) => {
        const x = logScale(tick);
        ctx.fillText(tick?.toFixed(2), x, height - padding.bottom + 10);
      });
    }
  }, [
    width,
    height,
    featuresToActivations,
    hoveredIdx,
    feature,
    logScale,
    showTicks,
    padding,
    dataset_max,
    isDark,
  ]);

  // Handle mouse interactions
  const handleMouseMove = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // Find closest line
      let closestIdx = null;
      let minDistance = Infinity;

      featuresToActivations.forEach(({ activation }, idx) => {
        const lineX = logScale(activation);
        const distance = Math.abs(x - lineX);
        if (distance < minDistance && distance < 5) {
          // 5px threshold
          minDistance = distance;
          closestIdx = idx;
        }
      });

      setHoveredIdx(closestIdx);

      if (closestIdx !== null) {
        const { feature: feat_idx, activation } = featuresToActivations[closestIdx];
        const rect = canvas.getBoundingClientRect();
        // Honest anchor: the hovered line's screen position at the canvas's
        // bottom edge. The tooltip consumer applies its own offset.
        const tooltipX = rect.left + logScale(activation);
        const tooltipY = rect.bottom;

        // Update tooltip state in a single setState call
        setFeatureTooltipContent({
          content: `Feature ${feat_idx}: ${features?.[feat_idx]?.label} (${activation.toFixed(3)})`,
          x: tooltipX,
          y: tooltipY,
        });
      } else {
        setFeatureTooltipContent(null);
      }
    },
    [featuresToActivations, logScale, features, setFeatureTooltipContent]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
    setFeatureTooltipContent(null);
  }, [setFeatureTooltipContent]);

  const [modalHoveredIdx, setModalHoveredIdx] = useState(null);

  return (
    <div className="feature-plot-container">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width, height }}
        data-tooltip-id="feature-tooltip"
        onClick={useCallback(() => {
          setIsModalOpen(true);
          setModalHoveredIdx(hoveredIdx);
        }, [hoveredIdx])}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      <FeatureModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        rowIndex={row.ls_index}
        hoveredIdx={modalHoveredIdx}
        features={features}
        topIndices={row.sae_indices}
        topActs={row.sae_acts}
        selectedFeature={feature}
        handleFeatureClick={handleFeatureClick}
      />
    </div>
  );
}

export default FeaturePlot;
