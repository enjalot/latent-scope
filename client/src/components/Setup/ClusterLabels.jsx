// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import JobProgress from '../JobProgress';
import { useStartJobPolling } from '../JobRun';
import DataTable from '../DataTable';

// import styles from './Cluster.module.css';

import PropTypes from 'prop-types';
ClusterLabels.propTypes = {
  dataset: PropTypes.shape({
    id: PropTypes.number.isRequired
  }).isRequired,
  cluster: PropTypes.object,
  selectedModel: PropTypes.string,
  onNew: PropTypes.func.isRequired,
  onChange: PropTypes.func.isRequired,
};

// This component is responsible for the embeddings state
// New embeddings update the list
function ClusterLabels({ dataset, cluster, selectedModel, onChange}) {
  const [clusterLabelsJob, setClusterLabelsJob] = useState(null);
  const { startJob: startClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, 'http://localhost:5001/jobs/cluster_label');

  const [chatModels, setChatModels] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/chat_models`)
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
      const endpoint = selectedModel ? `labels/${selectedModel}` : 'labels'
      fetch(`http://localhost:5001/datasets/${dataset.id}/clusters/${cluster.cluster_name}/${endpoint}`)
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
  }, [selectedModel, setClusterLabels, dataset, cluster])

  useEffect(() => {
    console.log("cluster changed, set label models", cluster?.cluster_name)
    if(cluster) {
      fetch(`http://localhost:5001/datasets/${dataset.id}/clusters/${cluster.cluster_name}/labels_available`)
        .then(response => response.json())
        .then(data => {
          console.log("cluster changed, set label models fetched", cluster.cluster_name, data)
          setClusterLabelModels(data)
        }).catch(err => {
          console.log(err)
          setClusterLabelModels([])
        })
    } else {
      setClusterLabelModels([])
    }
  }, [dataset, cluster, clusterLabelsJob, setClusterLabelModels])

  
  // useEffect(() => {
  //   fetchClusters(dataset.id, (clstrs) => {
  //     setClusters(clstrs)
  //     onNew(clstrs)
  //   })
  // }, [dataset, onNew]);

  // useEffect(() => {
  //   if(clusterJob?.status == "completed") {
  //     fetchClusters(dataset.id, (clstrs) => {
  //       setClusters(clstrs)
  //       onNew(clstrs)
  //     })
  //   }
  // }, [clusterJob, dataset, setClusters, onNew]);
  const handleNewLabels= useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const model = data.get('chatModel')
    const text_column = dataset.text_column
    const cluster_name = cluster.cluster_name
    const context = data.get('context')
    startClusterLabelsJob({model, cluster: cluster_name, text_column, context})
  }, [cluster, startClusterLabelsJob])

  return (
    <div className="dataset--setup-cluster-labels-content">
      <div className="dataset--slides-new">
        <p>Automatically create labels for each cluster in 
          {cluster.cluster_name}</p>
        <form onSubmit={handleNewLabels}>
          <label>
            Chat Models:
            <select id="chatModel" name="chatModel" disabled={!!clusterLabelsJob}>
              {chatModels.filter(d => clusterLabelModels?.indexOf(d.id) < 0).map((model, index) => (
                <option key={index} value={model.id}>{model.provider} - {model.name}</option>
              ))}
            </select>
            <br></br>
            <textarea name="context" disabled={!!clusterLabelsJob}></textarea>
          </label>
          <button type="submit">Auto Label</button>
        </form>

        <JobProgress job={clusterLabelsJob} clearJob={()=>setClusterLabelsJob(null)} />

      </div>
      <div className="dataset--setup-cluster-labels-list">
        <label>
          View Labels:
          <select 
            name="model" 
            value={selectedModel}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Default labels</option>
            {clusterLabelModels.map((model, index) => (
              <option key={index} value={model}>{model}</option>
            ))}
          </select>
        </label>
        <div className="dataset--setup-labels-list">
          <DataTable data={clusterLabels.map((d,i) => ({cluster: i, label: d.label, items: d.indices.length}))} />
        </div>
      </div>
    </div>
  );
}

export default ClusterLabels;