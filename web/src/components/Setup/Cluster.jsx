// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
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
  const { startJob: startClusterJob } = useStartJobPolling(dataset, setClusterJob, `${apiUrl}/jobs/cluster`);
  const { startJob: deleteClusterJob } = useStartJobPolling(dataset, setClusterJob, `${apiUrl}/jobs/delete/cluster`);

  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);

  const [embedding, setEmbedding] = useState(null);
  const [umap, setUmap] = useState(null);
  const [cluster, setCluster] = useState(null);

  useEffect(() => {
    setPreviewLabel(cluster?.id)
  }, [cluster, setPreviewLabel])

  // Update local state when scope changes
  useEffect(() => {
    if(scope?.embedding_id) {
      const emb = embeddings.find(e => e.id == scope.embedding_id)
      setEmbedding(emb)
    } else {
      setEmbedding(embeddings?.[0])
    }
    if(scope?.umap_id) {
      const um = umaps.find(u => u.id == scope.umap_id)
      setUmap(um)
    }
    if(scope?.cluster_id) {
      const cl = clusters?.find(c => c.id == scope.cluster_id)
      setCluster(cl)
    } else if(clusters) {
      setCluster(clusters.filter(c => c.umap_id == scope?.umap_id)[0])
    }
  }, [scope, clusters, umaps, embeddings])

  // Fetch initial data
  useEffect(() => {
    if(dataset) {
      apiService.fetchEmbeddings(dataset?.id).then(embs => setEmbeddings(embs))
      apiService.fetchUmaps(dataset?.id).then(ums => setUmaps(ums))
      apiService.fetchClusters(dataset?.id).then(cls => setClusters(cls))
    }
  }, [dataset])

  // Update clusters after job completion
  useEffect(() => {
    if(clusterJob?.status == "completed") {
      apiService.fetchClusters(dataset.id)
        .then(clstrs => {
          let cls;
          if(clusterJob.job_name == "cluster"){
            cls = clstrs.find(d => d.id == clusterJob.run_id)
          } else if(clusterJob.job_name == "rm") {
            cls = clstrs[0]
          }
          setCluster(cls)
          setClusters(clstrs)
        })
    }
  }, [clusterJob, dataset]);

  const handleNewCluster = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    startClusterJob({
      umap_id: umap.id, 
      samples: data.get('samples'),
      min_samples: data.get('min_samples'),
      cluster_selection_epsilon: data.get('cluster_selection_epsilon')
    })
  }, [startClusterJob, umap])

  const handleNextStep = useCallback(() => {
    if(savedScope?.cluster_id == cluster?.id) {
      updateScope({...savedScope})
    } else {
      updateScope({cluster_id: cluster?.id, cluster_labels_id: null, id: null})
    }
    goToNextStep()
  }, [updateScope, goToNextStep, cluster, savedScope])

  console.log({ cluster, clusters, umap })

  return (
    <div className={styles["cluster"]}>
      <div className={styles["cluster-setup"]}>
        <div className={styles["cluster-form"]}>
          <div>Cluster the 2D points using <a href="https://hdbscan.readthedocs.io/en/latest/api.html">HDBSCAN</a>.
          </div>
          <form onSubmit={handleNewCluster}>
            <label>
              <span className={styles["cluster-form-label"]}>Min Cluster Size:</span>
              <input type="number" name="samples" defaultValue={dataset.length < 1000 ? 3 : dataset.length < 10000 ? 15 : 25} disabled={!!clusterJob || !umap}/>
              <span className="tooltip" data-tooltip-id="samples">🤔</span>
              <Tooltip id="samples" place="top" effect="solid" className="tooltip-area">
                This parameter determines the minimum number of data points you need to make a cluster. Lower values mean more clusters.
              </Tooltip>
            </label>
            <label>
              <span className={styles["cluster-form-label"]}>Min Samples:</span>
              <input type="number" name="min_samples" defaultValue={dataset.length < 1000 ? 2 : 5} disabled={!!clusterJob || !umap} />
              <span className="tooltip" data-tooltip-id="min_samples">🤔</span>
              <Tooltip id="min_samples" place="top" effect="solid" className="tooltip-area">
                The number of samples in a neighborhood for a point to be considered a core point. Lower values mean more clusters.
              </Tooltip>
            </label>
            <label>
              <span className={styles["cluster-form-label"]}>Epsilon:</span>
              <input type="number" name="cluster_selection_epsilon" defaultValue={dataset.length < 1000 ? 0.05 : 0.005} step="0.0001" disabled={!!clusterJob || !umap} />
              <span className="tooltip" data-tooltip-id="cluster_selection_epsilon">🤔</span>
              <Tooltip id="cluster_selection_epsilon" place="top" effect="solid" className="tooltip-area">
                The cluster selection epsilon parameter sets a distance threshold that allows you to balance the density of clusters. Set to 0 to use pure HDBSCAN.
              </Tooltip>
            </label>
            <Button type="submit" color={cluster ? "secondary" : "primary"} disabled={false} text="New Clusters" />
          </form>

          <JobProgress job={clusterJob} clearJob={() => setClusterJob(null)} />
        </div>

        <div className={styles["cluster-list"]}>
          {umap && clusters.filter(d => d.umap_id == umap.id).map((cl, index) => (
            <div className={styles["item"] + (cl.id === cluster?.id ? " " + styles["selected"] : "")} key={index}>
              <label htmlFor={`cluster${index}`}>
                <input type="radio" 
                  id={`cluster${index}`} 
                  name="cluster" 
                  value={cl} 
                  checked={cl.id === cluster?.id} 
                  onChange={() => setCluster(cl)} />
                <span>{cl.id} {savedScope?.cluster_id == cl.id ? <span className="tooltip" data-tooltip-id="saved">💾</span> : null}</span>
                <div className={styles["item-info"]}>
                  <span>Samples: {cl.samples}</span>
                  <span>Min Samples: {cl.min_samples}</span>
                  {cl.cluster_selection_epsilon && <span>Epsilon: {cl.cluster_selection_epsilon}</span>}
                </div>
              </label>

              <img src={cl.url} alt={cl.id} />

              <div className={styles["item-info"]}>
                <span>Clusters: {cl.n_clusters}</span>
                <span>Noise points: {cl.n_noise}</span>
              </div>

              <Button className={styles["delete"]} color="secondary" onClick={() => deleteClusterJob({cluster_id: cl.id})} text="🗑️" />
            </div>
          ))}
        </div>
      </div>

      <div className={styles["cluster-preview"]}>
        <div className={styles["preview"]}>
          <Preview embedding={embedding} umap={umap} cluster={cluster} labelId={"default"} />
        </div>
        <div className={styles["navigate"]}>
          <Button 
            disabled={!cluster}
            onClick={handleNextStep}
            text={cluster ? `Proceed with ${cluster?.id}` : "Select a Cluster"}
          />
        </div>
      </div>
    </div>
  );
}

export default Cluster;