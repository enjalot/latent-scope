import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetSetup.css';
import DatasetUmaps from './DatasetUmaps';
import JobProgress from './JobProgress';

import { useStartJobPolling } from './JobRun';

function DatasetSetup() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();

  const [models, setModels] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/models`)
      .then(response => response.json())
      .then(data => {
        console.log("models", data)
        setModels(data)
      });
  }, []);

  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => setDataset(data));
  }, [datasetId]);

  const handleActivateUmap = useCallback((umap) => {
    fetch(`http://localhost:5001/datasets/${datasetId}/umaps/activate?umap=${umap.name}`)
      .then(response => response.json())
      .then(data => {
        console.log("activated umap", umap, data)
        setDataset(data);
      });
  }, [datasetId])

  
  const textColumn = useMemo(() => {
    if (!dataset) return "";
    console.log("dataset memo", dataset)
    return dataset.text_column || dataset.columns[0];
  }, [dataset])

  const handleChangeTextColumn = useCallback((event) => {
    const column = event.target.value;
    console.log("setting column", column)
    fetch(`http://localhost:5001/datasets/${datasetId}/meta/update?key=text_column&value=${column}`)
      .then(response => response.json())
      .then(data => {
        console.log("updated meta", data)
        setDataset(data)
      });
  }, [datasetId])


  // umaps
  const [umapJob, setUmapJob] = useState(null);
  const { startJob: startUmapJob } = useStartJobPolling(dataset, setUmapJob, 'http://localhost:5001/jobs/umap');
  const { startJob: deleteUmapJob } = useStartJobPolling(dataset, setUmapJob, 'http://localhost:5001/jobs/delete/umap');
  // clusters
  const [clusterJob, setClusterJob] = useState(null);
  const { startJob: startClusterJob } = useStartJobPolling(dataset, setClusterJob, 'http://localhost:5001/jobs/cluster');
  const { startJob: deleteClusterJob } = useStartJobPolling(dataset, setClusterJob, 'http://localhost:5001/jobs/delete/cluster');
  // slides
  const [slidesJob, setSlidesJob] = useState(null);
  const { startJob: startSlidesJob } = useStartJobPolling(dataset, setSlidesJob, 'http://localhost:5001/jobs/slides');
  useEffect(() => {
    if (slidesJob && slidesJob.status === "completed") {
      fetch(`http://localhost:5001/datasets/${datasetId}/meta`)
        .then(response => response.json())
        .then(data => setDataset(data));
    }
  }, [slidesJob, datasetId])

  const [embeddingsJob, setEmbeddingsJob] = useState(null);
  const { startJob: startEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, 'http://localhost:5001/jobs/embed');

  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/embeddings`)
      .then(response => response.json())
      .then(data => {
        console.log("embeddings", data)
        setEmbeddings(data)
      });
  }, [datasetId, embeddingsJob]);

  if (!dataset) return <div>Loading...</div>;
  const datasetUrl = "/datasets/" + datasetId

  return (
    <div className="dataset--details-experiments">
      <h2>Dataset: <a href={datasetUrl}>{datasetId}</a></h2>
      <div className="dataset--details-summary">
        [ {dataset.length} rows ]<br/>
      </div>
      <div className="dataset--details-columns">
        Columns: {dataset.columns.join(", ")}

        <div className="dataset--details-text-column">
          Set Text Column: 
          <select value={textColumn} onChange={handleChangeTextColumn}>
            {dataset.columns.map((column, index) => (
              <option key={index} value={column}>{column}</option>
            ))}
          </select>
        </div>

      </div>

      <div className="dataset--setup-embeddings">
          <div>
            Embedding on <b>{textColumn}</b>
          </div>
        {!embeddingsJob || embeddingsJob?.status == "completed" ? <form onSubmit={e => {
            e.preventDefault()
            const form = e.target
            const data = new FormData(form)
            const model = models.find(model => model.id === data.get('modelName'))
            let job = { 
              text_column: textColumn,
              provider: model.provider,
              model: model.id,
            }
            startEmbeddingsJob(job)
          }}>
          <div>
            <label htmlFor="modelName">Model:</label>
            <select id="modelName" name="modelName">
              {models.map((model, index) => (
                <option key={index} value={model.id}>{model.provider}: {model.name}</option>
              ))}
            </select>
          </div> 
          <button type="submit">New Embedding</button>
        </form> : 
        <JobProgress job={embeddingsJob} /> }
       
      </div>
      
      <DatasetUmaps 
        dataset={dataset} 
        embeddings={embeddings}
        onActivateUmap={handleActivateUmap} 
        onNewUmap={startUmapJob}
        onDeleteUmap={deleteUmapJob}
        onNewCluster={startClusterJob}
        onDeleteCluster={deleteClusterJob}
        onNewSlides={startSlidesJob}
        umapJob={umapJob}
        clusterJob={clusterJob}
        slidesJob={slidesJob}
        />

    </div>
  );
}

export default DatasetSetup;