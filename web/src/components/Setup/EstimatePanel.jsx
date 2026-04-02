import { useState, useCallback } from 'react';
import { Button } from 'react-element-forge';
import { Tooltip } from 'react-tooltip';
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
function EstimatePanel({ estimate, onEstimate, onBenchmark, benchmarkResult, loading, step }) {
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
                🤔
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
            <div className={styles.estimateItem}>
              <span className={styles.estimateLabel}>Time</span>
              <span className={styles.estimateValue}>
                ~{estimate.estimated_time_human || estimate.estimated_total_time_human}
              </span>
            </div>
            <div className={styles.estimateItem}>
              <span className={styles.estimateLabel}>Storage</span>
              <span className={styles.estimateValue}>
                {estimate.storage?.total_human || estimate.output_human || 'N/A'}
              </span>
            </div>
            <div className={styles.estimateItem}>
              <span className={styles.estimateLabel}>Rows</span>
              <span className={styles.estimateValue}>
                {estimate.num_rows?.toLocaleString()}
              </span>
            </div>
            {estimate.is_late_interaction && (
              <div className={styles.estimateItem}>
                <span className={styles.lateInteractionBadge}>Late Interaction</span>
              </div>
            )}
          </div>

          {estimate.note && (
            <div className={styles.estimateNote}>{estimate.note}</div>
          )}

          <button
            className={styles.detailsToggle}
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>

          {showDetails && (
            <div className={styles.estimateDetails}>
              {estimate.dimensions && (
                <div>Dimensions: {estimate.dimensions}</div>
              )}
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
              {estimate.neighbors && (
                <div>Neighbors: {estimate.neighbors}</div>
              )}
            </div>
          )}
        </div>
      )}

      {hasBenchmark && (
        <div className={styles.benchmarkResults}>
          <div className={styles.benchmarkHeader}>Benchmark Results</div>
          <div className={styles.estimateSummary}>
            <div className={styles.estimateItem}>
              <span className={styles.estimateLabel}>Time/item</span>
              <span className={styles.estimateValue}>
                {benchmarkResult.time_per_item?.toFixed(3)}s
              </span>
            </div>
            <div className={styles.estimateItem}>
              <span className={styles.estimateLabel}>Total (projected)</span>
              <span className={styles.estimateValue}>
                {benchmarkResult.estimated_total_time_human}
              </span>
            </div>
            <div className={styles.estimateItem}>
              <span className={styles.estimateLabel}>Storage</span>
              <span className={styles.estimateValue}>
                {benchmarkResult.storage?.total_human || 'N/A'}
              </span>
            </div>
          </div>
          <div className={styles.estimateNote}>
            Based on {benchmarkResult.sample_size} samples
            ({benchmarkResult.sample_total_time?.toFixed(2)}s total)
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
