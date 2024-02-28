// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
const apiUrl = import.meta.env.VITE_API_URL

import styles from './Embedding.module.css';

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
  const { startJob: rerunEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/rerun`);

  const [models, setModels] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/embedding_models`)
      .then(response => response.json())
      .then((data) => {
        setModels(data) 
        setModel(data[0])
      })
      .catch(console.error);
  }, []);

  const [model, setModel] = useState(null);
  // for the models that support choosing the size of dimensions
  const [dimensions, setDimensions] = useState(null)

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
        let emb;
        if(embeddingsJob.job_name == "embed"){
          emb = embs.find(d => d.id == embeddingsJob.run_id)
        } else if(embeddingsJob.job_name == "rm") {
          emb = embs[embs.length - 1]
        }
        onNew(embs, emb)
      })
    }
  }, [embeddingsJob, dataset, setEmbeddings, onNew])

  const handleNewEmbedding = useCallback((e) => {
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
    if(dimensions) job.dimensions = dimensions
    startEmbeddingsJob(job);
  }, [startEmbeddingsJob, textColumn, models, dimensions]);

  const handleRerunEmbedding = (job) => {
    rerunEmbeddingsJob({job_id: job?.id});
  }

  const handleModelChange = (e) => {
    const model = models.find(model => model.id === e.target.value);
    setModel(model)
  }
  const handleDimensionsChange = (e) => {
    setDimensions(+e.target.value)
  }

  return (
    <div>
      <div className={styles["embeddings-form"]}>
        Embedding on column: <b>{textColumn}</b>
      <form onSubmit={handleNewEmbedding}>
          <label htmlFor="modelName">Model:
          <select id="modelName" name="modelName" disabled={!!embeddingsJob} onChange={handleModelChange}>
            {models.map((model, index) => (
              <option key={index} value={model.id}>{model.provider}: {model.name}</option>
            ))}
          </select></label>
          <textarea name="prefix" placeholder={`Optional prefix to prepend to each ${textColumn}`} disabled={!!embeddingsJob}></textarea>
          {model && model.params.dimensions ? <select onChange={handleDimensionsChange}>
            {model.params.dimensions.map((dim, index) => {
              return <option key={index} value={dim}>{dim}</option>
            })}
          </select> : null}
        <button type="submit" disabled={!!embeddingsJob}>New Embedding</button>
      </form>
      </div>
      <JobProgress job={embeddingsJob} clearJob={()=> {
        setEmbeddingsJob(null)
      }} rerunJob={handleRerunEmbedding} />
      <div className={styles["embeddings-list"]}>
      {embeddings.map((emb, index) => (
        <div className="item" key={index}>
          <input type="radio" id={`embedding${index}`} name="embedding" value={emb.id} checked={emb.id === embedding?.id} onChange={() => onChange(emb)} />
          <label htmlFor={`embedding${index}`}>
            <span>
              <span>{emb.id} - {emb.model_id} </span><br></br>
              <span>Dimensions: {emb.dimensions}</span><br/>
              { emb.prefix ? <span>Prefix: {emb.prefix}<br/></span> : null }
              <span>[
                {umaps.filter(d => d.embedding_id == emb.id).length} umaps,&nbsp;
                {clusters.filter(d => umaps.filter(d => d.embedding_id == emb.id).map(d => d.id).indexOf(d.umap_id) >= 0).length} clusters 
              ]</span>
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