import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetSetup.css';
import DatasetUmaps from './DatasetUmaps';

import useJobPolling from './RunJob';

function DatasetSetup() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();

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

  

  // umaps
  const [umapJob, setUmapJob] = useState(null);
  const { startJob: startUmapJob } = useJobPolling(dataset, setUmapJob, 'http://localhost:5001/scripts/umap');
  const { startJob: deleteUmapJob } = useJobPolling(dataset, setUmapJob, 'http://localhost:5001/scripts/delete/umap');
  // clusters
  const [clusterJob, setClusterJob] = useState(null);
  const { startJob: startClusterJob } = useJobPolling(dataset, setClusterJob, 'http://localhost:5001/scripts/cluster');
  const { startJob: deleteClusterJob } = useJobPolling(dataset, setClusterJob, 'http://localhost:5001/scripts/delete/cluster');
  // slides
  const [slidesJob, setSlidesJob] = useState(null);
  const { startJob: startSlidesJob } = useJobPolling(dataset, setSlidesJob, 'http://localhost:5001/scripts/slides');
  useEffect(() => {
    if (slidesJob && slidesJob.status === "completed") {
      fetch(`http://localhost:5001/datasets/${datasetId}/meta`)
        .then(response => response.json())
        .then(data => setDataset(data));
    }
  }, [slidesJob, datasetId])

  const [embeddingsJob, setEmbeddingsJob] = useState(null);
  const { startJob: startEmbeddingsJob } = useJobPolling(dataset, setEmbeddingsJob, 'http://localhost:5001/scripts/embed');

  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/embeddings`)
      .then(response => response.json())
      .then(data => {
        console.log("embeddings", data)
        setEmbeddings(data)
      });
  }, [datasetId, embeddingsJob]);

  const [embedMode, setEmbedMode] = useState("local");
 

  if (!dataset) return <div>Loading...</div>;
  const datasetUrl = "/datasets/" + datasetId

  return (
    <div className="dataset--details-experiments">
      <h2>Dataset: <a href={datasetUrl}>{datasetId}</a></h2>
      <div className="dataset--details-summary">
        [ {dataset.length} rows ][ {dataset.active_embeddings} ][ {dataset.active_umap} ] [ {dataset.active_slides} ]<br/>
      </div>

      <div className="dataset--setup-embeddings">
        <form onSubmit={e => {
          e.preventDefault()
          const form = e.target
          const data = new FormData(form)
          let job = { 
            mode: embedMode,
            text_column: data.get('textColumn'),
          }
          if(embedMode === "local") {
            const model = data.get('modelName')
            job.model = model
          }
          startEmbeddingsJob(job)
        }}>

          <div>
            <input type="radio" id="local" name="embedMode" value="local" 
              onChange={e => setEmbedMode(e.target.value)} checked={embedMode === "local"} />
            <label htmlFor="local">Local</label>
          </div>
          <div>
            <input type="radio" id="openai" name="embedMode" value="openai" 
              onChange={e => setEmbedMode(e.target.value)} checked={embedMode === "openai"} />
            <label htmlFor="openai">OpenAI</label>
          </div>
          <div>
            <input type="radio" id="together" name="embedMode" value="together" 
              onChange={e => setEmbedMode(e.target.value)} checked={embedMode === "together"} />
            <label htmlFor="together">Together</label>
          </div>

          {embedMode === "local" && <div>
            <label htmlFor="modelName">Model Name:</label>
            <input type="text" id="modelName" name="modelName" defaultValue="BAAI/bge-small-en-v1.5" />
            </div>}

          <div>
            <label htmlFor="textColumn">Text Column:</label>
            <input type="text" id="textColumn" name="textColumn" defaultValue="text" />
          </div>
          
          <button type="submit">Run</button>
        </form>
        {embeddingsJob && embeddingsJob.status !== "completed" && 
          <div>
          <pre>{embeddingsJob.progress.join("\n")}</pre>
          </div>}
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