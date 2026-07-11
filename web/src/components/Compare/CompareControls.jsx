import { useCallback, useMemo } from 'react';
import ColorLegend from './ColorLegend';
import { Readout } from '../ui';
import styles from './Compare.module.css';

// A column is colorable if it's numeric, or a string column ingest tagged with
// a bounded category set (<=100 uniques -> `categories` in column_metadata).
function colorableColumns(dataset) {
  const cols = dataset?.columns || [];
  const meta = dataset?.column_metadata || {};
  return cols.filter((col) => {
    const m = meta[col];
    if (!m || m.image) return false;
    if (m.type === 'number') return true;
    if (m.type === 'string' && Array.isArray(m.categories)) return true;
    return false;
  });
}

const METRIC_INFO = {
  displacement: {
    label: 'Displacement (L2)',
    description: 'Euclidean distance each point moved between the two UMAPs. High values mean the point landed in a very different position.',
  },
  neighborhood: {
    label: 'Neighborhood Change',
    description: 'Jaccard distance of each point\'s k nearest neighbors between the two UMAPs. High values mean the point\'s local neighborhood changed, regardless of global position.',
  },
  relative: {
    label: 'Relative Displacement',
    description: 'How much a point moved relative to its neighbors. High values mean the point moved away from its neighbors (not just with them).',
  },
};

function CompareControls({
  dataset,
  datasetId,
  umaps,
  embeddings,
  left,
  right,
  onSetLeft,
  onSetRight,
  threshold,
  onThresholdChange,
  aboveThresholdCount,
  metric,
  onMetricChange,
  metricK,
  onMetricKChange,
  displacementLoading,
  colorColumn,
  onColorColumnChange,
  colorLegend,
}) {
  const colorColumns = useMemo(() => colorableColumns(dataset), [dataset]);

  const formatUmapOption = useCallback(
    (um) => {
      const emb = embeddings.find((d) => um.embedding_id === d.id);
      const model = emb?.model_id || um.embedding_id;
      const dims = emb?.dimensions ? `[${emb.dimensions}]` : '';
      const sae = um.sae_id ? ` (SAE)` : '';
      const aligned = um.align_id ? ` (aligned)` : '';
      return `${um.id} - ${model} ${dims}${sae}${aligned}`;
    },
    [embeddings]
  );

  return (
    <div className={styles['controls']}>
      <div className={styles['controls-header']}>
        <span className={styles['dataset-name']}>{datasetId}</span>
        <Readout label="ROWS" value={dataset?.length} />
      </div>
      <div className={styles['umap-selectors']}>
        <div className={styles['umap-selector']}>
          <label>Left UMAP</label>
          <select
            className="ls-select"
            value={left?.id || ''}
            onChange={(e) => onSetLeft(e.target.value)}
          >
            {umaps.map((um) => (
              <option key={um.id} value={um.id}>
                {formatUmapOption(um)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles['umap-selector']}>
          <label>Right UMAP</label>
          <select
            className="ls-select"
            value={right?.id || ''}
            onChange={(e) => onSetRight(e.target.value)}
          >
            {umaps.map((um) => (
              <option key={um.id} value={um.id}>
                {formatUmapOption(um)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={styles['metric-controls']}>
        <div className={styles['metric-selector']}>
          <label>Metric</label>
          <select
            className="ls-select"
            value={metric}
            onChange={(e) => onMetricChange(e.target.value)}
          >
            {Object.entries(METRIC_INFO).map(([key, info]) => (
              <option key={key} value={key}>{info.label}</option>
            ))}
          </select>
          <span className={styles['metric-description']}>
            {METRIC_INFO[metric]?.description}
          </span>
        </div>
        {metric !== 'displacement' && (
          <div className={styles['metric-k']}>
            <label>k = {metricK}</label>
            <input
              type="range"
              min="5"
              max="50"
              step="1"
              value={metricK}
              onChange={(e) => onMetricKChange(parseInt(e.target.value))}
            />
          </div>
        )}
        <div className={styles['threshold-control']}>
          <label>
            Threshold: {threshold.toFixed(2)}
            {displacementLoading && <span className={styles['loading-indicator']}> computing...</span>}
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={threshold}
            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
          />
          <span className={styles['threshold-count']}>
            {aboveThresholdCount} points above threshold
          </span>
        </div>
        <div className={styles['metric-selector']}>
          <label>Color by</label>
          <select
            className="ls-select"
            value={colorColumn || ''}
            onChange={(e) => onColorColumnChange(e.target.value)}
          >
            <option value="">Drift metric (default)</option>
            {colorColumns.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          {colorColumn ? (
            <span className={styles['metric-description']}>
              Coloring by column (drift coloring paused)
            </span>
          ) : (
            colorColumns.length === 0 && (
              <span className={styles['metric-description']}>No colorable columns</span>
            )
          )}
        </div>
        {colorLegend && (
          <div className={styles['color-legend-wrap']}>
            <ColorLegend legend={colorLegend} />
          </div>
        )}
      </div>
    </div>
  );
}

export default CompareControls;
