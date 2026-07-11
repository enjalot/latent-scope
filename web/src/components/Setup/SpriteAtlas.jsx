// SpriteAtlas.jsx — optional post-scope step (image datasets only).
// Generates a tiled representative-image atlas pyramid keyed to the heatmap
// grid. The page plans the pyramid first: it renders the scope's heatmap and
// overlays the tile grid for each resolution, showing how many cells/tiles would
// be populated so you can choose how high the resolution goes.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'react-element-forge';
import { useStartJobPolling } from '../Job/Run';
import JobProgress from '../Job/Progress';
import { apiService, apiUrl } from '../../lib/apiService';
import { fetchAtlasStatus, fetchAtlasPlan } from '../../lib/atlasUrl';
import { useSetup } from '../../contexts/SetupContext';
import AtlasPlanPreview from './AtlasPlanPreview';

import styles from './SpriteAtlas.module.scss';

const ALL_RESOLUTIONS = [64, 128, 256, 512, 1024];
const CELL_SIZES = [32, 64];

function resolutionsUpTo(maxRes) {
  return ALL_RESOLUTIONS.filter((r) => r <= maxRes);
}

function pct(n, d) {
  return d ? Math.round((100 * n) / d) : 0;
}

function formatBytes(b) {
  if (!b || b <= 0) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function SpriteAtlas() {
  const { dataset, scope, setPreviewLabel } = useSetup();

  const imageColumn = useMemo(() => {
    const cm = dataset?.column_metadata || {};
    return Object.keys(cm).find((c) => cm[c]?.type === 'image');
  }, [dataset]);

  const [cellSize, setCellSize] = useState(32);
  const [maxRes, setMaxRes] = useState(256);
  const [samples, setSamples] = useState(1);
  const [selectedRes, setSelectedRes] = useState(256);
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [status, setStatus] = useState({ generated: false });
  const [atlasJob, setAtlasJob] = useState(null);

  const resolutions = useMemo(() => resolutionsUpTo(maxRes), [maxRes]);

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

  // Plan the pyramid (no generation) whenever the inputs change.
  useEffect(() => {
    if (!dataset?.id || !scope?.id || !imageColumn) return;
    let cancelled = false;
    setPlanLoading(true);
    fetchAtlasPlan(dataset.id, scope.id, imageColumn, resolutions, cellSize)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch(() => {
        if (!cancelled) setPlan(null);
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataset?.id, scope?.id, imageColumn, resolutions, cellSize]);

  // Keep the previewed resolution within the chosen set.
  useEffect(() => {
    if (!resolutions.includes(selectedRes)) setSelectedRes(maxRes);
  }, [resolutions, selectedRes, maxRes]);

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
      resolutions: resolutions.join(','),
    });
  }, [scope?.id, imageColumn, cellSize, samples, resolutions, startAtlasJob]);

  if (!imageColumn) {
    return (
      <div className={styles['atlas-empty']}>
        <p>This dataset has no image column, so there is nothing to render as sprites.</p>
      </div>
    );
  }
  if (!scope?.id) {
    return (
      <div className={styles['atlas-empty']}>
        <h3>Image sprites</h3>
        <p>Save a scope first (step 5) — sprite sheets are generated per scope.</p>
      </div>
    );
  }

  const jobRunning = atlasJob && !['completed', 'error', 'dead'].includes(atlasJob.status);

  return (
    <div className={styles.atlas}>
      <div className={styles['atlas-setup']}>
        <h3>Image sprites for {scope.id}</h3>
        <p className={styles.help}>
          Builds a tiled image pyramid from column <code>{imageColumn}</code>: one representative
          image per heatmap cell. Higher resolutions split into 2048px tiles (empty tiles are
          skipped). In Explore, turn on <em>Show Images</em> and zoom in.
        </p>

        <div className={styles.controls}>
          <label>
            <span>Max resolution</span>
            <select className="ls-select" value={maxRes} onChange={(e) => setMaxRes(+e.target.value)}>
              {ALL_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}×{r}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Cell size</span>
            <select className="ls-select" value={cellSize} onChange={(e) => setCellSize(+e.target.value)}>
              {CELL_SIZES.map((c) => (
                <option key={c} value={c}>
                  {c}px
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sheets / cell</span>
            <input
              type="number"
              min="1"
              max="16"
              value={samples}
              onChange={(e) => setSamples(Math.max(1, Math.min(16, +e.target.value || 1)))}
            />
          </label>
        </div>

        <div className={styles.planRow}>
          <div className={styles.previewCol}>
            <AtlasPlanPreview plan={plan} selectedRes={selectedRes} size={320} />
            <div className={styles.previewCaption}>
              Heatmap density · grid = {selectedRes}×{selectedRes} tiles
              {planLoading ? ' · updating…' : ''}
            </div>
          </div>

          <table className={styles.stats}>
            <thead>
              <tr>
                <th>Grid</th>
                <th>Tiles</th>
                <th>Populated cells</th>
                <th>Populated tiles</th>
                <th>Est. size</th>
              </tr>
            </thead>
            <tbody>
              {(plan?.resolutions || []).map((e) => (
                <tr
                  key={e.num_tiles}
                  className={e.num_tiles === selectedRes ? styles.selected : ''}
                  onClick={() => setSelectedRes(e.num_tiles)}
                >
                  <td>
                    {e.num_tiles}×{e.num_tiles}
                  </td>
                  <td>
                    {e.tiles_per_axis}×{e.tiles_per_axis}
                  </td>
                  <td>
                    {e.populated_cells.toLocaleString()}{' '}
                    <span className={styles.muted}>({pct(e.populated_cells, e.total_cells)}%)</span>
                  </td>
                  <td>
                    {e.populated_tiles} / {e.total_tiles}{' '}
                    <span className={styles.muted}>({pct(e.populated_tiles, e.total_tiles)}%)</span>
                  </td>
                  <td>{formatBytes(e.populated_cells * (plan.bytes_per_cell || 0) * samples)}</td>
                </tr>
              ))}
            </tbody>
            {plan?.bytes_per_cell ? (
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={4}>Total{samples > 1 ? ` (×${samples} sheets)` : ''}</td>
                  <td>
                    {formatBytes(
                      (plan.resolutions || []).reduce((s, e) => s + e.populated_cells, 0) *
                        plan.bytes_per_cell *
                        samples
                    )}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        {plan && (
          <p className={styles.totals}>
            {plan.total_points.toLocaleString()} points · click a row to preview its tiling. Sizes
            are estimated from a sample of your images.
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

        <JobProgress
          job={atlasJob}
          clearJob={() => setAtlasJob(null)}
          killJob={(job) =>
            apiService.killJob(dataset.id, job.id).then(setAtlasJob).catch(console.error)
          }
        />

        {status.generated && (
          <div className={styles.summary}>
            <h4>Generated</h4>
            <ul>
              {(status.resolutions || []).map((entry) => (
                <li key={entry.num_tiles}>
                  {entry.num_tiles}×{entry.num_tiles}: {entry.filled_cells.toLocaleString()} cells
                  in {(entry.tiles || []).length} tile{(entry.tiles || []).length === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={styles['atlas-preview']}>
        <div className={styles.preview}>
          <div className={styles['scope-actions']}>
            <div
              className={
                'ls-panel ' + styles['action-card'] + ' ' + styles['action-card-explore']
              }
            >
              <h3>
                <Link
                  to={`/datasets/${dataset?.id}/explore/${scope?.id}`}
                  className={styles['action-link']}
                >
                  Explore {scope.label} ({scope.id})
                </Link>
              </h3>
              <p>
                {status.generated
                  ? 'Explore, filter and search your data in an interactive visualization interface.'
                  : 'You can explore now — images appear on the map once sprite sheets are generated.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpriteAtlas;
