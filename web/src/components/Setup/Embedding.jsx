// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'react-tooltip'
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
const apiUrl = import.meta.env.VITE_API_URL

import styles from './Embedding.module.css';

import PropTypes from 'prop-types';
EmbeddingNew.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired,
    potential_embeddings: PropTypes.array
  }).isRequired,
  textColumn: PropTypes.string.isRequired,
  embedding: PropTypes.object,
  umaps: PropTypes.array,
  clusters: PropTypes.array,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
  onTextColumn: PropTypes.func.isRequired,
  onRemovePotentialEmbedding: PropTypes.func.isRequired
};

// This component is responsible for the embeddings state
// New embeddings update the list
function EmbeddingNew({ dataset, textColumn, embedding, umaps, clusters, onNew, onChange, onTextColumn, onRemovePotentialEmbedding}) {
  const [embeddings, setEmbeddings] = useState([]);
  const [embeddingsJob, setEmbeddingsJob] = useState(null);
  const { startJob: startEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/embed`);
  const { startJob: deleteEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/delete/embedding`);
  const { startJob: rerunEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/rerun`);
  const { startJob: startEmbeddingsTruncateJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/embed_truncate`);
  const { startJob: startEmbeddingsImporterJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/embed_importer`);

  const [localEmbedding, setLocalEmbedding] = useState(embedding)
  useEffect(() => {
    if(embedding) {
      setLocalEmbedding(embedding)
    } else {
      setLocalEmbedding(embeddings[0])
    }
  }, [embedding, embeddings])

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
        // onNew(embs, emb)
        onNew(embs)
        setLocalEmbedding(emb.id)
      })
    }
  }, [embeddingsJob, dataset, setEmbeddings, onNew])

  const [batchSize, setBatchSize] = useState(100)

  const [potentialEmbeddings, setPotentialEmbeddings] = useState([])
  useEffect(() => {
    if(dataset?.potential_embeddings) {
      setPotentialEmbeddings(dataset.potential_embeddings)
    }
  }, [dataset])

  const handleConfirmPotentialEmbedding = useCallback((e, pe) => {
    e.preventDefault();
    const form = e.target.parentElement.parentElement;
    const data = new FormData(form);
    const model = data.get('model')
    const column = data.get('column')

    // kick off the job to create the embedding
    let job = { 
      embedding_column: pe,
      text_column: column,
      model_id: model,
    };
    startEmbeddingsImporterJob(job);
  }, [startEmbeddingsImporterJob])

  useEffect(() => {
    // check that the job is for the importer and if its complete remove the potential embedding
    if(embeddingsJob && embeddingsJob.status === "completed" && embeddingsJob.job_name === "embed-importer") {
      let pe = embeddingsJob.command.split(" ")[2]
      console.log("FINISHED JOB", pe)
      onRemovePotentialEmbedding(pe)
    }

  }, [embeddingsJob, onRemovePotentialEmbedding])

  const handleDenyPotentialEmbedding = useCallback((e, pe) => {
    e.preventDefault();
    console.log("DENYING", pe)
    onRemovePotentialEmbedding(pe)
  }, [onRemovePotentialEmbedding])

  const handleNewEmbedding = useCallback((e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const model = models.find(model => model.id === data.get('modelName'));
    const prefix = data.get('prefix')
    let job = { 
      text_column: textColumn,
      model_id: model.id,
      prefix,
      batch_size: batchSize
    };
    if(dimensions) job.dimensions = dimensions
    startEmbeddingsJob(job);
  }, [startEmbeddingsJob, textColumn, models, dimensions, batchSize]);

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

  const handleTruncate = useCallback((embeddingId) => {
    const selectedDimension = document.getElementById(`truncate-${embeddingId}`).value;
    console.log("truncating", embeddingId, selectedDimension)
    startEmbeddingsTruncateJob({embedding_id: embeddingId, dimensions: selectedDimension })
  }, [startEmbeddingsTruncateJob])

  return (
    <div>
      <div className={styles["embeddings-form"]}>

        {potentialEmbeddings.length ? <div className={styles["potential-embeddings"]}>
          {potentialEmbeddings.map(pe => {
            return <form key={pe} className={styles["potential-embedding"]}>
              <span>Create embedding from column <b>{pe}</b>?</span>
              <label htmlFor="column">Embedded text column:
              <select id="column" name="column">
                {dataset?.columns.filter(c => dataset?.column_metadata[c].type == "string")
                  .map((column, index) => {
                  return <option key={index} value={column}>{column}</option>
                })}
              </select>
              </label>
              <label htmlFor="model">Embedded with model:
              <select id="model" name="model">
                <option value="">Not listed</option>
                {models.map((model, index) => {
                  return <option key={index} value={model.id}>{model.provider}: {model.name}</option>
                })}
              </select>
              </label>
              <div className={styles["pe-buttons"]}>
                <span className={`${styles["button"]} button`} style={{borderColor: "green"}} onClick={(e) => handleConfirmPotentialEmbedding(e, pe)}>
                  ✅ Yes
                </span>
                <span className={`${styles["button"]} button`} style={{borderColor: "red"}} onClick={(e) => handleDenyPotentialEmbedding(e, pe)}>
                  ❌ No thanks
                </span>
              </div>
            </form>
          })}

        </div> : null}

        Embedding on column:  
        <select value={textColumn} onChange={onTextColumn}>
          {dataset.columns.map((column, index) => (
            <option key={index} value={column}>{column}</option>
          ))}
        </select>
      <form onSubmit={handleNewEmbedding}>
          <label htmlFor="modelName">Model:
          <select id="modelName" name="modelName" disabled={!!embeddingsJob} onChange={handleModelChange}>
            {models.map((model, index) => (
              <option key={index} value={model.id}>{model.provider}: {model.name}</option>
            ))}
          </select></label>

          <textarea name="prefix" placeholder={`Optional prefix to prepend to each ${textColumn}`} disabled={!!embeddingsJob}></textarea>

          <label> Batch Size:
          <input className={styles["batch-size"]} type="number" min="1" max="100" name="batch_size" value={batchSize} onChange={(e) => setBatchSize(e.target.value)} disabled={!!embeddingsJob} />
          <span className="tooltip" data-tooltip-id="batchsize">🤔</span>
          <Tooltip id="batchsize" place="top" effect="solid">
            Reduce this number if you run out of memory. It determines how many items are processed at once. Max 100.
          </Tooltip>
          </label>

          {model && model.params.dimensions ? 
            <select onChange={handleDimensionsChange}>
              {model.params.dimensions.map((dim, index) => {
                return <option key={index} value={dim}>{dim}</option>
              })}
            </select> 
          : null}

        <button type="submit" disabled={!!embeddingsJob}>New Embedding</button>
      </form>
      </div>
      <JobProgress job={embeddingsJob} clearJob={()=> {
        setEmbeddingsJob(null)
      }} rerunJob={handleRerunEmbedding} />
      <div className={styles["embeddings-list"]}>
      {embeddings.map((emb, index) => {
        let umps = umaps.filter(d => d.embedding_id == emb.id)
        let cls = clusters.filter(d => umps.map(d => d.id).indexOf(d.umap_id) >= 0)
        let m = models.find(d => d.id == emb.model_id)
        let dims = m ? m.params.dimensions ? m.params.dimensions.filter(d => +d < +emb.dimensions) : [] : []
        return (
        <div className={styles["item"]} key={index}>
          <input type="radio" id={`embedding${index}`} name="embedding" value={emb.id} checked={emb.id === localEmbedding?.id} onChange={() => setLocalEmbedding(emb)} />
          <label htmlFor={`embedding${index}`}>
            <span>
              <span>{emb.id} - {emb.model_id} </span>
              <span>[ {emb.dimensions} dimensions ]</span>
              <span>[ {umps.length} umaps,&nbsp; {cls.length} clusters ]</span>
              <span>[ text column: {emb.text_column} ]</span>
              { emb.prefix ? <span>Prefix: {emb.prefix}<br/></span> : null }
                {dims.length ? <div className={styles["truncate"]}>
                  <select id={"truncate-"+emb.id}>
                    {dims.map((d,i) => {
                      return (<option key={"dimension-"+i} value={d}>{d}</option>)
                    })}
                  </select>
                  <span className={`button ${styles["button"]}`} onClick={() => handleTruncate(emb.id)}>Truncate</span>
                  <span className="tooltip" data-tooltip-id="truncate">🤔</span>
                  <Tooltip id="truncate" place="top" effect="solid">
                    This model supports Matroyshka embeddings. You can make a truncated copy of this embedding with fewer dimensions.
                  </Tooltip>
              </div> : <br/> }
            </span>
          </label>
          <button className={styles["delete"]} onClick={() => deleteEmbeddingsJob({embedding_id: emb.id}) } disabled={embeddingsJob && embeddingsJob.status !== "completed"}>🗑️</button>
        </div>
      )}
    )}
    <br></br>
    {localEmbedding && <button type="submit" onClick={() => onChange(localEmbedding)}>Use embedding</button>} {localEmbedding?.id}
    </div>
    </div>
  );
}

export default EmbeddingNew;