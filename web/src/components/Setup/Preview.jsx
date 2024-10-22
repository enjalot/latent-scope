import { useEffect, useState, useCallback } from "react";
import { range } from "d3-array";

import { Input, Button } from "react-element-forge"
import { useSetup } from "../../contexts/SetupContext";
import { apiService } from "../../lib/apiService";
import FilterDataTable from '../FilterDataTable';

import styles from "./Preview.module.scss";

function Preview({
  embedding
} = {}) {
  const { datasetId, dataset, scope } = useSetup();

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

  return <div className={styles["preview"]}>
    <div className={styles["search-box"]}>
      <Input 
        className={styles["search-input"]}
        placeholder={`Search${embedding ? " with " + embedding.id : ""}`} disabled={!embedding}
        onChange={e => setSearchText(e.target.value)}
        onKeyDown={e => {
          if(e.key == "Enter" && !searchLoading) {
            searchQuery(searchText)
          }
        }}
      ></Input>
      <Button disabled={searchLoading || !searchText} className={styles["search-button"]}
        onClick={() => {
          searchQuery(searchText)
        }}
        icon={searchLoading ? "pie-chart" : "search"}
        // text={searchLoading ? "Searching..." : "Search"}
      >
      </Button>
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