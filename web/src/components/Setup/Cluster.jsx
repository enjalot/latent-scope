// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'react-tooltip';
import { Button } from 'react-element-forge';

import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
import { useSetup } from '../../contexts/SetupContext';
import { apiService, apiUrl } from '../../lib/apiService';
import EstimatePanel from './EstimatePanel';
import ExperimentGallery from './ExperimentGallery';

import Preview from './Preview';

import styles from './Cluster.module.scss';

// Per-method default input space (matches the CLI/server defaults).
const DEFAULT_CLUSTER_ON = {
  evoc: 'embedding',
  hdbscan: 'umap',
  kmeans: 'umap',
  gmm: 'umap',
};

const METHOD_LABELS = {
  evoc: 'EVoC',
  hdbscan: 'HDBSCAN',
  kmeans: 'KMeans',
  gmm: 'GMM',
};

// kmeans/gmm ask for a target number of clusters (the `samples` positional
// maps to n_clusters); evoc/hdbscan use the same positional as min cluster size.
const isCentroidMethod = (method) => method === 'kmeans' || method === 'gmm';

// This component is responsible for the embeddings state
// New embeddings update the list
function Cluster() {
  const { dataset, scope, savedScope, updateScope, goToNextStep, setPreviewLabel } = useSetup();

  const [clusterJob, setClusterJob] = useState(null);
  const { startJob: startClusterJob } = useStartJobPolling(
    dataset,
    setClusterJob,
    `${apiUrl}/jobs/cluster`
  );
  const { startJob: deleteClusterJob } = useStartJobPolling(
    dataset,
    setClusterJob,
    `${apiUrl}/jobs/delete/cluster`
  );

  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);

  const [embedding, setEmbedding] = useState(null);
  const [umap, setUmap] = useState(null);
  const [cluster, setCluster] = useState(null);
  const [method, setMethod] = useState('evoc');
  const [clusterOn, setClusterOn] = useState(DEFAULT_CLUSTER_ON['evoc']);
  const [qualityMetrics, setQualityMetrics] = useState({});

  // When the method changes, reset the input-space choice to that method's
  // default (evoc->embedding, hdbscan/kmeans/gmm->umap).
  const handleMethodChange = useCallback((e) => {
    const m = e.target.value;
    setMethod(m);
    setClusterOn(DEFAULT_CLUSTER_ON[m] || 'umap');
  }, []);

  useEffect(() => {
    setPreviewLabel(cluster?.id);
  }, [cluster, setPreviewLabel]);

  // Update local state when scope changes
  useEffect(() => {
    if (scope?.embedding_id) {
      const emb = embeddings.find((e) => e.id == scope.embedding_id);
      setEmbedding(emb);
    } else {
      setEmbedding(embeddings?.[0]);
    }
    if (scope?.umap_id) {
      const um = umaps.find((u) => u.id == scope.umap_id);
      setUmap(um);
    }
    // Re-derive the selected cluster without stomping a still-valid selection:
    // this effect also re-runs when the clusters list refetches (create/delete),
    // and the scope draft can reference a cluster that no longer exists.
    const targetUmapId = scope?.umap_id || umap?.id;
    const scopeCluster = scope?.cluster_id
      ? clusters?.find((c) => c.id == scope.cluster_id)
      : null;
    if (scopeCluster) {
      setCluster(scopeCluster);
    } else if (clusters) {
      setCluster((prev) =>
        prev && prev.umap_id == targetUmapId && clusters.some((c) => c.id == prev.id)
          ? prev
          : clusters.filter((c) => c.umap_id == targetUmapId)[0]
      );
    }
  }, [scope, clusters, umaps, embeddings, umap]);

  // Fetch initial data
  useEffect(() => {
    if (dataset) {
      apiService.fetchEmbeddings(dataset?.id).then((embs) => setEmbeddings(embs));
      apiService.fetchUmaps(dataset?.id).then((ums) => setUmaps(ums));
      apiService.fetchClusters(dataset?.id).then((cls) => setClusters(cls));
    }
  }, [dataset]);

  // Fetch quality metrics for clusters on current UMAP
  useEffect(() => {
    if (!dataset || !clusters?.length || !umap) return;
    const umapClusters = clusters.filter((c) => c.umap_id === umap.id);
    umapClusters.forEach((cl) => {
      if (!qualityMetrics[cl.id]) {
        apiService.fetchClusterQuality(dataset.id, cl.id).then((metrics) => {
          setQualityMetrics((prev) => ({ ...prev, [cl.id]: metrics }));
        });
      }
    });
  }, [dataset, clusters, umap]);

  // Update clusters after job completion
  useEffect(() => {
    if (clusterJob?.status == 'completed') {
      apiService.fetchClusters(dataset.id).then((clstrs) => {
        let cls;
        if (clusterJob.job_name == 'cluster') {
          cls = clstrs.find((d) => d.id == clusterJob.run_id);
        } else if (clusterJob.job_name == 'rm') {
          // fall back to a cluster on the umap being previewed, not just any
          cls = clstrs.filter((c) => c.umap_id == umap?.id)[0];
        }
        setCluster(cls);
        setClusters(clstrs);
        setTimeout(() => {
          setClusterJob(null);
        }, 500);
      });
    }
  }, [clusterJob, dataset, umap]);

  const handleNewCluster = useCallback(
    (e) => {
      e.preventDefault();
      const form = e.target;
      const data = new FormData(form);
      const params = {
        umap_id: umap.id,
        samples: data.get('samples'),
        method,
        cluster_on: clusterOn,
        name: data.get('name') || '',
        description: data.get('description') || '',
      };
      if (method === 'evoc') {
        params.n_neighbors = data.get('n_neighbors');
        params.noise_level = data.get('noise_level');
        const approx = data.get('approx_n_clusters');
        if (approx) params.approx_n_clusters = approx;
      } else if (method === 'hdbscan') {
        params.min_samples = data.get('min_samples');
        params.cluster_selection_epsilon = data.get('cluster_selection_epsilon');
      }
      // kmeans/gmm: only `samples` (= n_clusters) + cluster_on are needed;
      // the server defaults the unused positionals.
      startClusterJob(params);
    },
    [startClusterJob, umap, method, clusterOn]
  );

  // Inline rename of an existing cluster run (experiment gallery) without re-running.
  const handleRenameCluster = useCallback(
    (item, meta) => {
      return apiService.updateClusterMeta(dataset.id, item.id, meta).then(() =>
        apiService.fetchClusters(dataset?.id).then((cls) => {
          setClusters(cls);
        })
      );
    },
    [dataset]
  );

  // Estimation
  const [clusterEstimate, setClusterEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  const handleEstimateCluster = useCallback(() => {
    if (!umap?.id || !dataset?.id) return;
    setEstimateLoading(true);
    apiService
      .estimateCluster(dataset.id, umap.id)
      .then((data) => {
        setClusterEstimate(data);
        setEstimateLoading(false);
      })
      .catch(() => setEstimateLoading(false));
  }, [dataset, umap]);

  const handleNextStep = useCallback(() => {
    if (savedScope?.cluster_id == cluster?.id) {
      updateScope({ ...savedScope });
    } else {
      updateScope({ cluster_id: cluster?.id, cluster_labels_id: null, id: null });
    }
    goToNextStep();
  }, [updateScope, goToNextStep, cluster, savedScope]);

  return (
    <div className={styles['cluster']}>
      <div className={styles['cluster-setup']}>
        <div className={styles['cluster-form']}>
          <div>
            Cluster using{' '}
            {method === 'evoc' ? (
              <a href="https://github.com/TutteInstitute/evoc">EVoC</a>
            ) : method === 'hdbscan' ? (
              <a href="https://hdbscan.readthedocs.io/en/latest/api.html">HDBSCAN</a>
            ) : method === 'kmeans' ? (
              <a href="https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html">
                KMeans
              </a>
            ) : (
              <a href="https://scikit-learn.org/stable/modules/generated/sklearn.mixture.GaussianMixture.html">
                Gaussian Mixture
              </a>
            )}
            .
          </div>
          <form onSubmit={handleNewCluster}>
            <label>
              <span className={styles['cluster-form-label']}>Method:</span>
              <select value={method} onChange={handleMethodChange} disabled={!!clusterJob || !umap}>
                <option value="evoc">EVoC</option>
                <option value="hdbscan">HDBSCAN</option>
                <option value="kmeans">KMeans</option>
                <option value="gmm">GMM</option>
              </select>
            </label>
            <label>
              <span className={styles['cluster-form-label']}>Cluster on:</span>
              <select
                value={clusterOn}
                onChange={(e) => setClusterOn(e.target.value)}
                disabled={!!clusterJob || !umap}
              >
                <option value="umap">UMAP 2D</option>
                <option value="embedding">Embeddings hi-dim</option>
              </select>
              <span className="tooltip" data-tooltip-id="cluster_on">
                🤔
              </span>
              <Tooltip id="cluster_on" place="top" effect="solid" className="tooltip-area">
                Which space to cluster in: the 2D UMAP projection or the original high-dimensional
                embeddings. EVoC defaults to embeddings; the others default to the 2D UMAP.
              </Tooltip>
            </label>
            <label>
              <span className={styles['cluster-form-label']}>
                {isCentroidMethod(method) ? 'Number of clusters:' : 'Min Cluster Size:'}
              </span>
              <input
                type="number"
                name="samples"
                defaultValue={dataset.length < 1000 ? 3 : dataset.length < 10000 ? 15 : 25}
                disabled={!!clusterJob || !umap}
              />
              <span className="tooltip" data-tooltip-id="samples">
                🤔
              </span>
              <Tooltip id="samples" place="top" effect="solid" className="tooltip-area">
                {isCentroidMethod(method)
                  ? 'The exact number of clusters to partition the data into.'
                  : 'The minimum number of data points needed to form a cluster. Lower values mean more clusters.'}
              </Tooltip>
            </label>
            {method === 'evoc' ? (
              <>
                <label>
                  <span className={styles['cluster-form-label']}>Neighbors:</span>
                  <input
                    type="number"
                    name="n_neighbors"
                    defaultValue={15}
                    disabled={!!clusterJob || !umap}
                  />
                  <span className="tooltip" data-tooltip-id="n_neighbors">
                    🤔
                  </span>
                  <Tooltip id="n_neighbors" place="top" effect="solid" className="tooltip-area">
                    Number of neighbors for the kNN graph. Higher values capture broader structure.
                  </Tooltip>
                </label>
                <label>
                  <span className={styles['cluster-form-label']}>Noise Level:</span>
                  <input
                    type="number"
                    name="noise_level"
                    defaultValue={0.5}
                    step="0.1"
                    min="0"
                    max="1"
                    disabled={!!clusterJob || !umap}
                  />
                  <span className="tooltip" data-tooltip-id="noise_level">
                    🤔
                  </span>
                  <Tooltip id="noise_level" place="top" effect="solid" className="tooltip-area">
                    Controls the noise threshold (0.0-1.0). Lower values cluster more data points;
                    higher values are more selective and leave more points as noise.
                  </Tooltip>
                </label>
                <label>
                  <span className={styles['cluster-form-label']}>Approx. Clusters:</span>
                  <input
                    type="number"
                    name="approx_n_clusters"
                    placeholder="auto"
                    min="2"
                    disabled={!!clusterJob || !umap}
                  />
                  <span className="tooltip" data-tooltip-id="approx_n_clusters">
                    🤔
                  </span>
                  <Tooltip id="approx_n_clusters" place="top" effect="solid" className="tooltip-area">
                    Aim for approximately this many clusters: EVoC builds a hierarchy of cluster
                    layers and picks the one closest to this count. Leave empty to let EVoC choose
                    automatically (which can land on very few clusters for large datasets).
                  </Tooltip>
                </label>
              </>
            ) : method === 'hdbscan' ? (
              <>
                <label>
                  <span className={styles['cluster-form-label']}>Min Samples:</span>
                  <input
                    type="number"
                    name="min_samples"
                    defaultValue={dataset.length < 1000 ? 2 : 5}
                    disabled={!!clusterJob || !umap}
                  />
                  <span className="tooltip" data-tooltip-id="min_samples">
                    🤔
                  </span>
                  <Tooltip id="min_samples" place="top" effect="solid" className="tooltip-area">
                    The number of samples in a neighborhood for a point to be considered a core
                    point. Lower values mean more clusters.
                  </Tooltip>
                </label>
                <label>
                  <span className={styles['cluster-form-label']}>Epsilon:</span>
                  <input
                    type="number"
                    name="cluster_selection_epsilon"
                    defaultValue={dataset.length < 1000 ? 0.05 : 0.005}
                    step="0.0001"
                    disabled={!!clusterJob || !umap}
                  />
                  <span className="tooltip" data-tooltip-id="cluster_selection_epsilon">
                    🤔
                  </span>
                  <Tooltip
                    id="cluster_selection_epsilon"
                    place="top"
                    effect="solid"
                    className="tooltip-area"
                  >
                    The cluster selection epsilon parameter sets a distance threshold that allows you
                    to balance the density of clusters. Set to 0 to use pure HDBSCAN.
                  </Tooltip>
                </label>
              </>
            ) : null}
            <label>
              <span className={styles['cluster-form-label']}>Name:</span>
              <input
                type="text"
                name="name"
                placeholder="(optional)"
                className={styles['cluster-form-text']}
                disabled={!!clusterJob || !umap}
              />
            </label>
            <label>
              <span className={styles['cluster-form-label']}>Description:</span>
              <input
                type="text"
                name="description"
                placeholder="(optional)"
                className={styles['cluster-form-text']}
                disabled={!!clusterJob || !umap}
              />
            </label>
            {umap && (
              <EstimatePanel
                estimate={clusterEstimate}
                onEstimate={handleEstimateCluster}
                loading={estimateLoading}
                step="cluster"
              />
            )}
            <Button
              type="submit"
              color={cluster ? 'secondary' : 'primary'}
              disabled={false}
              text="New Clusters"
            />
          </form>

          <JobProgress
            job={clusterJob}
            clearJob={() => setClusterJob(null)}
            killJob={(job) => apiService.killJob(dataset.id, job.id).then(setClusterJob).catch(console.error)}
          />
        </div>

        <div className={styles['cluster-list']}>
          {umap && (
            <ExperimentGallery
              items={clusters.filter((d) => d.umap_id == umap.id)}
              selectedId={cluster?.id}
              savedId={savedScope?.cluster_id}
              onSelect={(cl) => setCluster(cl)}
              onProceed={handleNextStep}
              proceedLabel={`Proceed with ${cluster?.id}`}
              onDelete={(cl) => deleteClusterJob({ cluster_id: cl.id })}
              isDeleteDisabled={clusterJob && clusterJob.status !== 'completed'}
              onRename={handleRenameCluster}
              renderInfo={(cl) => (
                <>
                  <span>
                    <span className={styles['method-badge']}>
                      {METHOD_LABELS[cl.method] || 'EVoC'}
                    </span>
                    {cl.cluster_on ? (
                      <span className={styles['method-badge']}>
                        on {cl.cluster_on === 'embedding' ? 'hi-dim' : '2D'}
                      </span>
                    ) : null}
                  </span>
                  <span>
                    {cl.method === 'kmeans' || cl.method === 'gmm'
                      ? `N clusters: ${cl.samples}`
                      : `Min Size: ${cl.samples}`}
                  </span>
                  {cl.method === 'hdbscan' || !cl.method ? (
                    <>
                      <span>Min Samples: {cl.min_samples}</span>
                      {cl.cluster_selection_epsilon ? (
                        <span>Epsilon: {cl.cluster_selection_epsilon}</span>
                      ) : null}
                    </>
                  ) : cl.method === 'evoc' ? (
                    <>
                      {cl.n_neighbors && <span>Neighbors: {cl.n_neighbors}</span>}
                      {cl.noise_level != null && <span>Noise: {cl.noise_level}</span>}
                    </>
                  ) : null}
                  <span>Clusters: {cl.n_clusters}</span>
                  <span>Noise points: {cl.n_noise}</span>
                </>
              )}
              renderMetrics={(cl) =>
                qualityMetrics[cl.id] && qualityMetrics[cl.id].silhouette != null ? (
                  <div className={styles['quality-metrics']}>
                    <span className={styles['metric-badge']}>
                      Sil: {qualityMetrics[cl.id].silhouette}
                      <span className="tooltip" data-tooltip-id={`sil-${cl.id}`}>
                        🤔
                      </span>
                    </span>
                    <span className={styles['metric-badge']}>
                      CH: {Math.round(qualityMetrics[cl.id].calinski_harabasz)}
                      <span className="tooltip" data-tooltip-id={`ch-${cl.id}`}>
                        🤔
                      </span>
                    </span>
                    <span className={styles['metric-badge']}>
                      DB: {qualityMetrics[cl.id].davies_bouldin}
                      <span className="tooltip" data-tooltip-id={`db-${cl.id}`}>
                        🤔
                      </span>
                    </span>
                    <Tooltip id={`sil-${cl.id}`} place="top" effect="solid" className="tooltip-area">
                      Silhouette Score [-1,1]: higher means clusters are well-separated
                    </Tooltip>
                    <Tooltip id={`ch-${cl.id}`} place="top" effect="solid" className="tooltip-area">
                      Calinski-Harabasz: higher means denser, well-separated clusters
                    </Tooltip>
                    <Tooltip id={`db-${cl.id}`} place="top" effect="solid" className="tooltip-area">
                      Davies-Bouldin: lower means better separation between clusters
                    </Tooltip>
                  </div>
                ) : null
              }
            />
          )}
          {umap && clusters.filter((c) => c.umap_id === umap?.id).length >= 2 && (
            <div className={styles['compare-link']}>
              <Link to={`/datasets/${dataset?.id}/compare-clusters/`}>
                ↗ Compare Clusters
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className={styles['cluster-preview']}>
        <div className={styles['preview']}>
          <Preview embedding={embedding} umap={umap} cluster={cluster} labelId={'default'} />
        </div>
        <div className={styles['navigate']}>
          <Button
            disabled={!cluster}
            onClick={handleNextStep}
            text={cluster ? `Proceed with ${cluster?.id}` : 'Select a Cluster'}
          />
        </div>
      </div>
    </div>
  );
}

export default Cluster;
