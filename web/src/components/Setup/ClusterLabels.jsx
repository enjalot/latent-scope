// NewEmbedding.jsx
import { useState, useEffect, useCallback} from 'react';
import { useStartJobPolling } from '../Job/Run';
import { apiService, apiUrl } from '../../lib/apiService';
import { useSetup } from '../../contexts/SetupContext';
import { Button } from 'react-element-forge';

import JobProgress from '../Job/Progress';
import DataTable from '../DataTable';

import styles from './ClusterLabels.module.scss';

function labelName(labelId) {
  return labelId == "default" ? "label-default" : labelId.split("-").slice(2).join("-")
}

// This component is responsible for the embeddings state
// New embeddings update the list
function ClusterLabels() {
  const { datasetId, dataset, scope, updateScope, goToNextStep } = useSetup();
  const [clusterLabelsJob, setClusterLabelsJob] = useState(null);
  const { startJob: startClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, `${apiUrl}/jobs/cluster_label`);
  const { startJob: rerunClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, `${apiUrl}/jobs/rerun`);

  const [selected, setSelected] = useState("default")
  const [embedding, setEmbedding] = useState(null);
  const [cluster, setCluster] = useState(null);

  const [embeddings, setEmbeddings] = useState([]);
  const [clusters, setClusters] = useState([]);

  // Update local state when scope changes
  useEffect(() => {
    if(scope?.embedding_id) {
      const emb = embeddings.find(e => e.id == scope.embedding_id)
      setEmbedding(emb)
    } 
    if(scope?.cluster_id) {
      const cl = clusters?.find(c => c.id == scope.cluster_id)
      setCluster(cl)
    } 
  }, [scope, clusters, embeddings])

  // Fetch initial data
  useEffect(() => {
    if(dataset) {
      apiService.fetchEmbeddings(dataset?.id).then(embs => setEmbeddings(embs))
      apiService.fetchClusters(dataset?.id).then(cls => setClusters(cls))
    }
  }, [dataset])

  const [chatModels, setChatModels] = useState([]);
  useEffect(() => {
    apiService.fetchChatModels()
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
  const [clusterLabelData, setClusterLabelData] = useState([]);
  useEffect(() => {
    if(datasetId && cluster && selected) {
      const id = selected.split("-")[3] || selected
      apiService.fetchClusterLabels(datasetId, cluster.id, id)
        .then(data => {
          data.cluster_id = cluster.id
          setClusterLabelData(data)
        }).catch(err => {
          console.log("ERROR", err)
          setClusterLabelData([])
        })
    } else {
      setClusterLabelData([])
    }
  }, [selected, datasetId, cluster])

  useEffect(() => {
    if(cluster) {
      apiService.fetchClusterLabelsAvailable(datasetId, cluster.id)
        .then(data => {
          // console.log("cluster changed, labels available", cluster.id, data)
          const labelsAvailable = data.filter(d => d.cluster_id == cluster.id)
          let lbl;
          const defaultLabel = { id: "default", model_id: "N/A", cluster_id: cluster.id }
          if(selected){
            lbl = labelsAvailable.find(d => d.id == selected) || defaultLabel
          } else if(labelsAvailable[0]) {
            lbl = labelsAvailable[0]
          } else {
            lbl = defaultLabel
          }
          setClusterLabelSets([...labelsAvailable, defaultLabel])
          setSelected(lbl?.id)
        }).catch(err => {
          console.log(err)
          setClusterLabelSets([])
        })
    } else {
      setClusterLabelSets([])
    }
  }, [datasetId, selected, cluster, clusterLabelsJob, setClusterLabelSets, setSelected])

  useEffect(() => {
    if(clusterLabelsJob?.status == "completed" && clusterLabelsJob?.job_name == "label") {
      let label_id = clusterLabelsJob.run_id
      let found = clusterLabelSets.find(d => d.id == label_id)
      if(found) setSelected(found.id)
    }
  }, [clusterLabelsJob, clusterLabelSets, setSelected])

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

  const handleKill = useCallback((job) => {
    apiService.killJob(datasetId, job.id)
      .then(data => {
        console.log("killed job", data);
        setClusterLabelsJob(data)
      })
      .catch(console.error);
  }, [datasetId])

  return (
    <div className={styles["cluster-labels"]}>
      <div className={styles["cluster-labels-setup"]}>
        <div className={styles["cluster-form"]}>
          <p>Automatically create labels for each cluster
            {cluster ? ` in ${cluster.id}` : ''} using a chat model. Default labels are created from the top 3 words in each cluster using nltk.</p>
          <form onSubmit={handleNewLabels}>
            <label>
              <span className={styles["cluster-labels-form-label"]}>Chat Model:</span>
              <select id="chatModel" name="chatModel" disabled={!!clusterLabelsJob}>
                {chatModels.filter(d => clusterLabelSets?.indexOf(d.id) < 0).map((model, index) => (
                  <option key={index} value={model.id}>{model.provider} - {model.name}</option>
                ))}
              </select>
            </label>
            <textarea 
              name="context" 
              placeholder="Optional context for system prompt" 
              disabled={!!clusterLabelsJob || !cluster}
            />
            <Button type="submit" color={clusterLabelsJob ? "secondary" : "primary"} disabled={!!clusterLabelsJob || !cluster} text="Auto Label" />
          </form>

          <JobProgress 
            job={clusterLabelsJob} 
            clearJob={() => setClusterLabelsJob(null)} 
            killJob={handleKill} 
            rerunJob={handleRerun} 
          />
        </div>
        <div className={styles["cluster-labels-list"]}>
          {cluster && clusterLabelSets.filter(d => d.cluster_id == cluster.id).map((cl, index) => (
            <div className={styles["item"]} key={index}>
              <label htmlFor={`cluster${index}`}>
                <input type="radio" 
                  id={`cluster${index}`} 
                  name="cluster" 
                  value={cl.id} 
                  checked={cl.id === selected} 
                  onChange={() => setSelected(cl.id)} />
                <span>{labelName(cl.id)}</span>
                <div className={styles["item-info"]}>
                  <span>Model: {cl.model_id}</span>
                  <span>Context: <code style={{width: "100%"}}>{cl.context}</code></span>
                </div>
              </label>
              {/* <Button className={styles["delete"]} color="secondary" onClick={() => handleKill(cl)} text="🗑️" /> */}
            </div>
          ))}
        </div>
      </div>

        {cluster && (
          <div className={styles["cluster-labels-preview"]}>
            <div className={styles["preview"]}>
              <div className={styles["preview-header"]}>
                  <h3>Preview: {labelName(selected)}</h3>
              </div>
              <div className={styles["cluster-labels-table"]}>
                <DataTable 
                  data={clusterLabelData.map((d,i) => ({
                    index: i, 
                    label: d.label, 
                    items: d.indices.length
                  }))} 
                />
              </div>
            </div>
            <div className={styles["navigate"]}>
              <Button 
                disabled={!selected}
                onClick={() => {
                  updateScope({cluster_labels_id: selected})
                  goToNextStep()
                }}
                text={selected ? `Proceed with ${labelName(selected)}` : "Select a Label"}
              />
            </div> 
          </div>
        )}
    </div>
  );
}

export default ClusterLabels;