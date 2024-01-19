import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetSetup.css';
import DatasetUmaps from './DatasetUmaps';
import JobProgress from './JobProgress';

import { useStartJobPolling } from './JobRun';

function DatasetSetup() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();
  // Get the dataset meta data
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => setDataset(data));
  }, [datasetId]);

  // default text column from columns
  const textColumn = useMemo(() => {
    if (!dataset) return "";
    return dataset.text_column || dataset.columns[0];
  }, [dataset])
  // set the text column on our dataset
  const handleChangeTextColumn = useCallback((event) => {
    const column = event.target.value;
    console.log("setting column", column)
    fetch(`http://localhost:5001/datasets/${datasetId}/meta/update?key=text_column&value=${column}`)
      .then(response => response.json())
      .then(data => {
        // console.log("updated meta", data)
        setDataset(data)
      });
  }, [datasetId])


  // get the list of available models
  const [models, setModels] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/models`)
      .then(response => response.json())
      .then(data => {
        // console.log("models", data)
        setModels(data)
      });
  }, []);

  // setup the embeddings data
  // The job allows us to create a new embedding and watch its progress
  const [embeddingsJob, setEmbeddingsJob] = useState(null);
  const { startJob: startEmbeddingsJob } = useStartJobPolling(dataset, setEmbeddingsJob, 'http://localhost:5001/jobs/embed');
  // get the list of available embeddings, and refresh when a new one is created
  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/embeddings`)
      .then(response => response.json())
      .then(data => {
        setEmbeddings(data)
      });
  }, [datasetId, embeddingsJob]);
  const [embedding, setEmbedding] = useState(embeddings[0]);
  useEffect(() => {
    if(embeddings.length)
      setEmbedding(embeddings[0])
  }, [embeddings]) 

  const handleNewEmbedding = e => {
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
  }

  // umaps
  const [umapJob, setUmapJob] = useState(null);
  const { startJob: startUmapJob } = useStartJobPolling(dataset, setUmapJob, 'http://localhost:5001/jobs/umap');
  const { startJob: deleteUmapJob } = useStartJobPolling(dataset, setUmapJob, 'http://localhost:5001/jobs/delete/umap');

  const [umaps, setUmaps] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/umaps`)
      .then(response => response.json())
      .then(data => {
        const array = Object.keys(data).map(key => {
          return {
            ...data[key],
            url: `http://localhost:5001/files/${datasetId}/umaps/${key.replace(".json","")}.png`,
          }
        })
        // const filtered = array.filter(d => d.embeddings == embedding)
        // console.log("umap array", filtered)
        setUmaps(array.reverse())
      });
  }, [datasetId, umapJob]);
  const [umap, setUmap] = useState(umaps[0]);
    useEffect(() => {
      if(umaps.length)
        setUmap(umaps.filter(d => d.embeddings == embedding)[0])
  }, [umaps, embedding]) 

  const handleNewUmap = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const neighbors = data.get('neighbors')
    const min_dist = data.get('min_dist')
    startUmapJob({embeddings: embedding, neighbors, min_dist})
  }, [startUmapJob, embedding])


  // clusters
  const [clusterJob, setClusterJob] = useState(null);
  const { startJob: startClusterJob } = useStartJobPolling(dataset, setClusterJob, 'http://localhost:5001/jobs/cluster');
  const { startJob: deleteClusterJob } = useStartJobPolling(dataset, setClusterJob, 'http://localhost:5001/jobs/delete/cluster');

  const [clusters, setClusters] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/clusters`)
      .then(response => response.json())
      .then(data => {
        const array = Object.keys(data).map(key => {
          return {
            ...data[key],
            url: `http://localhost:5001/files/${datasetId}/clusters/${key.replace(".json","")}.png`,
          }
        })
        // console.log("clusters", clusters)
        setClusters(array.reverse())
      });
  }, [datasetId, clusterJob]);

  const [cluster, setCluster] = useState(clusters[0]);
    useEffect(() => {
      if(clusters.length && umap)
        setCluster(clusters.filter(d => d.umap_name == umap.name)[0])
  }, [clusters, umap]) 

  const handleNewCluster = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const samples = data.get('samples')
    const min_samples = data.get('min_samples')
    startClusterJob({umap_name: umap.name, samples, min_samples})
  }, [startClusterJob, umap])




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

  

  if (!dataset) return <div>Loading...</div>;

  const datasetUrl = "/datasets/" + datasetId

  return (
    <div className="dataset--setup">
      <div className="dataset--setup-summary">
        <div className="dataset--setup-info">
          <h2>{datasetId}</h2>
          [ {dataset.length} rows ]<br/>
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
        <div className="dataset--setup-saves">
            <div className="dataset--setup-saves-item">
              scope-001
            </div>
            <div className="dataset--setup-saves-item">
              scope-002
            </div>
        </div>
      </div>

      <div className="dataset--setup-layout">
        <div className="dataset--setup-left-column">
          <div className="dataset--setup-embeddings">
            <h3>1. Embeddings</h3>
              <div>
                Embedding on <b>{textColumn}</b>
              </div>
            {!embeddingsJob || embeddingsJob?.status == "completed" || clusterJob.status == "error" ? 
            <form onSubmit={handleNewEmbedding}>
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
            <div className="dataset--setup-embeddings-list">
              {embeddings.map((emb, index) => (
                <div key={index}>
                  <input type="radio" id={`embedding${index}`} name="embedding" value={emb} checked={emb === embedding} onChange={() => setEmbedding(emb)} />
                  <label htmlFor={`embedding${index}`}>
                    <span>
                      {emb} [
                        {umaps.filter(d => d.embeddings == emb).length} umaps,&nbsp;
                        {clusters.filter(d => umaps.filter(d => d.embeddings == emb).map(d => d.name).indexOf(d.umap_name) >= 0).length} clusters 
                      ]
                    </span>
                    </label>
                </div>
              ))}
            </div>
          
          </div>
          <div className="dataset--setup-umaps">
            <h3>2. UMAP </h3>
            <div className="dataset--umaps-new">
              {!umapJob || umapJob.status == "completed" || clusterJob.status == "error" ? 
              <form onSubmit={handleNewUmap}>
                <label>
                  Neighbors:
                  <input type="number" name="neighbors" defaultValue="50"/>
                </label>
                <label>
                  Min Dist:
                  <input type="text" name="min_dist" defaultValue="0.1" />
                </label>
                <button type="submit">New UMAP</button>
              </form>
              : <JobProgress job={umapJob} /> }
          </div>
            <div className="dataset--setup-umaps-list">
              {umaps.filter(d => d.embeddings == embedding).map((um, index) => (
                <div className="dataset--setup-umaps-item" key={index}>
                  <input type="radio" id={`umap${index}`} name="umap" value={um} checked={um === umap} onChange={() => setUmap(um)} />
                  <label htmlFor={`umap${index}`}>{um.name}
                  <br></br>
                    Neighbors: {um.neighbors}<br/>
                    Min Dist: {um.min_dist}<br/>
                  <img src={um.url} alt={um.name} />
                  <br></br>
                  {clusters.filter(d => d.umap_name == um.name).length} clusters
                  <button onClick={() => deleteUmapJob({umap_name: um.name}) }>🗑️ umap</button>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="dataset--setup-clusters">
            <h3>3. Clusters</h3>
            <div className="dataset--clusters-new">
              {!clusterJob || clusterJob.status == "completed" || clusterJob.status == "error" ? 
              <form onSubmit={(e) => handleNewCluster(e, umap)}>
                <label>
                  Samples:
                  <input type="number" name="samples" defaultValue="30"/>
                </label><br/>
                <label>
                  Min Samples:
                  <input type="number" name="min_samples" defaultValue="5" />
                </label>
                <button type="submit">New Clusters</button>
              </form> : <JobProgress job={clusterJob} /> }
            </div>
            <div className="dataset--setup-clusters-list">
              {umap && clusters.filter(d => d.umap_name == umap.name).map((cl, index) => (
                <div className="dataset--setup-clusters-item" key={index}>
                  <input type="radio" 
                    id={`cluster${index}`} 
                    name="cluster" 
                    value={cluster} 
                    checked={cl === cluster} 
                    onChange={() => setCluster(cl)} />
                  <label htmlFor={`cluster${index}`}>{cl.cluster_name}
                  <br></br>
                    Clusters: {cl.n_clusters}<br/>
                    Noise points: {cl.n_noise}<br/>
                    Samples: {cl.samples}<br/>
                    Min Samples: {cl.min_samples}<br/>
                  <img src={cl.url} alt={cl.name} />
                  <button onClick={() => deleteClusterJob({cluster_name: cl.cluster_name}) }>🗑️ cluster</button>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div className="dataset--setup-slides">
            <h3>4. Slides</h3>
          </div>
        </div>
        <div className="dataset--setup-right-column">
          <div className="dataset--setup-save-box">
            <div className="dataset--setup-save-box-title">
              {embedding}
            </div>
            <div className="dataset--setup-save-box-boxes">
              { umap ? <div className="box-item">
                {umap.name}
                <img src={umap.url} alt={umap.name} />
              </div> : <div className="empty-box"></div> }
              { cluster ? <div className="box-item">
                {cluster.cluster_name}
                <img src={cluster.url} alt={cluster.name} />
              </div> : <div className="empty-box"></div> }

            </div>
            <div className="dataset--setup-save-box-nav">
              <button>Save scope-001</button>
              <a href="">Explore scope-001</a>
            </div>


          </div>
          <div className="dataset--setup-umap">

          </div>
        </div>
      </div>
        
        {/* <DatasetUmaps 
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
          /> */}

    </div>
  );
}

export default DatasetSetup;