// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'react-tooltip'
import { Select, Button } from 'react-element-forge'

import { groups } from 'd3-array'

import ModelSelect from '../ModelSelect';
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
import { useSetup } from '../../contexts/SetupContext';
import { apiService, apiUrl } from '../../lib/apiService';

import Preview from './Preview';

import styles from './Embedding.module.scss';

// Debounce function without importing all of lodash
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};


function Embedding() {
  const { datasetId, dataset, scope, setDataset, updateScope, goToNextStep } = useSetup();

  const [textColumn, setTextColumn] = useState(null);
  const [embedding, setEmbedding] = useState(null);
  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);

  const [modelId, setModelId] = useState(null);
  // for the models that support choosing the size of dimensions
  const [dimensions, setDimensions] = useState(null)

  const [embeddingsJob, setEmbeddingsJob] = useState(null);
  const { startJob: startEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/embed`);
  const { startJob: deleteEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/delete/embedding`);
  const { startJob: rerunEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/rerun`);
  const { startJob: startEmbeddingsTruncateJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/embed_truncate`);
  const { startJob: startEmbeddingsImporterJob } = useStartJobPolling(dataset, setEmbeddingsJob, `${apiUrl}/jobs/embed_importer`);

  useEffect(() => {
    if(scope?.embedding_id) {
      console.log("scope changed", scope)
      const emb = embeddings.find(e => e.id == scope.embedding_id)
      setEmbedding(emb)
    } else {
      setEmbedding(embeddings?.[0])
    }
  }, [scope, embeddings])

  useEffect(() => {
    if(dataset){
      apiService.fetchEmbeddings(dataset?.id).then(embs => setEmbeddings(embs))
      apiService.fetchUmaps(dataset?.id).then(ums => setUmaps(ums))
      apiService.fetchClusters(dataset?.id).then(cls => setClusters(cls))
      setTextColumn(dataset?.text_column)
    }
  }, [dataset, setEmbeddings, setUmaps, setClusters])

  const [HFModels, setHFModels] = useState([])
  const searchHFModels = useCallback((query) => {
    debounce(apiService.searchHFModels(query)
      .then(hfm => {
        setHFModels(hfm)
      }),300)
  }, [])

  const [presetModels, setPresetModels] = useState([]);
  useEffect(() => {
    apiService.getEmbeddingModels()
      .then((data) => {
        setPresetModels(data) 
      })
      .catch(console.error);
  }, [setPresetModels]);

  const [recentModels, setRecentModels] = useState([])
  const fetchRecentModels = useCallback(() => {
    apiService.getRecentModels()
      .then(data => {
        setRecentModels(data)
      })
  }, []);

  useEffect(() => {
    fetchRecentModels();
    searchHFModels()
  }, [fetchRecentModels, searchHFModels]);

  // Build up the list of options for the Dropdown
  /*
    models is an array of objects with the following properties:
    - id: a unique identifier for the model
    - name: the name of the model
    - provider: the provider of the model
    and other optional properties like
    - params: { dimensions: [10, 20, 30] }

    models come from several sources:
    - recently used
    - top models from HF
      - search models from HF
    - 3rd party models
    
    TODO: custom list
    
  */
  const [allModels, setAllModels] = useState([])
  const [allOptionsGrouped, setAllOptionsGrouped] = useState([])
  const [defaultModel, setDefaultModel] = useState(null);
  useEffect(() => {
    const am = recentModels.concat(HFModels).concat(presetModels).filter(d => !!d)
    let allOptions = am.map(m => {
      return {
        ...m,
        group: m.group || m.provider,
      }
    }).filter(f => !!f)
    
    const grouped = groups(allOptions, f => f.group)
      .map(d => ({ label: d[0], options: d[1] }))
      .filter(d => d.options.length)

    // console.log("all options grouped", grouped)
    setAllOptionsGrouped(grouped)
    setAllModels(am)

    const defaultOption = allOptions.find(option => option.name.indexOf("all-MiniLM-L6-v2") > -1);
    if (defaultOption && !defaultModel) {
      setDefaultModel(defaultOption);
      setModelId(defaultOption.id);
    }

  }, [presetModels, HFModels, recentModels, defaultModel]) 
  
  useEffect(() => {
    if(embeddingsJob?.status === "completed") {
      apiService.fetchEmbeddings(datasetId)
        .then(embs => {
          setEmbeddings(embs)
          let emb;
          if(embeddingsJob.job_name == "embed"){
            emb = embs.find(d => d.id == embeddingsJob.run_id)
          } else if(embeddingsJob.job_name == "rm") {
            emb = embs[embs.length - 1]
          }
          console.log("new embedding", emb)
          setEmbedding(emb)
          fetchRecentModels()
        })
    }
  }, [embeddingsJob, datasetId, setEmbeddings, fetchRecentModels])

  const [batchSize, setBatchSize] = useState(100)
  const [maxSeqLength, setMaxSeqLength] = useState(512)

  // from the dataset, if a column is flagged as a potential embedding
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
      // we need to split our command to get the name of the embedding
      let commandParts = embeddingsJob.command.match(/(?:[^\s"']+|["'][^"']*["'])+/g);
      let pe = commandParts[2].replace(/['"]+/g, '').filter(d => d !== pe)
      apiService.updateDataset(datasetId, "potential_embeddings", pe)
        .then(data => setDataset(data))
    }
  }, [embeddingsJob, datasetId, setDataset])

  const handleDenyPotentialEmbedding = useCallback((e, pe) => {
    e.preventDefault();
    apiService.updateDataset(datasetId, "potential_embeddings", pe)
  }, [datasetId])

  const handleNewEmbedding = useCallback((e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    // const model = allModels.find(model => model.id === data.get('modelName'));
    const prefix = data.get('prefix')
    let job = { 
      text_column: textColumn,
      model_id: modelId,
      prefix,
      batch_size: batchSize,
      max_seq_length: maxSeqLength
    };
    if(dimensions) job.dimensions = dimensions
    startEmbeddingsJob(job);
  }, [startEmbeddingsJob, textColumn, dimensions, batchSize, modelId, maxSeqLength]);

  const handleRerunEmbedding = (job) => {
    rerunEmbeddingsJob({job_id: job?.id});
  }

  const handleModelSelectChange = useCallback((selectedOption) => {
    setDefaultModel(selectedOption)
    setModelId(selectedOption.id);
  }, [setDefaultModel, setModelId])

  const handleDimensionsChange = useCallback((e) => {
    setDimensions(+e.target.value)
  }, [setDimensions])

  const handleTextColumnChange = useCallback((e) => {
    setTextColumn(e.target.value)
    apiService.updateDataset(datasetId, "text_column", e.target.value)
      .then(data => setDataset(data))
  }, [setTextColumn, datasetId, setDataset])

  const handleTruncate = useCallback((embeddingId) => {
    const selectedDimension = document.getElementById(`truncate-${embeddingId}`).value;
    console.log("truncating", embeddingId, selectedDimension)
    startEmbeddingsTruncateJob({embedding_id: embeddingId, dimensions: selectedDimension })
  }, [startEmbeddingsTruncateJob])

  return (
    <div className={styles["embeddings"]}>
      <div className={styles["embeddings-setup"]}>
        <div className={styles["embeddings-form"]}>
          {/* Render the list of potential embeddings from the dataset columns */}
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
                  {allModels.map((model, index) => {
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

          1. Embed on column:  
          {dataset?.columns.length ? <Select 
            value={textColumn} 
            options={dataset?.columns.map((column) => ({label: column, value: column}))}
            onChange={handleTextColumnChange}
          /> : null}

          2. Select embedding model:
          <ModelSelect 
            options={allOptionsGrouped} 
            defaultValue={defaultModel} 
            onChange={handleModelSelectChange} 
            onInputChange={searchHFModels} />

          {/* The form for creating a new embedding */}
          <form onSubmit={handleNewEmbedding}>
              <textarea name="prefix" placeholder={`Optional prefix to prepend to each ${textColumn}`} disabled={!!embeddingsJob}></textarea>

              <span className={styles["options"]}>
              <label> Batch Size:
              <input className={styles["batch-size"]} type="number" min="1"name="batch_size" value={batchSize} onChange={(e) => setBatchSize(e.target.value)} disabled={!!embeddingsJob} />
              <span className="tooltip" data-tooltip-id="batchsize">🤔</span>
              <Tooltip id="batchsize" place="top" effect="solid">
                Reduce this number if you run out of memory. <br></br>
                It determines how many items are processed at once. 
              </Tooltip>
              </label>

              <label> Max Sequence Length:
              <input className={styles["max-seq-length"]} type="number" min="1"name="max_seq_length" value={maxSeqLength} onChange={(e) => setMaxSeqLength(e.target.value)} disabled={!!embeddingsJob} />
              <span className="tooltip" data-tooltip-id="maxseqlength">🤔</span>
              <Tooltip id="maxseqlength" place="top" effect="solid">
                This controls the maximum number of tokens to embed for each item. <br></br>
                You can increase this number to the model's context length, and reduce it to save memory. <br></br>
                If an item is too long, it will be truncated.
              </Tooltip>
              </label>
              </span>

              {/* {model && model.params.dimensions ? 
                <select onChange={handleDimensionsChange}>
                  {model.params.dimensions.map((dim, index) => {
                    return <option key={index} value={dim}>{dim}</option>
                  })}
                </select> 
              : null} */}

            <Button type="submit" color={embedding ? "secondary" : "primary"} disabled={!!embeddingsJob}
              text="New Embedding"
            />
          </form>
        </div>

        {/* 
        Render the progress for the current job 
        TODO: automatically dismiss if successful
        */}
        <JobProgress job={embeddingsJob} clearJob={()=> {
          setEmbeddingsJob(null)
        }} rerunJob={handleRerunEmbedding} />
        {/* 
        TODO: have a lastEmbeddingsJob with the info from previous run. 
        if job was successful user can click a button to display the logs. 
        */}

        {/* Render the list of existing embeddings */}
        <div className={styles["embeddings-list"]}>
          {embeddings?.map((emb, index) => {
            let umps = umaps.filter(d => d.embedding_id == emb.id)
            let cls = clusters.filter(d => umps.map(d => d.id).indexOf(d.umap_id) >= 0)
            let m = allModels.find(d => d.id == emb.model_id)
            let dims = m ? m.params?.dimensions ? m.params?.dimensions.filter(d => +d < +emb.dimensions) : [] : []
            if(emb?.model_id.indexOf("nomic-embed-text-v1.5") >= 0) {
              dims = [512, 256, 128, 64, 16].filter(d => d < emb.dimensions)
            }
            return (
            <div className={styles["item"] + (emb.id === embedding?.id ? " " + styles["selected"] : "")} key={index}>
              <label htmlFor={`embedding${index}`}>
                <span className={styles["item-info"]}>
                  <span>
                    <input type="radio" id={`embedding${index}`} name="embedding" value={emb.id} checked={emb.id === embedding?.id} onChange={() => setEmbedding(emb)} />
                    {emb.id}
                  </span>
                  <span>{emb.model_id?.replace("___", "/")}</span>
                  <span>{emb.dimensions} dimensions</span>
                  {umps.length || cls.length ? <div className={styles["item-deps"]}>
                    {umps.length ? <span>{umps.length} umaps</span> : null}
                    {cls.length ? <span>{cls.length} clusters</span> : null}
                  </div> : null}
                  <span>text column: {emb.text_column}</span>
                  { emb.prefix ? <span>Prefix: "<code>{emb.prefix}</code>"<br/></span> : null }
                    {dims.length ? <div className={styles["truncate"]}>
                      <select id={"truncate-"+emb.id}>
                        {dims.map((d,i) => {
                          return (<option key={"dimension-"+i} value={d}>{d}</option>)
                        })}
                      </select>
                      <span className={`button ${styles["button"]}`} onClick={() => handleTruncate(emb.id)}>Truncate</span>
                      <span className="tooltip" data-tooltip-id="truncate">🤔</span>
                      <Tooltip id="truncate" place="top" effect="solid">
                        This model supports Matroyshka embeddings. <br></br>
                        You can make a truncated copy of this embedding with fewer dimensions.
                      </Tooltip>
                  </div> : <br/> }
                </span>
              </label>
              <button className={styles["delete"]} onClick={() => deleteEmbeddingsJob({embedding_id: emb.id}) } disabled={embeddingsJob && embeddingsJob.status !== "completed"}>🗑️</button>
            </div>
          )}
        )}
        </div>
      </div>
      <div className={styles["embeddings-preview"]}>
        <div className={styles["preview"]}>
          <Preview embedding={embedding} />
        </div>
        <div className={styles["navigate"]}>
          <Button disabled={!embedding}
            onClick={() => {
              updateScope({embedding_id: embedding?.id})
              goToNextStep()
            }}
            text={embedding ? `Proceed with ${embedding?.id}` : "Select an embedding"}
            >
          </Button>
        </div>
      </div>
    </div>
  );
}

export default Embedding;