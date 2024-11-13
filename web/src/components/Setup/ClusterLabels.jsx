// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { useStartJobPolling } from '../Job/Run';
import { apiService, apiUrl } from '../../lib/apiService';
import { useSetup } from '../../contexts/SetupContext';
import { Button, Select } from 'react-element-forge';
import { Tooltip } from 'react-tooltip';

import JobProgress from '../Job/Progress';
import DataTable from '../DataTable';

import styles from './ClusterLabels.module.scss';

function labelName(labelId) {
  if (!labelId) return '';
  return labelId == 'default' ? 'label-default' : labelId.split('-').slice(2).join('-');
}

// This component is responsible for the embeddings state
// New embeddings update the list
function ClusterLabels() {
  const { datasetId, dataset, scope, savedScope, updateScope, goToNextStep, setPreviewLabel } =
    useSetup();
  const [clusterLabelsJob, setClusterLabelsJob] = useState(null);
  const { startJob: startClusterLabelsJob } = useStartJobPolling(
    dataset,
    setClusterLabelsJob,
    `${apiUrl}/jobs/cluster_label`
  );
  const { startJob: rerunClusterLabelsJob } = useStartJobPolling(
    dataset,
    setClusterLabelsJob,
    `${apiUrl}/jobs/rerun`
  );

  const [selected, setSelected] = useState('default');
  const [embedding, setEmbedding] = useState(null);
  const [cluster, setCluster] = useState(null);

  const [embeddings, setEmbeddings] = useState([]);
  const [clusters, setClusters] = useState([]);

  const [chatModel, setChatModel] = useState(null);
  // the models used to label a particular cluster (the ones the user has run)
  const [clusterLabelSets, setClusterLabelSets] = useState([]);
  // the actual labels for the given cluster
  const [clusterLabelData, setClusterLabelData] = useState([]);

  useEffect(() => {
    setPreviewLabel(labelName(selected));
  }, [selected, setPreviewLabel]);

  // Update local state when scope changes
  useEffect(() => {
    if (scope?.embedding_id) {
      const emb = embeddings.find((e) => e.id == scope.embedding_id);
      setEmbedding(emb);
    }
    if (scope?.cluster_id) {
      const cl = clusters?.find((c) => c.id == scope.cluster_id);
      setCluster(cl);
    }
    if (scope?.cluster_labels_id) {
      // const cl = clusterLabelSets?.find(c => c.id == scope.cluster_labels_id)
      setSelected(scope.cluster_labels_id);
    }
  }, [scope, clusters, embeddings]);

  // Fetch initial data
  useEffect(() => {
    if (dataset) {
      apiService.fetchEmbeddings(dataset?.id).then((embs) => setEmbeddings(embs));
      apiService.fetchClusters(dataset?.id).then((cls) => setClusters(cls));
    }
  }, [dataset]);

  const [chatModels, setChatModels] = useState([]);
  useEffect(() => {
    apiService
      .fetchChatModels()
      .then((data) => {
        setChatModels(data);
        setChatModel(data[0]?.id);
      })
      .catch((err) => {
        console.log(err);
        setChatModels([]);
      });
  }, []);

  useEffect(() => {
    if (datasetId && cluster && selected) {
      const id = selected.split('-')[3] || selected;
      apiService
        .fetchClusterLabels(datasetId, cluster.id, id)
        .then((data) => {
          data.cluster_id = cluster.id;
          setClusterLabelData(data);
        })
        .catch((err) => {
          console.log('ERROR', err);
          setClusterLabelData([]);
        });
    } else {
      setClusterLabelData([]);
    }
  }, [selected, datasetId, cluster]);

  useEffect(() => {
    if (cluster) {
      apiService
        .fetchClusterLabelsAvailable(datasetId, cluster.id)
        .then((data) => {
          // console.log("cluster changed, labels available", cluster.id, data)
          const labelsAvailable = data.filter((d) => d.cluster_id == cluster.id);
          let lbl;
          const defaultLabel = { id: 'default', model_id: 'N/A', cluster_id: cluster.id };
          if (selected) {
            // console.log("selected", selected)
            lbl = labelsAvailable.find((d) => d.id == selected) || defaultLabel;
            // console.log("found?", lbl, labelsAvailable)
          } else if (labelsAvailable[0]) {
            lbl = labelsAvailable[0];
          } else {
            lbl = defaultLabel;
          }
          setClusterLabelSets([...labelsAvailable, defaultLabel]);
          // setSelected(lbl?.id)
        })
        .catch((err) => {
          console.log(err);
          setClusterLabelSets([]);
        });
    } else {
      setClusterLabelSets([]);
    }
  }, [datasetId, selected, cluster, clusterLabelsJob, setClusterLabelSets, setSelected]);

  useEffect(() => {
    if (clusterLabelsJob?.status == 'completed' && clusterLabelsJob?.job_name == 'label') {
      let label_id = clusterLabelsJob.run_id;
      let found = clusterLabelSets.find((d) => d.id == label_id);
      if (found) setSelected(found.id);
    }
  }, [clusterLabelsJob, clusterLabelSets, setSelected]);

  const handleNewLabels = useCallback(
    (e) => {
      e.preventDefault();
      const form = e.target;
      const data = new FormData(form);
      const model = chatModel;
      const text_column = embedding.text_column;
      const cluster_id = cluster.id;
      const context = data.get('context');
      const samples = data.get('samples');
      startClusterLabelsJob({
        chat_id: model,
        cluster_id: cluster_id,
        text_column,
        context,
        samples,
      });
    },
    [cluster, embedding, chatModel, startClusterLabelsJob]
  );

  function handleRerun(job) {
    rerunClusterLabelsJob({ job_id: job?.id });
  }

  const handleKill = useCallback(
    (job) => {
      apiService
        .killJob(datasetId, job.id)
        .then((data) => {
          console.log('killed job', data);
          setClusterLabelsJob(data);
        })
        .catch(console.error);
    },
    [datasetId]
  );

  const handleNextStep = useCallback(() => {
    if (savedScope?.cluster_labels_id == selected && savedScope?.cluster_id == cluster.id) {
      updateScope({ ...savedScope });
    } else {
      updateScope({ cluster_labels_id: selected, id: null });
    }
    goToNextStep();
  }, [updateScope, goToNextStep, selected, savedScope, cluster]);

  return (
    <div className={styles['cluster-labels']}>
      <div className={styles['cluster-labels-setup']}>
        <div className={styles['cluster-labels-form']}>
          <p>
            Automatically create labels for each cluster
            {cluster ? ` in ${cluster.id}` : ''} using a chat model. For quickest CPU based results
            use nltk top-words.
          </p>
          <form onSubmit={handleNewLabels}>
            <label>
              <span className={styles['cluster-labels-form-label']}>Chat Model:</span>
              <Select
                id="chatModel"
                disabled={!!clusterLabelsJob}
                options={chatModels
                  .filter((d) => clusterLabelSets?.indexOf(d.id) < 0)
                  .map((model) => ({
                    label: `${model.provider} - ${model.name}`,
                    value: model.id,
                  }))}
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
              />
            </label>
            <label>
              <span className={styles['cluster-labels-form-label']}>Samples:</span>
              <input
                type="number"
                name="samples"
                value={10}
                min={0}
                disabled={!!clusterLabelsJob || !cluster}
              />
              <span className="tooltip" data-tooltip-id="samples">
                🤔
              </span>
              <Tooltip id="samples" place="top" effect="solid" className="tooltip-area">
                The number of samples to use from each cluster for summarization. Set to 0 to use
                all samples.
              </Tooltip>
            </label>
            <textarea
              name="context"
              placeholder="Optional context for system prompt"
              disabled={!!clusterLabelsJob || !cluster}
            />
            <Button
              type="submit"
              color={clusterLabelsJob ? 'secondary' : 'primary'}
              disabled={!!clusterLabelsJob || !cluster}
              text="Auto Label"
            />
          </form>

          <JobProgress
            job={clusterLabelsJob}
            clearJob={() => setClusterLabelsJob(null)}
            killJob={handleKill}
            rerunJob={handleRerun}
          />
        </div>
        <div className={styles['cluster-labels-list']}>
          {cluster &&
            clusterLabelSets
              .filter((d) => d.cluster_id == cluster.id)
              .map((cl, index) => (
                <div
                  className={styles['item'] + (cl.id == selected ? ' ' + styles['selected'] : '')}
                  key={index}
                >
                  <label htmlFor={`cluster${index}`}>
                    <input
                      type="radio"
                      id={`cluster${index}`}
                      name="cluster"
                      value={cl.id}
                      checked={cl.id === selected}
                      onChange={() => setSelected(cl.id)}
                    />
                    <span>
                      {labelName(cl.id)}{' '}
                      {cl.id == savedScope?.cluster_labels_id && (
                        <span className="tooltip" data-tooltip-id="saved">
                          💾
                        </span>
                      )}
                    </span>
                    <div className={styles['item-info']}>
                      <span>Model: {cl.model_id}</span>
                      {cl.context && (
                        <span>
                          Context: <code style={{ width: '100%' }}>{cl.context}</code>
                        </span>
                      )}
                      {cl.samples && <span>Samples: {cl.samples}</span>}
                    </div>
                  </label>

                  {selected == cl.id ? (
                    <div className={styles['navigate']}>
                      <Button
                        disabled={!selected}
                        onClick={handleNextStep}
                        text={`Proceed with ${labelName(selected)}`}
                      />
                    </div>
                  ) : null}

                  <span></span>

                  {/* <Button className={styles["delete"]} color="secondary" onClick={() => handleKill(cl)} text="🗑️" /> */}
                </div>
              ))}
        </div>
      </div>

      {cluster && (
        <div className={styles['cluster-labels-preview']}>
          <div className={styles['preview']}>
            {/* <div className={styles["preview-header"]}>
                  <h3>Preview: {labelName(selected)}</h3>
              </div> */}
            <div className={styles['cluster-labels-table']}>
              <DataTable
                data={clusterLabelData.map((d, i) => ({
                  index: i,
                  label: d.label,
                  items: d.indices.length,
                }))}
              />
            </div>
          </div>
          <div className={styles['navigate']}>
            <Button
              disabled={!selected}
              onClick={handleNextStep}
              text={selected ? `Proceed with ${labelName(selected)}` : 'Select a Label'}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ClusterLabels;
