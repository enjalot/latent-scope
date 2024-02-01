// NewEmbedding.jsx
import { useState, useEffect, useMemo } from 'react';
import JobProgress from '../JobProgress';
import { useStartJobPolling } from '../JobRun';
const apiUrl = import.meta.env.VITE_API_URL

import styles from './Embedding.module.css';
console.log("EMBEDDING STYLES", styles)

import PropTypes from 'prop-types';
EmbeddingNew.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  textColumn: PropTypes.string.isRequired,
  embedding: PropTypes.object,
  umaps: PropTypes.array,
  clusters: PropTypes.array,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function EmbeddingNew({ dataset, textColumn, embedding, umaps, clusters, onNew, onChange}) {
  const [embeddings, setEmbeddings] = useState([]);
  const [embeddingsJob, setEmbeddingsJob] = useState(null);
  const { startJob: startEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/embed`);
  const { startJob: deleteEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/delete/embedding`);

  const [models, setModels] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/embedding_models`)
      .then(response => response.json())
      .then(setModels)
      .catch(console.error);
  }, []);

  const fetchEmbeddings = (datasetId, callback) => {
    fetch(`${apiUrl}/datasets/${datasetId}/embeddings`)
      .then(response => response.json())
      .then(data => {
        callback(data)
      });
  }

  useEffect(() => {
    fetchEmbeddings(dataset?.id, (embs) => {
      setEmbeddings(embs)
      onNew(embs)
    });
  }, [dataset, setEmbeddings, onNew])
  
  useEffect(() => {
    if(embeddingsJob?.status === "completed") {
      fetchEmbeddings(dataset.id, (embs) => {
        setEmbeddings(embs)
        onNew(embs)
      })
    }
  }, [embeddingsJob, dataset, setEmbeddings, onNew])

  const handleNewEmbedding = (e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const model = models.find(model => model.id === data.get('modelName'));
    const prefix = data.get('prefix')
    let job = { 
      text_column: textColumn,
      model_id: model.id,
      prefix
    };
    startEmbeddingsJob(job);
  };

  return (
    <div>
      <div className={styles["embeddings-form"]}>
        Embedding on column: <b>{textColumn}</b>
      <form onSubmit={handleNewEmbedding}>
          <label htmlFor="modelName">Model:
          <select id="modelName" name="modelName" disabled={!!embeddingsJob}>
            {models.map((model, index) => (
              <option key={index} value={model.id}>{model.provider}: {model.name}</option>
            ))}
          </select></label>
          <textarea name="prefix" placeholder={`Optional prefix to prepend to each ${textColumn}`} disabled={!!embeddingsJob}></textarea>
        <button type="submit" disabled={!!embeddingsJob}>New Embedding</button>
      </form>
      </div>
      <JobProgress job={embeddingsJob} clearJob={()=> {
        
        setEmbeddingsJob(null)
      }} />
      <div className={styles["embeddings-list"]}>
      {embeddings.map((emb, index) => (
        <div className="item" key={index}>
          <input type="radio" id={`embedding${index}`} name="embedding" value={emb.id} checked={emb.id === embedding?.id} onChange={() => onChange(emb)} />
          <label htmlFor={`embedding${index}`}>
            <span>
              {emb?.id} - {emb?.model_id} [
                {umaps.filter(d => d.embedding_id == emb).length} umaps,&nbsp;
                {clusters.filter(d => umaps.filter(d => d.embedding_id == emb).map(d => d.id).indexOf(d.umap_id) >= 0).length} clusters 
              ]
              <button onClick={() => deleteEmbeddingsJob({embedding_id: emb.id}) } disabled={embeddingsJob && embeddingsJob.status !== "completed"}>🗑️</button>
            </span>
          </label>
        </div>
      ))}
    </div>
    </div>
  );
}

export default EmbeddingNew;