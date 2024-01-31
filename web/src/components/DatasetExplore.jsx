import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';

import './DatasetExplore.css';
import DataTable from './DataTable';
import Scatter from './Scatter';
import AnnotationPlot from './AnnotationPlot';
import SlideBar from './SlideBar';


// TODO: decide how to deal with sizing
const scopeWidth = 500
const scopeHeight = 500

function DatasetDetail() {
  const apiUrl = import.meta.env.VITE_API_URL
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams(); 

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => {
        console.log("dataset", data)
        setDataset(data)
      });
  }, [datasetId, setDataset]);

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
  const [clusterLabels, setClusterLabels] = useState([]);
  // The search model is the embeddings model that we pass to the nearest neighbor query
  // we want to enable searching with any embedding set
  const [searchModel, setSearchModel] = useState(embedding)

  useEffect(() => {
    if(scope) {
      setEmbedding(scope.embeddings)
      setSearchModel(scope.embeddings)
      fetch(`${apiUrl}/datasets/${datasetId}/umaps/${scope.umap}`)
        .then(response => response.json())
        .then(data => {
          console.log("umap", data)
          setUmap(data)
        });
      fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster}/labels/${scope.cluster_labels || 'default'}`)
        .then(response => response.json())
        .then(data => {
          console.log("umap", data)
          setClusterLabels(data)
        });
    }
  }, [datasetId, scope, setUmap, setClusterLabels, setEmbedding, setSearchModel]);


  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/embeddings`)
      .then(response => response.json())
      .then(data => {
        // console.log("embeddings", data)
        setEmbeddings(data)
      });
  }, [datasetId, setEmbeddings]);

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
      fetch(`${apiUrl}/datasets/${dataset.id}/umaps/${umap.name}/points`)
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
        // console.log("neighbors", data)
        const text_column = dataset.text_column
        let rows = data.map((row, index) => {
          return {
            index: indices[index],
            ...row
            // text: row[text_column],
            // score: row.score, // TODO: this is custom to one dataset
            // distance: distances[index],
            // date: row.date,
          }
        })
        rows.sort((a, b) => b.score - a.score)
        setter(rows)
        // console.log("rows", rows)
      })
  }, [dataset, datasetId])

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
  const [tagrows, setTagrows] = useState([]);
  useEffect(() => {
    if(tagset[tag]) {
      hydrateIndices(tagset[tag], setTagrows)

      } else {
        setTagrows([])
      }
  }, [dataset, tag, tagset])

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
  }, [tagset, tag, points])

  // Search
  // the indices returned from similarity search
  const [searchIndices, setSearchIndices] = useState([]);
  const [distances, setDistances] = useState([]);

  const searchQuery = useCallback((query) => {
    fetch(`${apiUrl}/search/nn?dataset=${datasetId}&query=${query}&model=${searchModel}`)
      .then(response => response.json())
      .then(data => {
        // console.log("search", data)
        setDistances(data.distances);
        setSearchIndices(data.indices);
        console.log("SEARCH RESULTS", data)
        scatter?.zoomToPoints(data.indices, { transition: true, padding: 0.2, transitionDuration: 1500 })
      });
  }, [searchModel]);

  const [neighbors, setNeighbors] = useState([]);
  useEffect(() => {
    hydrateIndices(searchIndices, setNeighbors, distances)
  }, [searchIndices, setNeighbors, distances])

  const [searchAnnotations, setSearchAnnotations] = useState([]);
  useEffect(() => {
    const annots = searchIndices.map(index => points[index])
    setSearchAnnotations(annots)
  }, [searchIndices, points])

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
  })
  // Selection via Scatterplot
  // indices of items selected by the scatter plot
  const [selectedIndices, setSelectedIndices] = useState([]);
  const [selected, setSelected] = useState([]);
  useEffect(() => {
    hydrateIndices(selectedIndices, setSelected)
  }, [selectedIndices, setSelected])

  const handleSelected = useCallback((indices) => {
    setSelectedIndices(indices);
    setActiveTab(0)
    // for now we dont zoom because if the user is selecting via scatter they can easily zoom themselves
    // scatter?.zoomToPoints(indices, { transition: true })
  })
  // // If only one item is selected, do a NN search for it
  // useEffect(() => {
  //   if(selected.length === 1){
  //     searchQuery(selected[0].text)
  //   }
  // }, [selected])

  // Hover via scatterplot or tables
  // index of item being hovered over
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState([]);
  useEffect(() => {
    if(hoveredIndex !== null && hoveredIndex !== undefined) {
      hydrateIndices([hoveredIndex], setHovered)
    } else {
      setHovered([])
    }
  }, [hoveredIndex, setHovered])

  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  useEffect(() => {
    if(hoveredIndex !== null && hoveredIndex !== undefined) {
      setHoverAnnotations([points[hoveredIndex]])
    } else {
      setHoverAnnotations([])
    }
  }, [hoveredIndex, points])

  // Tabs
  const tabs = [
    { id: 0, name: "Selected"},
    { id: 1, name: "Search"},
    { id: 2, name: "Clusters"},
    { id: 3, name: "Tags"},
  ]
  const [activeTab, setActiveTab] = useState(2)

  // ====================================================================================================
  // Clusters
  // ====================================================================================================
  // indices of items in a chosen slide
  const [slideIndices, setSlideIndices] = useState([]);
  const [slide, setSlide] = useState(null);
  const [slideHover, setSlideHover] = useState(null);
  const [slideRows, setSlideRows] = useState([]);
  // useEffect(() => {
  //   if(scope) {
  //     fetch(`${apiUrl}/datasets/${datasetId}/clusters/${scope.cluster}/labels`)
  //       .then(response => response.json())
  //       .then(data => {
  //         console.log("cluster labels", data)
  //         setClusterLabels(data)
  //       });
  //     } else {
  //       setClusterLabels([])
  //     }
  // }, [scope, setClusterLabels, datasetId])
  useEffect(() => {
    if(slide) {
      fetch(`${apiUrl}/indexed?dataset=${datasetId}&indices=${JSON.stringify(slide.indices)}`)
        .then(response => response.json())
        .then(data => {
          const text_column = dataset.text_column
          let rows = data.map((row, index) => {
            return {
              index: slide.indices[index],
              text: row[text_column],
              score: row.score, // TODO: this is custom to one dataset
              date: row.date,
            }
          })
          rows.sort((a, b) => b.score - a.score)
          setSlideRows(rows)
        }).catch(e => console.log(e));
      } else {
        setSlideRows([])
      }
  }, [datasetId, slide])

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
  }, [slide, points])
  const [slideHoverAnnotations, setSlideHoverAnnotations] = useState([]);
  useEffect(() => {
    if(slideHover) {
      const annots = slideHover.indices.map(index => points[index])
      setSlideHoverAnnotations(annots)
    } else {
      setSlideHoverAnnotations([])
    }
  }, [slideHover, points])



  const handleSlideClick = useCallback((slide) => {
    setSlide(slide)
    setActiveTab(2)
    scatter?.zoomToPoints(slide.indices, { transition: true, padding: 0.5, transitionDuration: 1500 })
  })

  const handleSlideHover = useCallback((slide) => {
    setSlideHover(slide)
  })


  // Handlers for responding to individual data points
  const handleClicked = useCallback((index) => {
    scatter?.zoomToPoints([index], { transition: true, padding: 0.9, transitionDuration: 1500 })
  })
  const handleHover = useCallback((index) => {
    setHoveredIndex(index);
  })

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className="dataset--explore">
      <div className="column">
        <div className="first-row summary">
          <h3> {datasetId}  [{scope?.name}]
              <Link to={`/datasets/${dataset?.id}/setup/${scope?.name}`}>Configure</Link> 
          </h3>
          {dataset?.length} rows<br/>
          Embedding model:<br/> {embedding}<br/>
        </div>
        <div className="second-row">
          <div className="umap-container">
            <div className="scatters" style={{ width: scopeWidth, height: scopeHeight }}>
              <Scatter 
                points={points} 
                loading={loadingPoints} 
                width={scopeWidth} 
                height={scopeHeight}
                onScatter={setScatter}
                onView={handleView} 
                onSelect={handleSelected}
                onHover={handleHover}
                />
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
                points={slideHoverAnnotations} 
                fill="red"
                size="12"
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
              
            </div>
          </div>
          <div className="hovered-point">
            {/* Hovered: &nbsp; */}
            {hovered[0] && Object.keys(hovered[0]).map((key) => (
              <span key={key}>
                <span className="key">{key}:</span> 
                <span className="value">{hovered[0][key]}</span>
              </span>
            ))}
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
              <span>Selected: {selected.length} 
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
                <DataTable 
                  data={selected} 
                  tagset={tagset} 
                  datasetId={datasetId} 
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
                    {embeddings.map((embedding, index) => (
                      <option key={index} value={embedding}>{embedding}</option>
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
              {neighbors.length > 0 ?
                <DataTable 
                  data={neighbors} 
                  tagset={tagset} 
                  datasetId={datasetId} 
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
                    const cl = clusterLabels.find(cluster=> cluster.label === e.target.value)
                    if(cl)
                      setSlide(cl)
                  }} value={slide?.label}>
                    <option value="">Select a cluster</option>
                  {clusterLabels.map((cluster, index) => (
                    <option key={index} value={cluster.label}>{cluster.label}</option>
                  ))}
                </select>
              </div>
              <div className="cluster-selected">
                <span>{slide?.indices.length} {slide?.indices.length ? "Rows" :""}
                { slide ? <button className="deselect" onClick={() => {
                  console.log("SLIDE", slide)
                    setSlide(null)
                  }
                  }>X</button> 
                : null}
              </span>
              </div>
              <div className="cluster-table">
                { slideRows.length ? 
                  <DataTable 
                    data={slideRows} 
                    tagset={tagset} 
                    datasetId={datasetId} 
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
                  <div className="new-tag">
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
                  </div>
                </div>
                <span>{tag} {tagset[tag]?.length}
                  { tag ? <button className="deselect" onClick={() => {
                      setTag(null)
                    }
                    }>X</button> 
                  : null}
                </span>
                { tagrows.length ? 
                  <DataTable 
                    data={tagrows} 
                    tagset={tagset} 
                    datasetId={datasetId} 
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

export default DatasetDetail;
