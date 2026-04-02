import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { interpolateSpectral } from 'd3-scale-chromatic';

import Scatter from '../components/Scatter';
import AnnotationPlot from '../components/AnnotationPlot';
import OverlapHeatmap from '../components/OverlapHeatmap';
import IndexDataTable from '../components/IndexDataTable';

import { apiService, apiUrl } from '../lib/apiService';

import styles from './CompareClusters.module.css';

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

function CompareClusters() {
  const { dataset: datasetId } = useParams();
  const [dataset, setDataset] = useState(null);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);

  // Selections
  const [selectedUmap, setSelectedUmap] = useState(null);
  const [leftCluster, setLeftCluster] = useState(null);
  const [rightCluster, setRightCluster] = useState(null);

  // UMAP points
  const [umapPoints, setUmapPoints] = useState([]);

  // Cluster assignments
  const [leftLabels, setLeftLabels] = useState([]);
  const [rightLabels, setRightLabels] = useState([]);

  // Comparison results
  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  // View state
  const [bottomTab, setBottomTab] = useState('overlap');
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [showChangedOnly, setShowChangedOnly] = useState(false);

  // Scatter state
  const [leftScatter, setLeftScatter] = useState(null);
  const [rightScatter, setRightScatter] = useState(null);
  const [leftXDomain, setLeftXDomain] = useState([-1, 1]);
  const [leftYDomain, setLeftYDomain] = useState([-1, 1]);
  const [rightXDomain, setRightXDomain] = useState([-1, 1]);
  const [rightYDomain, setRightYDomain] = useState([-1, 1]);

  // Layout
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState([500, 400]);

  useEffect(() => {
    function updateSize() {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      setContainerSize([width, height]);
    }
    window.addEventListener('resize', updateSize);
    updateSize();
    setTimeout(updateSize, 200);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // ===== Data Loading =====

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then((r) => r.json())
      .then(setDataset);
  }, [datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    Promise.all([
      apiService.fetchUmaps(datasetId),
      apiService.fetchClusters(datasetId),
    ]).then(([umapData, clusterData]) => {
      setUmaps(umapData);
      setClusters(clusterData);
    });
  }, [datasetId]);

  // Auto-select first UMAP that has clusters
  useEffect(() => {
    if (!umaps.length || !clusters.length) return;
    const umapsWithClusters = umaps.filter((u) =>
      clusters.some((c) => c.umap_id === u.id)
    );
    if (umapsWithClusters.length && !selectedUmap) {
      setSelectedUmap(umapsWithClusters[0]);
    }
  }, [umaps, clusters, selectedUmap]);

  // Filter clusters to selected UMAP
  const filteredClusters = useMemo(() => {
    if (!selectedUmap) return [];
    return clusters.filter((c) => c.umap_id === selectedUmap.id);
  }, [clusters, selectedUmap]);

  // Auto-select first two clusters
  useEffect(() => {
    if (filteredClusters.length >= 2) {
      setLeftCluster(filteredClusters[0]);
      setRightCluster(filteredClusters[1]);
    } else if (filteredClusters.length === 1) {
      setLeftCluster(filteredClusters[0]);
      setRightCluster(null);
    }
  }, [filteredClusters]);

  // Load UMAP points
  useEffect(() => {
    if (!selectedUmap || !datasetId) return;
    fetch(`${apiUrl}/datasets/${datasetId}/umaps/${selectedUmap.id}/points`)
      .then((r) => r.json())
      .then((pts) => setUmapPoints(pts.map((d) => [d.x, d.y])));
  }, [datasetId, selectedUmap]);

  // Load cluster assignments
  useEffect(() => {
    if (!leftCluster || !datasetId) return;
    apiService.fetchClusterIndices(datasetId, leftCluster.id).then((data) => {
      setLeftLabels(data.map((d) => d.cluster));
    });
  }, [datasetId, leftCluster]);

  useEffect(() => {
    if (!rightCluster || !datasetId) return;
    apiService.fetchClusterIndices(datasetId, rightCluster.id).then((data) => {
      setRightLabels(data.map((d) => d.cluster));
    });
  }, [datasetId, rightCluster]);

  // Run comparison
  useEffect(() => {
    if (!leftCluster || !rightCluster || leftCluster.id === rightCluster.id) {
      setComparison(null);
      return;
    }
    setComparisonLoading(true);
    apiService
      .compareClusters(datasetId, leftCluster.id, rightCluster.id)
      .then((data) => {
        setComparison(data);
        setComparisonLoading(false);
      });
  }, [datasetId, leftCluster, rightCluster]);

  // ===== Build scatter points =====

  const leftDrawPoints = useMemo(() => {
    if (!umapPoints.length || !leftLabels.length) return [];
    return umapPoints.map((p, i) => [p[0], p[1], leftLabels[i] || 0]);
  }, [umapPoints, leftLabels]);

  const rightDrawPoints = useMemo(() => {
    if (!umapPoints.length || !rightLabels.length) return [];
    return umapPoints.map((p, i) => [p[0], p[1], rightLabels[i] || 0]);
  }, [umapPoints, rightLabels]);

  // Diff points: green = stable, red = changed
  const diffDrawPoints = useMemo(() => {
    if (!umapPoints.length || !comparison) return [];
    const changedSet = new Set(comparison.changed_indices);
    return umapPoints.map((p, i) => [p[0], p[1], changedSet.has(i) ? 1 : 0]);
  }, [umapPoints, comparison]);

  // ===== Interaction Handlers =====

  const handleHover = useCallback((index) => {
    setHoveredIndex(index);
  }, []);

  const handleSelect = useCallback((indices) => {
    setSelectedIndices(indices);
  }, []);

  const handleCellClick = useCallback(
    (leftClusterId, rightClusterId, count) => {
      if (!leftLabels.length || !rightLabels.length) return;
      // Find indices that are in this cell
      const indices = [];
      for (let i = 0; i < leftLabels.length; i++) {
        if (leftLabels[i] === leftClusterId && rightLabels[i] === rightClusterId) {
          indices.push(i);
        }
      }
      setSelectedIndices(indices);
      setBottomTab('points');
      // Zoom to those points
      if (leftScatter && indices.length) {
        leftScatter.zoomToPoints(indices, {
          transition: true,
          padding: 0.2,
          transitionDuration: 1500,
        });
      }
      if (rightScatter && indices.length) {
        rightScatter.zoomToPoints(indices, {
          transition: true,
          padding: 0.2,
          transitionDuration: 1500,
        });
      }
    },
    [leftLabels, rightLabels, leftScatter, rightScatter]
  );

  const handleClicked = useCallback(
    (index) => {
      leftScatter?.zoomToPoints([index], {
        transition: true,
        padding: 0.9,
        transitionDuration: 1500,
      });
      rightScatter?.zoomToPoints([index], {
        transition: true,
        padding: 0.9,
        transitionDuration: 1500,
      });
    },
    [leftScatter, rightScatter]
  );

  // Hover annotations for both scatters
  const hoverAnnotations =
    hoveredIndex != null && umapPoints[hoveredIndex]
      ? [umapPoints[hoveredIndex]]
      : [];

  const halfWidth = Math.floor((containerSize[0] - 12) / 2);
  const scatterHeight = containerSize[1];

  // Determine which points to show for the diff scatter
  const activeLeftPoints = showChangedOnly ? diffDrawPoints : leftDrawPoints;
  const activeRightPoints = showChangedOnly ? diffDrawPoints : rightDrawPoints;

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className={styles['container']}>
      {/* Controls */}
      <div className={styles['controls']}>
        <div className={styles['controls-header']}>
          <b>{datasetId}</b>
          <span>{dataset?.length} rows</span>
        </div>
        <div className={styles['selectors']}>
          <div className={styles['selector']}>
            <label>UMAP</label>
            <select
              value={selectedUmap?.id || ''}
              onChange={(e) => setSelectedUmap(umaps.find((u) => u.id === e.target.value))}
            >
              {umaps
                .filter((u) => clusters.some((c) => c.umap_id === u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id} - {u.embedding_id}
                  </option>
                ))}
            </select>
          </div>
          <div className={styles['selector']}>
            <label>Left Cluster</label>
            <select
              value={leftCluster?.id || ''}
              onChange={(e) =>
                setLeftCluster(filteredClusters.find((c) => c.id === e.target.value))
              }
            >
              {filteredClusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} ({c.method || 'hdbscan'}) - {c.n_clusters} clusters
                </option>
              ))}
            </select>
          </div>
          <div className={styles['selector']}>
            <label>Right Cluster</label>
            <select
              value={rightCluster?.id || ''}
              onChange={(e) =>
                setRightCluster(filteredClusters.find((c) => c.id === e.target.value))
              }
            >
              {filteredClusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} ({c.method || 'hdbscan'}) - {c.n_clusters} clusters
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Metrics */}
        {comparison && (
          <div className={styles['metrics']}>
            <div className={styles['metric-card']}>
              <span className={styles['metric-label']}>ARI</span>
              <span className={styles['metric-value']}>{comparison.ari}</span>
            </div>
            <div className={styles['metric-card']}>
              <span className={styles['metric-label']}>NMI</span>
              <span className={styles['metric-value']}>{comparison.nmi}</span>
            </div>
            <div className={styles['metric-card']}>
              <span className={styles['metric-label']}>Changed</span>
              <span className={styles['metric-value']}>
                {comparison.n_changed} / {comparison.n_total}
              </span>
            </div>
            <label className={styles['diff-toggle']}>
              <input
                type="checkbox"
                checked={showChangedOnly}
                onChange={(e) => setShowChangedOnly(e.target.checked)}
              />
              Show diff
            </label>
          </div>
        )}
        {comparisonLoading && <span className={styles['loading']}>Computing comparison...</span>}
      </div>

      {/* Side-by-side scatters */}
      <div ref={containerRef} className={styles['scatter-area']}>
        {activeLeftPoints.length > 0 && (
          <div className={styles['scatter-panel']}>
            <div className={styles['scatter-label']}>
              {leftCluster?.id} ({leftCluster?.method || 'hdbscan'})
            </div>
            <div className={styles['scatter-container']} style={{ width: halfWidth, height: scatterHeight }}>
              <div className={styles['scatter']}>
                {!isIOS() ? (
                  <Scatter
                    points={activeLeftPoints}
                    duration={0}
                    pointScale={1}
                    width={halfWidth}
                    height={scatterHeight}
                    colorScaleType="categorical"
                    colorInterpolator={interpolateSpectral}
                    onScatter={setLeftScatter}
                    onView={(xd, yd) => {
                      setLeftXDomain(xd);
                      setLeftYDomain(yd);
                    }}
                    onSelect={handleSelect}
                    onHover={handleHover}
                  />
                ) : (
                  <AnnotationPlot
                    points={umapPoints}
                    fill="gray"
                    size="8"
                    xDomain={leftXDomain}
                    yDomain={leftYDomain}
                    width={halfWidth}
                    height={scatterHeight}
                  />
                )}
              </div>
              <AnnotationPlot
                points={hoverAnnotations}
                stroke="black"
                fill="orange"
                size="16"
                xDomain={leftXDomain}
                yDomain={leftYDomain}
                width={halfWidth}
                height={scatterHeight}
              />
            </div>
          </div>
        )}
        {activeRightPoints.length > 0 && (
          <div className={styles['scatter-panel']}>
            <div className={styles['scatter-label']}>
              {rightCluster?.id} ({rightCluster?.method || 'hdbscan'})
            </div>
            <div className={styles['scatter-container']} style={{ width: halfWidth, height: scatterHeight }}>
              <div className={styles['scatter']}>
                {!isIOS() ? (
                  <Scatter
                    points={activeRightPoints}
                    duration={0}
                    pointScale={1}
                    width={halfWidth}
                    height={scatterHeight}
                    colorScaleType="categorical"
                    colorInterpolator={interpolateSpectral}
                    onScatter={setRightScatter}
                    onView={(xd, yd) => {
                      setRightXDomain(xd);
                      setRightYDomain(yd);
                    }}
                    onSelect={handleSelect}
                    onHover={handleHover}
                  />
                ) : (
                  <AnnotationPlot
                    points={umapPoints}
                    fill="gray"
                    size="8"
                    xDomain={rightXDomain}
                    yDomain={rightYDomain}
                    width={halfWidth}
                    height={scatterHeight}
                  />
                )}
              </div>
              <AnnotationPlot
                points={hoverAnnotations}
                stroke="black"
                fill="orange"
                size="16"
                xDomain={rightXDomain}
                yDomain={rightYDomain}
                width={halfWidth}
                height={scatterHeight}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className={styles['bottom-panel']}>
        <div className={styles['tab-header']}>
          <button
            onClick={() => setBottomTab('overlap')}
            className={bottomTab === 'overlap' ? styles['tab-active'] : styles['tab-inactive']}
          >
            Overlap Matrix
          </button>
          <button
            onClick={() => setBottomTab('points')}
            className={bottomTab === 'points' ? styles['tab-active'] : styles['tab-inactive']}
          >
            Points {selectedIndices.length > 0 && `(${selectedIndices.length})`}
          </button>
        </div>

        <div className={styles['tab-content']}>
          {bottomTab === 'overlap' && comparison && (
            <div className={styles['overlap-container']}>
              <div className={styles['overlap-labels']}>
                <span>← {leftCluster?.id} clusters (rows)</span>
                <span>{rightCluster?.id} clusters (columns) →</span>
              </div>
              <OverlapHeatmap
                matrix={comparison.overlap_matrix}
                leftLabels={comparison.left_clusters.map(String)}
                rightLabels={comparison.right_clusters.map(String)}
                width={Math.min(
                  600,
                  Math.max(200, comparison.right_clusters.length * 20 + 60)
                )}
                height={Math.min(
                  500,
                  Math.max(200, comparison.left_clusters.length * 20 + 50)
                )}
                onCellClick={handleCellClick}
              />
            </div>
          )}

          {bottomTab === 'points' && (
            <div className={styles['points-content']}>
              {comparison && (
                <div className={styles['points-summary']}>
                  <span>
                    {selectedIndices.length > 0
                      ? `Showing ${selectedIndices.length} selected points`
                      : `${comparison.n_changed} points changed clusters (${((comparison.n_changed / comparison.n_total) * 100).toFixed(1)}%)`}
                  </span>
                  {selectedIndices.length > 0 && (
                    <button
                      className={styles['clear-button']}
                      onClick={() => {
                        setSelectedIndices([]);
                        leftScatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 });
                        rightScatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 });
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
              {selectedIndices.length > 0 && (
                <IndexDataTable
                  indices={selectedIndices.slice(0, 150)}
                  dataset={dataset}
                  maxRows={150}
                  onHover={handleHover}
                  onClick={handleClicked}
                />
              )}
              {selectedIndices.length === 0 && comparison && comparison.changed_indices.length > 0 && (
                <IndexDataTable
                  indices={comparison.changed_indices.slice(0, 150)}
                  dataset={dataset}
                  maxRows={150}
                  onHover={handleHover}
                  onClick={handleClicked}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CompareClusters;
