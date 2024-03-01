import { useReducer, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { extent } from 'd3-array';
import { scaleSymlog } from 'd3-scale';
import { interpolateMagma, interpolateReds, interpolateViridis, interpolateTurbo, interpolateCool } from 'd3-scale-chromatic';

// import DataTable from '../components/DataTable';
import IndexDataTable from '../components/IndexDataTable';
import Scatter from '../components/Scatter';
import AnnotationPlot from '../components/AnnotationPlot';
// import HullPlot from '../components/HullPlot';

import styles from  "./Compare.module.css"
console.log("styles", styles)

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


const initialState = {
  dataset: null,

}

function reducer(state, action) {
}


function processHulls(labels, points) {
  return labels.map(d => {
    return d.hull.map(i => points[i])
  })
}

function Compare() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();

  const navigate = useNavigate();

  const containerRef = useRef(null);

  // let's fill the container and update the width and height if window resizes
  const [scopeWidth, scopeHeight] = useWindowSize();
  function useWindowSize() {
    const [size, setSize] = useState([500,500]);
    useEffect(() => {
      function updateSize() {
        if(!containerRef.current) return
        const { height, width } = containerRef.current.getBoundingClientRect()
        // console.log("width x height", width, height)
        // let swidth = width > 500 ? 500 : width - 50
        setSize([width-15, height-25]);
      }
      window.addEventListener('resize', updateSize);
      updateSize();
      setTimeout(updateSize, 200)
      return () => window.removeEventListener('resize', updateSize);
    }, []);
    return size;
  }

  // Tabs
  const tabs = [
    { id: 0, name: "Selected" },
    { id: 1, name: "Search" },
  ]
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => {
        console.log("dataset", data)
        setDataset(data)
      });
  }, [datasetId, setDataset]);


  const [embeddings, setEmbeddings] = useState([]);
  const [umaps, setUmaps] = useState([]);
  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/datasets/${datasetId}/embeddings`).then(response => response.json()),
      fetch(`${apiUrl}/datasets/${datasetId}/umaps`).then(response => response.json())
    ]).then(([embeddingsData, umapsData]) => {
        console.log("embeddings", embeddingsData)
        console.log("umaps", umapsData)
        setEmbeddings(embeddingsData)
        umapsData.sort((a, b) => {
          if (b.align_id < a.align_id) return -1;
          if (b.align_id > a.align_id) return 1;
          if (a.id < b.id) return -1;
          if (a.id > b.id) return 1;
          return 0;
        });
        setUmaps(umapsData)
      });
  }, [datasetId, setEmbeddings, setUmaps]);

  const [direction, setDirection] = useState("left")
  const [left, setLeft] = useState(null)
  const [right, setRight] = useState(null)
  useEffect(() => {
    if(umaps) {
      setLeft(umaps[0])
      setRight(umaps[1])
    }
  }, [umaps])

  const [umap, setUmap] = useState(null)
  const [points, setPoints] = useState([]);
  const [drawPoints, setDrawPoints] = useState([]); // this is the points with the cluster number
  const drawPointsRef = useRef([])
  const pointsRef = useRef([])
  useEffect(() => {
    if(umaps && left && right && direction) {

      const decision = direction === "left" ? left : right;

      Promise.all([
        fetch(`${apiUrl}/datasets/${datasetId}/umaps/${decision.id}`).then(response => response.json()),
        fetch(`${apiUrl}/datasets/${datasetId}/umaps/${decision.id}/points`).then(response => response.json()),
      ]).then(([umapData, pointsData]) => {
        // console.log("umap", umapData);
        setUmap(umapData);

        // console.log("set points")
        const pts = pointsData.map(d => [d.x, d.y])
        setPoints(pts)
        pointsRef.current = pts

        // const dpts = pointsData.map((d, i) => [d.x, d.y, i/pts.length])
        const dpts = pointsData.map((d,i) => {
          let c = drawPointsRef.current[i]
          return [d.x, d.y, c ? c[2] : 0]
        })
        setDrawPoints(dpts)
        drawPointsRef.current = dpts

      }).catch(error => console.error("Fetching data failed", error));

    }
  }, [datasetId, direction, left, right, umaps, setUmap, setPoints, setDrawPoints]);


  let firstPoints = useRef(false)
  let dispChange = useRef("")
  const [displacementLoading, setDisplacementLoading] = useState(false)
  useEffect(() => {
    let change = left?.id + right?.id + firstPoints.current
    if(left && right && points.length) {
      if(dispChange.current !== change){
        setDisplacementLoading(true)
        fetch(`${apiUrl}/search/compare?dataset=${datasetId}&umap_left=${left.id}&umap_right=${right.id}&k=10`)
          .then(response => response.json())
          .then((displacementData) => {
            // console.log("displacement data", displacementData)
            const log = scaleSymlog(extent(displacementData), [0, 1])
            const dpts = pointsRef.current.map((d, i) => [d[0], d[1], log(displacementData[i])])
            setDrawPoints(dpts)
            drawPointsRef.current = dpts
            setDisplacementLoading(false)
            firstPoints.current = true
            dispChange.current = left?.id + right?.id + firstPoints.current
          })
      } else {
        // // the left, right or points changed so we do draw points
        // console.log("update draw points")
        // const dpts = points.map((d, i) => [d[0], d[1], drawPointsRef.current[i] || 0])
        // setDrawPoints(dpts)
        // drawPointsRef.current = dpts
      }
    }
  }, [datasetId, left, right, points])

  // The search model is the embeddings model that we pass to the nearest neighbor query
  // we want to enable searching with any embedding set
  const [searchModel, setSearchModel] = useState(null)

  useEffect(() => {
    if (embeddings) {
      setSearchModel(embeddings[0])
    }
  }, [embeddings, setSearchModel])


  // const [activeUmap, setActiveUmap] = useState(null)
  const handleModelSelect = useCallback((model) => {
    console.log("selected", model)
    setSearchModel(embeddings.find(e => e.id == model))
  }, [embeddings])


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
  // useEffect(() => {
  //   if (hoveredIndex !== null && hoveredIndex !== undefined) {
  //     hydrateIndices([hoveredIndex], (results) => {
  //       setHovered(results[0])
  //     })
  //   } else {
  //     setHovered(null)
  //   }
  // }, [hoveredIndex, setHovered, hydrateIndices])


  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      setHoverAnnotations([points[hoveredIndex]])
    } else {
      setHoverAnnotations([])
    }
  }, [hoveredIndex, points])
  // Search
  // the indices returned from similarity search
  const [searchIndices, setSearchIndices] = useState([]);
  const [distances, setDistances] = useState([]);

  const searchQuery = useCallback((query) => {
    fetch(`${apiUrl}/search/nn?dataset=${datasetId}&query=${query}&embedding_id=${searchModel.id}&dimensions=${searchModel.dimensions}`)
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

    // Handlers for responding to individual data points
  const handleClicked = useCallback((index) => {
    scatter?.zoomToPoints([index], { transition: true, padding: 0.9, transitionDuration: 1500 })
  }, [scatter])

  const handleHover = useCallback((index) => {
    setHoveredIndex(index);
  }, [setHoveredIndex])

  const handleSetLeft = useCallback((e) => {
    setLeft(umaps.find(d => d.id == e.target.value))
    setDirection("left")
  }, [umaps, setLeft, setDirection])
  const handleSetRight = useCallback((e) => {
    setRight(umaps.find(d => d.id == e.target.value))
    setDirection("right")
  }, [umaps, setRight, setDirection])

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className={styles["container"]}>
      <div className={styles["controls"]}>
        <div className={styles["summary"]}>
          <div className={styles["scope-card"]}>
            {/* <h3> */}
            { isMobileDevice() ? <i>Use a desktop browser for full interactivity!</i> : null}
            <div className={styles["heading"]}>
              <b>{datasetId}</b>
              <span>{dataset?.length} rows</span>
              {readonly ? null : <Link to={`/datasets/${dataset?.id}/setup`}>Configure</Link>}
            </div>
            {/* </h3> */}
          </div>
          <div className={styles["umap-selectors"]}>
            <select 
              name="left" 
              value={left?.id}
              onChange={handleSetLeft}>
              {umaps.map((um, index) => {
                let emb = embeddings.find(d => um.embedding_id == d.id)
                return (
                <option key={index} value={um.id}>
                  {um.embedding_id} - {um.id} - {emb?.model_id} [{emb?.dimensions}] {um.align_id}
                  </option>
              )})}
            </select>
            <div>
              <label>
                👈
                <input
                  type="radio"
                  value="left"
                  name="direction"
                  checked={direction === "left"}
                  onChange={() => setDirection("left")}
                /> 
              </label>
              <label>
                <input
                  type="radio"
                  value="right"
                  name="direction"
                  checked={direction === "right"}
                  onChange={() => setDirection("right")}
                /> 👉
              </label>
            </div>
            <select 
              name="right" 
              onChange={handleSetRight}
              value={right?.id}>
              {umaps.map((um, index) => {
                let emb = embeddings.find(d => um.embedding_id == d.id)
                return (
                <option key={index} value={um.id}>
                  {um.embedding_id} - {um.id} - {emb?.model_id} [{emb?.dimensions}] {um.align_id}
                  </option>
              )})}
            </select>
            {/* <br></br>
            <span>
                  Displacement loading {displacementLoading ? "⏰" : "✅"}
            </span> */}
          </div>
        </div>
      </div>
      <div ref={containerRef} className={styles["umap-container"]}>
        <div className={styles["scatters"]} style={{ width: scopeWidth, height: scopeHeight }}>
          {points.length ? <>
            <div className={styles["scatter"]}>
              { !isIOS() ? <Scatter
                points={drawPoints}
                duration={2000}
                pointScale={1.5}
                width={scopeWidth}
                height={scopeHeight}
                colorScaleType="continuous"
                colorInterpolator={interpolateMagma}
                opacityBy="valueA"
                // colorInterpolator={interpolateReds}
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
            </div>
            <AnnotationPlot
              points={searchAnnotations}
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

        </div>
        {/* {!isMobileDevice() ? <div className={styles["hovered-point"]}>
          {hovered && Object.keys(hovered).map((key) => (
            <span key={key}>
              <span className={styles["key"]}>{key}:</span>
              <span className={styles["value"]}>{hovered[key]}</span>
            </span>
          ))}
          {hoveredCluster ? <span><span className={styles["key"]}>Cluster {hoveredCluster.index}:</span><span className={styles["value"]}>{hoveredCluster.label}</span></span> : null}
        </div> : null } */}
      </div> 

      <div className={styles["data"]}>

        <div className={styles["tab-header"]}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={tab.id === activeTab ? styles['tab-active'] : styles['tab-inactive']}>
              {tab.name}
            </button>
          ))}
        </div>

        {activeTab === 0 ?
          <div className={styles["tab-content"]}>
            <span>Selected: {selectedIndices?.length}
              {selectedIndices?.length > 0 ?
                <button className={styles["deselect"]} onClick={() => {
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
                // clusterIndices={clusterIndices}
                // clusterLabels={clusterLabels}
                // tagset={tagset}
                dataset={dataset}
                maxRows={150}
                // onTagset={(data) => setTagset(data)}
                onHover={handleHover}
                onClick={handleClicked}
              />
              : null}
          </div>
          : null}

        {activeTab === 1 ?
          <div className={styles["tab-content"]}>
            <div className={styles["search-box"]}>
              <form onSubmit={(e) => {
                e.preventDefault();
                searchQuery(e.target.elements.searchBox.value);
                setActiveTab(1)
              }}>
                <input type="text" id="searchBox" />
                <button type="submit">Similarity Search</button>
                <br />
                <label htmlFor="embeddingModel"></label>
                <select id="embeddingModel"
                  onChange={(e) => handleModelSelect(e.target.value)}
                  defaultValue={searchModel?.id}>
                  {embeddings.map((emb, index) => (
                    <option key={index} value={emb.id}>{emb.id} - {emb.model_id} - {emb.dimensions}</option>
                  ))}
                </select>

              </form>
            </div>
            <span>
              {searchIndices.length ? <span>Nearest Neighbors: {searchIndices.length} (capped at 150) </span> : null}
              {searchIndices.length > 0 ?
                <button className={styles["deselect"]} onClick={() => {
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
                // clusterIndices={clusterIndices}
                // clusterLabels={clusterLabels}
                // tagset={tagset}
                dataset={dataset}
                // onTagset={(data) => setTagset(data)}
                onHover={handleHover}
                onClick={handleClicked}
              />
              : null}
          </div>
          : null}


        {/* </div> */}
      </div>
    </div>
  );
}

export default Compare;
