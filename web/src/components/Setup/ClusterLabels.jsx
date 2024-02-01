// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import JobProgress from '../JobProgress';
import { useStartJobPolling } from '../JobRun';
import DataTable from '../DataTable';
const apiUrl = import.meta.env.VITE_API_URL

// import styles from './Cluster.module.css';

import PropTypes from 'prop-types';
ClusterLabels.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.string.isRequired
  }).isRequired,
  cluster: PropTypes.object,
  selectedModel: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onLabels: PropTypes.func,
  onHoverLabel: PropTypes.func,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function ClusterLabels({ dataset, cluster, selectedModel, onChange, onLabels, onHoverLabel}) {
  const [clusterLabelsJob, setClusterLabelsJob] = useState(null);
  const { startJob: startClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, `${apiUrl}/jobs/cluster_label`);

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
    if(dataset && cluster) {
      fetch(`${apiUrl}/datasets/${dataset.id}/clusters/${cluster.id}/labels/${selectedModel}`)
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
  }, [selectedModel, setClusterLabels, dataset, cluster, clusterLabelModels])

  useEffect(() => {
    if(cluster) {
      fetch(`${apiUrl}/datasets/${dataset.id}/clusters/${cluster.id}/labels_available`)
        .then(response => response.json())
        .then(data => {
          console.log("cluster changed, set label models fetched", cluster.id, data)
          setClusterLabelModels(data)
        }).catch(err => {
          console.log(err)
          setClusterLabelModels([])
        })
    } else {
      setClusterLabelModels([])
    }
  }, [dataset, cluster, clusterLabelsJob, setClusterLabelModels])
  
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

        <JobProgress job={clusterLabelsJob} clearJob={()=>setClusterLabelsJob(null)} />

      </div>
      {cluster ? <div className="dataset--setup-cluster-labels-list">
        <label>
          View Labels:
          <select 
            name="model" 
            value={selectedModel}
            onChange={(e) => onChange(e.target.value)}
          >
            {clusterLabelModels.map((model, index) => (
              <option key={index} value={model}>{model}</option>
            ))}
          </select>
        </label>
        <div className="dataset--setup-labels-list">
          <DataTable data={clusterLabels.map((d,i) => ({index: i, label: d.label, items: d.indices.length}))} onHover={(index) => onHoverLabel(clusterLabels[index])}/>
        </div>
      </div> : null}
    </div>
  );
}

export default ClusterLabels;