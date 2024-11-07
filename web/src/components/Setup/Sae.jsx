// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { Tooltip } from 'react-tooltip'
import Select from 'react-select'
import { groups } from 'd3-array'
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';

import { Button } from "react-element-forge"

import { apiService, apiUrl } from '../../lib/apiService';
import { useSetup } from '../../contexts/SetupContext';

import styles from './Sae.module.scss';

// const kexpansionStyle= {
//   backgroundColor: '#EBECF0',
//   borderRadius: '2em',
//   color: '#172B4D',
//   display: 'inline-block',
//   fontSize: 12,
//   fontWeight: 'normal',
//   lineHeight: '1',
//   minWidth: 1,
//   padding: '0.16666666666667em 0.5em',
//   textAlign: 'center',
// };



// TODO: this component will for now just assume a single SAE for an embedding
// We only have one SAE model currently available really
// When we have more we can allow for multiple SAEs per embedding
function Sae({ embedding, model }) {

  const { dataset, scope, updateScope } = useSetup();

  const [sae, setSae] = useState(null);
  const [saes, setSaes] = useState([]);
  const [saeJob, setSaeJob] = useState(null);
  const { startJob: startSaeJob } = useStartJobPolling(dataset, setSaeJob, `${apiUrl}/jobs/sae`);
  const { startJob: deleteSaeJob } = useStartJobPolling(dataset, setSaeJob, `${apiUrl}/jobs/delete/sae`);
  const { startJob: rerunSaeJob } = useStartJobPolling(dataset, setSaeJob, `${apiUrl}/jobs/rerun`);


  // const [presetModels, setPresetModels] = useState([
    // {
    //   "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-100BT",
    //   "k_expansion": "64_32"
    // },
    // {
    //   "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-100BT",
    //   "k_expansion": "64_128"
    // },
    // {
    //   "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-100BT",
    //   "k_expansion": "128_32"
    // },
    // {
    //   "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-100BT",
    //   "k_expansion": "128_128"
    // },
    // {
    //   "model_id": "enjalot/sae-nomic-text-v1.5-FineWeb-edu-10BT",
    //   "k_expansion": "64_128"
    // },
  // ]);
  
  // const [inputValue, setInputValue] = useState('');
  // const handleInputChange = (newValue) => {
  //   setInputValue(newValue);
  //   return newValue
  // }
  // const formatOptionLabel = useCallback((option) => {
  //   return (
  //     <div>
  //       <span>{option.model_id} </span>
  //       {<span style={kexpansionStyle}>{option.k_expansion}</span>}
  //     </div>
  //   );
  // }, []);
 
  // const [allModels, setAllModels] = useState([])
  // const [allOptionsGrouped, setAllOptionsGrouped] = useState([])
  // useEffect(() => {
  //   const am = presetModels
  //   let allOptions = am.map(m => {
  //     return {
  //       ...m,
  //       group: m.group || m.provider,
  //     }
  //   }).filter(f => !!f)
    
  //   const grouped = groups(allOptions, f => f.group)
  //     .map(d => ({ label: d[0], options: d[1] }))
  //     .filter(d => d.options.length)

  //   console.log("all options grouped", grouped)
  //   setAllOptionsGrouped(grouped)
  //   setAllModels(am)

  // }, [presetModels])

  // const [model, setModel] = useState(presetModels[0]);

  useEffect(() => {
    apiService.fetchSaes(dataset.id)
      .then(saes => {
        setSaes(saes)
        if(saes.length) {
          setSae(saes[0].id)
        }
      });
  }, [dataset, setSaes])
  
  useEffect(() => {
    if(saeJob?.status === "completed") {
      apiService.fetchSaes(dataset.id)
        .then(saes => {
          setSaes(saes)
          let s;
          if(saeJob.job_name == "sae"){
            s = saes.find(d => d.id == saeJob.run_id)
          } else if(saeJob.job_name == "rm") {
            s = saes[saes.length - 1]
          }
          setSae(s?.id)
        });
    }
  }, [saeJob, dataset, setSaes, setSae])

  const handleNewSae = useCallback((e) => {
    e.preventDefault();
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

  // const handleModelSelectChange = (selectedOption) => {
  //   setModel(selectedOption);
  // };

  return (
    <div className={styles["sae"]}>
      <div className={styles["saes-form"]}>
        {/* <Select 
            placeholder="Select model..."
            options={allOptionsGrouped} 
            formatOptionLabel={formatOptionLabel} 
            onInputChange={handleInputChange}
            value={model}
            onChange={handleModelSelectChange}
          /> */}

        {/* The form for creating a new embedding */}
        { !sae && !saeJob ? <form onSubmit={handleNewSae}>
          <Button type="submit" color="secondary" disabled={!!saeJob} text="Process SAE" />
        </form> : null }
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
      <div className={styles["saes-list"]}>
      {saes.map((sae, index) => {
        // let umps = umaps.filter(d => d.sae_id == sae.id)
        // let cls = clusters.filter(d => umps.map(d => d.id).indexOf(d.umap_id) >= 0)

        return (
        <div className={styles["item"]} key={index}>
          {/* <input type="radio" id={`sae${index}`} name="sae" value={sae.id} checked={sae.id === sae?.id} onChange={() => setSae(sae)} /> */}
          <label htmlFor={`sae${index}`}>
            <span>
              <span>{sae.id} - {sae.num_features} features</span>
              {/* <span>{sae.id} - {sae.num_features} features, {sae.model_id} {sae.k_expansion} </span> */}
              {/* <span>[ {sae.dead_features} / {sae.num_features} dead features ]</span> */}
              {/* <span>[ {umps.length} umaps,&nbsp; {cls.length} clusters ]</span> */}
            </span>
          </label>
          <Button color="secondary" 
            className={styles["delete"]} 
            onClick={() => deleteSaeJob({sae_id: sae.id}) } 
            disabled={saeJob && saeJob.status !== "completed"} 
            text="🗑️"
            />
        </div>
      )}
    )}
    <br></br>
    </div>
    </div>
  );
}

export default Sae;