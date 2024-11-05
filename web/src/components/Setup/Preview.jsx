import { useEffect, useState, useCallback, useMemo } from "react";
import { range } from "d3-array";
import { interpolatePurples} from "d3-scale-chromatic";

import { Input, Button } from "react-element-forge"
import { Tooltip } from "react-tooltip"

import { useSetup } from "../../contexts/SetupContext";
import { apiService } from "../../lib/apiService";
import FilterDataTable from '../FilterDataTable';
import Scatter from "../Scatter";

import styles from "./Preview.module.scss";

function Preview({
  embedding,
  umap,
  cluster,
} = {}) {
  const { datasetId, dataset, scope, currentStep, stepIds } = useSetup();

  // Search related state
  // ------------------------------------------------------------
  const [dataIndices, setDataIndices] = useState(range(0, 100));
  const [distances, setDistances] = useState([])
  const [clusterMap, setClusterMap] = useState({})

  const [searchText, setSearchText] = useState("")
  const [searchLoading, setSearchLoading] = useState(false)
  const [drawPoints, setDrawPoints] = useState([])

  const searchQuery = useCallback(() => {
    if(searchText) {
      setSearchLoading(true)
      apiService.searchNearestNeighbors(datasetId, embedding, searchText)
        .then(data => {
          console.log("search", data)
          setDataIndices(data.indices.slice(0,100))
          setDistances(data.distances)
          setSearchLoading(false)
          if(drawPoints.length){
            let dp = drawPoints.map(d => {
              return [d[0], d[1], 4]
            })
            data.indices.slice(0,100).forEach((index,i) => {
              // set the color to progressively less emphasized based on search index
              dp[index][2] = i < 5 ? 1 : ( i < 10 ? 2 : 3)
            })
            setDrawPoints(dp)
          }
        })
    }
  }, [searchText, embedding, datasetId, drawPoints])

  useEffect(() => {
    searchQuery()
  }, [embedding]) // don't want this to update on searchText change
  
  // Calculate the width and height based on window size (within the frame)
  // ------------------------------------------------------------
  const [height, setHeight] = useState(300);
  const [width, setWidth] = useState(300);
  const heightOffset = 140; // 140px for the header and search box
  const umapHeight = useMemo(() => height > 700 ? height / 2 : height, [height])
  const tableHeight = useMemo(() => !umap ? height : (height > 700 ? height / 2 - 6 : 0), [umap, height])
  // const heightPx = useMemo(() => `${height}px`, [height])
  // const widthPx = useMemo(() => `${width}px`, [width])

  useEffect(() => {
    const updateDimensions = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const previewElement = document.querySelector(`.${styles["preview"]}`);
      if (previewElement) {
        const previewRect = previewElement.getBoundingClientRect();
        const newHeight = windowHeight - previewRect.top - heightOffset;
        const newWidth = windowWidth - previewRect.left - 36;
        console.log("newHeight", newHeight, "newWidth", newWidth)
        setHeight(newHeight);
        setWidth(newWidth);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    setTimeout(() => {
      updateDimensions()
    }, 100)

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    console.log("SCOPE", scope)
  }, [scope])

  // Title for the preview based on the current step
  // ------------------------------------------------------------
  const stepTitle = useMemo(() => {
    if(currentStep == 1) {
      return embedding?.id
    }
    if(currentStep == 2) {
      return umap?.id
    }
    if(currentStep == 3) {
      return cluster?.id
    }
    return stepIds[currentStep - 1]
  }, [currentStep, stepIds, embedding, umap, cluster])

  // Scatter plot related state
  // ------------------------------------------------------------
  const [scatter, setScatter] = useState(null)
  const [xDomain, setXDomain] = useState([-1, 1]);
  const [yDomain, setYDomain] = useState([-1, 1]);

  useEffect(() => {
    console.log("umap", umap?.id, umap)
    if(umap) {
      apiService.fetchUmapPoints(datasetId, umap.id)
      .then(data => {
        let pts = data.map((d) => [d.x, d.y, 4])
        console.log("drawPoints", pts[0])
        setDrawPoints(pts)
      })
    }
  }, [datasetId, umap])

  const handleView = useCallback((xDomain, yDomain) => {
    console.log("handleView", xDomain, yDomain)
    setXDomain(xDomain);
    setYDomain(yDomain);
  }, [setXDomain, setYDomain])

  const handleSelected = useCallback((selected) => {
    console.log("selected", selected)
  }, [])

  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const handleHovered = useCallback((index) => {
    setHoveredIndex(index);
  }, [setHoveredIndex])

  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      apiService.fetchDataFromIndices(datasetId, [hoveredIndex])
        .then(results => {
          let h = results[0]
          if(dataIndices && distances) {
            let searchIndex = dataIndices.indexOf(hoveredIndex)
            if(searchIndex >= 0) {
              h.ls_search_index = searchIndex
              h.ls_distance = distances[searchIndex]
            }
          }
          setHovered(h)
        })
      const point = drawPoints[hoveredIndex];
      if (point && xDomain && yDomain) {
        const xPos = ((point[0] - xDomain[0]) / (xDomain[1] - xDomain[0])) * width + 6;
        const yPos = ((point[1] - yDomain[1]) / (yDomain[0] - yDomain[1])) * (umapHeight) + heightOffset / 2 - 6;
        console.log(xPos, yPos)
        setTooltipPosition({ 
          x: xPos,// - .5*16, 
          y: yPos// - .67*16 
        });
      }
    } else {
      setHovered(null)
    }
  }, [datasetId, hoveredIndex, setHovered, drawPoints, xDomain, yDomain, width, umapHeight, dataIndices, distances]);

  return <div className={styles["preview"]}>
    <div className={styles["preview-header"]}>
      <h3>Preview: {stepTitle}</h3>
    </div>
    <div className={styles["search-box"]}>
      <Input 
        className={styles["search-input"]}
        placeholder={`Search${embedding ? " with " + embedding.id + ` (${embedding.model_id?.replace("___", "/")})` : ""}`} disabled={!embedding}
        onChange={e => setSearchText(e.target.value)}
        onKeyDown={e => {
          if(e.key == "Enter" && !searchLoading) {
            searchQuery()
          }
        }}
      ></Input>
      <div className={styles["search-button-container"]}>
        <Button color="secondary"disabled={searchLoading || !searchText} className={styles["search-button"]}
          onClick={() => {
            searchQuery()
          }}
          icon={searchLoading ? "pie-chart" : "search"}
          // text={searchLoading ? "Searching..." : "Search"}
        >
        </Button>
      </div>
    </div>

    {drawPoints.length ? <div className={styles["scatter-container"]} style={{width: width, height: umapHeight}}>
    <Scatter 
      points={drawPoints} 
      width={width} 
      height={umapHeight}
      duration={1000}
      colorScaleType="categorical"
      colorInterpolator={interpolatePurples}
      colorDomain={[1,2,3,4,5].reverse()}
      onScatter={setScatter}
      onView={handleView} 
      onSelect={handleSelected}
      onHover={handleHovered}
      />
    </div> : null }
    <div className={styles["table-container"]}>
      {tableHeight > 0 ? <FilterDataTable
        dataset={dataset}
        indices={dataIndices} 
        distances={distances}
        clusterMap={clusterMap}
        height={tableHeight}
        showNavigation={false}
        /> : null }
    </div>

    <div
      data-tooltip-id="featureTooltip"
      style={{
        position: 'absolute',
        left: tooltipPosition.x,
        top: tooltipPosition.y,
        pointerEvents: 'none',
      }}
    ></div>
    <Tooltip id="featureTooltip" 
      isOpen={hoveredIndex !== null}
      delayShow={0}
      delayHide={0}
      delayUpdate={0}
      style={{
        position: 'absolute',
        left: tooltipPosition.x,
        top: tooltipPosition.y,
        pointerEvents: 'none',
        maxWidth: "400px",
      }}
    >
      {hovered && embedding && <div className={styles["tooltip-content"]}>
        {hovered.ls_search_index ? <span>Search: #{hovered.ls_search_index}<br/></span> : null}
        <span>{hoveredIndex}: {hovered[embedding.text_column]}</span>
      </div>}
    </Tooltip>

  </div>
}

export default Preview;