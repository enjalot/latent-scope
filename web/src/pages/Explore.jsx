import { useReducer, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import './Explore.css';
// import DataTable from '../components/DataTable';
// import IndexDataTable from '../components/IndexDataTable';
import FilterDataTable from '../components/FilterDataTable';
import Scatter from '../components/Scatter';
import AnnotationPlot from '../components/AnnotationPlot';
import HullPlot from '../components/HullPlot';

import Tagging from '../components/Bulk/Tagging';
import Clustering from '../components/Bulk/Clustering';
// import Saving from '../components/Bulk/Saving';
import Deleting from '../components/Bulk/Deleting';


const apiUrl = import.meta.env.VITE_API_URL
const readonly = import.meta.env.MODE == "read_only"

// unfortunately regl-scatter doesn't even render in iOS
const isIOS = () => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}
// let's warn mobile users (on demo in read-only) that desktop is better experience
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

function processHulls(labels, points, indexMap) {
  if(!labels) return []
  return labels.map(d => {
    return d.hull.map(i => points[indexMap[i]])
  })
}

function Explore() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams();

  const navigate = useNavigate();

  const containerRef = useRef(null);
  const filtersContainerRef = useRef(null);

  // let's fill the container and update the width and height if window resizes
  const [scopeWidth, scopeHeight] = useWindowSize();
  function useWindowSize() {
    const [size, setSize] = useState([500,500]);
    useEffect(() => {
      function updateSize() {
        if(!containerRef.current) return
        const { height, width } = containerRef.current.getBoundingClientRect()
        // console.log("width x height", width, height)
        let swidth = width > 500 ? 500 : width - 50
        setSize([swidth, swidth]);
      }
      window.addEventListener('resize', updateSize);
      updateSize();
      setTimeout(updateSize, 100)
      return () => window.removeEventListener('resize', updateSize);
    }, []);
    return size;
  }

  const [filtersHeight, setFiltersHeight] = useState(250);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const {height} = entry.contentRect;
        setFiltersHeight(height);
      }
    });

    let node = filtersContainerRef.current
    if (node) {
      resizeObserver.observe(node);
    } else {
      setTimeout(() => {
        node = filtersContainerRef.current
        resizeObserver.observe(node)
      }, 100)
    }

    return () => {
      if (node) {
        resizeObserver.unobserve(node);
      }
    };
  }, []);

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => {
        console.log("dataset", data)
        setDataset(data)
      });
  }, [datasetId, setDataset]);

  const [scopes, setScopes] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes`)
      .then(response => response.json())
      .then(data => {
        setScopes(data)
      });
  }, [datasetId, setScopes]);


  const [delay, setDelay] = useState(200)
  const [scope, setScope] = useState(null);
  const fetchScopeMeta = useCallback(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`)
      .then(response => response.json())
      .then(data => {
        console.log("scope", data)
        setScope(data)
      });
  }, [datasetId, scopeId, setScope]);

  useEffect(() => {
   fetchScopeMeta() 
  }, [datasetId, scopeId, fetchScopeMeta]);

  const [embedding, setEmbedding] = useState(null);
  const [clusterMap, setClusterMap] = useState({})
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


  const [scopeRows, setScopeRows] = useState([])
  const [points, setPoints] = useState([]);
  const [drawPoints, setDrawPoints] = useState([]); // this is the points with the cluster number
  const [hulls, setHulls] = useState([]); 
  const [scopeToInputIndexMap, setScopeToInputIndexMap] = useState({})
  const [inputToScopeIndexMap, setInputToScopeIndexMap] = useState({})

  const fetchScopeRows = useCallback(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scope.id}/parquet`)
      .then(response => response.json())
      .then(scopeRows => {
        // console.log("scope rows", scopeRows)
        setScopeRows(scopeRows)

        // calculate scopeIndexMap
        let sim = {}
        let ism = {}
        scopeRows.forEach((d,i) => {
          ism[d.ls_index] = i
          sim[i] = d.ls_index
        })
        setScopeToInputIndexMap(sim)
        setInputToScopeIndexMap(ism)

        // console.log("set points")
        // const pts = pointsData.map(d => [d.x, d.y])
        const pts = scopeRows.map(d => [d.x, d.y])
        setPoints(pts)

        // const dpts = pointsData.map((d, i) => [d.x, d.y, clusterIndicesData[i].cluster])
        const dpts = scopeRows.map((d, i) => [d.x, d.y, d.cluster])
        setDrawPoints(dpts)
        setHulls([])

        // console.log("SCOPE", scope)
        const labelsData = scope.cluster_labels_lookup || []
        // console.log("labels", labelsData);
        setClusterLabels(labelsData);

        // console.log("cluster indices", clusterIndicesData);
        // setClusterIndices(clusterIndicesData);
        setClusterIndices(scopeRows.map(d => d.cluster));

        let clusterMap = {}
        scopeRows.forEach(d => {
          clusterMap[d.ls_index] = scope.cluster_labels_lookup?.[d.cluster]
        })
        setClusterMap(clusterMap)

        setTimeout(() => {
          if(labelsData)
            setHulls(processHulls(labelsData, pts, ism))
        }, 100)

      }).catch(error => console.error("Fetching data failed", error));
  }, [datasetId, scope, setHulls, setClusterMap, setClusterLabels, setClusterIndices, setPoints]);

  useEffect(() => {
    if (scope) {
      setEmbedding(embeddings.find(e => e.id == scope.embedding_id))
      fetchScopeRows()
    }
  }, [fetchScopeRows, scope, embeddings, setClusterLabels, setEmbedding, setSearchModel]);


  useEffect(() => {
    if (embedding && embedding.model_id) {
      setSearchModel(embedding.id)
    } else if(embeddings.length) {
      const emb = embeddings.find(d => !!d.model_id)
      if(emb)
        setSearchModel(emb.id)
    }
  }, [embedding, embeddings, setSearchModel])

  useEffect(() => {
    // console.log("search model", searchModel)
  }, [searchModel])


  // const [activeUmap, setActiveUmap] = useState(null)
  const handleModelSelect = (model) => {
    console.log("selected", model)
    setSearchModel(model)
  }


  const hydrateIndices = useCallback((indices, setter, distances = []) => {
    fetch(`${apiUrl}/indexed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataset: datasetId, indices: indices }),
    })
      .then(response => response.json())
      .then(data => {
        if (!dataset) return;
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
    // console.log("handle selected", indices)
    // we have to map from the scatterplot indices to the ls_index of the original input data (in case any has been deleted)
    let idxs = indices.map(i => scopeToInputIndexMap[i])
    setSelectedIndices(idxs);
    // for now we dont zoom because if the user is selecting via scatter they can easily zoom themselves
    // scatter?.zoomToPoints(indices, { transition: true })
  }, [setSelectedIndices, scopeToInputIndexMap])

  // Hover via scatterplot or tables
  // index of item being hovered over
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      hydrateIndices([scopeToInputIndexMap[hoveredIndex]], (results) => {
        setHovered(results[0])
      })
    } else {
      setHovered(null)
    }
  }, [hoveredIndex, setHovered, hydrateIndices, scopeToInputIndexMap])

  const [hoveredCluster, setHoveredCluster] = useState(null);
  useEffect(() => {
    if (hoveredIndex) {
      setHoveredCluster(clusterMap[scopeToInputIndexMap[hoveredIndex]])
    } else {
      setHoveredCluster(null)
    }
  }, [hoveredIndex, clusterMap, scopeToInputIndexMap, setHoveredCluster])

  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      setHoverAnnotations([points[hoveredIndex]])
    } else {
      setHoverAnnotations([])
    }
  }, [hoveredIndex, points])

  // ====================================================================================================
  // Tags
  // ====================================================================================================
  const [tagset, setTagset] = useState({});

  const fetchTagSet = useCallback(() => {
    fetch(`${apiUrl}/tags?dataset=${datasetId}`)
      .then(response => response.json())
      .then(data => setTagset(data));
  }, [datasetId, setTagset])

  useEffect(() => {
    fetchTagSet()
  }, [fetchTagSet])

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
    if (tagset[tag]) {
      const annots = tagset[tag].map(index => points[index])
      setTagAnnotations(annots)
    } else {
      setTagAnnotations([])
      if (scatter && scatter.config) {
        // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
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
        let indices = data.indices.filter(d => inputToScopeIndexMap[d] >= 0)
        // setDistances(data.distances); // TODO: if we want distances we'd need to filter them at the same time
        setSearchIndices(indices);
        // scatter?.zoomToPoints(data.indices, { transition: true, padding: 0.2, transitionDuration: 1500 })
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
    if (slide) {
      // const annots = slide.indices.map(index => points[index])
      const annots = drawPoints.filter(p => p[2] == slide.cluster)
      setSlideAnnotations(annots)
    } else {
      setSlideAnnotations([])
      if (scatter && scatter.config) {
        // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      }
    }
  }, [slide, points, scatter, setSlideAnnotations])

  const [clusterLabel, setClusterLabel] = useState(slide?.label || '');
  const [newClusterLabel, setNewClusterLabel] = useState('')
  useEffect(() => {
    setNewClusterLabel('')
  }, [slide])

const handleNewCluster = useCallback((label) => {
    console.log("new cluster", label)
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scope.id}/new-cluster?label=${label}`)
      .then(response => response.json())
      .then(data => {
        console.log("what happened?", data)
        fetchScopeMeta()
      })
  }, [datasetId, scope, fetchScopeMeta])



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

  const handleLabelUpdate = useCallback((cluster, label) => {
    console.log("update label", cluster, label)
    fetch(`${apiUrl}/bulk/change-cluster-name?dataset_id=${datasetId}&scope_id=${scope.id}&cluster=${cluster}&new_label=${label}`)
      .then(response => response.json())
      .then(data => {
        console.log("got new labels", data)
        fetchScopeMeta()
      })
  }, [datasetId, scope])

  const clearScope = useCallback(() => {
    setSlide(null)
    // setClusterLabels([])
    // setPoints([])
  }, [])


  const [columnIndices, setColumnIndices] = useState([])
  const [columnFiltersActive, setColumnFiltersActive] = useState({})


  const columnFilters = useMemo(() => {
    if(!dataset?.column_metadata) return []
    return Object.keys(dataset.column_metadata).map(column => ({
      column: column,
      categories: dataset.column_metadata[column].categories,
      counts: dataset.column_metadata[column].counts
    })).filter(d => d.counts)
  }, [dataset])

  const [columnIndicesAnnotations, setColumnIndicesAnnotations] = useState([])
  useEffect(() => {
    const annots = columnIndices.map(index => points[inputToScopeIndexMap[index]])
    setColumnIndicesAnnotations(annots)
  }, [columnIndices, points, inputToScopeIndexMap])

  const columnQuery = useCallback((filters) => {
    let query = []
    Object.keys(filters).forEach(c => {
      let f = filters[c]
      if(f) {
        query.push({
          column: c,
          type: "eq",
          value: f
        })
      }
    })
    console.log("query", query)
    fetch(`${apiUrl}/column-filter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataset: datasetId, filters: query }),
    })
    .then(response => response.json())
    .then(data => {
      let indices = data.indices.filter(d => inputToScopeIndexMap[d] >= 0)
      setColumnIndices(indices)
    })

  }, [datasetId, inputToScopeIndexMap, setColumnIndices]);

  useEffect(() => {
    let active = Object.values(columnFiltersActive).filter(d => !!d).length
    console.log("active filters", active, columnFiltersActive)
    if(active > 0) {
      columnQuery(columnFiltersActive)
    }
  }, [columnFiltersActive, columnQuery])

  const clearFilters = useCallback(() => {
    setSelectedIndices([])
    setSearchIndices([])
    setTag(null)
    setColumnIndices([])
  }, [setSelectedIndices, setSearchIndices, setTag, setColumnIndices])

  const filterInputIndices = useCallback((indices) => {
    return indices.filter(d => inputToScopeIndexMap[d] >= 0)
  }, [inputToScopeIndexMap])


  function intersectMultipleArrays(...arrays) {
    arrays = arrays.filter(d => d.length > 0)
    if (arrays.length === 0) return [];
    if(arrays.length == 1) return arrays[0]
    // Use reduce to accumulate intersections
    return arrays.reduce((acc, curr) => {
        // Convert current array to a Set for fast lookup
        const currSet = new Set(curr);
        // Filter the accumulated results to keep only elements also in the current array
        return acc.filter(x => currSet.has(x));
    });
  }


  const [intersectedIndices, setIntersectedIndices] = useState([])
  // intersect the indices from the various filters
  useEffect(() => {
    // console.log("selectedIndices", selectedIndices)
    // console.log("searchIndices", searchIndices)
    // console.log("tag", tag)
    // console.log("tagset", tagset[tag])
    const filteredClusterIndices = scopeRows.filter(d => d.cluster == slide?.cluster).map(d => d.ls_index)
    const filteredTagset = filterInputIndices(tagset[tag] || [])
    let indices = intersectMultipleArrays(selectedIndices || [], 
      searchIndices || [], 
      filteredClusterIndices || [], 
      filteredTagset || [], 
      columnIndices || [])
    if(indices.length == 0 && selectedIndices.length > 0) {
      indices = selectedIndices
    }
    // console.log("indices!", indices)
    setIntersectedIndices(indices)
  }, [scopeRows, selectedIndices, searchIndices, slide, tagset, tag, inputToScopeIndexMap, columnIndices])

  const [intersectedAnnotations, setIntersectedAnnotations] = useState([]);
  useEffect(() => {
    const annots = intersectedIndices.map(index => points[inputToScopeIndexMap[index]])
    setIntersectedAnnotations(annots)
  }, [intersectedIndices, points, inputToScopeIndexMap])


  const [bulkAction, setBulkAction] = useState(null)


  if (!dataset) return <div>Loading...</div>;

  return (
    <div ref={containerRef} className="container">
      <div className="left-column">
        <div className="summary">
          <div className="scope-card">
            {/* <h3> */}
            { isMobileDevice() ? <i>Use a desktop browser for full interactivity!</i> : null}
            <div className='heading'>
              {/* {scope?.label || scope?.id} */}


              <select className="scope-selector" onChange={(e) => {
                clearScope()
                setDelay(2000)
                navigate(`/datasets/${dataset?.id}/explore/${e.target.value}`)
              }}
                value={scope?.id}
              >
                {scopes.map((scopeOption, index) => (
                  <option key={index} value={scopeOption.id}>
                    {scopeOption.label} ({scopeOption.id})
                  </option>
                ))}
              </select>
              {readonly ? null : <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure</Link>}
              {readonly ? null : <Link to={`/datasets/${dataset?.id}/export/${scope?.id}`}>Export</Link>}
            </div>
            {/* </h3> */}
            {scope?.ls_version && <span>
              <span>{scope?.description}</span>
              <br />
              <span>{embedding?.model_id}</span>
              <span>{clusterLabels?.length} clusters</span>
            </span>}
            {!scope?.ls_version && <div className="scope-version-warning">
            <span className="warning-header">Outdated Scope!</span>
            <span> please "Overwrite" the scope in the last step on the <Link to={`/datasets/${dataset?.id}/setup/${scope?.id}`}>Configure Page</Link> to update.</span>
          </div>}
          </div>
          <div className="dataset-card">
            <span><b>{datasetId}</b>  {scope?.rows}/{dataset?.length} rows</span>
          </div>
          
        </div>
        <div className="umap-container">
          {/* <div className="umap-container"> */}
          <div className="scatters" style={{ width: scopeWidth, height: scopeHeight }}>
            {points.length ? <>
              { !isIOS() && scope ? <Scatter
                points={drawPoints}
                duration={2000}
                width={scopeWidth}
                height={scopeHeight}
                colorScaleType="categorical"
                onScatter={setScatter}
                onView={handleView}
                onSelect={handleSelected}
                onHover={handleHover}
              /> : <AnnotationPlot
              points={points}
              fill="gray"
              size="8"
              xDomain={xDomain}
              yDomain={yDomain}
              width={scopeWidth}
              height={scopeHeight}
            /> }
              {hoveredCluster && hoveredCluster.hull && !scope.ignore_hulls && scope.cluster_labels_lookup ? <HullPlot
                hulls={processHulls([hoveredCluster], points, inputToScopeIndexMap)}
                fill="lightgray"
                duration={0}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}

              {slide && slide.hull && !scope.ignore_hulls && scope.cluster_labels_lookup ? <HullPlot
                hulls={processHulls([slide], points, inputToScopeIndexMap)}
                fill="darkgray"
                strokeWidth={2}
                duration={0}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}
              {hulls.length && !scope.ignore_hulls ? <HullPlot
                hulls={hulls}
                stroke="black"
                fill="none"
                delay={delay}
                duration={200}
                strokeWidth={1}
                xDomain={xDomain}
                yDomain={yDomain}
                width={scopeWidth}
                height={scopeHeight} /> : null}
              <AnnotationPlot
                points={intersectedAnnotations}
                stroke="black"
                fill="steelblue"
                size="8"
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

            </> : null}

            {/* </div> */}
          </div>
          {!isMobileDevice() ? <div className="hovered-point">
            {hoveredCluster ? <span><span className="key">Cluster {hoveredCluster.cluster}:</span><span className="value">{hoveredCluster.label}</span></span> : null}
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
          </div> : null }
        </div> 
      </div>

      <div className="data">
          <div className="filters-container" ref={filtersContainerRef}>
            <div className={`filter-row search-box ${searchIndices.length ? 'active': ''}`}>
              <div className="filter-cell left">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  searchQuery(e.target.elements.searchBox.value);
                }}>
                  <input type="text" id="searchBox" placeholder="Nearest Neighbor Search..." />
                  {/* <button type="submit">Similarity Search</button> */}
                  <button type="submit">🔍</button>
                </form>
              </div>
              <div className="filter-cell middle">
                <span>
                  {searchIndices.length ? <span>{searchIndices.length} rows</span> : null}
                  {searchIndices.length > 0 ?
                    <button className="deselect" onClick={() => {
                      setSearchIndices([])
                      document.getElementById("searchBox").value = "";
                    }
                    }>X</button>
                    : null}
                </span>
              </div>
              <div className="filter-cell right">
                <label htmlFor="embeddingModel"></label>
                <select id="embeddingModel"
                  onChange={(e) => handleModelSelect(e.target.value)}
                  value={searchModel}>
                  {embeddings.filter(d => d.model_id).map((emb, index) => (
                    <option key={index} value={emb.id}>{emb.id} - {emb.model_id} - {emb.dimensions}</option>
                  ))}
                </select>
                {/* TODO: tooltip */}
              </div>
            </div>

            <div className={`clusters-select filter-row  ${slideAnnotations.length ? 'active': ''}`}>
              <div className="filter-cell left">
                <select onChange={(e) => {
                  if(e.target.value == -1) {
                    setSlide(null)
                    return
                  }
                  const cl = clusterLabels.find(cluster => cluster.cluster === +e.target.value)
                  if(cl) setSlide(cl)
                }} value={slide?.cluster >= 0 ? slide.cluster : -1}>
                  <option value="-1">Filter by cluster</option>
                  {clusterLabels?.map((cluster, index) => (
                    <option key={index} value={cluster.cluster}>{cluster.cluster}: {cluster.label}</option>
                  ))}
                </select>
              </div>
              <div className="filter-cell middle">
                {slideAnnotations.length ? <span> {slideAnnotations.length} rows
                  <button className="deselect" onClick={() => {
                    setSlide(null)
                  }
                  }>X</button>
                </span> : null}
              </div>
              <div className="filter-cell right">
                {slide ?
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    handleLabelUpdate(slide.cluster, clusterLabel);
                  }}>
                    <input
                      className="update-cluster-label"
                      type="text"
                      id="update-label"
                      value={clusterLabel}
                      onChange={(e) => setClusterLabel(e.target.value)} />
                    <button type="submit">✍️</button>
                    {/* TODO: tooltip */}
                  </form>
                  : <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const newLabel = formData.get("new-label")
                    console.log("new label", newLabel)
                    handleNewCluster(newLabel)
                  }}>
                    <input type="text" 
                        id="new-label" name="new-label" className="new-cluster-label" 
                        value={newClusterLabel} onChange={(e) => setNewClusterLabel(e.target.value)} 
                        placeholder="New Cluster"
                        />
                    <button type="submit">➕️ Cluster</button>
                  </form>}
              </div>
            </div>

            <div className={`filter-row tags-box ${filterInputIndices(tagset[tag] || [])?.length ? 'active': ''}`}>
              <div className="filter-cell left tags-select">
                {/* <select onChange={(e) => {
                  if(e.target.value == "-1") {
                    setTag(null)
                    return
                  }
                  setTag(e.target.value)
                }} value={tag ? tag : "-1"}>
                  <option value="-1">Select a tag</option>
                  {tags.map((t, index) => (
                    <option key={index} value={t}>{t} ({filterInputIndices(tagset[t] || []).length})</option>
                  ))}
                </select> */}
              {tags.map((t, index) => (
                <button
                  key={index}
                  className={`tag-button ${tag === t ? 'selected' : ''}`}
                  onClick={() => setTag(tag === t ? null : t)}
                >
                  {t} ({filterInputIndices(tagset[t] || []).length})
                </button>
              ))}
              </div>
              <div className="filter-cell middle">
                {tag && filterInputIndices(tagset[tag] || []).length ? <span>{filterInputIndices(tagset[tag] || []).length} rows
                  <button className="deselect" onClick={() => {
                    setTag(null)
                  }
                  }>X</button>
                </span> : null}
              </div>
              <div className="filter-cell right new-tag">
                {!tag ? <form onSubmit={(e) => {
                  e.preventDefault();
                  const newTag = e.target.elements.newTag.value;
                  fetch(`${apiUrl}/tags/new?dataset=${datasetId}&tag=${newTag}`)
                    .then(response => response.json())
                    .then(data => {
                      console.log("new tag", data)
                      e.target.elements.newTag.value = ""
                      fetchTagSet()
                    });
                }}>
                  <input type="text" id="newTag" placeholder="New Tag" />
                  <button type="submit">➕ Tag</button>
                </form> : <form onSubmit={(e) => {
                  e.preventDefault();
                  fetch(`${apiUrl}/tags/delete?dataset=${datasetId}&tag=${tag}`)
                    .then(response => response.json())
                    .then(data => {
                      console.log("deleted tag", data)
                      setTag(null)
                      fetchTagSet()
                    })
                  }}>
                  <button type="submit">➖ {tag}</button>
                </form>}
              </div>
            </div>

            {columnFilters?.length ? <div className={`filter-row column-filter ${columnIndices?.length ? 'active': ''}`}>
              <div className="filter-cell left">
                {columnFilters.map(column => (
                  <span key={column.column}>{column.column}: 
                    <select onChange={(e) => {
                      let active = {...columnFiltersActive}
                      active[column.column] = e.target.value
                      setColumnFiltersActive(active)
                    }} value={columnFiltersActive[column.column] || ""}>
                      <option value="">Select a value</option>
                      {column.categories.map(c => (
                        <option key={c} value={c}>{c} ({column.counts[c]})</option>
                      ))}
                    </select>
                  </span>
                ))}
              </div>
              <div className="filter-cell middle">
                {columnIndices?.length ? <span>{columnIndices?.length} rows</span> : null}
                {columnIndices?.length ? <button className="deselect" onClick={() => {
                    setColumnFiltersActive({})
                    setColumnIndices([])
                  }}>X</button> : null}
              </div>
              <div className="filter-cell right">
              </div>
            </div> : null}

            <div className={`filter-row ${selectedIndices?.length ? 'active': ''}`}>
              <div className="filter-cell left">
                Shift+Drag on the map to filter by points.
              </div>
              <div className="filter-cell middle">
                  {selectedIndices?.length > 0 ?<span>{selectedIndices?.length} rows</span> : null}
                  {selectedIndices?.length > 0 ?<button className="deselect" onClick={() => {
                      setSelectedIndices([])
                      scatter?.select([])
                      // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
                    }
                    }>X</button>
                    : null}
              </div>
              <div className="filter-cell right"></div>
            </div>

            <div className="filter-row">
              <div className="filter-cell left">
                {intersectedIndices.length > 0 ? "Intersection of filtered rows:" : "No rows filtered"}
              </div>
              <div className="filter-cell middle intersected-count">
                <span>{intersectedIndices.length} rows</span>
              </div>
              <div className="filter-cell right bulk-actions">
                <div className="bulk-actions-buttons">
                  Bulk Actions: 
                  <button className={`bulk ${bulkAction == "tag" ? 'active' : ''}`} onClick={() => bulkAction == "tag" ? setBulkAction(null) : setBulkAction("tag")}>🏷️</button>
                  <button className={`bulk ${bulkAction == "cluster" ? 'active' : ''}`} onClick={() => bulkAction == "cluster" ? setBulkAction(null) : setBulkAction("cluster")}>️📍</button>
                  {/* <button className={`bulk ${bulkAction == "save" ? 'active' : ''}`} onClick={() => bulkAction == "save" ? setBulkAction(null) : setBulkAction("save")}>💾</button> */}
                  <button className={`bulk ${bulkAction == "delete" ? 'active' : ''}`} onClick={() => bulkAction == "delete" ? setBulkAction(null) : setBulkAction("delete")}>🗑️</button>
                </div>
                <div className="bulk-actions-action">
                  {bulkAction == "tag" ? <Tagging dataset={dataset} indices={intersectedIndices} 
                    onSuccess={() => {
                      setBulkAction(null)
                      fetchTagSet()
                    }} /> : null}
                  {bulkAction == "cluster" ? <Clustering dataset={dataset} scope={scope} indices={intersectedIndices} 
                    onSuccess={() => {
                      setBulkAction(null)
                      fetchScopeMeta()
                      fetchScopeRows()
                    }} /> : null}
                  {/* {bulkAction == "save" ? <Saving dataset={dataset} scope={scope} indices={intersectedIndices} 
                    onSuccess={() => setBulkAction(null)} /> : null} */}
                  {bulkAction == "delete" ? <Deleting dataset={dataset} scope={scope} indices={intersectedIndices} 
                    onSuccess={() => {
                      setBulkAction(null)
                      clearFilters()
                      fetchScopeMeta()
                      fetchScopeRows()
                    }} /> : null}
                </div>
              </div>
            </div>
          </div>

            <FilterDataTable
                dataset={dataset}
                scope={scope}
                indices={intersectedIndices}
                clusterMap={clusterMap}
                clusterLabels={clusterLabels}
                tagset={tagset}
                onTagset={fetchTagSet}
                onScope={() => { 
                  fetchScopeMeta() 
                  fetchScopeRows()
                }}
                onHover={(index) => handleHover(inputToScopeIndexMap[index])}
                onClick={handleClicked}
                height={`calc(100% - ${filtersHeight + 62}px)`}
            />

{/* {selectedIndices?.length > 0 ?
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
              : null} */}
        
        {/* </div> */}
      </div>
    </div>
  );
}

export default Explore;
