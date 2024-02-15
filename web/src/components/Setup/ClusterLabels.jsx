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
  cluster: PropTypes.object,
  selectedLabelId: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onLabels: PropTypes.func,
  onLabelIds: PropTypes.func,
  onHoverLabel: PropTypes.func,
  onClickLabel: PropTypes.func,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function ClusterLabels({ dataset, cluster, selectedLabelId, onChange, onLabels, onLabelIds, onHoverLabel, onClickLabel}) {
  const [clusterLabelsJob, setClusterLabelsJob] = useState(null);
  const { startJob: startClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, `${apiUrl}/jobs/cluster_label`);
  const { startJob: rerunClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, `${apiUrl}/jobs/rerun`);

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
  const [clusterLabelModels, setClusterLabelModels] = useState([]);
  // the actual labels for the given cluster
  const [clusterLabels, setClusterLabels] = useState([]);
  useEffect(() => {
    console.log("in cluster labels", dataset, cluster, selectedLabelId)
    if(dataset && cluster && selectedLabelId) {
      fetch(`${apiUrl}/datasets/${dataset.id}/clusters/${cluster.id}/labels/${selectedLabelId}`)
        .then(response => response.json())
        .then(data => {
          setClusterLabels(data)
        }).catch(err => {
          console.log(err)
          setClusterLabels([])
        })
      } else {
        setClusterLabels([])
      }
  }, [selectedLabelId, setClusterLabels, dataset, cluster, clusterLabelModels])

  useEffect(() => {
    if(cluster) {
      fetch(`${apiUrl}/datasets/${dataset.id}/clusters/${cluster.id}/labels_available`)
        .then(response => response.json())
        .then(data => {
          console.log("cluster changed, set label models fetched", cluster.id, data, clusterLabelsJob)
          if(clusterLabelsJob) {
            let lbl;
            if(clusterLabelsJob?.job_name == "label"){
              let label_id = clusterLabelsJob.run_id.split("-")[3]
              lbl = data.find(d => d == label_id)
              console.log("label_id", label_id, lbl)
            } else if(clusterLabelsJob.job_name == "rm") {
              lbl = data[0]
            }
            onLabelIds(data.map(id => ({cluster_id: cluster.id, id: id})), lbl)
            // onChange(lbl)
          }  else {
            onLabelIds(data.map(id => ({cluster_id: cluster.id, id: id})))
          }
          setClusterLabelModels(data)
        }).catch(err => {
          console.log(err)
          setClusterLabelModels([])
          onLabelIds([])
        })
    } else {
      setClusterLabelModels([])
      onLabelIds([])
    }
  }, [dataset, cluster, clusterLabelsJob, setClusterLabelModels, onLabelIds])
  
  useEffect(() => {
    if(clusterLabels?.length) {
      onLabels(clusterLabels)
    }
  }, [clusterLabels, onLabels])


  const handleNewLabels= useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const model = data.get('chatModel')
    const text_column = dataset.text_column
    const cluster_id = cluster?.id
    const context = data.get('context')
    startClusterLabelsJob({chat_id: model, cluster_id: cluster_id, text_column, context})
  }, [dataset, cluster, startClusterLabelsJob])

  function handleRerun(job) {
    rerunJob({job_id: job?.id});
  }

  return (
    <div className="dataset--setup-cluster-labels-content">
      <div className="dataset--slides-new">
        <p>Automatically create labels for each cluster
          {cluster ? ` in ${cluster.cluster_id}` : ''} using a chat model. </p>
        <form onSubmit={handleNewLabels}>
          <label>
            Chat Model:
            <select id="chatModel" name="chatModel" disabled={!!clusterLabelsJob}>
              {chatModels.filter(d => clusterLabelModels?.indexOf(d.id) < 0).map((model, index) => (
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
        <label>
          Use Labels: &nbsp;
          {clusterLabelModels.length > 1 ? <select 
            name="model" 
            value={selectedLabelId}
            onChange={(e) => onChange(e.target.value)}
          >
            {clusterLabelModels.map((model, index) => (
              <option key={index} value={model}>{model}</option>
            ))}
          </select> : <span>{clusterLabelModels[0]}</span> }
        </label>
        <div className="dataset--setup-labels-list">
          <DataTable 
            data={clusterLabels.map((d,i) => ({index: i, label: d.label, items: d.indices.length}))} 
            onHover={(index) => onHoverLabel(clusterLabels[index])}
            onClick={(index) => onClickLabel(clusterLabels[index])}
          />
        </div>
      </div> : null}
    </div>
  );
}

export default ClusterLabels;