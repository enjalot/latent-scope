// SpriteAtlas.jsx — optional post-scope step (image datasets only).
// Generates representative-image "sprite sheet" atlases keyed to the heatmap
// grid: one image sampled per cell, per resolution. The Explore view stretches
// these over the map to replace the dots when you zoom in.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'react-element-forge';
import { useStartJobPolling } from '../Job/Run';
import JobProgress from '../Job/Progress';
import { apiUrl } from '../../lib/apiService';
import { fetchAtlasStatus } from '../../lib/atlasUrl';
import { useSetup } from '../../contexts/SetupContext';

import styles from './SpriteAtlas.module.scss';

const RESOLUTIONS = [64, 128]; // grids the scope step computes (tile_index_64/128)
const CELL_SIZES = [32, 64];

function decodedMB(px) {
  return (px * px * 4) / (1024 * 1024);
}

function SpriteAtlas() {
  const { dataset, scope, setPreviewLabel } = useSetup();

  const imageColumn = useMemo(() => {
    const cm = dataset?.column_metadata || {};
    return Object.keys(cm).find((c) => cm[c]?.type === 'image');
  }, [dataset]);

  const [cellSize, setCellSize] = useState(32);
  const [samples, setSamples] = useState(1);
  const [status, setStatus] = useState({ generated: false });
  const [atlasJob, setAtlasJob] = useState(null);

  const { startJob: startAtlasJob } = useStartJobPolling(
    dataset,
    setAtlasJob,
    `${apiUrl}/jobs/sprite-atlas`
  );

  useEffect(() => {
    if (scope?.id) setPreviewLabel(scope.id);
  }, [scope, setPreviewLabel]);

  const refreshStatus = useCallback(() => {
    if (!dataset?.id || !scope?.id || !imageColumn) return;
    fetchAtlasStatus(dataset.id, scope.id, imageColumn)
      .then(setStatus)
      .catch(() => setStatus({ generated: false }));
  }, [dataset?.id, scope?.id, imageColumn]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Pre-fill the controls from an existing atlas so "Regenerate" is honest.
  useEffect(() => {
    if (status.generated) {
      if (status.cell_size) setCellSize(status.cell_size);
      if (status.samples) setSamples(status.samples);
    }
  }, [status.generated]);

  useEffect(() => {
    if (atlasJob?.status === 'completed') refreshStatus();
  }, [atlasJob?.status, refreshStatus]);

  const handleGenerate = useCallback(() => {
    if (!scope?.id || !imageColumn) return;
    startAtlasJob({
      scope_id: scope.id,
      image_column: imageColumn,
      cell_size: cellSize,
      samples,
      resolutions: RESOLUTIONS.join(','),
    });
  }, [scope?.id, imageColumn, cellSize, samples, startAtlasJob]);

  if (!imageColumn) {
    return (
      <div className={styles.atlas}>
        <p>This dataset has no image column, so there is nothing to render as sprites.</p>
      </div>
    );
  }

  if (!scope?.id) {
    return (
      <div className={styles.atlas}>
        <h3>Image sprites</h3>
        <p>Save a scope first (step 5) — sprite sheets are generated per scope.</p>
      </div>
    );
  }

  const jobRunning = atlasJob && !['completed', 'error', 'dead'].includes(atlasJob.status);

  return (
    <div className={styles.atlas}>
      <h3>Image sprites for {scope.id}</h3>
      <p className={styles.help}>
        Generates one WebP “sprite sheet” per heatmap resolution, sampling a representative image
        from column <code>{imageColumn}</code> into each grid cell. In Explore, turn on{' '}
        <em>Show Images</em> and zoom in to see them replace the dots.
      </p>

      <div className={styles.controls}>
        <label>
          <span>Cell size</span>
          <select value={cellSize} onChange={(e) => setCellSize(+e.target.value)}>
            {CELL_SIZES.map((c) => (
              <option key={c} value={c}>
                {c}px
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Sheets (images per cell)</span>
          <input
            type="number"
            min="1"
            max="16"
            value={samples}
            onChange={(e) => setSamples(Math.max(1, Math.min(16, +e.target.value || 1)))}
          />
        </label>
      </div>

      <table className={styles.sizes}>
        <thead>
          <tr>
            <th>Resolution</th>
            <th>Sheet size</th>
            <th>Decoded</th>
            <th>× sheets</th>
          </tr>
        </thead>
        <tbody>
          {RESOLUTIONS.map((r) => {
            const px = r * cellSize;
            return (
              <tr key={r} className={px > 4096 ? styles.warn : ''}>
                <td>
                  {r}×{r}
                </td>
                <td>
                  {px}×{px}px
                </td>
                <td>~{decodedMB(px).toFixed(0)} MB</td>
                <td>×{samples}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {RESOLUTIONS.some((r) => r * cellSize > 4096) && (
        <p className={styles.warnText}>
          64px cells make the 128×128 sheet 8192px (~256 MB decoded) — heavy for some browsers. 32px
          is recommended.
        </p>
      )}

      <div className={styles.actions}>
        <Button
          onClick={handleGenerate}
          disabled={jobRunning}
          text={
            jobRunning
              ? 'Generating…'
              : status.generated
                ? 'Regenerate sprite sheets'
                : 'Generate sprite sheets'
          }
        />
      </div>

      <JobProgress job={atlasJob} clearJob={() => setAtlasJob(null)} />

      {status.generated && (
        <div className={styles.summary}>
          <h4>Generated</h4>
          <ul>
            {(status.resolutions || []).map((entry) => (
              <li key={entry.num_tiles}>
                {entry.num_tiles}×{entry.num_tiles}: {entry.filled_cells} cells filled (
                {entry.atlas_px}px, {status.samples} sheet{status.samples > 1 ? 's' : ''})
              </li>
            ))}
          </ul>
          <Link to={`/datasets/${dataset.id}/explore/${scope.id}`} className={styles.exploreLink}>
            Explore {scope.id} →
          </Link>
        </div>
      )}
    </div>
  );
}

export default SpriteAtlas;
