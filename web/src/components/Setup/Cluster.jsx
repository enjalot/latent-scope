// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip } from 'react-tooltip';
import { Button } from 'react-element-forge';

import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
import { useSetup } from '../../contexts/SetupContext';
import { apiService, apiUrl } from '../../lib/apiService';

import Preview from './Preview';

import styles from './Cluster.module.scss';

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
  const [qualityMetrics, setQualityMetrics] = useState({});

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
    if (scope?.cluster_id) {
      const cl = clusters?.find((c) => c.id == scope.cluster_id);
      setCluster(cl);
    } else if (clusters) {
      setCluster(clusters.filter((c) => c.umap_id == scope?.umap_id)[0]);
    }
  }, [scope, clusters, umaps, embeddings]);

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
          cls = clstrs[0];
        }
        setCluster(cls);
        setClusters(clstrs);
        setTimeout(() => {
          setClusterJob(null);
        }, 500);
      });
    }
  }, [clusterJob, dataset]);

  const handleNewCluster = useCallback(
    (e) => {
      e.preventDefault();
      const form = e.target;
      const data = new FormData(form);
      const params = {
        umap_id: umap.id,
        samples: data.get('samples'),
        min_samples: data.get('min_samples'),
        cluster_selection_epsilon: data.get('cluster_selection_epsilon'),
        method,
      };
      if (method === 'evoc') {
        params.n_neighbors = data.get('n_neighbors');
        params.noise_level = data.get('noise_level');
      }
      startClusterJob(params);
    },
    [startClusterJob, umap, method]
  );

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
            ) : (
              <a href="https://hdbscan.readthedocs.io/en/latest/api.html">HDBSCAN</a>
            )}
            .
          </div>
          <form onSubmit={handleNewCluster}>
            <label>
              <span className={styles['cluster-form-label']}>Method:</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                disabled={!!clusterJob || !umap}
              >
                <option value="evoc">EVoC</option>
                <option value="hdbscan">HDBSCAN</option>
              </select>
            </label>
            <label>
              <span className={styles['cluster-form-label']}>Min Cluster Size:</span>
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
                The minimum number of data points needed to form a cluster. Lower values mean more
                clusters.
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
              </>
            ) : (
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
            )}
            <Button
              type="submit"
              color={cluster ? 'secondary' : 'primary'}
              disabled={false}
              text="New Clusters"
            />
          </form>

          <JobProgress job={clusterJob} clearJob={() => setClusterJob(null)} />
        </div>

        <div className={styles['cluster-list']}>
          {umap &&
            clusters
              .filter((d) => d.umap_id == umap.id)
              .map((cl, index) => (
                <div
                  className={
                    styles['item'] + (cl.id === cluster?.id ? ' ' + styles['selected'] : '')
                  }
                  key={index}
                >
                  <label htmlFor={`cluster${index}`}>
                    <input
                      type="radio"
                      id={`cluster${index}`}
                      name="cluster"
                      value={cl}
                      checked={cl.id === cluster?.id}
                      onChange={() => setCluster(cl)}
                    />
                    <span>
                      {cl.id}{' '}
                      <span className={styles['method-badge']}>
                        {cl.method === 'hdbscan' ? 'HDBSCAN' : 'EVoC'}
                      </span>
                      {savedScope?.cluster_id == cl.id ? (
                        <span className="tooltip" data-tooltip-id="saved">
                          💾
                        </span>
                      ) : null}
                    </span>
                    <div className={styles['item-info']}>
                      <span>Min Size: {cl.samples}</span>
                      {cl.method === 'hdbscan' || !cl.method ? (
                        <>
                          <span>Min Samples: {cl.min_samples}</span>
                          {cl.cluster_selection_epsilon ? (
                            <span>Epsilon: {cl.cluster_selection_epsilon}</span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {cl.n_neighbors && <span>Neighbors: {cl.n_neighbors}</span>}
                          {cl.noise_level != null && <span>Noise: {cl.noise_level}</span>}
                        </>
                      )}
                    </div>
                  </label>

                  <img src={cl.url} alt={cl.id} />

                  <div className={styles['item-info']}>
                    <span>Clusters: {cl.n_clusters}</span>
                    <span>Noise points: {cl.n_noise}</span>
                  </div>

                  {qualityMetrics[cl.id] && qualityMetrics[cl.id].silhouette != null && (
                    <div className={styles['quality-metrics']}>
                      <span className={styles['metric-badge']}>
                        Sil: {qualityMetrics[cl.id].silhouette}
                        <span className="tooltip" data-tooltip-id={`sil-${cl.id}`}>🤔</span>
                      </span>
                      <span className={styles['metric-badge']}>
                        CH: {Math.round(qualityMetrics[cl.id].calinski_harabasz)}
                        <span className="tooltip" data-tooltip-id={`ch-${cl.id}`}>🤔</span>
                      </span>
                      <span className={styles['metric-badge']}>
                        DB: {qualityMetrics[cl.id].davies_bouldin}
                        <span className="tooltip" data-tooltip-id={`db-${cl.id}`}>🤔</span>
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
                  )}

                  {cluster?.id == cl.id ? (
                    <div className={styles['navigate']}>
                      <Button
                        disabled={!cluster}
                        onClick={handleNextStep}
                        text={`Proceed with ${cluster?.id}`}
                      />
                    </div>
                  ) : null}

                  <Button
                    className={styles['delete']}
                    color="secondary"
                    onClick={() => deleteClusterJob({ cluster_id: cl.id })}
                    text="🗑️"
                  />
                </div>
              ))}
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
