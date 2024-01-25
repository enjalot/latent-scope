// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import JobProgress from '../JobProgress';
import { useStartJobPolling } from '../JobRun';

// import styles from './Cluster.module.css';

import PropTypes from 'prop-types';
Cluster.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.number.isRequired
  }).isRequired,
  cluster: PropTypes.object,
  umap: PropTypes.object,
  clusters: PropTypes.array.isRequired,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function Cluster({ dataset, cluster, umap, onNew, onChange}) {
  const [clusterJob, setClusterJob] = useState(null);
  const { startJob: startClusterJob } = useStartJobPolling(dataset, setClusterJob, 'http://localhost:5001/jobs/cluster');
  const { startJob: deleteClusterJob } = useStartJobPolling(dataset, setClusterJob, 'http://localhost:5001/jobs/delete/cluster');

  const [clusters, setClusters] = useState([]);

  function fetchClusters(datasetId, callback) {
    fetch(`http://localhost:5001/datasets/${datasetId}/clusters`)
      .then(response => response.json())
      .then(data => {
        const array = data.map(d => {
          return {
            ...d,
            url: `http://localhost:5001/files/${datasetId}/clusters/${d.cluster_name}.png`,
          }
        })
        // console.log("clusters", clusters)
        callback(array.reverse())
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
    startClusterJob({umap_name: umap.name, samples, min_samples})
  }, [startClusterJob, umap])


  return (
    <div className="dataset--clusters-new">
      <form onSubmit={(e) => handleNewCluster(e, umap)}>
        <label>
          Samples:
          <input type="number" name="samples" defaultValue="5" disabled={!!clusterJob}/>
        </label><br/>
        <label>
          Min Samples:
          <input type="number" name="min_samples" defaultValue="5" disabled={!!clusterJob} />
        </label>
        <button type="submit" disabled={!!clusterJob}>New Clusters</button>
      </form> 

      <JobProgress job={clusterJob} clearJob={()=>setClusterJob(null)} />

      <div className="dataset--setup-clusters-list">
        {umap && clusters.filter(d => d.umap_name == umap.name).map((cl, index) => (
          <div className="dataset--setup-clusters-item" key={index}>
            <input type="radio" 
              id={`cluster${index}`} 
              name="cluster" 
              value={cluster} 
              checked={cl.cluster_name === cluster?.cluster_name} 
              onChange={() => onChange(cl)} />
            <label htmlFor={`cluster${index}`}>{cl.cluster_name}
            <br></br>
              Clusters: {cl.n_clusters}<br/>
              Noise points: {cl.n_noise}<br/>
              Samples: {cl.samples}<br/>
              Min Samples: {cl.min_samples}<br/>
            <img src={cl.url} alt={cl.name} />
            <button onClick={() => deleteClusterJob({cluster_name: cl.cluster_name}) }>🗑️ cluster</button>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Cluster;