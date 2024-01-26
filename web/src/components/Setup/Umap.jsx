// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import JobProgress from '../JobProgress';
import { useStartJobPolling } from '../JobRun';

import styles from './Umap.module.css';

import PropTypes from 'prop-types';
Umap.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  umap: PropTypes.object,
  embedding: PropTypes.string,
  clusters: PropTypes.array.isRequired,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function Umap({ dataset, umap, embedding, clusters, onNew, onChange}) {
  const [umapJob, setUmapJob] = useState(null);
  const { startJob: startUmapJob } = useStartJobPolling(dataset, setUmapJob, 'http://localhost:5001/jobs/umap');
  const { startJob: deleteUmapJob } = useStartJobPolling(dataset, setUmapJob, 'http://localhost:5001/jobs/delete/umap');

  const [umaps, setUmaps] = useState([]);
  function fetchUmaps(datasetId, callback) {
    fetch(`http://localhost:5001/datasets/${datasetId}/umaps`)
      .then(response => response.json())
      .then(data => {
        const array = data.map(d=> {
          return {
            ...d,
            url: `http://localhost:5001/files/${datasetId}/umaps/${d.name}.png`,
          }
        })
        callback(array.reverse())
      });
  }
  useEffect(() => {
    fetchUmaps(dataset.id, (umps) => {
      setUmaps(umps)
      onNew(umps)
    })
  }, [dataset, onNew]);

  useEffect(() => {
    if(umapJob?.status == "completed") {
      fetchUmaps(dataset.id, (umps) => {
        setUmaps(umps)
        onNew(umps)
      })
    }
  }, [umapJob, dataset, setUmaps, onNew]);

  const handleNewUmap = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const neighbors = data.get('neighbors')
    const min_dist = data.get('min_dist')
    startUmapJob({embeddings: embedding, neighbors, min_dist})
  }, [startUmapJob, embedding])

  return (
      <div className="dataset--umaps-new">
        <form onSubmit={handleNewUmap}>
          <label>
            Neighbors:
            <input type="number" name="neighbors" defaultValue="50"disabled={!!umapJob} />
          </label>
          <label>
            Min Dist:
            <input type="text" name="min_dist" defaultValue="0.1" disabled={!!umapJob} />
          </label>
          <button type="submit" disabled={!!umapJob}>New UMAP</button>
        </form>
        <JobProgress job={umapJob} clearJob={()=> setUmapJob(null)}/>
        {/* The list of available UMAPS */}
        <div className={styles["umaps-list"]}>
          {umaps.filter(d => d.embeddings == embedding).map((um, index) => (
            <div className={styles["umaps-item"]} key={index}>
              <input type="radio" 
                id={`umap${index}`} 
                name="umap" 
                value={um} checked={um.name === umap?.name} onChange={() => onChange(um)} />
              <label htmlFor={`umap${index}`}>{um.name}
              <br></br>
                Neighbors: {um.neighbors}<br/>
                Min Dist: {um.min_dist}<br/>
              <img src={um.url} alt={um.name} />
              <br></br>
              {clusters.filter(d => d.umap_name == um.name).length} clusters
              <button onClick={() => deleteUmapJob({umap_name: um.name}) } disabled={umapJob && umapJob.status !== "completed"}>🗑️ umap</button>
              </label>
            </div>
          ))}
        </div>
    </div>
  );
}

export default Umap;