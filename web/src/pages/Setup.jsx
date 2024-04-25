import { useEffect, useState, useMemo, useCallback, useReducer, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

import { range } from 'd3-array';

import './Setup.css';
import Embedding from '../components/Setup/Embedding';
import Umap from '../components/Setup/Umap';
import Cluster from '../components/Setup/Cluster';
import ClusterLabels from '../components/Setup/ClusterLabels';
import Scope from '../components/Setup/Scope';
import Stage from '../components/Setup/Stage';
import HullPlot from '../components/HullPlot';

import JobProgress from '../components/Job/Progress';
import { useStartJobPolling } from '../components/Job/Run';

import IndexDataTable from '../components/IndexDataTable';
import FilterDataTable from '../components/FilterDataTable';
import Scatter from '../components/Scatter';
  
const apiUrl = import.meta.env.VITE_API_URL


const initialState = {
  // process related state
  dataset: null,
  textColumn: "",
  embeddings: [],
  embedding: null,
  umaps: [],
  umap: null,
  clusters: [],
  cluster: null,
  clusterLabelSets: [],
  clusterLabelSet: null,
  scopes: [],
  scope: null,

  // display related state
  scopeWidth: 500,
  scopeHeight: 500,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_DATASET': {
      const dataset = action.payload;
      // set a default value for the text column if not specified in dataset
      const textColumn = dataset ? (dataset.text_column || dataset.columns[0]) : "";
      return { ...state  , dataset, textColumn }
    }
    case 'SET_EMBEDDINGS':
      return { ...state, embeddings: action.payload }
    case 'SET_EMBEDDING':
      return { ...state, embedding: action.payload }
    case 'SET_UMAPS':
      return { ...state, umaps: action.payload }
    case 'SET_UMAP':
      return { ...state, umap: action.payload }
    case 'SET_CLUSTERS':
      return { ...state, clusters: action.payload }
    case 'SET_CLUSTER':
      return { ...state, cluster: action.payload }
    case 'SET_CLUSTER_LABEL_SETS':
      return { ...state, clusterLabelSets: action.payload }
    case 'SET_CLUSTER_LABEL_SET':
      return { ...state, clusterLabelSet: action.payload }
    case 'SET_SCOPES':
      return { ...state, scopes: action.payload }
    case 'SET_SCOPE': {
        // setSelectedEmbeddingId(scope.embedding_id)
        // setSelectedUmapId(scope.umap_id)
        // setSelectedClusterId(scope.cluster_id)
        // setSelectedClusterLabelSetId(scope.cluster_labels_id)
 
      return { ...state, scope: action.payload }
    }
    default:
      return state
  }
}

function processHulls(labels, points) {
  return labels.map(d => {
    return d.hull.map(i => points[i])
  })
}

function Setup() {
  const { dataset: datasetId, scope: scopeId } = useParams();

  const navigate = useNavigate();

  const [{ 
    dataset, 
    textColumn,
    embeddings,
    embedding,
    umaps,
    umap,
    clusters,
    cluster,
    clusterLabelSets,
    clusterLabelSet,

    scopes,
    scope,

    scopeWidth, 
    scopeHeight 
  }, dispatch ] = useReducer(reducer, initialState)

  // Get the dataset meta data
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => dispatch({ type: "SET_DATASET", payload: data}));
  }, [datasetId]);

  useEffect(() => {
    if(dataset) {
      console.log("dataset", dataset)
    }
  }, [dataset])

  // have job for re-ingesting dataset
  const [reingestJob, setReingestJob] = useState(null);
  const { startJob: startReingestJob } = useStartJobPolling(dataset, setReingestJob, `${apiUrl}/jobs/reingest`);

  // set the text column on our dataset
  const handleChangeTextColumn = useCallback((event) => {
    const column = event.target.value;
    fetch(`${apiUrl}/datasets/${datasetId}/meta/update?key=text_column&value=${column}`)
      .then(response => response.json())
      .then(data => {
        dispatch({ type: "SET_DATASET", payload: data})
      });
  }, [datasetId])
  
  const handleRemovePotentialEmbedding = useCallback((pe) => {
    const newPe = dataset.potential_embeddings.filter(d => d !== pe)
    fetch(`${apiUrl}/datasets/${datasetId}/meta/update?key=potential_embeddings&value=${JSON.stringify(newPe)}`)
      .then(response => response.json())
      .then(data => {
        dispatch({ type: "SET_DATASET", payload: data})
      })
  }, [dataset])
 
  // ====================================================================================================
  // embeddings 
  // ====================================================================================================

  const [selectedEmbeddingId, setSelectedEmbeddingId] = useState(null);
  function deriveEmbedding(embeddings, selectedEmbeddingId) {
    if(embeddings.length) {
      if(selectedEmbeddingId) {
        const found = embeddings.find(d => d.id == selectedEmbeddingId)
        return found
      } else {
        // return embeddings[0]
      } 
    } else {
      return null
    }
  }
  useEffect(() => {
    const emb = deriveEmbedding(embeddings, selectedEmbeddingId)
    dispatch({ type: "SET_EMBEDDING", payload: emb })
  }, [embeddings, selectedEmbeddingId])

  // ====================================================================================================
  // umaps
  // ====================================================================================================

  // the id of the umap selected by the user
  const [selectedUmapId, setSelectedUmapId] = useState(null);

  function deriveUmap(umaps, embedding, selectedUmapId) {
    if(umaps.length && embedding) {
      const embeddingUmaps = umaps.filter(d => d.embedding_id == embedding.id)
      const found = embeddingUmaps.find(d => d.id == selectedUmapId)
      if(selectedUmapId && found) {
        return found
      } else {
        // return embeddingUmaps[0] 
      }
    } else {
      return null
    }
  }
  useEffect(() => {
    const umap = deriveUmap(umaps, embedding, selectedUmapId)
    dispatch({ type: "SET_UMAP", payload: umap })
  }, [selectedUmapId, umaps, embedding])  

  // ====================================================================================================
  // clusters
  // ==================================================================================================== 

  // the id of the cluster selected by the user
  const [selectedClusterId, setSelectedClusterId] = useState(null);

  function deriveCluster(clusters, umap, selectedClusterId) {
    if(clusters.length && umap) {
      const umapClusters = clusters.filter(d => d.umap_id == umap.id)
      const found = umapClusters.find(d => d.id == selectedClusterId)
      // if the user has selected a cluster and it is found in the current umap's cluster list, set it
      if(selectedClusterId && found) {
        return found;
      } else {
        // otherwise set the first cluster in the umap's list
        // return umapClusters[0]
      }
    } else {
      return null;
    }
  }
  useEffect(() => {
    const cluster = deriveCluster(clusters, umap, selectedClusterId)
    dispatch({ type: "SET_CLUSTER", payload: cluster })
  }, [selectedClusterId, clusters, umap]) 

  const [selectedClusterLabelSetId, setSelectedClusterLabelSetId] = useState(null);

  function deriveClusterLabelSet(clusterLabelSets, cluster, selectedClusterLabelSetId) {
    if(clusterLabelSets && clusterLabelSets.length && cluster) {
      const filtered = clusterLabelSets.filter(d => d.cluster_id == cluster.id)
      if(selectedClusterLabelSetId && filtered) {
        const found = filtered.find(d => d.id == selectedClusterLabelSetId)
        if(found) {
          return found
        } else {
          // return filtered[0]
          return { id: "default" }
        }
      } else {
        // return clusterLabelSets[0]
      }
    } else {
      if(selectedClusterLabelSetId == "default")
        return { id: "default" }
    }
  }
  useEffect(() => {
    const labelSet = deriveClusterLabelSet(clusterLabelSets, cluster, selectedClusterLabelSetId)
    dispatch({ type: "SET_CLUSTER_LABEL_SET", payload: labelSet })
  }, [cluster, selectedClusterLabelSetId, clusterLabelSets])


  // ====================================================================================================
  // scopes
  // ====================================================================================================
  // When the scopeId changes, update the scope and set all the default selections
  useEffect(() => {
    let scope;
    // console.log("SCOPEID", scopeId)
    if(scopeId && scopes?.length) {
      scope = scopes.find(d => d.id == scopeId)
    } 
    if(!scopeId) {
      dispatch({ type: "SET_SCOPE", payload: null })
    }
    if(scope) {
      console.log("have scope", scope)
      dispatch({ type: "SET_SCOPE", payload: scope })
      setSelectedEmbeddingId(scope.embedding_id)
      setSelectedUmapId(scope.umap_id)
      setSelectedClusterId(scope.cluster_id)
      setSelectedClusterLabelSetId(scope.cluster_labels_id)
    } else {
      console.log("setting everything to null")
      if(scopeId) dispatch({ type: "SET_SCOPE", payload: null })
      setSelectedEmbeddingId(null)
      setSelectedUmapId(null)
      setSelectedClusterId(null)
      setSelectedClusterLabelSetId(null)
    } 
  }, [scopeId, scopes])


  // ====================================================================================================
  // selected points from the scatterplot 
  // ====================================================================================================
  const [selectedIndices, setSelectedIndices] = useState([]);
  const handleSelected = useCallback((indices) => {
    setSelectedIndices(indices);
  }, [setSelectedIndices])

  const [scatter, setScatter] = useState({})
  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);
  const handleView = useCallback((xDomain, yDomain) => {
    setXDomain(xDomain);
    setYDomain(yDomain);
  }, [setXDomain, setYDomain])


  const hydrateIndices = useCallback((indices, setter, distances = []) => {
    fetch(`${apiUrl}/indexed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataset: dataset.id, indices: indices }),
    })
    .then(response => response.json())
    .then(data => {
      if(!dataset) return;
      let rows = data.map((row, index) => {
        return {
          index: indices[index],
          ...row
        }
      })
      setter(rows)
    })
  }, [dataset, datasetId])

  // Hover via scatterplot or tables
  // index of item being hovered over
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const handleHovered = useCallback((index) => {
      setHoveredIndex(index);
  }, [setHoveredIndex])

  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    if(hoveredIndex >= 0 && hoveredIndex != null) {
      hydrateIndices([hoveredIndex], (results) => {
        setHovered(results[0])
      })
    } else {
      setHovered(null)
    }
  }, [hoveredIndex, setHovered, hydrateIndices])

  const [clusterIndices, setClusterIndices] = useState([]);
  const [clusterLabels, setClusterLabels] = useState([]);
  useEffect(() => {
    if(cluster) {
      fetch(`${apiUrl}/datasets/${datasetId}/clusters/${cluster.id}/indices`)
        .then(response => response.json())
        .then(data => {
          // console.log("cluster indices", data)
          data.cluster_id = cluster.id
          setClusterIndices(data)
        });
    } else {
      setClusterIndices([])
    }
  }, [cluster, setClusterIndices, datasetId])

  const [selectedClusterLabel, setSelectedClusterLabel] = useState(null);

  const [hoveredCluster, setHoveredCluster] = useState(null);
  const [hoveredClusterHull, setHoveredClusterHull] = useState(null);
  useEffect(() => {
    if(hovered && clusterIndices.length && clusterLabels.length){
      const index = hovered.index
      const cluster = clusterIndices[index]
      const label = clusterLabels[cluster?.cluster]
      setHoveredCluster({...label, cluster: cluster.cluster})
    } else {
      setHoveredCluster(null)
    }
  }, [hovered, clusterIndices, clusterLabels, setHoveredCluster])


  // const [points, setPoints] = useState([]);
  // // const [loadingPoints, setLoadingPoints] = useState(false);
  // useEffect(() => {
  //   if(umap) {
  //     fetch(`${apiUrl}/datasets/${dataset.id}/umaps/${umap.id}/points`)
  //       .then(response => response.json())
  //       .then(data => {
  //         // console.log("umap points", data)
  //         setPoints(data.map(d => [d.x, d.y]))
  //       })
  //   } else {
  //     setPoints([])
  //   }
  // }, [dataset, umap])

  const prevHullConfig = useRef()
  const [hulls, setHulls] = useState([]);
  useEffect(() => {
    if(clusterLabels.length && umap && cluster && cluster.umap_id == umap.id && clusterLabels.cluster_id == cluster.id) {
      const config = umap.id + cluster.id + clusterLabels.cluster_id
      if(prevHullConfig.current !== config) {
        fetch(`${apiUrl}/datasets/${datasetId}/umaps/${umap.id}/points`).then(response => response.json()).then(data => {
          let pts = data.map(d => [d.x, d.y])
          setHulls(processHulls(clusterLabels, pts))
        })
        prevHullConfig.current = config
      }
    } else {
      // setHulls([])
    }
  }, [datasetId, clusterLabels, cluster, umap])

  const prevPointConfig = useRef()
  const [drawPoints, setDrawPoints] = useState([]);
  useEffect(() => {
    // if cluster and umap are ready and haven't been drawn we update the draw points
    // we also set hulls to empty so they can animate in
    if(clusterIndices.length && umap && cluster && cluster.umap_id == umap.id && clusterIndices.cluster_id == cluster.id) {
      const config = umap.id + cluster.id + clusterIndices.cluster_id
      if(prevPointConfig.current !== config) {
        fetch(`${apiUrl}/datasets/${datasetId}/umaps/${umap.id}/points`).then(response => response.json()).then(data => {
          let pts = data.map((d,i) => [d.x, d.y, clusterIndices[i].cluster])
          setDrawPoints(pts)
          // TODO: this doesn't always work out in the right timing
          // the other useEffect above should be tied to this one somehow
          setHulls([])
        })
        prevPointConfig.current = config
      }
    } else if(umap && !cluster) {
      const config = umap.id
      if(prevPointConfig.current !== config) {
        fetch(`${apiUrl}/datasets/${datasetId}/umaps/${umap.id}/points`).then(response => response.json()).then(data => {
          let pts = data.map((d) => [d.x, d.y, -1])
          setDrawPoints(pts)
          setHulls([])
        })
        prevPointConfig.current = config
      }
    } else if(!umap && !cluster) {
      setHulls([])
      setDrawPoints([])
    }
  }, [datasetId, clusterIndices, cluster, umap])



  // ====================================================================================================
  // progress indicator through stages
  // determine which section (if any) to highlight based on what has been set
  // ====================================================================================================
  const [stage, setStage] = useState(1);
  useEffect(() => {
    // console.log("update stage?", "embedding", embedding, "umap", umap, "cluster", cluster, "clusterLabelSet", clusterLabelSet)
    if(!embedding) {
      setStage(1)
    } else if(!umap) {
      setStage(2)
    } else if(!cluster) {
      setStage(3)
    } else if(!clusterLabelSet) {
      setStage(4)
    } else if(!scope) {
      setStage(5)
    } else {
      setStage(6)
    }
  }, [embedding, umap, cluster, clusterLabelSet, scope])


  const handleNewEmbeddings = useCallback((embs, emb) => {
    dispatch({type: "SET_EMBEDDINGS", payload: embs })
    if(emb) dispatch({ type: "SET_EMBEDDING", payload: emb })
  }, [])

  const handleNewUmaps = useCallback((umaps, ump) => {
    dispatch({ type: "SET_UMAPS", payload: umaps })
    if(ump) dispatch({type: "SET_UMAP", payload: ump })
    // if no umaps for the current embedding, unset the umap
    if(!umaps.filter(d => d.embedding_id == embedding?.id).length) {
      console.log("handling new umap setting null")
      dispatch({type: "SET_UMAP", payload: null })
    }
  }, [embedding])

  const handleNewClusters = useCallback((clusters, cls) => {
    dispatch({ type: "SET_CLUSTERS", payload: clusters })
    if(cls) dispatch({ type: "SET_CLUSTER", payload: cls })
    // if no clusters for the current umap, unset the cluster
    if(!clusters.filter(d => d.umap_id == umap?.id).length) {
      dispatch({ type: "SET_CLUSTER", payload: null })
    }
  }, [umap])
 
  const handleNewClusterLabelSets = useCallback((labels, lbl) => {
    dispatch({ type: "SET_CLUSTER_LABEL_SETS", payload: labels })
    console.log("new cluster label sets", labels, lbl)
    if(lbl) {
       dispatch({ type: "SET_CLUSTER_LABEL_SET", payload: lbl })
       setSelectedClusterLabelSetId(lbl.id)
    }
    // if no labels for the current cluster, unset the labels
    if(!labels.filter(d => d.cluster_id == cluster?.id).length) {
      // dispatch({ type: "SET_CLUSTER_LABEL_SET", payload: null })
      console.log("clearing cluster labels?")
      setClusterLabels([])
    }
  }, [setClusterLabels, setSelectedClusterLabelSetId, cluster])


  const [defaultIndices, setDefaultIndices] = useState(range(0, 100));



  if (!dataset) return <div>Loading...</div>;

  return (
    <div className="dataset--setup">
      <div className="dataset--setup-summary">
        <h3>{datasetId}</h3>
        <div className="dataset--setup-info">
          <div className="dataset--setup-scope-info">
            <div className="dataset--setup-scopes-list">
                {scopes ? 
                  <select className="scope-selector" 
                    onChange={(e) => navigate(`/datasets/${dataset?.id}/setup/${e.target.value}`)}
                    value={scope?.id || ""}
                  >
                    <option value="">New scope</option>
                    {scopes.map((scopeOption, index) => (
                      <option key={index} value={scopeOption.id} >
                        {scopeOption.label} ({scopeOption.id})
                      </option>
                    ))}
                  </select> 
                : null}
            </div>
            { scope ? <Link to={`/datasets/${dataset?.id}/export/${scope?.id}`}> ↗ Export data <br/></Link> 
            : <Link to={`/datasets/${dataset?.id}/export`}> ↗ Export data <br/></Link> }
            { scope ? <Link to={`/datasets/${dataset?.id}/explore/${scope?.id}`}> ↗ Explore <br/></Link> : null } 
            
          </div>
          <div className="job-history">
            <Link to={`/datasets/${dataset?.id}/jobs`}> Job history</Link><br/>
          </div>
        </div>
        <div className="dataset--setup-meta">
          {/* {scope && <div>
            <span>{scope?.label}<br/></span>
            <span>{scope?.description}</span>
          </div>} */}
          {/* {!dataset.column_metadata ? <div className="reimport"> */}
          {!dataset.ls_version ? <div className="reimport">
            <span className="warning-header">WARNING: outdated dataset!</span>
            <button onClick={() => {
              startReingestJob({ text_column: dataset.text_column })
            }}>Reimport</button>
            </div> : null}
          
            <JobProgress job={reingestJob} clearJob={()=> {
              setReingestJob(null)
              fetch(`${apiUrl}/datasets/${datasetId}/meta`)
                .then(response => response.json())
                .then(data => dispatch({ type: "SET_DATASET", payload: data}));
            }}/>
          <div>
            {dataset.length} rows. Columns: {dataset.columns.map(c => {
              let meta = dataset.column_metadata?.[c]
              return (<span key={c} style={{fontWeight: dataset.text_column == c ? "bold" : "normal", margin: "0 4px"}}>
                {c} ({meta?.type})
              </span>)
            })}
          </div>
        </div> 
        
      </div>

      <div className="dataset--setup-layout">
        <div className="dataset--setup-left-column">
          <Stage active={stage == 1} complete={stage > 1} title={`1. Embed`} subtitle={embedding?.id}>
            <Embedding 
              dataset={dataset} 
              textColumn={textColumn} 
              embedding={embedding} 
              umaps={umaps} 
              clusters={clusters} 
              onNew={handleNewEmbeddings} 
              onChange={(emb) => {
                setSelectedEmbeddingId(emb.id)
                dispatch({type:"SET_EMBEDDING", payload: emb})
              }} 
              onTextColumn={handleChangeTextColumn}
              onRemovePotentialEmbedding={handleRemovePotentialEmbedding}
              />
          </Stage>
          <Stage active={stage == 2} complete={stage > 2} title={`2. Project`} subtitle={umap?.id}>
            <Umap 
              dataset={dataset} 
              umap={umap} 
              embedding={embedding} 
              embeddings={embeddings}
              clusters={clusters} 
              onNew={handleNewUmaps} 
              onChange={(ump) => {
                setSelectedUmapId(ump.id)
                dispatch({type: "SET_UMAP", payload: ump})
              }} />
          </Stage>
          <Stage active={stage == 3} complete={stage > 3} title={`3. Cluster`} subtitle={cluster?.id}>
            <Cluster 
              dataset={dataset} 
              cluster={cluster} 
              umap={umap} 
              onNew={handleNewClusters} 
              onChange={(cls) => {
                setSelectedClusterId(cls.id)
                dispatch({type: "SET_CLUSTER", payload: cls })
              }} />
          </Stage>
          <Stage active={stage == 4} complete={stage > 4} title={`4. Auto-Label Clusters`} subtitle={clusterLabelSet?.id}>
            <ClusterLabels 
              dataset={dataset} 
              cluster={cluster} 
              embedding={embedding}
              selectedLabelId={clusterLabelSet?.id} 
              onChange={(lblId) => {
                setSelectedClusterLabelSetId(lblId)
                // dispatch({type: "SET_CLUSTER_LABEL_SET", payload: lbl })
              }} 
              onLabelSets={handleNewClusterLabelSets} 
              onLabels={setClusterLabels} 
              onHoverLabel={setHoveredClusterHull} 
              onClickLabel={(c) => { console.log("CLUSTER", c); setSelectedClusterLabel(c)}} 
            />
          </Stage>
          <Stage active={stage == 5} complete={stage > 5} title="5. Save Scope" allowToggle={false}>
            <Scope 
              dataset={dataset} 
              scope={scope} 
              embedding={embedding} 
              umap={umap} 
              cluster={cluster} 
              clusterLabelId={clusterLabelSet?.id} 
              onNew={(scopes) => dispatch({ type: "SET_SCOPES", payload: scopes})} 
              onChange={(scope) => dispatch({ type: "SET_SCOPE", payload: scope})} />
          </Stage>
        </div>

        {/* RIGHT COLUMN */}
        <div className="dataset--setup-right-column">
          <div className="dataset--setup-preview" style={{
            "maxHeight": drawPoints.length ? "340px" : "95%",
            "minHeight": drawPoints.length ? "340px" : "95%"
            }}>
            {selectedClusterLabel ? <div>
              <b>Cluster {selectedClusterLabel.index}: {selectedClusterLabel.label}</b>
                {/* <IndexDataTable 
                dataset={dataset}
                indices={selectedClusterLabel.indices} 
                datasetId={datasetId} 
                maxRows={100}  
                /> */}
                <FilterDataTable
                dataset={dataset}
                indices={selectedClusterLabel.indices} 
                height={drawPoints.length ? "280px" : "95%"} 
              />
              </div> : <div>
                {/* <b>Dataset Preview</b> */}
              {/* <IndexDataTable 
                dataset={dataset}
                indices={range(0, 100)} 
                datasetId={datasetId} 
                maxRows={100} 
                /> */}
              <FilterDataTable
                dataset={dataset}
                indices={defaultIndices} 
                height={drawPoints.length ? "340px" : "95%"}
              />
              </div> }
          </div>
          {drawPoints.length ? <div>
          <div className="dataset--setup-umap">

            { drawPoints.length ? <Scatter 
              points={drawPoints} 
              width={scopeWidth} 
              height={scopeHeight}
              colorScaleType="categorical"
              duration={1000}
              onScatter={setScatter}
              onView={handleView} 
              onSelect={handleSelected}
              onHover={handleHovered}
              /> : null }
            { hoveredCluster && hoveredCluster.hull ? <HullPlot
              hulls={processHulls([hoveredCluster], drawPoints)}
              fill="lightgray"
              strokeWidth={2}
              duration={0}
              xDomain={xDomain} 
              yDomain={yDomain} 
              width={scopeWidth} 
              height={scopeHeight} /> : null }
            { selectedClusterLabel && selectedClusterLabel.hull ? <HullPlot
              hulls={processHulls([selectedClusterLabel], drawPoints)}
              fill="red"
              stroke="black"
              strokeWidth={2}
              duration={0}
              xDomain={xDomain} 
              yDomain={yDomain} 
              width={scopeWidth} 
              height={scopeHeight} /> : null }
            { hoveredClusterHull && hoveredClusterHull.hull ? <HullPlot
              hulls={processHulls([hoveredClusterHull], drawPoints)}
              fill="orange"
              stroke="black"
              strokeWidth={2}
              duration={0}
              xDomain={xDomain} 
              yDomain={yDomain} 
              width={scopeWidth} 
              height={scopeHeight} /> : null }

              {/* this is the hull plot for the whole map of clusters */}
            { hulls.length ? <HullPlot
              hulls={hulls}
              fill="none"
              stroke="black"
              strokeWidth={1}
              delay={1000}
              duration={200}
              xDomain={xDomain} 
              yDomain={yDomain} 
              width={scopeWidth} 
              height={scopeHeight} /> : null } 
          </div>

          <div className="dataset--hovered">
            {/* Hovered: &nbsp; */}
            {hoveredCluster ? <span><span className="key">Cluster:</span><span className="value">{hoveredCluster.index}: {hoveredCluster.label}</span></span> : null }
            {hovered && Object.keys(hovered).map((key,idx) => {
              let d = hovered[key]
              if(typeof d === 'object' && !Array.isArray(d)) {
                d = JSON.stringify(d)
              }
              let meta = dataset.column_metadata && dataset.column_metadata[key]
              let value;
              if(meta && meta.image) {
                value = <span className="value" key={idx}><img src={d} alt={key} height={64} /></span>
              } else if(meta && meta.url) {
                value = <span className="value" key={idx}><a href={d}>url</a></span>
              } else if(meta && meta.type == "array") {
                value = <span className="value" key={idx}>[{d.length}]</span>
              } else {
                value = <span className="value" key={idx}>{d}</span>
              }
              return (
              <span key={key}>
                <span className="key">{key}:</span> 
                {value}
              </span>
            )})}
            {/* <DataTable  data={hovered} tagset={tagset} datasetId={datasetId} onTagset={(data) => setTagset(data)} /> */}
          </div>

          </div> : null }

          {/* <div className="dataset--selected">
            <span>Points Selected: {selectedIndices.length} {!selectedIndices.length ? "(Hold shift and drag an area of the map to select)" : null}
              {selectedIndices.length > 0 ? 
                <button className="deselect" onClick={() => {
                  setSelectedIndices([])
                  scatter?.select([])
                  scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
                }
                }>X</button> 
              : null}
            </span>
            {selectedIndices.length > 0 ? 
            <div className="dataset--selected-table">
              <IndexDataTable 
                dataset={dataset}
                indices={selectedIndices} 
                datasetId={datasetId} 
                maxRows={150} 
                />
            </div>
            : null }
          </div>
        
         */}
        </div>
      </div>
    </div>
  );
}

export default Setup;