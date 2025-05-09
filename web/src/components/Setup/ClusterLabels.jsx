// NewEmbedding.jsx
import { useState, useEffect, useCallback } from 'react';
import { groups } from 'd3-array';

import { useStartJobPolling } from '../Job/Run';
import { apiService, apiUrl } from '../../lib/apiService';
import { debounce } from '../../utils';
import { useSetup } from '../../contexts/SetupContext';
import { Button, Modal } from 'react-element-forge';
import { Tooltip } from 'react-tooltip';

import ModelSelect from '../ModelSelect';
import JobProgress from '../Job/Progress';
import DataTable from '../DataTable';
import Settings from '../../pages/Settings';
import SettingsModal from '../SettingsModal';
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
  const { startJob: deleteClusterLabelsJob } = useStartJobPolling(
    dataset,
    setClusterLabelsJob,
    `${apiUrl}/jobs/delete/cluster_label`
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

  const [HFModels, setHFModels] = useState([]);
  const searchHFModels = useCallback((query) => {
    debounce(
      apiService.searchHFChatModels(query).then((hfm) => {
        console.log('hf chat models', hfm);
        setHFModels(hfm);
      }),
      300
    );
  }, []);

  const [presetModels, setPresetModels] = useState([]);
  useEffect(() => {
    apiService
      .fetchChatModels()
      .then((data) => {
        console.log('preset chat models', data);
        setPresetModels(data);
      })
      .catch(console.error);
  }, [setPresetModels]);

  const [customModels, setCustomModels] = useState([]);
  useEffect(() => {
    apiService.fetchCustomModels().then((data) => {
      console.log('custom models', data);
      setCustomModels(data);
    });
  }, [setCustomModels]);

  const [recentModels, setRecentModels] = useState([]);
  const fetchRecentModels = useCallback(() => {
    apiService.getRecentChatModels().then((data) => {
      console.log('recent chat models', data);
      setRecentModels(data?.slice(0, 3) || []);
    });
  }, []);

  const [ollamaModels, setOllamaModels] = useState([]);
  const fetchOllamaModels = useCallback(() => {
    apiService.fetchOllamaChatModels().then((data) => {
      console.log('ollama chat models', data);
      if (data && data.length) setOllamaModels(data);
    });
  }, [setOllamaModels]);

  useEffect(() => {
    fetchRecentModels();
    searchHFModels();
    fetchOllamaModels();
  }, [fetchRecentModels, searchHFModels, fetchOllamaModels]);

  // Build up the list of options for the Dropdown
  const [allModels, setAllModels] = useState([]);
  const [allOptionsGrouped, setAllOptionsGrouped] = useState([]);
  const [defaultModel, setDefaultModel] = useState(null);
  useEffect(() => {
    const am = [presetModels[0]]
      .concat(recentModels)
      .concat(customModels)
      .concat(ollamaModels)
      .concat(HFModels)
      .concat(presetModels.slice(1))
      .filter((d) => !!d);
    let allOptions = am
      .map((m) => {
        return {
          ...m,
          group: m.group || m.provider,
        };
      })
      .filter((f) => !!f);

    const grouped = groups(allOptions, (f) => f.group)
      .map((d) => ({ label: d[0], options: d[1] }))
      .filter((d) => d.options.length);

    // console.log("all options grouped", grouped)
    setAllOptionsGrouped(grouped);
    setAllModels(am);

    // we don't set a default option, so it's a more explicit choice of model
    const defaultOption = allOptions.find((option) => option.id == 'nltk-top-words');
    if (defaultOption && !defaultModel) {
      setDefaultModel(defaultOption);
      setChatModel(defaultOption.id);
    }
  }, [presetModels, HFModels, recentModels, defaultModel, customModels, ollamaModels]);

  useEffect(() => {
    setChatModel(defaultModel);
  }, [defaultModel]);

  const handleModelSelectChange = useCallback(
    (selectedOption) => {
      setDefaultModel(selectedOption);
      setChatModel(selectedOption);
    },
    [setDefaultModel, setChatModel]
  );

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
    if (clusterLabelsJob?.status == 'completed') {
      // && clusterLabelsJob?.job_name == 'label') {
      let label_id = clusterLabelsJob.run_id;
      let found = clusterLabelSets.find((d) => d.id == label_id);
      if (found) setSelected(found.id);
      if (!found) {
        setSelected('default');
      }
      setTimeout(() => {
        setClusterLabelsJob(null);
      }, 500);
    }
  }, [clusterLabelsJob, clusterLabelSets, setSelected]);

  const handleNewLabels = useCallback(
    (e) => {
      e.preventDefault();
      const form = e.target;
      const data = new FormData(form);
      const model = chatModel?.id;
      const text_column = embedding.text_column;
      const cluster_id = cluster.id;
      const context = data.get('context');
      const samples = data.get('samples');
      const max_tokens_per_sample = data.get('max_tokens_per_sample');
      const max_tokens_total = data.get('max_tokens_total');
      startClusterLabelsJob({
        chat_id: model,
        cluster_id: cluster_id,
        text_column,
        context,
        samples,
        max_tokens_per_sample,
        max_tokens_total,
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

  const handleSettingsClose = useCallback(() => {
    console.log('CLOSING SETTINGS');
    apiService.fetchCustomModels().then((data) => {
      console.log('FETCHED CUSTOM MODELS', data);
      setCustomModels(data);
    });
  }, [setCustomModels]);

  return (
    <div className={styles['cluster-labels']}>
      <div className={styles['cluster-labels-setup']}>
        <div className={styles['cluster-labels-form']}>
          <p>
            Automatically create labels for each cluster
            {cluster ? ` in ${cluster.id}` : ''} using a chat model. For quickest CPU based results
            use nltk top-words.
          </p>
          <form>
            <label>
              <span className={styles['cluster-labels-form-label']}>Chat Model:</span>
              <ModelSelect
                options={allOptionsGrouped}
                defaultValue={defaultModel}
                onChange={handleModelSelectChange}
                onInputChange={searchHFModels}
              />
            </label>
            <label>
              <SettingsModal
                tooltip="Configure API keys for 3rd party models or add custom models via URL."
                color="primary"
                onClose={() => handleSettingsClose()}
              />
            </label>
          </form>
          <form onSubmit={handleNewLabels}>
            <label>
              <span className={styles['cluster-labels-form-label']}>Samples:</span>
              <input
                type="number"
                name="samples"
                defaultValue={10}
                min={0}
                disabled={!!clusterLabelsJob || !cluster}
              />
              <span className="tooltip" data-tooltip-id="samples">
                🤔
              </span>
              <Tooltip id="samples" place="top" effect="solid" className="tooltip-area">
                The number of items to use from each cluster for summarization. Set to 0 to use all
                items. Items are chosen based on distance from the centroid of the cluster.
              </Tooltip>
            </label>
            <label>
              <span className={styles['cluster-labels-form-label']}>Max Tokens per Sample:</span>
              <input
                type="number"
                name="max_tokens_per_sample"
                defaultValue={scope?.embedding?.max_seq_length || 512}
                min={-1}
                disabled={!!clusterLabelsJob || !cluster}
              />
              <span className="tooltip" data-tooltip-id="max_tokens_per_sample">
                🤔
              </span>
              <Tooltip
                id="max_tokens_per_sample"
                place="top"
                effect="solid"
                className="tooltip-area"
              >
                The maximum number of tokens per sample to use, truncates long samples to max
                tokens. Set to -1 to ignore limits.
              </Tooltip>
            </label>
            <label>
              <span className={styles['cluster-labels-form-label']}>Max Tokens Total:</span>
              <input
                type="number"
                name="max_tokens_total"
                defaultValue={chatModel?.params?.max_tokens || 8192}
                min={-1}
                disabled={!!clusterLabelsJob || !cluster}
              />
              <span className="tooltip" data-tooltip-id="max_tokens_total">
                🤔
              </span>
              <Tooltip id="max_tokens_total" place="top" effect="solid" className="tooltip-area">
                The maximum number of tokens to use for across all samples. Set to -1 to ignore
                limits.
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

                  {cl?.id != 'default' && (
                    <Button
                      className={styles['delete']}
                      color="secondary"
                      onClick={() => deleteClusterLabelsJob({ cluster_labels_id: cl.id })}
                      text="🗑️"
                    />
                  )}
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
