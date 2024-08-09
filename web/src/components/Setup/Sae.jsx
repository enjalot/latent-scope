// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'react-tooltip'
import Select from 'react-select'
import { groups } from 'd3-array'
import { format } from 'd3-format'
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';

const apiUrl = import.meta.env.VITE_API_URL
import styles from './Sae.module.css';

const kexpansionStyle= {
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


import PropTypes from 'prop-types';
Sae.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired,
    potential_embeddings: PropTypes.array
  }).isRequired,
  sae: PropTypes.object,
  embedding: PropTypes.object,
  umaps: PropTypes.array,
  clusters: PropTypes.array,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};



// This component is responsible for the embeddings state
// New embeddings update the list
function Sae({ dataset, sae, embedding, umaps, clusters, onNew, onChange}) {
  const [saes, setSaes] = useState([]);
  const [saeJob, setSaeJob] = useState(null);
  const { startJob: startSaeJob } = useStartJobPolling(dataset, setSaeJob, `${apiUrl}/jobs/sae`);
  const { startJob: deleteSaeJob } = useStartJobPolling(dataset, setSaeJob, `${apiUrl}/jobs/delete/sae`);
  const { startJob: rerunSaeJob } = useStartJobPolling(dataset, setSaeJob, `${apiUrl}/jobs/rerun`);

  const [localSae, setLocalSae] = useState(sae)
  useEffect(() => {
    if(sae) {
      setLocalSae(sae)
    } else {
      setLocalSae(saes[0])
    }
  }, [sae, saes])


  const [presetModels, setPresetModels] = useState([
    {
      "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-10BT",
      "k_expansion": "64_32"
    },
    {
      "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-10BT",
      "k_expansion": "64_64"
    },
    {
      "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-10BT",
      "k_expansion": "64_128"
    },
  ]);
  
  // Add a state to track the input value
  const [inputValue, setInputValue] = useState('');
  // Update the input value and trigger the debounced search
  const handleInputChange = (newValue) => {
    setInputValue(newValue);
    return newValue
  }
  const formatOptionLabel = useCallback((option) => {
    return (
      <div>
        <span>{option.model_id} </span>
        {<span style={kexpansionStyle}>{option.k_expansion}</span>}
      </div>
    );
  }, []);
 
  const [allModels, setAllModels] = useState([])
  const [allOptionsGrouped, setAllOptionsGrouped] = useState([])
  useEffect(() => {
    const am = presetModels
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

  }, [presetModels])

  const [model, setModel] = useState(presetModels[0]);

  const fetchSaes = (datasetId, callback) => {
    fetch(`${apiUrl}/datasets/${datasetId}/saes`)
      .then(response => response.json())
      .then(data => {
        callback(data)
      }).catch(e => {
        console.error("Error fetching saes", e)
        callback([])
      })
  }

  useEffect(() => {
    fetchSaes(dataset?.id, (saes) => {
      setSaes(saes)
      onNew(saes)
    });
  }, [dataset, setSaes, onNew])
  
  useEffect(() => {
    if(saeJob?.status === "completed") {
      fetchSaes(dataset.id, (saes) => {
        setSaes(saes)
        let s;
        if(saeJob.job_name == "sae"){
          s = saes.find(d => d.id == saeJob.run_id)
        } else if(saeJob.job_name == "rm") {
          s = saes[saes.length - 1]
        }
        onNew(saes)
        setLocalSae(s?.id)
      })
    }
  }, [saeJob, dataset, setSaes, onNew])


  const handleNewSae = useCallback((e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    let job = { 
      model_id: model.model_id,
      k_expansion: model.k_expansion,
      embedding_id: embedding.id
    };
    startSaeJob(job);
  }, [startSaeJob, model, embedding]);

  const handleRerunSae = (job) => {
    rerunSaeJob({job_id: job?.id});
  }

  const handleModelSelectChange = (selectedOption) => {
    setModel(selectedOption);
  };

  return (
    <div>
      <div className={styles["saes-form"]}>
        <Select 
            placeholder="Select model..."
            options={allOptionsGrouped} 
            formatOptionLabel={formatOptionLabel} 
            onInputChange={handleInputChange}
            value={model}
            // inputValue={inputValue} 
            // getOptionValue={(option) => option.model_id + ":" + option.k_expansion} 
            onChange={handleModelSelectChange}
            // menuIsOpen={true}
          />

        {/* The form for creating a new embedding */}
        <form onSubmit={handleNewSae}>
          <button type="submit" disabled={!!saeJob}>New SAE</button>
        </form>
      </div>

      {/* 
      Render the progress for the current job 
      TODO: automatically dismiss if successful
      */}
      <JobProgress job={saeJob} clearJob={()=> {
        setSaeJob(null)
      }} rerunJob={handleRerunSae} />
      {/* 
      TODO: have a lastEmbeddingsJob with the info from previous run. 
      if job was successful user can click a button to display the logs. 
      */}

      {/* Render the list of existing embeddings */}
      <div className={styles["embeddings-list"]}>
      {saes.map((sae, index) => {
        let umps = umaps.filter(d => d.sae_id == sae.id)
        let cls = clusters.filter(d => umps.map(d => d.id).indexOf(d.umap_id) >= 0)

        return (
        <div className={styles["item"]} key={index}>
          <input type="radio" id={`sae${index}`} name="sae" value={sae.id} checked={sae.id === localSae?.id} onChange={() => setLocalSae(sae)} />
          <label htmlFor={`sae${index}`}>
            <span>
              <span>{sae.id} - {sae.model_id} {sae.k_expansion} </span>
              <span>[ {sae.dead_features} / {sae.num_features} dead features ]</span>
              <span>[ {umps.length} umaps,&nbsp; {cls.length} clusters ]</span>
            </span>
          </label>
          <button className={styles["delete"]} onClick={() => deleteSaeJob({sae_id: sae.id}) } disabled={saeJob && saeJob.status !== "completed"}>🗑️</button>
        </div>
      )}
    )}
    <br></br>
    {localSae && <button type="submit" onClick={() => onChange(localSae, false)}>👉 Use {localSae?.id}</button>} 
    <button type="submit" onClick={() => onChange(null, true)}>🙅 Skip SAE</button>
    </div>
    </div>
  );
}

export default Sae;