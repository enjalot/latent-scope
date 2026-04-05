import { useCallback } from 'react';
import styles from './Compare.module.css';

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
}) {
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
        <b>{datasetId}</b>
        <span>{dataset?.length} rows</span>
      </div>
      <div className={styles['umap-selectors']}>
        <div className={styles['umap-selector']}>
          <label>Left UMAP</label>
          <select value={left?.id || ''} onChange={(e) => onSetLeft(e.target.value)}>
            {umaps.map((um) => (
              <option key={um.id} value={um.id}>
                {formatUmapOption(um)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles['umap-selector']}>
          <label>Right UMAP</label>
          <select value={right?.id || ''} onChange={(e) => onSetRight(e.target.value)}>
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
          <select value={metric} onChange={(e) => onMetricChange(e.target.value)}>
            <option value="displacement">Displacement (L2)</option>
            <option value="neighborhood">Neighborhood Change</option>
            <option value="relative">Relative Displacement</option>
          </select>
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
      </div>
    </div>
  );
}

export default CompareControls;
