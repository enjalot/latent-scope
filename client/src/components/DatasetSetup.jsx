import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import './DatasetSetup.css';
// import DatasetUmaps from './DatasetUmaps';
import DataTable from './DataTable';
import JobProgress from './JobProgress';

import { useStartJobPolling } from './JobRun';

function DatasetSetup() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams();
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
        const array = data.map(d=> {
          return {
            ...d,
            url: `http://localhost:5001/files/${datasetId}/umaps/${d.name}.png`,
          }
        })
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
        const array = data.map(d => {
          return {
            ...d,
            url: `http://localhost:5001/files/${datasetId}/clusters/${d.cluster_name}.png`,
          }
        })
        // console.log("clusters", clusters)
        setClusters(array.reverse())
      });
  }, [datasetId, clusterJob]);

  const [cluster, setCluster] = useState(clusters[0]);
  useEffect(() => {
    if(clusters.length && umap) {
      setCluster(clusters.filter(d => d.umap_name == umap.name)[0])
    } else {
      setCluster(null)
    }
  }, [clusters, umap]) 

  const [clusterLabels, setClusterLabels] = useState([]);
  useEffect(() => {
    if(cluster) {
      fetch(`http://localhost:5001/datasets/${datasetId}/clusters/${cluster.cluster_name}/labels`)
        .then(response => response.json())
        .then(data => {
          setClusterLabels(data)
        });
      } else {
        setClusterLabels([])
      }
  }, [cluster, setClusterLabels, datasetId])

  const handleNewCluster = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const samples = data.get('samples')
    const min_samples = data.get('min_samples')
    startClusterJob({umap_name: umap.name, samples, min_samples})
  }, [startClusterJob, umap])


  // Get the available scopes
  const[scopes, setScopes] = useState([]);
  const[scope, setScope] = useState(null);
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/scopes`)
      .then(response => response.json())
      .then(data => {
        console.log("got scope data", data)
        setScopes(data)
      });
  }, [datasetId, setScopes]);

  useEffect(() => {
    if(scopeId && scopes.length) {
      const scope = scopes.find(d => d.name == scopeId)
      if(scope) {
        setScope(scope)
        const selectedUmap = umaps.find(u => u.name === scope.umap);
        const selectedCluster = clusters.find(c => c.cluster_name === scope.cluster);
        setUmap(selectedUmap);
        setCluster(selectedCluster);
      }

    } else {
      setScope(null)
    }
  }, [scopeId, scopes, umaps, clusters, setScope, setUmap, setCluster])

  const navigate = useNavigate();
  const handleSaveScope = useCallback((event) => {
    event.preventDefault();
    if(!umap || !cluster) return;
    const form = event.target;
    const data = new FormData(form);
    const payload = {
      umap: umap.name,
      cluster: cluster.cluster_name,
      label: data.get('label'),
      description: data.get('description')
    };

    const action = data.get('action')
    console.log("action", action)
    if(action == "save") {
      payload.name = scope.name
    }

    fetch(`http://localhost:5001/datasets/${datasetId}/scopes/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
      console.log('Scope saved:', data);
      setScope(data)
      fetch(`http://localhost:5001/datasets/${datasetId}/scopes`)
        .then(response => response.json())
        .then(data => {
          setScopes(data)
        });
      navigate(`/datasets/${datasetId}/setup/${data.name}`);
    })
    .catch(error => {
      console.error('Error saving scope:', error);
    });
  }, [datasetId, cluster, umap, navigate, setScope, scope]);

  if (!dataset) return <div>Loading...</div>;

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
        <div className="dataset--setup-scopes">
            {scopes && scopes.map((s, index) => {
              const cl = clusters.find(c => c.cluster_name == s.cluster) || {}
              return (
              <div 
                key={index} 
                className={ "dataset--setup-scopes-item" + (s.name == scope?.name ? " active" : "") }
                onClick={() => navigate(`/datasets/${datasetId}/setup/${s.name}`)}
                >
                <span>{s.name}</span>
                <span>{s.label} </span>
                <span>{s.description}</span>
                <img src={cl.url} alt={cl.name} /> 
              </div>
            )})}
            
        </div>
      </div>

      <div className="dataset--setup-layout">
        <div className="dataset--setup-left-column">
          <div className="dataset--setup-embeddings">
            <h3>1. Embeddings</h3>
              <div>
                Embedding on <b>{textColumn}</b>
              </div>
            {!embeddingsJob  ? 
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
            <JobProgress job={embeddingsJob} clearJob={()=> setEmbeddingsJob(null)} /> }
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
              {!umapJob  ? 
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
              : <JobProgress job={umapJob} clearJob={()=>setUmapJob(null)}/> }
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
              {!clusterJob ? 
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
              </form> : <JobProgress job={clusterJob} clearJob={()=>setClusterJob(null)} /> }
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
          {/* AUTO LABEL CLUSTERS */}
          <div className="dataset--setup-slides">
            <h3>4. Auto-Label Clusters</h3>
            {cluster && clusterLabels ? 
            <div className="dataset--slides-new">
              {cluster.cluster_name}
              {/* TODO iterate over chat models  */}
              <button>Auto Label</button>
              <div className="dataset--setup-labels-list">
                <DataTable data={clusterLabels.map(d => ({label: d.label, items: d.indices.length}))} />
              </div>
            </div> : null}
          </div>
        </div>

        {/* RIGHT COLUMN */}
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
              <form onSubmit={handleSaveScope}>
                <label>
                  Label:
                  <input type="text" name="label" defaultValue={scope ? scope.label: ""}/>
                </label>
                <label>
                  Description:
                  <input type="text" name="description" defaultValue={scope ? scope.description: ""}/>
                </label>
                <input type="hidden" name="action" value="" />
                {scope ? 
                  <button type="submit" disabled={cluster ? false : true } onClick={() => { 
                    document.querySelector('input[name="action"]').value = 'save'; 
                  }}>Save scope</button> : null }
                  <button type="submit" disabled={cluster ? false : true } onClick={() => { 
                    document.querySelector('input[name="action"]').value = 'new'; 
                  }}>New scope</button>
              </form>
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