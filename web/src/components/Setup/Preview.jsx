import { useEffect, useState, useCallback, useMemo } from "react";
import { range } from "d3-array";

import { Input, Button } from "react-element-forge"
import { useSetup } from "../../contexts/SetupContext";
import { apiService } from "../../lib/apiService";
import FilterDataTable from '../FilterDataTable';

import styles from "./Preview.module.scss";

function Preview({
  embedding,
  umap,
  cluster,
} = {}) {
  const { datasetId, dataset, scope, currentStep, stepIds } = useSetup();

  const [dataIndices, setDataIndices] = useState(range(0, 100));
  const [distances, setDistances] = useState([])
  const [clusterMap, setClusterMap] = useState({})
  const [height, setHeight] = useState('300px');

  const [searchText, setSearchText] = useState("")
  const [searchLoading, setSearchLoading] = useState(false)

  const searchQuery = useCallback(() => {
    if(searchText) {
      setSearchLoading(true)
      apiService.searchNearestNeighbors(datasetId, embedding, searchText)
        .then(data => {
          console.log("search", data)
          setDataIndices(data.indices.slice(0,100))
          setDistances(data.distances)
          setSearchLoading(false)
        })
    }
  }, [searchText, embedding, datasetId])

  useEffect(() => {
    searchQuery()
  }, [embedding]) // don't want this to update on searchText change

  useEffect(() => {
    const updateHeight = () => {
      const windowHeight = window.innerHeight;
      const previewElement = document.querySelector(`.${styles["preview"]}`);
      if (previewElement) {
        const previewRect = previewElement.getBoundingClientRect();
        const topOffset = previewRect.top;
        const newHeight = `${windowHeight - topOffset - 140}px`; // 20px for some bottom margin
        setHeight(newHeight);
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    setTimeout(() => {
      updateHeight()
    }, 100)

    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  useEffect(() => {
    console.log("SCOPE", scope)
  }, [scope])

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

    <FilterDataTable
      dataset={dataset}
      indices={dataIndices} 
      distances={distances}
      clusterMap={clusterMap}
      height={height}
      showNavigation={false}
    />
  </div>
}

export default Preview;