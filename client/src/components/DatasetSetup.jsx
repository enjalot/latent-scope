import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import './DatasetSetup.css';
import Embedding from './Setup/Embedding';
import Umap from './Setup/Umap';

// import DatasetUmaps from './DatasetUmaps';
import DataTable from './DataTable';
import Scatter from './Scatter';
import JobProgress from './JobProgress';

import { useStartJobPolling } from './JobRun';

function DatasetSetup() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams();

  const scopeWidth = 640
  const scopeHeight = 640

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
 

  // ====================================================================================================
  // embeddings 
  // ====================================================================================================
  // get the list of available embeddings, and refresh when a new one is created
  const [embeddings, setEmbeddings] = useState([]);
  const [embedding, setEmbedding] = useState(embeddings[0]);

  // ====================================================================================================
  // umaps
  // ====================================================================================================

  const [umaps, setUmaps] = useState([]);
  const [umap, setUmap] = useState(umaps[0]);

  useEffect(() => {
      if(umaps.length)
        setUmap(umaps.filter(d => d.embeddings == embedding)[0])
  }, [umaps, embedding]) 


  // ====================================================================================================
  // Points for rendering the scatterplot
  // ====================================================================================================
  const [points, setPoints] = useState([]);
  // const [loadingPoints, setLoadingPoints] = useState(false);
  useEffect(() => {
    if(umap) {
      fetch(`http://localhost:5001/datasets/${dataset.id}/umaps/${umap.name}/points`)
        .then(response => response.json())
        .then(data => {
          // console.log("umap points", data)
          setPoints(data.map(d => [d.x, d.y]))
        })
    } else {
      setPoints([])
    }
  }, [dataset, umap])

  const hydrateIndices = useCallback((indices, setter, distances = []) => {
    fetch(`http://localhost:5001/indexed?dataset=${datasetId}&indices=${JSON.stringify(indices)}`)
      .then(response => response.json())
      .then(data => {
        if(!dataset) return;
        // console.log("neighbors", data)
        const text_column = dataset.text_column
        let rows = data.map((row, index) => {
          return {
            index: indices[index],
            ...row
          }
        })
        rows.sort((a, b) => b.score - a.score)
        setter(rows)
        // console.log("rows", rows)
      })
  }, [dataset, datasetId])

   
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [selected, setSelected] = useState([]);
  useEffect(() => {
    hydrateIndices(selectedIndices, setSelected)
  }, [selectedIndices, setSelected, hydrateIndices])

  const handleSelected = useCallback((indices) => {
    setSelectedIndices(indices);
  }, [setSelectedIndices])

  const [scatter, setScatter] = useState({})


  // ====================================================================================================
  // clusters
  // ====================================================================================================
  const [clusterJob, setClusterJob] = useState(null);
  const { startJob: startClusterJob } = useStartJobPolling(dataset, setClusterJob, 'http://localhost:5001/jobs/cluster');
  const { startJob: deleteClusterJob } = useStartJobPolling(dataset, setClusterJob, 'http://localhost:5001/jobs/delete/cluster');

  const [clusterLabelsJob, setClusterLabelsJob] = useState(null);
  const { startJob: startClusterLabelsJob } = useStartJobPolling(dataset, setClusterLabelsJob, 'http://localhost:5001/jobs/cluster_label');


  const [clusters, setClusters] = useState([]);
  function fetchClusters(datasetId, callback) {
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
        callback(array.reverse())
      });
  }
  useEffect(() => {
    fetchClusters(datasetId, setClusters)
  }, [datasetId, setClusters, clusterJob]);

  const [cluster, setCluster] = useState(clusters[0]);
  useEffect(() => {
    if(clusters.length && umap) {
      setCluster(clusters.filter(d => d.umap_name == umap.name)[0])
    } else {
      setCluster(null)
    }
  }, [clusters, umap]) 

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
  // the currently chosen model used to label the active cluster
  const [clusterLabelModel, setClusterLabelModel] = useState(null);
  // the actual labels for the given cluster
  const [clusterLabels, setClusterLabels] = useState([]);
  useEffect(() => {
    if(cluster) {
      const endpoint = clusterLabelModel ? `labels/${clusterLabelModel}` : 'labels'
      fetch(`http://localhost:5001/datasets/${datasetId}/clusters/${cluster.cluster_name}/${endpoint}`)
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
  }, [clusterLabelModel, setClusterLabels, datasetId])


  const handleNewCluster = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const samples = data.get('samples')
    const min_samples = data.get('min_samples')
    startClusterJob({umap_name: umap.name, samples, min_samples})
  }, [startClusterJob, umap])

  const handleNewLabels= useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const model = data.get('chatModel')
    const text_column = textColumn
    const cluster_name = cluster.cluster_name
    const context = data.get('context')
    startClusterLabelsJob({model, cluster: cluster_name, text_column, context})
  }, [cluster, textColumn, startClusterLabelsJob])

  // ====================================================================================================
  // scopes
  // ====================================================================================================
  const[scopes, setScopes] = useState([]);
  const[scope, setScope] = useState(null);
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/scopes`)
      .then(response => response.json())
      .then(data => {
        setScopes(data.sort((a,b) => a.name.localeCompare(b.name)))
      });
  }, [datasetId, setScopes]);

  useEffect(() => {
    // TODO: this seems like a runaround on React.
    // I want to have umap and cluster be set by the scope
    // but i don't want to override any temporary changes to umap and cluster
    // real solution probably involves some kind of staging state
    async function setters(scope) {
      setScope(scope)
      setEmbedding(scope.embeddings)
      const tumaps = await new Promise((resolve) => fetchUmaps(datasetId, (data) => resolve(data)));
      const selectedUmap = tumaps.find(u => u.name === scope.umap);
      const tclusters = await new Promise((resolve) => fetchClusters(datasetId, (data) => resolve(data)));
      const selectedCluster = tclusters.find(c => c.cluster_name === scope.cluster);
      setUmap(selectedUmap);
      setCluster(selectedCluster);
      setClusterLabelModel(scope.cluster_labels)
    }
    if(scopeId && scopes.length) {
      const scope = scopes.find(d => d.name == scopeId)
      if(scope) {
        setters(scope)
      }
    } else {
      setScope(null)
    }
  }, [datasetId, scopeId, scopes, setScope, setUmap, setCluster])

  // The embedding is either set by the scope or by the first embedding in the list of available embeddings
  // TODO: only want to set the scope embedding initially, if a new embedding is generated want that new one to be set
  useEffect(() => {
    if(embeddings.length){
      if(scope && scope.embeddings) {
        setEmbedding(scope.embeddings)
      } else {
        setEmbedding(embeddings[0])
      }
    }
  }, [embeddings, scope]) 

  const navigate = useNavigate();
  const handleSaveScope = useCallback((event) => {
    event.preventDefault();
    if(!umap || !cluster) return;
    const form = event.target;
    const data = new FormData(form);
    const payload = {
      embeddings: embedding,
      umap: umap.name,
      cluster: cluster.cluster_name,
      cluster_labels: clusterLabelModel,
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
  }, [datasetId, cluster, clusterLabelModel, umap, navigate, setScope, scope, embedding]);

  // TODO got to be a better way to make sure the cluster label matches the cluster
  // and is either set by the scope or set when the cluster changes
  useEffect(() => {
    console.log("cluster changed, set label models", cluster?.cluster_name)
    if(cluster) {
      fetch(`http://localhost:5001/datasets/${datasetId}/clusters/${cluster.cluster_name}/labels_available`)
        .then(response => response.json())
        .then(data => {
          console.log("cluster changed, set label models fetched", cluster.cluster_name, data)
          setClusterLabelModels(data)
          console.log("debug", scope, cluster, data.length)
          if(scope && scope?.cluster == cluster?.cluster_name) {
            setClusterLabelModel(scope.cluster_labels)
          } else if(data.length){
            setClusterLabelModel(data[0])
          } else if(!data.length){
              setClusterLabelModel(null)
          }
        }).catch(err => {
          console.log(err)
          setClusterLabelModels([])
          setClusterLabelModel(null)
        })
    } else {
      setClusterLabelModels([])
      setClusterLabelModel(null)
    }
  }, [scope, cluster, clusterLabelsJob, setClusterLabelModels, datasetId])



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
            <Embedding dataset={dataset} textColumn={textColumn} embedding={embedding} umaps={umaps} clusters={clusters} onNew={setEmbeddings} onChange={setEmbedding} />
          </div>
          <div className="dataset--setup-umaps">
            <h3>2. UMAP </h3>
            <Umap dataset={dataset} umap={umap} embedding={embedding} clusters={clusters} onNew={setUmaps} onChange={setUmap} />
          </div>

          <div className="dataset--setup-clusters">
            <h3>3. Clusters</h3>
            <div className="dataset--clusters-new">
              <form onSubmit={(e) => handleNewCluster(e, umap)}>
                <label>
                  Samples:
                  <input type="number" name="samples" defaultValue="30" disabled={!!clusterJob}/>
                </label><br/>
                <label>
                  Min Samples:
                  <input type="number" name="min_samples" defaultValue="5" disabled={!!clusterJob} />
                </label>
                <button type="submit" disabled={!!clusterJob}>New Clusters</button>
              </form> 
              <JobProgress job={clusterJob} clearJob={()=>setClusterJob(null)} />
            </div>
            <div className="dataset--setup-clusters-list">
              {umap && clusters.filter(d => d.umap_name == umap.name).map((cl, index) => (
                <div className="dataset--setup-clusters-item" key={index}>
                  <input type="radio" 
                    id={`cluster${index}`} 
                    name="cluster" 
                    value={cluster} 
                    checked={cl.cluster_name === cluster?.cluster_name} 
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
          <div className="dataset--setup-cluster-labels">
            <h3>4. Auto-Label Clusters</h3>
            {cluster && clusterLabels ? 
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
                    value={clusterLabelModel}
                    onChange={(e) => setClusterLabelModel(e.target.value)}
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
            </div> : null}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="dataset--setup-right-column">

          <div className="dataset--setup-save-box">
            <div className="dataset--setup-save-box-title">
              Embedding: {embedding}<br/>
              Labels: {clusterLabelModel}
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
              { scope ? <a href={`/datasets/${datasetId}/explore/${scope.name}`}>Explore {scope.label} ({scope.name})</a> : null }
            </div>


          </div>
          <div className="dataset--setup-umap">
            <Scatter 
              points={points} 
              width={scopeWidth} 
              height={scopeHeight}
              onScatter={setScatter}
              // onView={handleView} 
              onSelect={handleSelected}
              // onHover={handleHover}
              />
            </div>
            <div className="dataset--selected">
              <span>Points Selected: {selected.length} {!selected.length ? "(Hold shift and drag an area of the map to select)" : null}
                {selected.length > 0 ? 
                  <button className="deselect" onClick={() => {
                    setSelectedIndices([])
                    scatter?.select([])
                    scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
                  }
                  }>X</button> 
                : null}
              </span>
              {selected.length > 0 ? 
              <div className="dataset--selected-table">
                <DataTable 
                  data={selected} 
                  // tagset={tagset} 
                  datasetId={datasetId} 
                  maxRows={150} 
                  // onTagset={(data) => setTagset(data)} 
                  // onHover={handleHover} 
                  // onClick={handleClicked}
                  />
              </div>
              : null }
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