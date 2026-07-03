// NewEmbedding.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Tooltip } from 'react-tooltip';
import { Select, Button } from 'react-element-forge';

import { groups } from 'd3-array';

import ModelSelect from '../ModelSelect';
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';
import { useSetup } from '../../contexts/SetupContext';
import { apiService, apiUrl } from '../../lib/apiService';
import {
  isImageColumn,
  modelSupportsImages,
  filterModelsForColumn,
} from '../../lib/embeddingColumns';
import { getSaeForModel } from '../../lib/SAE';
import { debounce } from '../../utils';
import SettingsModal from '../SettingsModal';

import Sae from './Sae';
import Preview from './Preview';
import EstimatePanel from './EstimatePanel';

import styles from './Embedding.module.scss';

function Embedding() {
  const {
    datasetId,
    dataset,
    scope,
    savedScope,
    setDataset,
    updateScope,
    goToNextStep,
    setPreviewLabel,
  } = useSetup();

  const [textColumn, setTextColumn] = useState(null);
  const [embedding, setEmbedding] = useState(null);
  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [sae, setSae] = useState(null);

  const [embeddingFormats, setEmbeddingFormats] = useState({});
  const [migratingId, setMigratingId] = useState(null);

  const [modelId, setModelId] = useState(null);
  // for the models that support choosing the size of dimensions
  const [dimensions] = useState(null);

  // metadata for the currently selected column; image columns are embedded
  // as images by the backend and only image-capable models apply
  const textColumnMeta = dataset?.column_metadata?.[textColumn];
  const imageColumn = isImageColumn(textColumnMeta);

  const [embeddingsJob, setEmbeddingsJob] = useState(null);
  const { startJob: startEmbeddingsJob } = useStartJobPolling(
    dataset,
    setEmbeddingsJob,
    `${apiUrl}/jobs/embed`
  );
  const { startJob: deleteEmbeddingsJob } = useStartJobPolling(
    dataset,
    setEmbeddingsJob,
    `${apiUrl}/jobs/delete/embedding`
  );
  const { startJob: rerunEmbeddingsJob } = useStartJobPolling(
    dataset,
    setEmbeddingsJob,
    `${apiUrl}/jobs/rerun`
  );
  const { startJob: startEmbeddingsTruncateJob } = useStartJobPolling(
    dataset,
    setEmbeddingsJob,
    `${apiUrl}/jobs/embed_truncate`
  );
  const { startJob: startEmbeddingsImporterJob } = useStartJobPolling(
    dataset,
    setEmbeddingsJob,
    `${apiUrl}/jobs/embed_importer`
  );

  useEffect(() => {
    setPreviewLabel(embedding?.id);
  }, [embedding, setPreviewLabel]);

  useEffect(() => {
    if (scope?.embedding_id) {
      console.log('scope changed', scope);
      const emb = embeddings.find((e) => e.id == scope.embedding_id);
      setEmbedding(emb);
    } else {
      setEmbedding(embeddings?.[0]);
    }
  }, [scope, embeddings]);
  useEffect(() => {
    console.log('saved scope changed', savedScope);
  }, [savedScope]);

  useEffect(() => {
    if (dataset) {
      apiService.fetchEmbeddings(dataset?.id).then((embs) => {
        setEmbeddings(embs);
        // Fetch format for each embedding
        embs.forEach((emb) => {
          apiService.fetchEmbeddingFormat(dataset.id, emb.id).then((data) => {
            setEmbeddingFormats((prev) => ({ ...prev, [emb.id]: data.format }));
          });
        });
      });
      apiService.fetchUmaps(dataset?.id).then((ums) => setUmaps(ums));
      apiService.fetchClusters(dataset?.id).then((cls) => setClusters(cls));
      setTextColumn(dataset?.text_column);
    }
  }, [dataset, setEmbeddings, setUmaps, setClusters]);

  const [HFModels, setHFModels] = useState([]);
  const searchHFModels = useMemo(
    () =>
      debounce((query) => {
        apiService.searchHFSTModels(query).then((hfm) => {
          setHFModels(hfm);
        });
      }, 300),
    []
  );

  const [presetModels, setPresetModels] = useState([]);
  useEffect(() => {
    apiService
      .getEmbeddingModels()
      .then((data) => {
        setPresetModels(data);
      })
      .catch(console.error);
  }, [setPresetModels]);

  const [customEmbeddingModels, setCustomEmbeddingModels] = useState([]);
  const fetchCustomEmbeddingModels = useCallback(() => {
    apiService
      .fetchCustomEmbeddingModels()
      .then((data) => {
        const models = (data || []).map((m) => ({
          ...m,
          group: 'custom',
        }));
        setCustomEmbeddingModels(models);
      })
      .catch(console.error);
  }, []);
  useEffect(() => {
    fetchCustomEmbeddingModels();
  }, [fetchCustomEmbeddingModels]);

  const [recentModels, setRecentModels] = useState([]);
  const fetchRecentModels = useCallback(() => {
    apiService.getRecentEmbeddingModels().then((data) => {
      setRecentModels(data?.slice(0, 3) || []);
    });
  }, []);

  useEffect(() => {
    fetchRecentModels();
    searchHFModels();
  }, [fetchRecentModels, searchHFModels]);

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
    - custom embedding models (OpenAI-compatible APIs)

  */
  const [allModels, setAllModels] = useState([]);
  const [allOptionsGrouped, setAllOptionsGrouped] = useState([]);
  const [defaultModel, setDefaultModel] = useState(null);
  useEffect(() => {
    const am = customEmbeddingModels
      .concat(recentModels)
      .concat(HFModels)
      .concat(presetModels)
      .filter((d) => !!d);
    // only offer models compatible with the selected column: image columns
    // get image-capable models only; text columns exclude image-only models
    let allOptions = filterModelsForColumn(am, textColumnMeta)
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
    // const defaultOption = allOptions.find(option => option.name.indexOf("all-MiniLM-L6-v2") > -1);
    // if (defaultOption && !defaultModel) {
    //   setDefaultModel(defaultOption);
    //   setModelId(defaultOption.id);
    // }
  }, [presetModels, HFModels, recentModels, customEmbeddingModels, defaultModel, textColumnMeta]);

  // guardrail: a stale model selection (e.g. picked before switching to an
  // image column) that can't embed images shouldn't be runnable
  const selectedModel = allModels.find((m) => m.id === modelId);
  const imageModelMismatch = imageColumn && !!modelId && !modelSupportsImages(selectedModel);

  useEffect(() => {
    if (embeddingsJob?.status === 'completed') {
      apiService.fetchEmbeddings(datasetId).then((embs) => {
        setEmbeddings(embs);
        let emb;
        if (embeddingsJob.job_name == 'embed') {
          emb = embs.find((d) => d.id == embeddingsJob.run_id);
        } else if (embeddingsJob.job_name == 'rm') {
          emb = embs[embs.length - 1];
        }
        console.log('new embedding', emb);
        setEmbedding(emb);
        fetchRecentModels();
        setEmbeddingsJob(null);
      });
    }
  }, [embeddingsJob, datasetId, setEmbeddings, fetchRecentModels]);

  const [batchSize, setBatchSize] = useState(100);
  const [maxSeqLength, setMaxSeqLength] = useState(512);
  // Task-conditioned models (e.g. jina-v3/v5) advertise `task_names` in their HF
  // config and must have a task selected. Detect them and offer a picker so the
  // popular base checkpoints work without needing a task-specialised variant.
  const [taskNames, setTaskNames] = useState([]);
  const [task, setTask] = useState(null);

  useEffect(() => {
    setTaskNames([]);
    setTask(null);
    const m = allModels.find((mm) => mm.id === modelId);
    const isHF =
      m && m.name && (m.provider === 'huggingface' || String(m.id || '').startsWith('huggingface-'));
    if (!isHF) return;
    let cancelled = false;
    fetch(`https://huggingface.co/${m.name}/resolve/main/config.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cancelled || !cfg) return;
        const tn = cfg.task_names;
        if (Array.isArray(tn) && tn.length) {
          setTaskNames(tn);
          setTask(tn.includes('retrieval') ? 'retrieval' : tn[0]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [modelId, allModels]);

  // Estimation state
  const [embedEstimate, setEmbedEstimate] = useState(null);
  const [embedBenchmark, setEmbedBenchmark] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);

  const handleEstimate = useCallback(() => {
    if (!modelId || !textColumn || !datasetId) return;
    setEstimateLoading(true);
    setEmbedEstimate(null);
    apiService
      .estimateEmbed(datasetId, modelId, textColumn, dimensions)
      .then((data) => {
        setEmbedEstimate(data);
        setEstimateLoading(false);
      })
      .catch(() => setEstimateLoading(false));
  }, [datasetId, modelId, textColumn, dimensions]);

  const handleBenchmark = useCallback(() => {
    if (!modelId || !textColumn || !datasetId) return;
    setEstimateLoading(true);
    setEmbedBenchmark(null);
    apiService
      .benchmarkEmbed(datasetId, modelId, textColumn, 10, dimensions)
      .then((data) => {
        setEmbedBenchmark(data);
        setEstimateLoading(false);
      })
      .catch(() => setEstimateLoading(false));
  }, [datasetId, modelId, textColumn, dimensions]);

  // Reset estimates when model changes
  useEffect(() => {
    setEmbedEstimate(null);
    setEmbedBenchmark(null);
  }, [modelId]);

  // from the dataset, if a column is flagged as a potential embedding
  const [potentialEmbeddings, setPotentialEmbeddings] = useState([]);
  useEffect(() => {
    if (dataset?.potential_embeddings) {
      setPotentialEmbeddings(dataset.potential_embeddings);
    }
  }, [dataset]);

  const handleConfirmPotentialEmbedding = useCallback(
    (e, pe) => {
      e.preventDefault();
      const form = e.target.parentElement.parentElement;
      const data = new FormData(form);
      const model = data.get('model');
      const column = data.get('column');
      // kick off the job to create the embedding
      let job = {
        embedding_column: pe,
        text_column: column,
        model_id: model,
      };
      startEmbeddingsImporterJob(job);
    },
    [startEmbeddingsImporterJob]
  );

  useEffect(() => {
    // check that the job is for the importer and if its complete remove the potential embedding
    if (
      dataset &&
      embeddingsJob &&
      embeddingsJob.status === 'completed' &&
      embeddingsJob.job_name === 'embed-importer'
    ) {
      // we need to split our command to get the name of the embedding
      let commandParts = embeddingsJob.command.match(/(?:[^\s"']+|["'][^"']*["'])+/g);
      console.log('command parts', commandParts);
      console.log('sup', commandParts[2].replace(/['"]+/g, ''));
      let pe = commandParts[2].replace(/['"]+/g, '');
      let peList = dataset.potential_embeddings.filter((d) => d !== pe);
      console.log('dataset', dataset);
      console.log('potential embedding', peList);
      apiService
        .updateDataset(dataset.id, 'potential_embeddings', JSON.stringify(peList))
        .then((data) => setDataset(data));
    }
  }, [embeddingsJob, dataset, setDataset]);

  const handleDenyPotentialEmbedding = useCallback(
    (e, pe) => {
      e.preventDefault();
      let peList = dataset.potential_embeddings.filter((d) => d !== pe);
      apiService
        .updateDataset(dataset.id, 'potential_embeddings', JSON.stringify(peList))
        .then((data) => setDataset(data));
    },
    [dataset, setDataset]
  );

  const handleNewEmbedding = useCallback(
    (e) => {
      e.preventDefault();
      const form = e.target;
      const data = new FormData(form);
      // const model = allModels.find(model => model.id === data.get('modelName'));
      // prefix doesn't apply to image columns (the textarea is hidden).
      // Coerce a missing/empty value to "" so it never serializes to the string
      // "null"/"undefined" (which would then be prepended to every document).
      const prefix = imageColumn ? '' : (data.get('prefix') ?? '');
      let job = {
        text_column: textColumn,
        model_id: modelId,
        prefix,
        batch_size: batchSize,
        max_seq_length: maxSeqLength,
      };
      if (dimensions) job.dimensions = dimensions;
      if (task && taskNames.length) job.task = task;
      startEmbeddingsJob(job);
    },
    [startEmbeddingsJob, textColumn, dimensions, batchSize, modelId, maxSeqLength, imageColumn, task, taskNames]
  );

  const handleRerunEmbedding = (job) => {
    rerunEmbeddingsJob({ job_id: job?.id });
  };

  const handleModelSelectChange = useCallback(
    (selectedOption) => {
      setDefaultModel(selectedOption);
      setModelId(selectedOption.id);
    },
    [setDefaultModel, setModelId]
  );

  const handleTextColumnChange = useCallback(
    (e) => {
      setTextColumn(e.target.value);
      apiService
        .updateDataset(datasetId, 'text_column', e.target.value)
        .then((data) => setDataset(data));
    },
    [setTextColumn, datasetId, setDataset]
  );

  const handleTruncate = useCallback(
    (embeddingId) => {
      const selectedDimension = document.getElementById(`truncate-${embeddingId}`).value;
      console.log('truncating', embeddingId, selectedDimension);
      startEmbeddingsTruncateJob({ embedding_id: embeddingId, dimensions: selectedDimension });
    },
    [startEmbeddingsTruncateJob]
  );

  const handleSAE = useCallback(
    (sae) => {
      setSae(sae);
    },
    [setSae]
  );

  const handleNextStep = useCallback(() => {
    if (savedScope?.embedding_id == embedding?.id) {
      updateScope({ ...savedScope, sae_id: sae?.id });
    } else {
      updateScope({
        embedding_id: embedding?.id,
        sae_id: sae?.id,
        umap_id: null,
        cluster_id: null,
        cluster_labels_id: null,
        id: null,
      });
    }
    goToNextStep();
  }, [updateScope, goToNextStep, embedding, savedScope, sae]);

  return (
    <div className={styles['embeddings']}>
      <div className={styles['embeddings-setup']}>
        <div className={styles['embeddings-form']}>
          {/* Render the list of potential embeddings from the dataset columns */}
          {potentialEmbeddings.length ? (
            <div className={styles['potential-embeddings']}>
              {potentialEmbeddings.map((pe) => {
                return (
                  <form key={pe} className={styles['potential-embedding']}>
                    <span>
                      Create embedding from column <b>{pe}</b>?
                    </span>
                    <label htmlFor="column">
                      Embedded text column:
                      <select id="column" name="column">
                        {dataset?.columns
                          .filter((c) => dataset?.column_metadata[c].type == 'string')
                          .map((column, index) => {
                            return (
                              <option key={index} value={column}>
                                {column}
                              </option>
                            );
                          })}
                      </select>
                    </label>
                    <label htmlFor="model">
                      Embedded with model:
                      <select id="model" name="model">
                        <option value="">Not listed</option>
                        {allModels.map((model, index) => {
                          return (
                            <option key={index} value={model.id}>
                              {model.provider}: {model.name}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <div className={styles['pe-buttons']}>
                      <Button
                        className={`${styles['button']} button`}
                        color="secondary"
                        onClick={(e) => handleConfirmPotentialEmbedding(e, pe)}
                        text="✅ Yes"
                      />
                      <Button
                        className={`${styles['button']} button`}
                        color="secondary"
                        onClick={(e) => handleDenyPotentialEmbedding(e, pe)}
                        text="❌ No thanks"
                      />
                    </div>
                  </form>
                );
              })}
            </div>
          ) : null}

          <div className={styles.step}>
            1. Embed on column:
            {dataset?.columns.length ? (
              <Select
                value={textColumn}
                options={dataset?.columns.map((column) => ({
                  label: isImageColumn(dataset?.column_metadata?.[column])
                    ? `${column} (image)`
                    : column,
                  value: column,
                }))}
                onChange={handleTextColumnChange}
              />
            ) : null}
          </div>

          <div className={styles.step}>
            2. Select embedding model:
            <ModelSelect
              options={allOptionsGrouped}
              defaultValue={defaultModel}
              onChange={handleModelSelectChange}
              onInputChange={searchHFModels}
            />
          </div>
          <SettingsModal
            tooltip="Configure API keys for 3rd party models"
            onClose={fetchCustomEmbeddingModels}
          />

          {/* The form for creating a new embedding */}
          <form onSubmit={handleNewEmbedding}>
            <div className={styles.step}>
              {/* Task picker for task-conditioned models (jina-v3/v5). */}
              {!imageColumn && taskNames.length > 0 && (
                <label className={styles.taskSelect}>
                  Task:{' '}
                  <select
                    value={task || ''}
                    onChange={(e) => setTask(e.target.value)}
                    disabled={!!embeddingsJob}
                  >
                    {taskNames.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {/* prefix doesn't apply to image columns */}
              {!imageColumn && (
                <textarea
                  name="prefix"
                  className={styles.prefix}
                  placeholder={`Optional prefix to prepend to each ${textColumn}`}
                  disabled={!!embeddingsJob}
                ></textarea>
              )}

              <span className={styles['options']}>
                <label>
                  {' '}
                  Batch Size:
                  <input
                    className={styles['batch-size']}
                    type="number"
                    min="1"
                    name="batch_size"
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                    disabled={!!embeddingsJob}
                  />
                  <span className="tooltip" data-tooltip-id="batchsize">
                    🤔
                  </span>
                  <Tooltip className="tooltip-area" id="batchsize" place="top" effect="solid">
                    Reduce this number if you run out of memory. <br></br>
                    It determines how many items are processed at once.
                  </Tooltip>
                </label>

                <label>
                  {' '}
                  Max Sequence Length:
                  <input
                    className={styles['max-seq-length']}
                    type="number"
                    min="1"
                    name="max_seq_length"
                    value={maxSeqLength}
                    onChange={(e) => setMaxSeqLength(e.target.value)}
                    disabled={!!embeddingsJob}
                  />
                  <span className="tooltip" data-tooltip-id="maxseqlength">
                    🤔
                  </span>
                  <Tooltip className="tooltip-area" id="maxseqlength" place="top" effect="solid">
                    This controls the maximum number of tokens to embed for each item. <br></br>
                    You can increase this number to the model&apos;s context length, and reduce it to
                    save memory. <br></br>
                    If an item is too long, it will be truncated.
                  </Tooltip>
                </label>
              </span>
            </div>

            {/* {model && model.params.dimensions ?
                <select onChange={handleDimensionsChange}>
                  {model.params.dimensions.map((dim, index) => {
                    return <option key={index} value={dim}>{dim}</option>
                  })}
                </select>
              : null} */}

            {modelId && textColumn && (
              <EstimatePanel
                estimate={embedEstimate}
                onEstimate={handleEstimate}
                onBenchmark={handleBenchmark}
                benchmarkResult={embedBenchmark}
                loading={estimateLoading}
                step="embed"
              />
            )}

            {imageModelMismatch && (
              <div className={styles['model-mismatch']}>
                {selectedModel?.name || modelId} can&apos;t embed images. Select an image-capable
                model (CLIP, SigLIP, ViT, DINOv2) for column {textColumn}.
              </div>
            )}
            <Button
              type="submit"
              color={embedding ? 'secondary' : 'primary'}
              disabled={!!embeddingsJob || !modelId || imageModelMismatch}
              text="New Embedding"
            />
            {/* 
            Render the progress for the current job 
            TODO: automatically dismiss if successful
            */}
            <JobProgress
              job={embeddingsJob}
              clearJob={() => {
                setEmbeddingsJob(null);
              }}
              killJob={(job) =>
                apiService.killJob(dataset.id, job.id).then(setEmbeddingsJob).catch(console.error)
              }
              rerunJob={handleRerunEmbedding}
            />
            {/* 
            TODO: have a lastEmbeddingsJob with the info from previous run. 
            if job was successful user can click a button to display the logs. 
            */}
          </form>
        </div>

        {/* Render the list of existing embeddings */}
        <div className={styles['embeddings-list']}>
          {embeddings?.map((emb, index) => {
            let umps = umaps.filter((d) => d.embedding_id == emb.id);
            let cls = clusters.filter((d) => umps.map((d) => d.id).indexOf(d.umap_id) >= 0);
            let m = allModels.find((d) => d.id == emb.model_id);
            // dimensions may be absent or (for custom models) a scalar;
            // only arrays carry Matryoshka truncate options
            let dims = Array.isArray(m?.params?.dimensions)
              ? m.params.dimensions.filter((d) => +d < +emb.dimensions)
              : [];
            if (emb?.model_id.indexOf('nomic-embed-text-v1.5') >= 0) {
              dims = [512, 256, 128, 64, 16].filter((d) => d < emb.dimensions);
            }
            return (
              <div
                className={
                  styles['item'] + (emb.id === embedding?.id ? ' ' + styles['selected'] : '')
                }
                key={index}
              >
                <label htmlFor={`embedding${index}`}>
                  <span className={styles['item-info']}>
                    <span>
                      <input
                        type="radio"
                        id={`embedding${index}`}
                        name="embedding"
                        value={emb.id}
                        checked={emb.id === embedding?.id}
                        onChange={() => setEmbedding(emb)}
                      />
                      {emb.id}{' '}
                      {savedScope?.embedding_id == emb.id ? (
                        <span className="tooltip" data-tooltip-id="saved">
                          💾
                        </span>
                      ) : null}
                    </span>
                    <span>
                      {emb.model_id?.replace('___', '/')}
                      {emb.input_type === 'image' && (
                        <span className={styles['format-badge-image']}>image</span>
                      )}
                    </span>
                    <span>
                      {emb.dimensions} dimensions
                      {embeddingFormats[emb.id] === 'hdf5' && (
                        <>
                          <span className={styles['format-badge-hdf5']}>HDF5</span>
                          <button
                            className={styles['migrate-button']}
                            disabled={migratingId === emb.id}
                            onClick={(e) => {
                              e.preventDefault();
                              setMigratingId(emb.id);
                              apiService.migrateEmbedding(dataset.id, emb.id).then(() => {
                                setMigratingId(null);
                                setEmbeddingFormats((prev) => ({ ...prev, [emb.id]: 'lancedb' }));
                              });
                            }}
                          >
                            {migratingId === emb.id ? 'Migrating...' : 'Migrate to LanceDB'}
                          </button>
                        </>
                      )}
                      {embeddingFormats[emb.id] === 'lancedb' && (
                        <span className={styles['format-badge-lance']}>LanceDB</span>
                      )}
                    </span>
                    {emb.token_stats?.total ? (
                      <span className={styles['token-info']}>
                        {emb.token_stats.total.toLocaleString()} tokens · ~
                        {emb.token_stats.mean} per doc (max {emb.token_stats.max})
                      </span>
                    ) : null}
                    {umps.length || cls.length ? (
                      <div className={styles['item-deps']}>
                        {umps.length ? <span>{umps.length} umaps</span> : null}
                        {cls.length ? <span>{cls.length} clusters</span> : null}
                      </div>
                    ) : null}
                    <span>text column: {emb.text_column}</span>
                    {emb.prefix ? (
                      <span>
                        Prefix: &quot;<code>{emb.prefix}</code>&quot;<br />
                      </span>
                    ) : null}
                    {dims.length ? (
                      <div className={styles['truncate']}>
                        <select id={'truncate-' + emb.id}>
                          {dims.map((d, i) => {
                            return (
                              <option key={'dimension-' + i} value={d}>
                                {d}
                              </option>
                            );
                          })}
                        </select>
                        <Button
                          color="secondary"
                          onClick={() => handleTruncate(emb.id)}
                          text="Truncate"
                        />
                        <span className="tooltip" data-tooltip-id="truncate">
                          🤔
                        </span>
                        <Tooltip id="truncate" place="top" effect="solid">
                          This model supports Matroyshka embeddings. <br></br>
                          You can make a truncated copy of this embedding with fewer dimensions.
                        </Tooltip>
                      </div>
                    ) : (
                      <br />
                    )}

                    {getSaeForModel(emb.model_id) ? (
                      <Sae embedding={emb} model={getSaeForModel(emb.model_id)} onSAE={handleSAE} />
                    ) : null}
                  </span>
                </label>
                {embedding?.id == emb.id ? (
                  <div className={styles['navigate']}>
                    <Button
                      disabled={!embedding}
                      onClick={handleNextStep}
                      text={`Proceed with ${embedding?.id}`}
                    ></Button>
                  </div>
                ) : null}
                <Button
                  className={styles['delete']}
                  onClick={() => deleteEmbeddingsJob({ embedding_id: emb.id })}
                  color="secondary"
                  disabled={embeddingsJob && embeddingsJob.status !== 'completed'}
                  text="🗑️"
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles['embeddings-preview']}>
        <div className={styles['preview']}>
          <Preview embedding={embedding} />
        </div>
        <div className={styles['navigate']}>
          <Button
            disabled={!embedding}
            onClick={handleNextStep}
            text={embedding ? `Proceed with ${embedding?.id}` : 'Select an embedding'}
          ></Button>
        </div>
      </div>
    </div>
  );
}

export default Embedding;
