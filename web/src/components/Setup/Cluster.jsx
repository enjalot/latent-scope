// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import { Tooltip } from 'react-tooltip';
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
const apiUrl = import.meta.env.VITE_API_URL

// import styles from './Cluster.module.css';

import PropTypes from 'prop-types';
Cluster.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  cluster: PropTypes.object,
  umap: PropTypes.object,
  clusters: PropTypes.array,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function Cluster({ dataset, cluster, umap, onNew, onChange}) {
  const [clusterJob, setClusterJob] = useState(null);
  const { startJob: startClusterJob } = useStartJobPolling(dataset, setClusterJob, `${apiUrl}/jobs/cluster`);
  const { startJob: deleteClusterJob } = useStartJobPolling(dataset, setClusterJob, `${apiUrl}/jobs/delete/cluster`);

  const [clusters, setClusters] = useState([]);
  const [localCluster, setLocalCluster] = useState(cluster)
  useEffect(() => {
    if(cluster) {
      setLocalCluster(cluster)
    } else {
      setLocalCluster(clusters[0])
    }
  }, [cluster, clusters])


  function fetchClusters(datasetId, callback) {
    fetch(`${apiUrl}/datasets/${datasetId}/clusters`)
      .then(response => response.json())
      .then(data => {
        const array = data.map(d => {
          return {
            ...d,
            url: `${apiUrl}/files/${datasetId}/clusters/${d.id}.png`,
          }
        })
        // console.log("clusters", clusters)
        callback(array)
      });
  }
  
  useEffect(() => {
    fetchClusters(dataset.id, (clstrs) => {
      setClusters(clstrs)
      onNew(clstrs)
    })
  }, [dataset, onNew]);

  useEffect(() => {
    if(clusterJob?.status == "completed") {
      fetchClusters(dataset.id, (clstrs) => {
        let cls;
        if(clusterJob.job_name == "cluster"){
          cls = clstrs.find(d => d.id == clusterJob.run_id)
        } else if(clusterJob.job_name == "rm") {
          cls = clstrs[0]
        }
        setLocalCluster(cls)
        setClusters(clstrs)
        onNew(clstrs)
      })
    }
  }, [clusterJob, dataset, setClusters, onNew]);

  const handleNewCluster = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const samples = data.get('samples')
    const min_samples = data.get('min_samples')
    const cluster_selection_epsilon = data.get('cluster_selection_epsilon')
    startClusterJob({umap_id: umap.id, samples, min_samples, cluster_selection_epsilon})
  }, [startClusterJob, umap])


  return (
    <div className="dataset--clusters-new">
      <div>Cluster using <a href="https://hdbscan.readthedocs.io/en/latest/api.html">HDBSCAN</a></div>
      <form onSubmit={(e) => handleNewCluster(e, umap)}>
        <label>
          Min Cluster Size:
          <input type="number" name="samples" defaultValue={dataset.length < 1000 ? 3 : dataset.length < 10000 ? 15 : 25} disabled={!!clusterJob || !umap}/>
          <span className="tooltip" data-tooltip-id="samples">🤔</span>
          <Tooltip id="samples" place="top" effect="solid">
            This parameter determines the minimum number of data points you need to make a cluster. lower values mean more clusters.
          </Tooltip>
        </label>
        <label>
          Min Samples:
          <input type="number" name="min_samples" defaultValue={dataset.length < 1000 ? 2 : 5} disabled={!!clusterJob || !umap} />
          <span className="tooltip" data-tooltip-id="min_samples">🤔</span>
          <Tooltip id="min_samples" place="top" effect="solid">
            The number of samples in a neighbourhoodfor a point to be considered a core point. lower values mean more clusters.
          </Tooltip>
        </label>
        <label>
          Cluster Selection Epsilon:
          <input type="number" name="cluster_selection_epsilon" defaultValue={dataset.length < 1000 ? 0.05 : 0.005} step="0.0001" disabled={!!clusterJob || !umap} />
          <span className="tooltip" data-tooltip-id="cluster_selection_epsilon">🤔</span>
          <Tooltip id="cluster_selection_epsilon" place="top" effect="solid">
            This parameter sets a distance threshold that allows you to balance the density of clusters. Set to 0 to use pure HDBSCAN.
          </Tooltip>
        </label>
        <button type="submit" disabled={!!clusterJob || !umap}>New Clusters</button>
      </form> 

      <JobProgress job={clusterJob} clearJob={()=>setClusterJob(null)} />

      <div className="dataset--setup-clusters-list">
        {umap && clusters.filter(d => d.umap_id == umap.id).map((cl, index) => (
          <div className="item dataset--setup-clusters-item" key={index}>
            <input type="radio" 
              id={`cluster${index}`} 
              name="cluster" 
              value={cluster || ""} 
              checked={cl.id === localCluster?.id} 
              onChange={() => setLocalCluster(cl)} />
            <label htmlFor={`cluster${index}`}>{cl.id}
            <br></br>
              Clusters: {cl.n_clusters}<br/>
              Noise points: {cl.n_noise}<br/>
              Samples: {cl.samples}<br/>
              Min Samples: {cl.min_samples}<br/>
              { cl.cluster_selection_epsilon ? <>Cluster Selection Epsilon: {cl.cluster_selection_epsilon} <br/></>: null }
            <img src={cl.url} alt={cl.id} /><br/>
            <button onClick={() => deleteClusterJob({cluster_id: cl.id}) }>🗑️</button>
            </label>
          </div>
        ))}
      </div>
      <br></br>
        {localCluster && <button type="submit" onClick={() => onChange(localCluster)}>Use Cluster</button>} {localCluster?.id}
    </div>
  );
}

export default Cluster;