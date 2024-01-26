// NewEmbedding.jsx
import { useState, useEffect, useMemo } from 'react';
import JobProgress from '../JobProgress';
import { useStartJobPolling } from '../JobRun';
const apiUrl = import.meta.env.VITE_API_URL

import PropTypes from 'prop-types';
EmbeddingNew.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  textColumn: PropTypes.string.isRequired,
  embedding: PropTypes.string,
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
    let job = { 
      text_column: textColumn,
      provider: model.provider,
      model: model.id,
    };
    startEmbeddingsJob(job);
  };

  return (
    <div>
      <div>
        Embedding on column: <b>{textColumn}</b>
      </div>
      <form onSubmit={handleNewEmbedding}>
        <div>
          <label htmlFor="modelName">Model:</label>
          <select id="modelName" name="modelName" disabled={!!embeddingsJob}>
            {models.filter(d => embeddings?.indexOf(d.id) < 0).map((model, index) => (
              <option key={index} value={model.id}>{model.provider}: {model.name}</option>
            ))}
          </select>
        </div> 
        <button type="submit" disabled={!!embeddingsJob}>New Embedding</button>
      </form>
      <JobProgress job={embeddingsJob} clearJob={()=> {
        
        setEmbeddingsJob(null)
      }} />
      <div className="embeddings-list">
      {embeddings.map((emb, index) => (
        <div key={index}>
          <input type="radio" id={`embedding${index}`} name="embedding" value={emb} checked={emb === embedding} onChange={() => onChange(emb)} />
          <label htmlFor={`embedding${index}`}>
            <span>
              {emb} [
                {umaps.filter(d => d.embeddings == emb).length} umaps,&nbsp;
                {clusters.filter(d => umaps.filter(d => d.embeddings == emb).map(d => d.name).indexOf(d.umap_name) >= 0).length} clusters 
              ]
            </span>
          </label>
        </div>
      ))}
    </div>
    </div>
  );
}

export default EmbeddingNew;