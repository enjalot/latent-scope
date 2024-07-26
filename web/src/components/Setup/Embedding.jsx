// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'react-tooltip'
import Select from 'react-select'
import { groups } from 'd3-array'
import { format } from 'd3-format'
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';

// Debounce function without importing all of lodash
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
};

const apiUrl = import.meta.env.VITE_API_URL


function sanitizeModelName(name) {
  return name.replace("/", '___')
}

import styles from './Embedding.module.css';
const intf = format(",d")

const groupStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
const groupBadgeStyles = {
  backgroundColor: '#EBECF0',
  borderRadius: '2em',
  color: '#172B4D',
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 'normal',
  lineHeight: '1',
  minWidth: 1,
  padding: '0.16666666666667em 0.5em',
  textAlign: 'center',
};
const downloadsStyle = {
  color: '#172B4D',
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 'normal',
  lineHeight: '1',
  minWidth: 1,
  padding: '0.16666666666667em 0.5em',
  textAlign: 'center',
};
const providerStyle = {
  color: '#ccc',
  display: 'inline-block',
  // fontSize: 12,
  fontWeight: 'normal',
  lineHeight: '1',
  minWidth: 1,
  padding: '0.16666666666667em 0.5em',
  textAlign: 'center',
};

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


  const [presetModels, setPresetModels] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/embedding_models`)
      .then(response => response.json())
      .then((data) => {
        setPresetModels(data) 
        setModel(data[0])
      })
      .catch(console.error);
    searchHFModels()
  }, []);

  const [recentModels, setRecentModels] = useState([])
  const fetchRecentModels = useCallback(() => {
    fetch(`${apiUrl}/embedding_models/recent`)
      .then(response => response.json())
      .then(data => {
        console.log("RECENT MODELS", data)
        setRecentModels(data)
      })
  }, []);

  useEffect(() => {
    fetchRecentModels();
  }, [fetchRecentModels]);

  const [HFModels, setHFModels] = useState([])
  const searchHFModels = useCallback((query) => {
    let limit = query ? 5 : 5 // TODO: could change this
    let url = `https://huggingface.co/api/models?filter=sentence-transformers&sort=downloads&limit=${limit}&full=false&config=false`
    if(query) {
      url += `&search=${query}`
    }
    fetch(url)
      .then(response => response.json())
      .then(data => {
        console.log("HF MODELS", data)
        // convert the HF data format to ours
        const hfm = data.map(d => {
          return {
            id: "🤗-" + sanitizeModelName(d.id),
            name: d.id,
            provider: "🤗",
            downloads: d.downloads,
            params: {}
          }
        })
        console.log("HFM", hfm)
        setHFModels(hfm)
      })
  }, [])

  // Add a state to track the input value
  const [inputValue, setInputValue] = useState('');
  // Update the input value and trigger the debounced search
  const handleInputChange = (newValue) => {
    setInputValue(newValue);
    debouncedSearchHFModels(newValue);
    return newValue
  };
  const debouncedSearchHFModels = useCallback(debounce(searchHFModels, 300), [searchHFModels]);
  const customFilterOption = (option, inputValue) => {
    const { provider, name } = option.data;
    return (
      provider.toLowerCase().includes(inputValue.toLowerCase()) ||
      name.toLowerCase().includes(inputValue.toLowerCase())
    );
  };
  const formatOptionLabel = useCallback((option) => {
    return (
      <div>
        <span style={providerStyle}>{option.provider} </span>
        <span>{option.name} </span>
        {option.downloads ? <span style={downloadsStyle}>downloads: {intf(+option.downloads)}</span> : null}
      </div>
    );
  }, []);
  const formatGroupLabel = useCallback((option) => {
    return (
      <div style={groupStyles}>
        {option.label == "🤗" ? <span>🤗 Sentence Transformers</span> : <span>{option.label}</span>}
        {option.options.length ? <span style={groupBadgeStyles}>{option.options.length}</span> : null}
      </div>
    );
  }, []);

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
  useEffect(() => {
    const am = recentModels.concat(HFModels).concat(presetModels)
    let allOptions = am.map(m => {
      return {
        ...m,
        group: m.group || m.provider,
      }
    }).filter(f => !!f)
    
    const grouped = groups(allOptions, f => f.group)
      .map(d => ({ label: d[0], options: d[1] }))
      .filter(d => d.options.length)

    console.log("all options grouped", grouped)
    setAllOptionsGrouped(grouped)
    setAllModels(am)

  }, [presetModels, HFModels, recentModels])

  const [model, setModel] = useState(null);
  const [modelId, setModelId] = useState(null);
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
        setLocalEmbedding(emb?.id)
        fetchRecentModels()
      })
    }
  }, [embeddingsJob, dataset, setEmbeddings, onNew])

  const [batchSize, setBatchSize] = useState(100)
  const [maxSeqLength, setMaxSeqLength] = useState(512)

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
      let pe = commandParts[2].replace(/['"]+/g, '');
      console.log("FINISHED JOB", pe);
      onRemovePotentialEmbedding(pe);
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

  const handleModelSelectChange = (selectedOption) => {
    console.log("SELECTED OPTION", selectedOption)
    setModelId(selectedOption.id);
  };
  // const handleModelChange = (e) => {
  //   const model = allModels.find(model => model.id === e.target.value);
  //   setModel(model)
  // }
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

        Embedding on column:  
        <select value={textColumn} onChange={onTextColumn}>
          {dataset.columns.map((column, index) => (
            <option key={index} value={column}>{column}</option>
          ))}
        </select>

        <Select 
            placeholder="Select model..."
            options={allOptionsGrouped} 
            formatOptionLabel={formatOptionLabel} 
            formatGroupLabel={formatGroupLabel}
            onInputChange={handleInputChange}
            inputValue={inputValue} 
            filterOption={customFilterOption}
            getOptionValue={(option) => option.id} 
            onChange={handleModelSelectChange}
            // menuIsOpen={true}
          />

        {/* The form for creating a new embedding */}
        <form onSubmit={handleNewEmbedding}>
            {/* <label htmlFor="modelName">Model: */}
            {/* <select id="modelName" name="modelName" disabled={!!embeddingsJob} onChange={handleModelChange}>
              {allModels.map((model, index) => (
                <option key={index} value={model.id}>{model.provider}: {model.name}</option>
              ))}
            </select></label> */}

            <textarea name="prefix" placeholder={`Optional prefix to prepend to each ${textColumn}`} disabled={!!embeddingsJob}></textarea>

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


            {/* {model && model.params.dimensions ? 
              <select onChange={handleDimensionsChange}>
                {model.params.dimensions.map((dim, index) => {
                  return <option key={index} value={dim}>{dim}</option>
                })}
              </select> 
            : null} */}

          <button type="submit" disabled={!!embeddingsJob}>New Embedding</button>
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
      {embeddings.map((emb, index) => {
        let umps = umaps.filter(d => d.embedding_id == emb.id)
        let cls = clusters.filter(d => umps.map(d => d.id).indexOf(d.umap_id) >= 0)
        let m = allModels.find(d => d.id == emb.model_id)
        let dims = m ? m.params?.dimensions ? m.params?.dimensions.filter(d => +d < +emb.dimensions) : [] : []
        if(emb?.model_id.indexOf("nomic-embed-text-v1.5") >= 0) {
          dims = [512, 256, 128, 64, 16].filter(d => d < emb.dimensions)
        }
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
    <br></br>
    {localEmbedding && <button type="submit" onClick={() => onChange(localEmbedding)}>👉 Use {localEmbedding?.id}</button>} 
    </div>
    </div>
  );
}

export default EmbeddingNew;