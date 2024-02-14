import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import './Explore.css';
import DataTable from '../components/DataTable';
import IndexDataTable from '../components/IndexDataTable';
import Scatter from '../components/Scatter';
import AnnotationPlot from '../components/AnnotationPlot';
import HullPlot from '../components/HullPlot';


// TODO: decide how to deal with sizing
const scopeWidth = 500
const scopeHeight = 500
const apiUrl = import.meta.env.VITE_API_URL
const readonly = import.meta.env.MODE == "read_only"

function Explore() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams(); 

  const navigate = useNavigate();

  // Tabs
  const tabs = [
    { id: 0, name: "Selected"},
    { id: 1, name: "Search"},
    { id: 2, name: "Clusters"},
    { id: 3, name: "Tags"},
  ]
  const [activeTab, setActiveTab] = useState(2)

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => {
        console.log("dataset", data)
        setDataset(data)
      });
  }, [datasetId, setDataset]);

  const[ scopes, setScopes] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes`)
      .then(response => response.json())
      .then(data => {
        setScopes(data)
      });
  }, [datasetId, setScopes]);


  const[ scope, setScope] = useState(null);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`)
      .then(response => response.json())
      .then(data => {
        console.log("scope", data)
        setScope(data)
      });
  }, [datasetId, scopeId, setScope]);

  const [embedding, setEmbedding] = useState(null);
  const [umap, setUmap] = useState(null);
  const [clusterIndices, setClusterIndices] = useState([]); // the cluster number for each point
  const [clusterLabels, setClusterLabels] = useState([]);
  // The search model is the embeddings model that we pass to the nearest neighbor query
  // we want to enable searching with any embedding set
  const [searchModel, setSearchModel] = useState(embedding?.id)


  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/embeddings`)
      .then(response => response.json())
      .then(data => {
        // console.log("embeddings", data)
        setEmbeddings(data)
      });
  }, [datasetId, setEmbeddings]);


  useEffect(() => {
    if(scope) {
      setEmbedding(embeddings.find(e => e.id == scope.embedding_id))
      fetch(`${apiUrl}/datasets/${datasetId}/umaps/${scope.umap_id}`)
        .then(response => response.json())
        .then(data => {
          console.log("umap", data)
          setUmap(data)
        });
      fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster_id}/labels/${scope.cluster_labels_id}`)
        .then(response => response.json())
        .then(data => {
          console.log("labels", data)
          setClusterLabels(data)
          // setClusterLabels(data.map((d,i) => ({...d, index: i})))
        });
      fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster_id}/indices`)
        .then(response => response.json())
        .then(data => {
          console.log("cluster indices", data)
          setClusterIndices(data)
        });
    }
  }, [datasetId, scope, embeddings, setUmap, setClusterLabels, setEmbedding, setSearchModel]);

  const memoClusterIndices = useMemo(() => {
    return clusterIndices.map(d => d.cluster)
  }, [clusterIndices])


  useEffect(() => {
    if(embedding) {
      setSearchModel(embedding.id)
    }
  }, [embedding, setSearchModel])


  // const [activeUmap, setActiveUmap] = useState(null)
  const handleModelSelect = (model) => {
    console.log("selected", model)
    setSearchModel(model)
  }

  // ====================================================================================================
  // Points for rendering the scatterplot
  // ====================================================================================================
  const [points, setPoints] = useState([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  useEffect(() => {
    if(umap) {
      fetch(`${apiUrl}/datasets/${dataset.id}/umaps/${umap.id}/points`)
        .then(response => response.json())
        .then(data => {
          console.log("umap points", data)
          setPoints(data.map(d => [d.x, d.y]))
        })
    }
  }, [dataset, umap])
   

  const hydrateIndices = useCallback((indices, setter, distances = []) => {
    fetch(`${apiUrl}/indexed?dataset=${datasetId}&indices=${JSON.stringify(indices)}`)
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



  // ====================================================================================================
  // Scatterplot related logic
  // ====================================================================================================
  // this is a reference to the regl scatterplot instance
  // so we can do stuff like clear selections without re-rendering
  const [scatter, setScatter] = useState({})
  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);
  const handleView = useCallback((xDomain, yDomain) => {
    setXDomain(xDomain);
    setYDomain(yDomain);
  }, [setXDomain, setYDomain])
  // Selection via Scatterplot
  // indices of items selected by the scatter plot
  const [selectedIndices, setSelectedIndices] = useState([]);

  const handleSelected = useCallback((indices) => {
    console.log("handle selected", indices)
    setSelectedIndices(indices);
    setActiveTab(0)
    // for now we dont zoom because if the user is selecting via scatter they can easily zoom themselves
    // scatter?.zoomToPoints(indices, { transition: true })
  }, [setSelectedIndices, setActiveTab])

  // Hover via scatterplot or tables
  // index of item being hovered over
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    if(hoveredIndex !== null && hoveredIndex !== undefined) {
      hydrateIndices([hoveredIndex], (results) => {
        setHovered(results[0])
      })
    } else {
      setHovered(null)
    }
  }, [hoveredIndex, setHovered, hydrateIndices])

  const [hoveredCluster, setHoveredCluster] = useState(null);
  useEffect(() => {
    if(hovered && clusterIndices.length && clusterLabels.length){
      const index = hovered.index
      const cluster = clusterIndices[index]
      const label = clusterLabels[cluster?.cluster]
      setHoveredCluster({cluster: cluster.cluster, ...label})
    } else {
      setHoveredCluster(null)
    }
  }, [hovered, clusterIndices, clusterLabels, setHoveredCluster])

  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  useEffect(() => {
    if(hoveredIndex !== null && hoveredIndex !== undefined) {
      setHoverAnnotations([points[hoveredIndex]])
    } else {
      setHoverAnnotations([])
    }
  }, [hoveredIndex, points])

  // ====================================================================================================
  // Tags
  // ====================================================================================================
  const [tagset, setTagset] = useState({});
  useEffect(() => {
    fetch(`${apiUrl}/tags?dataset=${datasetId}`)
      .then(response => response.json())
      .then(data => setTagset(data));
  }, [datasetId])
  const tags = useMemo(() => {
    const tags = []
    for (const tag in tagset) {
      tags.push(tag)
    }
    // console.log("tagset", tagset, tags)
    return tags
  }, [tagset])

  const [tag, setTag] = useState(tags[0]);

  const [tagAnnotations, setTagAnnotations] = useState([]);
  useEffect(() => {
    if(tagset[tag]) {
      const annots = tagset[tag].map(index => points[index])
      setTagAnnotations(annots)
    } else {
      setTagAnnotations([])
      if(scatter && scatter.config) {
        scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      } 
    }
  }, [tagset, tag, points, scatter, setTagAnnotations])

  // Search
  // the indices returned from similarity search
  const [searchIndices, setSearchIndices] = useState([]);
  const [distances, setDistances] = useState([]);

  const searchQuery = useCallback((query) => {
    fetch(`${apiUrl}/search/nn?dataset=${datasetId}&query=${query}&embedding_id=${searchModel}`)
      .then(response => response.json())
      .then(data => {
        // console.log("search", data)
        setDistances(data.distances);
        setSearchIndices(data.indices);
        scatter?.zoomToPoints(data.indices, { transition: true, padding: 0.2, transitionDuration: 1500 })
      });
  }, [searchModel, datasetId, scatter, setDistances, setSearchIndices]);

  const [searchAnnotations, setSearchAnnotations] = useState([]);
  useEffect(() => {
    const annots = searchIndices.map(index => points[index])
    setSearchAnnotations(annots)
  }, [searchIndices, points])

  // ====================================================================================================
  // Clusters
  // ====================================================================================================
  // indices of items in a chosen slide
  const [slide, setSlide] = useState(null);
  const [slideAnnotations, setSlideAnnotations] = useState([]);
  useEffect(() => {
    if(slide) {
      const annots = slide.indices.map(index => points[index])
      setSlideAnnotations(annots)
    } else {
      setSlideAnnotations([])
      if(scatter && scatter.config) {
        scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      } 
    }
  }, [slide, points, scatter, setSlideAnnotations])

  const [clusterLabel, setClusterLabel] = useState(slide?.label || '');

  useEffect(() => {
    setClusterLabel(slide?.label || '');
  }, [slide]);

  // Handlers for responding to individual data points
  const handleClicked = useCallback((index) => {
    scatter?.zoomToPoints([index], { transition: true, padding: 0.9, transitionDuration: 1500 })
  }, [scatter])
  const handleHover = useCallback((index) => {
    setHoveredIndex(index);
  }, [setHoveredIndex])

  const handleLabelUpdate = useCallback((index, label) => {
    console.log("update label", index, label)
    fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster_id}/labels/${scope.cluster_labels_id}/label/${index}?label=${label}`)
      .then(response => response.json())
      .then(_ => {
        fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster_id}/labels/${scope.cluster_labels_id}`)
          .then(response => response.json())
          .then(data => {
            console.log("got new labels", data)
            setClusterLabels(data);
          })
          .catch(console.error);
      })
      .catch(console.error);
  }, [datasetId, scope])

  const clearScope = useCallback(() => {
    setSlide(null)
    setClusterLabels([])
    setPoints([])
  }, [])

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className="dataset--explore">
      <div className="column">
        <div className="first-row summary">
          <div className="scope-card">
            <h3> 
              {/* {scope?.label || scope?.id} */}

              {datasetId}: <select className="scope-selector" onChange={(e) => {
                  clearScope()
                  navigate(`/datasets/${dataset?.id}/explore/${e.target.value}`)
                }}>
                {scopes.map((scopeOption, index) => (
                  <option key={index} value={scopeOption.id} selected={scopeOption.id === scope?.id}>
                    {scopeOption.label || scopeOption.id}
                  </option>
                ))}
              </select>
              {readonly ? null : <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure</Link> }
            </h3>
            <span>{scope?.description}</span>
            <span>Embeddings: {embedding?.model_id}</span>
            <span>{clusterLabels?.length} clusters</span>
          </div>
          <div className="dataset-card">
            <span>{dataset?.length} rows</span>
          </div>
        </div>
        <div className="second-row">
          <div className="umap-container">
            <div className="scatters" style={{ width: scopeWidth, height: scopeHeight }}>
            { points.length ? <><Scatter 
                points={points} 
                colors={memoClusterIndices}
                loading={loadingPoints} 
                width={scopeWidth} 
                height={scopeHeight}
                onScatter={setScatter}
                onView={handleView} 
                onSelect={handleSelected}
                onHover={handleHover}
                /> 
              { hoveredCluster && hoveredCluster.hull && !scope.ignore_hulls ? <HullPlot
                points={points}
                hulls={[hoveredCluster?.hull]}
                fill="lightgray"
                xDomain={xDomain} 
                yDomain={yDomain} 
                width={scopeWidth} 
                height={scopeHeight} /> : null }

              { slide && slide.hull && !scope.ignore_hulls ? <HullPlot
                points={points}
                hulls={[slide?.hull]}
                fill="darkgray"
                xDomain={xDomain} 
                yDomain={yDomain} 
                width={scopeWidth} 
                height={scopeHeight} /> : null }
              { clusterLabels.length && !scope.ignore_hulls ? <HullPlot
                points={points}
                hulls={clusterLabels.map(d => d.hull)}
                stroke="lightgray"
                xDomain={xDomain} 
                yDomain={yDomain} 
                width={scopeWidth} 
                height={scopeHeight} /> : null }
              <AnnotationPlot 
                points={searchAnnotations} 
                fill="black"
                size="8"
                xDomain={xDomain} 
                yDomain={yDomain} 
                width={scopeWidth} 
                height={scopeHeight} 
                />
              <AnnotationPlot 
                points={slideAnnotations} 
                fill="darkred"
                size="8"
                xDomain={xDomain} 
                yDomain={yDomain} 
                width={scopeWidth} 
                height={scopeHeight} 
                />
              
              <AnnotationPlot 
                points={tagAnnotations} 
                symbol={tag}
                size="20"
                xDomain={xDomain} 
                yDomain={yDomain} 
                width={scopeWidth} 
                height={scopeHeight} 
                />
              <AnnotationPlot 
                points={hoverAnnotations} 
                stroke="black"
                fill="orange"
                size="16"
                xDomain={xDomain} 
                yDomain={yDomain} 
                width={scopeWidth} 
                height={scopeHeight} 
                />
              
              </> : null }
              
            </div>
          </div>
          <div className="hovered-point">
            {/* Hovered: &nbsp; */}
            {hovered && Object.keys(hovered).map((key) => (
              <span key={key}>
                <span className="key">{key}:</span> 
                <span className="value">{hovered[key]}</span>
              </span>
            ))}
            {hoveredCluster ? <span><span className="key">Cluster {hoveredCluster.index}:</span><span className="value">{hoveredCluster.label}</span></span> : null }
            {/* <DataTable  data={hovered} tagset={tagset} datasetId={datasetId} onTagset={(data) => setTagset(data)} /> */}
          </div>
        </div>
      </div>

      <div className="column">
        <div className="second-row tab-tables">

          <div className="tab-header">
            {tabs.map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)}
                className={tab.id === activeTab ? 'tab-active' : 'tab-inactive'}>
                  {tab.name}
              </button>
            ))}
          </div>

            {activeTab === 0 ?
            <div className="tab-content tab-selected">
              <span>Selected: {selectedIndices?.length} 
                {selectedIndices?.length > 0 ? 
                  <button className="deselect" onClick={() => {
                    setSelectedIndices([])
                    scatter?.select([])
                    scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
                  }
                  }>X</button> 
                : null}
              </span>
              {selectedIndices?.length > 0 ? 
                <IndexDataTable 
                  indices={selectedIndices}
                  clusterIndices={clusterIndices}
                  clusterLabels={clusterLabels}
                  tagset={tagset} 
                  dataset={dataset} 
                  maxRows={150} 
                  onTagset={(data) => setTagset(data)} 
                  onHover={handleHover} 
                  onClick={handleClicked}
                  />
              : null }
            </div>
            : null }

            {activeTab === 1 ? 
            <div className="tab-content tab-neighbors">
              <div className="search-box">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  searchQuery(e.target.elements.searchBox.value);
                  setActiveTab(1)
                }}>
                  <input type="text" id="searchBox" />
                  <button type="submit">Similarity Search</button>
                  <br/>
                  <label htmlFor="embeddingModel"></label>
                  <select id="embeddingModel" 
                    onChange={(e) => handleModelSelect(e.target.value)} 
                    value={searchModel}>
                    {embeddings.map((emb, index) => (
                      <option key={index} value={emb.id}>{emb.id} - {emb.model_id}</option>
                    ))}
                  </select>
                  
                </form>
              </div>
              <span>
              { searchIndices.length ? <span>Nearest Neighbors: {searchIndices.length} (capped at 150) </span> : null }
                {searchIndices.length > 0 ? 
                  <button className="deselect" onClick={() => {
                    setSearchIndices([])
                    document.getElementById("searchBox").value = "";
                  }
                  }>X</button> 
                : null}
              </span>
              {searchIndices.length > 0 ?
                <IndexDataTable 
                  indices={searchIndices} 
                  distances={distances}
                  clusterIndices={clusterIndices}
                  clusterLabels={clusterLabels}
                  tagset={tagset} 
                  dataset={dataset} 
                  onTagset={(data) => setTagset(data)} 
                  onHover={handleHover} 
                  onClick={handleClicked}
                />
              : null }
            </div>
            : null }

            {activeTab === 2 ? 
             <div className="tab-content tab-cluster">
              <div className="clusters-select">
                <select onChange={(e) => {
                    const cl = clusterLabels.find(cluster => cluster.index === +e.target.value)
                    if(cl)
                      setSlide(cl)
                  }} value={slide?.index}>
                    <option value="">Select a cluster</option>
                  {clusterLabels.map((cluster, index) => (
                    <option key={index} value={cluster.index}>{cluster.index}: {cluster.label}</option>
                  ))}
                </select>
              </div>
              <div className="cluster-selected">
                { slide ? 
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleLabelUpdate(slide.index, clusterLabel);
                  }}>
                    <input 
                      type="text" 
                      id="new-label" 
                      value={clusterLabel} 
                      onChange={(e) => setClusterLabel(e.target.value)}  />
                    <button type="submit">Update Label</button>
                  </form> 
                : null }
                <span>{slide?.indices.length} {slide?.indices.length ? "Rows" :""}
                { slide ? <button className="deselect" onClick={() => {
                    setSlide(null)
                  }
                  }>X</button> 
                : null}
              </span>
              </div>
              <div className="cluster-table">
                { slide?.indices ? 
                  <IndexDataTable 
                    indices={slide?.indices} 
                    clusterIndices={clusterIndices}
                    clusterLabels={clusterLabels}
                    dataset={dataset} 
                    tagset={tagset} 
                    onTagset={(data) => setTagset(data)} 
                    onHover={handleHover} 
                    onClick={handleClicked}
                  />
                : null }
                </div>
              </div>
            : null }

            {activeTab === 3 ? 
              <div className="tab-content tab-tag">
                <div className="tags-box">
                  <div className="tags-select">
                    Tags: {tags.map(t => {
                      return <button className="dataset--tag-link" key={t} onClick={() => {
                        setTag(t)
                        setActiveTab(3)
                        scatter?.zoomToPoints(tagset[t], { transition: true, padding: 0.2, transitionDuration: 1500 })
                      }}>{t}({tagset[t].length})</button>
                    })}
                  </div>
                  {readonly ? null : <div className="new-tag">
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const newTag = e.target.elements.newTag.value;
                      fetch(`${apiUrl}/tags/new?dataset=${datasetId}&tag=${newTag}`)
                        .then(response => response.json())
                        .then(data => {
                          console.log("new tag", data)
                          setTagset(data);
                        });
                    }}>
                      <input type="text" id="newTag" />
                      <button type="submit">New Tag</button>
                    </form>
                  </div>}
                </div>
                <span>{tag} {tagset[tag]?.length}
                  { tag ? <button className="deselect" onClick={() => {
                      setTag(null)
                    }
                    }>X</button> 
                  : null}
                </span>
                { tagset[tag] ? 
                  <IndexDataTable 
                    indices={tagset[tag]}
                    clusterIndices={clusterIndices}
                    clusterLabels={clusterLabels}
                    tagset={tagset} 
                    dataset={dataset} 
                    onTagset={(data) => setTagset(data)} 
                    onHover={handleHover} 
                    onClick={handleClicked}
                  />
                : null }
              </div>
            : null }
        </div>
      </div>
    </div>
  );
}

export default Explore;
