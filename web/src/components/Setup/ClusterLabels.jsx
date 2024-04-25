// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
import DataTable from '../DataTable';
const apiUrl = import.meta.env.VITE_API_URL

// import styles from './Cluster.module.css';

import PropTypes from 'prop-types';
ClusterLabels.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  embedding: PropTypes.object,
  cluster: PropTypes.object,
  selectedLabelId: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onLabels: PropTypes.func,
  onLabelSets: PropTypes.func,
  onHoverLabel: PropTypes.func,
  onClickLabel: PropTypes.func,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function ClusterLabels({ dataset, cluster, embedding, selectedLabelId, onChange, onLabels, onLabelSets, onHoverLabel, onClickLabel}) {
  const [clusterLabelsJob, setClusterLabelsJob] = useState(null);
  const { startJob: startClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, `${apiUrl}/jobs/cluster_label`);
  const { startJob: rerunClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, `${apiUrl}/jobs/rerun`);

  const [localSelected, setLocalSelected] = useState(selectedLabelId || "default")
  useEffect(() => {
    setLocalSelected(selectedLabelId || "default")
  }, [selectedLabelId])

  const [chatModels, setChatModels] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/chat_models`)
      .then(response => response.json())
      .then(data => {
        setChatModels(data)
      }).catch(err => {
        console.log(err)
        setChatModels([])
      })
  }, []);

  // the models used to label a particular cluster (the ones the user has run)
  const [clusterLabelSets, setClusterLabelSets] = useState([]);
  // the actual labels for the given cluster
  const [clusterLabels, setClusterLabels] = useState([]);
  useEffect(() => {
    if(dataset && cluster && localSelected) {
      const id = localSelected.split("-")[3] || localSelected
      fetch(`${apiUrl}/datasets/${dataset.id}/clusters/${cluster.id}/labels/${id}`)
        .then(response => response.json())
        .then(data => {
          data.cluster_id = cluster.id
          setClusterLabels(data)
        }).catch(err => {
          console.log("ERROR", err)
          setClusterLabels([])
        })
    } else {
      setClusterLabels([])
    }
  }, [localSelected, dataset, cluster, clusterLabelSets])

  useEffect(() => {
    if(clusterLabels?.length) {
      onLabels(clusterLabels)
    }
  }, [clusterLabels, onLabels])

  useEffect(() => {
    if(cluster) {
      fetch(`${apiUrl}/datasets/${dataset.id}/clusters/${cluster.id}/labels_available`)
        .then(response => response.json())
        .then(data => {
          // console.log("cluster changed, labels available", cluster.id, data)
          const labelsAvailable = data.filter(d => d.cluster_id == cluster.id)
          let lbl;
          if(clusterLabelsJob) {
            if(clusterLabelsJob?.job_name == "label"){
              let label_id = clusterLabelsJob.run_id//.split("-")[3]
              let found = labelsAvailable.find(d => d.id == label_id)
              if(found) lbl = found
            } else if(clusterLabelsJob.job_name == "rm") {
              lbl = data[0]
            }
            // onChange(lbl)
          }  else if(localSelected){
            if(localSelected  == "default" && labelsAvailable[0]) {
              lbl = labelsAvailable[0]
            } else if(localSelected.indexOf(cluster.id) < 0 && labelsAvailable[0]) {
              lbl = labelsAvailable[0]
            } else {
              lbl = labelsAvailable.find(d => d.id == localSelected) || { id: "default" }
            }
          } else if(labelsAvailable[0]) {
            lbl = labelsAvailable[0]
          } else {
            lbl = { id: "default" }
          }
          // onLabelSets(labelsAvailable, lbl)
          setClusterLabelSets(labelsAvailable)
          onLabelSets(labelsAvailable)
        }).catch(err => {
          console.log(err)
          setClusterLabelSets([])
          onLabelSets([])
        })
    } else {
      setClusterLabelSets([])
      onLabelSets([])
    }
  }, [dataset, cluster, clusterLabelsJob, setClusterLabelSets, onLabelSets])
  
  


  const handleNewLabels= useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const model = data.get('chatModel')
    const text_column = embedding.text_column
    const cluster_id = cluster.id
    const context = data.get('context')
    startClusterLabelsJob({chat_id: model, cluster_id: cluster_id, text_column, context})
  }, [cluster, embedding, startClusterLabelsJob])

  function handleRerun(job) {
    rerunClusterLabelsJob({job_id: job?.id});
  }

  return (
    <div className="dataset--setup-cluster-labels-content">
      <div className="dataset--slides-new">
        <p>Automatically create labels for each cluster
          {cluster ? ` in ${cluster.id}` : ''} using a chat model. Default labels are created from the top 3 words in each cluster using nltk.</p>
        <form onSubmit={handleNewLabels}>
          <label>
            Chat Model:
            <select id="chatModel" name="chatModel" disabled={!!clusterLabelsJob}>
              {chatModels.filter(d => clusterLabelSets?.indexOf(d.id) < 0).map((model, index) => (
                <option key={index} value={model.id}>{model.provider} - {model.name}</option>
              ))}
            </select>
          </label>
          <textarea name="context" placeholder="Optional context for system prompt" disabled={!!clusterLabelsJob || !cluster}></textarea>
          <button type="submit" disabled={!!clusterLabelsJob || !cluster}>Auto Label</button>
        </form>

        <JobProgress job={clusterLabelsJob} clearJob={()=>setClusterLabelsJob(null)} killJob={setClusterLabelsJob} rerunJob={handleRerun} />

      </div>
      {cluster ? <div className="dataset--setup-cluster-labels-list">
        
        <div className="dataset--setup-labels-list">
          <DataTable 
            data={clusterLabels.map((d,i) => ({index: i, label: d.label, items: d.indices.length}))} 
            onHover={(index) => onHoverLabel(clusterLabels[index])}
            onClick={(index) => onClickLabel(clusterLabels[index])}
          />
        </div>
        <br></br>
          <button type="submit" onClick={() => onChange(localSelected)}>
          {clusterLabelSets.length >= 1 ? 
            "Use Labels" : 
            "Use Default Labels"
          }
          </button>
          {clusterLabelSets.length >= 1 ? <select 
            name="model" 
            value={localSelected}
            // onChange={(e) => onChange(e.target.value)}
            onChange={(e) => setLocalSelected(e.target.value)}
          >
            <option value="default">Default</option>
            {clusterLabelSets.map((model, index) => (
              <option key={index} value={model.id}>{model.id} - { model.model_id} </option>
            ))}
          </select> : <span>{clusterLabelSets[0]?.id}</span> }
      </div> : null}
    </div>
  );
}

export default ClusterLabels;