// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
const apiUrl = import.meta.env.VITE_API_URL

import styles from './Umap.module.css';

import PropTypes from 'prop-types';
Umap.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  umap: PropTypes.object,
  embedding: PropTypes.object,
  embeddings: PropTypes.array.isRequired,
  clusters: PropTypes.array.isRequired,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function Umap({ dataset, umap, embedding, embeddings, clusters, onNew, onChange}) {
  const [umapJob, setUmapJob] = useState(null);
  const { startJob: startUmapJob } = useStartJobPolling(dataset, setUmapJob, `${apiUrl}/jobs/umap`);
  const { startJob: deleteUmapJob } = useStartJobPolling(dataset, setUmapJob, `${apiUrl}/jobs/delete/umap`);

  const [init, setInit] = useState("")

  const [umaps, setUmaps] = useState([]);
  function fetchUmaps(datasetId, callback) {
    fetch(`${apiUrl}/datasets/${datasetId}/umaps`)
      .then(response => response.json())
      .then(data => {
        const array = data.map(d=> {
          return {
            ...d,
            url: `${apiUrl}/files/${datasetId}/umaps/${d.id}.png`,
          }
        })
        callback(array)
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
        let ump;
        if(umapJob.job_name == "umap"){
          ump = umps.find(d => d.id == umapJob.run_id)
        } else if(umapJob.job_name == "rm") {
          ump = umps[0]
        }
        onNew(umps, ump)
      })
    }
  }, [umapJob, dataset, setUmaps, onNew]);


  const handleChangeInit = useCallback((e) => {
    setInit(e.target.value)
  }, [setInit])

  const handleNewUmap = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const neighbors = data.get('neighbors')
    const min_dist = data.get('min_dist')
    const align = Array.from(document.querySelectorAll('input[name="umapAlign"]:checked'))
      .map(input => input.value)
      .sort((a,b) => a.localeCompare(b))
      .join(",")
    startUmapJob({embedding_id: embedding?.id, neighbors, min_dist, init, align})
  }, [startUmapJob, embedding, init])

  const [showAlign, setShowAlign] = useState(false);

  const toggleShowAlign = useCallback(() => {
    setShowAlign(!showAlign);
  }, [showAlign, setShowAlign]);

  return (
      <div className="dataset--umaps-new">
        <form onSubmit={handleNewUmap}>
          <label>
            Neighbors:
            <input type="number" name="neighbors" defaultValue="25"disabled={!!umapJob} />
          </label>
          <label>
            Min Dist:
            <input type="text" name="min_dist" defaultValue="0.1" disabled={!!umapJob} />
          </label>
          <label>
            Initialize from UMAP:
            <select name="init" disabled={!!umapJob} onChange={handleChangeInit}>
              <option value="">None</option>
              {umaps.map((um, index) => {
                let emb = embeddings.find(d => um.embedding_id == d.id)
                return (
                <option key={index} value={um.id}>
                  {um.embedding_id} - {um.id} - {emb?.model_id} [{emb?.dimensions}]
                  </option>
              )})}
            </select>
          </label>
          <span className="button" onClick={toggleShowAlign}>{showAlign ? 'x Align UMAPs' : '+ Align UMAPs'}</span>
          {showAlign && <div className={styles["umaps-align"]}>
            <span className={styles["umaps-align-info"]}>
              Choose 1 or more embeddings to align alongside {embedding?.id}. 
              An <a href="https://umap-learn.readthedocs.io/en/latest/aligned_umap_basic_usage.html">Aligned UMAP</a> will be generated for each embedding selected.
            </span>
            {embeddings.map((emb, index) => {
              if(emb.id == embedding?.id) return null
              return (<label key={index}>
                <input type="checkbox" id={`umap-align-${emb.id}`} name="umapAlign" value={emb.id} />
                {emb.id} - {emb.model_id} [{emb.dimensions}]
              </label>
            )}
            )} 
          </div>}
          <button type="submit" disabled={!!umapJob}>New UMAP</button>
        </form>
        <JobProgress job={umapJob} clearJob={()=> setUmapJob(null)}/>
        {/* The list of available UMAPS */}
        <div className={styles["umaps-list"]}>
          {umaps.filter(d => d.embedding_id == embedding?.id).map((um, index) => (
            <div className={`${styles["umaps-item"]} item`} key={index}>
              <input type="radio" 
                id={`umap${index}`} 
                name="umap" 
                value={um} checked={um.id === umap?.id} onChange={() => onChange(um)} />
              <label htmlFor={`umap${index}`}>{um.id}
              <br></br>
                Neighbors: {um.neighbors}<br/>
                Min Dist: {um.min_dist}<br/>
              [{clusters.filter(d => d.umap_id == um.id).length} clusters]<br/>
              <img src={um.url} alt={um.id} />
              <button onClick={() => deleteUmapJob({umap_id: um.id}) } disabled={umapJob && umapJob.status !== "completed"}>🗑️</button>
              </label>
            </div>
          ))}
        </div>
    </div>
  );
}

export default Umap;