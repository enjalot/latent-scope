import { useState } from 'react';
import { Button, Icon } from 'react-element-forge';
import { Tooltip } from 'react-tooltip';
import { Badge, Readout } from '../ui';
import styles from './EstimatePanel.module.scss';

/**
 * EstimatePanel - shows compute/storage estimates for a pipeline step.
 *
 * Props:
 *   estimate: object with estimation data (from API), or null
 *   onEstimate: callback to trigger formula-based estimate
 *   onBenchmark: callback to trigger benchmark on sample data (optional)
 *   benchmarkResult: object with benchmark results, or null
 *   loading: boolean - whether an estimate/benchmark is in progress
 *   step: string - which pipeline step this is for ("embed", "umap", "cluster")
 */
function EstimatePanel({ estimate, onEstimate, onBenchmark, benchmarkResult, loading }) {
  const [showDetails, setShowDetails] = useState(false);

  if (!onEstimate) return null;

  const hasEstimate = estimate && !estimate.error;
  const hasBenchmark = benchmarkResult && !benchmarkResult.error;

  return (
    <div className={styles.estimatePanel}>
      <div className={styles.estimateHeader}>
        <div className={styles.estimateActions}>
          <Button
            color="secondary"
            onClick={onEstimate}
            disabled={loading}
            text={loading ? 'Estimating...' : 'Estimate'}
          />
          {onBenchmark && (
            <>
              <Button
                color="secondary"
                onClick={onBenchmark}
                disabled={loading}
                text={loading ? 'Running...' : 'Benchmark'}
              />
              <span className="tooltip" data-tooltip-id="benchmark-tip">
                <Icon name="help-circle" size={14} />
              </span>
              <Tooltip className="tooltip-area" id="benchmark-tip" place="top" effect="solid">
                Runs on a small sample to give accurate time and storage estimates.
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {hasEstimate && (
        <div className={styles.estimateResults}>
          <div className={styles.estimateSummary}>
            <Readout
              label="Time"
              value={`~${estimate.estimated_time_human || estimate.estimated_total_time_human}`}
            />
            <Readout
              label="Storage"
              value={estimate.storage?.total_human || estimate.output_human || 'N/A'}
            />
            <Readout label="Rows" value={estimate.num_rows?.toLocaleString()} />
            {estimate.is_late_interaction && (
              <Badge mono variant="info">
                Late Interaction
              </Badge>
            )}
          </div>

          {estimate.note && <div className={styles.estimateNote}>{estimate.note}</div>}

          <button
            type="button"
            className={styles.detailsToggle}
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>

          {showDetails && (
            <div className={styles.estimateDetails}>
              {estimate.dimensions && <div>Dimensions: {estimate.dimensions}</div>}
              {estimate.avg_text_length > 0 && (
                <div>Avg text length: {estimate.avg_text_length} chars</div>
              )}
              {estimate.avg_tokens_per_doc > 0 && (
                <div>Avg tokens/doc: {estimate.avg_tokens_per_doc}</div>
              )}
              {estimate.storage?.mean_vector_bytes > 0 && (
                <div>Mean vectors: {formatBytes(estimate.storage.mean_vector_bytes)}</div>
              )}
              {estimate.storage?.token_vector_bytes > 0 && (
                <div>Token vectors: {formatBytes(estimate.storage.token_vector_bytes)}</div>
              )}
              {estimate.neighbors && <div>Neighbors: {estimate.neighbors}</div>}
            </div>
          )}
        </div>
      )}

      {hasBenchmark && (
        <div className={styles.benchmarkResults}>
          <div className="ls-overline">Benchmark Results</div>
          <div className={styles.estimateSummary}>
            <Readout label="Time/item" value={`${benchmarkResult.time_per_item?.toFixed(3)}s`} />
            <Readout
              label="Total (projected)"
              value={benchmarkResult.estimated_total_time_human}
            />
            <Readout label="Storage" value={benchmarkResult.storage?.total_human || 'N/A'} />
          </div>
          <div className={styles.estimateNote}>
            Based on {benchmarkResult.sample_size} samples (
            {benchmarkResult.sample_total_time?.toFixed(2)}s total)
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

export default EstimatePanel;
