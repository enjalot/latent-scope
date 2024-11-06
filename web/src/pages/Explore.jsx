import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useParams, useNavigate } from "react-router-dom";

import "./Explore.css";
import useCurrentScope from "../hooks/useCurrentScope";
import useNearestNeighborsSearch from '../hooks/useNearestNeighborsSearch';
import useScopeData from "../hooks/useScopeData";
import useColumnFilter from "../hooks/useColumnFilter";

import ScopeHeader from "../components/Explore/ScopeHeader";
import VisualizationPane from "../components/Explore/VisualizationPane";
import NearestNeighbor from '../components/Explore/NearestNeighbor';
import ClusterFilter from '../components/Explore/ClusterFilter';
import ColumnFilter from '../components/Explore/ColumnFilter';

import FilterDataTable from "../components/FilterDataTable";

import Tagging from "../components/Bulk/Tagging";
import Clustering from "../components/Bulk/Clustering";
import Deleting from "../components/Bulk/Deleting";




const apiUrl = import.meta.env.VITE_API_URL;
const readonly = import.meta.env.MODE == "read_only";

function Explore() {
  const { dataset: datasetId, scope: scopeId } = useParams();
  const navigate = useNavigate();

  // fetch dataset and current scope metadata
  // - scopes: all scopes available for this dataset
  // - embeddings: embeddings available for this dataset
  const { embeddings, dataset, scope, fetchScopeMeta, scopes } = useCurrentScope(
    datasetId,
    scopeId,
    apiUrl,
  );

  // fetch data for the current scope and populate data structures for scatterplot and clustering
  const {
    fetchScopeRows,
    setClusterLabels,
    clusterMap,
    clusterLabels,
    scopeRows,
    points,
    drawPoints,
    hulls,
    scopeToInputIndexMap,
    inputToScopeIndexMap,
  } = useScopeData(apiUrl, datasetId, scope);

  const hydrateIndices = useCallback(
    (indices, setter, distances = []) => {
      fetch(`${apiUrl}/indexed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dataset: datasetId, indices: indices }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (!dataset) return;
          let rows = data.map((row, index) => {
            return {
              index: indices[index],
              ...row,
            };
          });
          setter(rows);
        });
    },
    [dataset, datasetId],
  );

  // ====================================================================================================
  // Scatterplot related logic
  // ====================================================================================================
  // this is a reference to the regl scatterplot instance
  // so we can do stuff like clear selections without re-rendering
  const [scatter, setScatter] = useState({});

  // Selection via Scatterplot
  // indices of items selected by the scatter plot
  const [selectedIndices, setSelectedIndices] = useState([]);

  const handleSelected = useCallback(
    (indices) => {
      // console.log("handle selected", indices)
      // we have to map from the scatterplot indices to the ls_index of the original input data (in case any has been deleted)
      let idxs = indices.map((i) => scopeToInputIndexMap[i]);
      setSelectedIndices(idxs);
      // for now we dont zoom because if the user is selecting via scatter they can easily zoom themselves
      // scatter?.zoomToPoints(indices, { transition: true })
    },
    [setSelectedIndices, scopeToInputIndexMap],
  );

  // Hover via scatterplot or tables
  // index of item being hovered over
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      hydrateIndices([scopeToInputIndexMap[hoveredIndex]], (results) => {
        setHovered(results[0]);
      });
    } else {
      setHovered(null);
    }
  }, [hoveredIndex, setHovered, hydrateIndices, scopeToInputIndexMap]);

  const [hoveredCluster, setHoveredCluster] = useState(null);
  useEffect(() => {
    if (hoveredIndex) {
      setHoveredCluster(clusterMap[scopeToInputIndexMap[hoveredIndex]]);
    } else {
      setHoveredCluster(null);
    }
  }, [hoveredIndex, clusterMap, scopeToInputIndexMap, setHoveredCluster]);

  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      setHoverAnnotations([points[hoveredIndex]]);
    } else {
      setHoverAnnotations([]);
    }
  }, [hoveredIndex, points]);

  // ====================================================================================================
  // Tags
  // ====================================================================================================
  const [tagset, setTagset] = useState({});

  const fetchTagSet = useCallback(() => {
    fetch(`${apiUrl}/tags?dataset=${datasetId}`)
      .then((response) => response.json())
      .then((data) => setTagset(data));
  }, [datasetId, setTagset]);

  useEffect(() => {
    fetchTagSet();
  }, [fetchTagSet]);

  const tags = useMemo(() => {
    const tags = [];
    for (const tag in tagset) {
      tags.push(tag);
    }
    // console.log("tagset", tagset, tags)
    return tags;
  }, [tagset]);

  const [tag, setTag] = useState(tags[0]);

  const [tagAnnotations, setTagAnnotations] = useState([]);
  useEffect(() => {
    if (tagset[tag]) {
      const annots = tagset[tag].map((index) => points[index]);
      setTagAnnotations(annots);
    } else {
      setTagAnnotations([]);
      if (scatter && scatter.config) {
        // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      }
    }
  }, [tagset, tag, points, scatter, setTagAnnotations]);

  // ====================================================================================================
  // NN Search
  // ====================================================================================================
  // indices of items in a chosen slide
  // the indices returned from similarity search
  const {
    setSearchText,
    searchIndices,
    setSearchIndices,
    distances,
    isLoading: searchLoading,
    clearSearch
  } = useNearestNeighborsSearch({
    apiUrl,
    datasetId,
    scope,
    embeddings,
    inputToScopeIndexMap,
  });

  // ====================================================================================================
  // Clusters
  // ====================================================================================================
  // indices of items in a chosen slide
  const [slide, setSlide] = useState(null);
  const [slideAnnotations, setSlideAnnotations] = useState([]);

  useEffect(() => {
    if (scope) {
      fetchScopeRows();
    }
  }, [fetchScopeRows, scope, embeddings, setClusterLabels]);

  useEffect(() => {
    if (slide) {
      // const annots = slide.indices.map(index => points[index])
      const annots = drawPoints.filter((p) => p[2] == slide.cluster);
      setSlideAnnotations(annots);
    } else {
      setSlideAnnotations([]);
      if (scatter && scatter.config) {
        // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      }
    }
  }, [slide, points, scatter, setSlideAnnotations]);

  const [clusterLabel, setClusterLabel] = useState(slide?.label || "");
  const [newClusterLabel, setNewClusterLabel] = useState("");
  useEffect(() => {
    setNewClusterLabel("");
  }, [slide]);

  const handleNewCluster = useCallback(
    (label) => {
      console.log("new cluster", label);
      fetch(
        `${apiUrl}/datasets/${datasetId}/scopes/${scope.id}/new-cluster?label=${label}`,
      )
        .then((response) => response.json())
        .then((data) => {
          console.log("what happened?", data);
          fetchScopeMeta();
        });
    },
    [datasetId, scope, fetchScopeMeta],
  );

  useEffect(() => {
    setClusterLabel(slide?.label || "");
  }, [slide]);

  // Handlers for responding to individual data points
  const handleClicked = useCallback(
    (index) => {
      scatter?.zoomToPoints([index], {
        transition: true,
        padding: 0.9,
        transitionDuration: 1500,
      });
    },
    [scatter],
  );
  const handleHover = useCallback(
    (index) => {
      setHoveredIndex(index);
    },
    [setHoveredIndex],
  );

  const handleLabelUpdate = useCallback(
    (cluster, label) => {
      console.log("update label", cluster, label);
      fetch(
        `${apiUrl}/bulk/change-cluster-name?dataset_id=${datasetId}&scope_id=${scope.id}&cluster=${cluster}&new_label=${label}`,
      )
        .then((response) => response.json())
        .then((data) => {
          console.log("got new labels", data);
          fetchScopeMeta();
        });
    },
    [datasetId, scope],
  );

  const clearScope = useCallback(() => {
    setSlide(null);
    // setClusterLabels([])
    // setPoints([])
  }, []);

  const {
    columnIndices,
    setColumnIndices,
    columnFiltersActive,
    setColumnFiltersActive,
    columnFilters,
  } = useColumnFilter(apiUrl, dataset, datasetId, inputToScopeIndexMap, points);

  const clearFilters = useCallback(() => {
    setSelectedIndices([]);
    setSearchIndices([]);
    setTag(null);
    setColumnIndices([]);
  }, [setSelectedIndices, setSearchIndices, setTag, setColumnIndices]);

  const filterInputIndices = useCallback(
    (indices) => {
      return indices.filter((d) => inputToScopeIndexMap[d] >= 0);
    },
    [inputToScopeIndexMap],
  );

  function intersectMultipleArrays(...arrays) {
    arrays = arrays.filter((d) => d.length > 0);
    if (arrays.length === 0) return [];
    if (arrays.length == 1) return arrays[0];
    // Use reduce to accumulate intersections
    return arrays.reduce((acc, curr) => {
      // Convert current array to a Set for fast lookup
      const currSet = new Set(curr);
      // Filter the accumulated results to keep only elements also in the current array
      return acc.filter((x) => currSet.has(x));
    });
  }

  const [intersectedIndices, setIntersectedIndices] = useState([]);
  // intersect the indices from the various filters
  useEffect(() => {
    // console.log("selectedIndices", selectedIndices)
    // console.log("searchIndices", searchIndices)
    // console.log("tag", tag)
    // console.log("tagset", tagset[tag])
    const filteredClusterIndices = scopeRows
      .filter((d) => d.cluster == slide?.cluster)
      .map((d) => d.ls_index);
    const filteredTagset = filterInputIndices(tagset[tag] || []);
    let indices = intersectMultipleArrays(
      selectedIndices || [],
      searchIndices || [],
      filteredClusterIndices || [],
      filteredTagset || [],
      columnIndices || [],
    );
    if (indices.length == 0 && selectedIndices.length > 0) {
      indices = selectedIndices;
    }
    // console.log("indices!", indices)
    setIntersectedIndices(indices);
  }, [
    scopeRows,
    selectedIndices,
    searchIndices,
    slide,
    tagset,
    tag,
    inputToScopeIndexMap,
    columnIndices,
  ]);

  const [intersectedAnnotations, setIntersectedAnnotations] = useState([]);
  useEffect(() => {
    const annots = intersectedIndices.map(
      (index) => points[inputToScopeIndexMap[index]],
    );
    setIntersectedAnnotations(annots);
  }, [intersectedIndices, points, inputToScopeIndexMap]);

  const [bulkAction, setBulkAction] = useState(null);


  const [delay, setDelay] = useState(200);
  const [rows, setRows] = useState([]);
  const handleScopeChange = useCallback(
    (scopeId) => {
      clearScope();
      setDelay(2000);
      navigate(`/datasets/${dataset?.id}/explore/${scopeId}`);
    },
    [dataset, clearScope, navigate],
  );

  const containerRef = useRef(null);
  const filtersContainerRef = useRef(null);

  const [filtersHeight, setFiltersHeight] = useState(250);
  const FILTERS_PADDING = 62;
  const tableHeight = useMemo(
    () => `calc(100% - ${filtersHeight + FILTERS_PADDING}px)`,
    [filtersHeight],
  );

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { height } = entry.contentRect;
        setFiltersHeight(height);
      }
    });

    let node = filtersContainerRef?.current;
    if (node) {
      resizeObserver.observe(node);
    } else {
      setTimeout(() => {
        node = filtersContainerRef?.current;
        if (node) {
          resizeObserver.observe(node);
        } else {
          setFiltersHeight(0)
        }
      }, 100);
    }

    return () => {
      if (node) {
        resizeObserver.unobserve(node);
      }
    };
  }, []);

  if (!dataset) return <div>Loading...</div>;

  return (
    <div ref={containerRef} className="container">
      <div className="left-column">
        <ScopeHeader
          dataset={dataset}
          scope={scope}
          scopes={scopes}
          onScopeChange={handleScopeChange}
        />

        {points.length ? (
          <VisualizationPane
            points={points}
            drawPoints={drawPoints}
            hulls={hulls}
            selectedIndices={selectedIndices}
            hoveredIndex={hoveredIndex}
            hoverAnnotations={hoverAnnotations}
            intersectedAnnotations={intersectedAnnotations}
            hoveredCluster={hoveredCluster}
            slide={slide}
            scope={scope}
            containerRef={containerRef}
            inputToScopeIndexMap={inputToScopeIndexMap}
            onScatter={setScatter}
            onSelect={handleSelected}
            onHover={handleHover}
            hovered={hovered}
            dataset={dataset}
          />
        ) : null}
      </div>

      <div className="data">
        <div className="filters-container" ref={filtersContainerRef}>
          {/* row 1: nearest neighbor search */}
          <NearestNeighbor
            searchIndices={searchIndices}
            searchLoading={searchLoading}
            setSearchText={setSearchText}
            clearSearch={clearSearch}
          />

          {/* row 2: cluster select */}
          <ClusterFilter
            clusterLabels={clusterLabels}
            slide={slide}
            slideAnnotations={slideAnnotations}
            setSlide={setSlide}
            clusterLabel={clusterLabel}
            setClusterLabel={setClusterLabel}
            handleLabelUpdate={handleLabelUpdate}
            newClusterLabel={newClusterLabel}
            setNewClusterLabel={setNewClusterLabel}
            handleNewCluster={handleNewCluster}
          />

          {/* row 3: tags */}
          <div
            className={`filter-row tags-box ${filterInputIndices(tagset[tag] || [])?.length ? "active" : ""
              }`}
          >
            <div className="filter-cell left tags-select">
              {tags.map((t, index) => (
                <button
                  key={index}
                  className={`tag-button ${tag === t ? "selected" : ""}`}
                  onClick={() => setTag(tag === t ? null : t)}
                >
                  {t} ({filterInputIndices(tagset[t] || []).length})
                </button>
              ))}
            </div>
            <div className="filter-cell middle">
              {tag && filterInputIndices(tagset[tag] || []).length ? (
                <span>
                  {filterInputIndices(tagset[tag] || []).length} rows
                  <button
                    className="deselect"
                    onClick={() => {
                      setTag(null);
                    }}
                  >
                    X
                  </button>
                </span>
              ) : null}
            </div>
            <div className="filter-cell right new-tag">
              {!tag ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const newTag = e.target.elements.newTag.value;
                    fetch(
                      `${apiUrl}/tags/new?dataset=${datasetId}&tag=${newTag}`,
                    )
                      .then((response) => response.json())
                      .then((data) => {
                        console.log("new tag", data);
                        e.target.elements.newTag.value = "";
                        fetchTagSet();
                      });
                  }}
                >
                  <input type="text" id="newTag" placeholder="New Tag" />
                  <button type="submit">➕ Tag</button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                      fetch(
                        `${apiUrl}/tags/delete?dataset=${datasetId}&tag=${tag}`,
                      )
                        .then((response) => response.json())
                        .then((data) => {
                          console.log("deleted tag", data);
                          setTag(null);
                          fetchTagSet();
                        });
                    }}
                  >
                    <button type="submit">➖ {tag}</button>
                </form>
              )}
            </div>
          </div>

          {/* row 4: column filters */}
          <ColumnFilter
            columnFilters={columnFilters}
            columnIndices={columnIndices}
            columnFiltersActive={columnFiltersActive}
            setColumnFiltersActive={setColumnFiltersActive}
            setColumnIndices={setColumnIndices}
          />

          <div
            className={`filter-row ${selectedIndices?.length ? "active" : ""}`}
          >
            <div className="filter-cell left">
              Shift+Drag on the map to filter by points.
            </div>
            <div className="filter-cell middle">
              {selectedIndices?.length > 0 ? (
                <span>{selectedIndices?.length} rows</span>
              ) : null}
              {selectedIndices?.length > 0 ? (
                <button
                  className="deselect"
                  onClick={() => {
                    setSelectedIndices([]);
                    scatter?.select([]);
                    // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
                  }}
                >
                  X
                </button>
              ) : null}
            </div>
            <div className="filter-cell right"></div>
          </div>

          <div className="filter-row">
            <div className="filter-cell left">
              {intersectedIndices.length > 0
                ? "Intersection of filtered rows:"
                : "No rows filtered"}
            </div>
            <div className="filter-cell middle intersected-count">
              <span>{intersectedIndices.length} rows</span>
            </div>

            <div className="filter-cell right bulk-actions">
              <div className="bulk-actions-buttons">
                Bulk Actions:
                <button
                  className={`bulk ${bulkAction == "tag" ? "active" : ""}`}
                  onClick={() =>
                    bulkAction == "tag"
                      ? setBulkAction(null)
                      : setBulkAction("tag")
                  }
                >
                  🏷️
                </button>
                <button
                  className={`bulk ${bulkAction == "cluster" ? "active" : ""}`}
                  onClick={() =>
                    bulkAction == "cluster"
                      ? setBulkAction(null)
                      : setBulkAction("cluster")
                  }
                >
                  ️📍
                </button>
                <button
                  className={`bulk ${bulkAction == "delete" ? "active" : ""}`}
                  onClick={() =>
                    bulkAction == "delete"
                      ? setBulkAction(null)
                      : setBulkAction("delete")
                  }
                >
                  🗑️
                </button>
              </div>
              <div className="bulk-actions-action">
                {bulkAction == "tag" ? (
                  <Tagging
                    dataset={dataset}
                    indices={intersectedIndices}
                    onSuccess={() => {
                      setBulkAction(null);
                      fetchTagSet();
                    }}
                  />
                ) : null}
                {bulkAction == "cluster" ? (
                  <Clustering
                    dataset={dataset}
                    scope={scope}
                    indices={intersectedIndices}
                    onSuccess={() => {
                      setBulkAction(null);
                      fetchScopeMeta();
                      fetchScopeRows();
                    }}
                  />
                ) : null}
                {bulkAction == "delete" ? (
                  <Deleting
                    dataset={dataset}
                    scope={scope}
                    indices={intersectedIndices}
                    onSuccess={() => {
                      setBulkAction(null);
                      clearFilters();
                      fetchScopeMeta();
                      fetchScopeRows();
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* <div className="filter-row embeddings-controls">
            <EmbeddingControls
              showEmbeddings={showEmbeddings}
              handleShowEmbeddings={handleShowEmbeddings}
              showDifference={showDifference}
              handleShowDifference={handleShowDifference}
              searchEmbedding={searchEmbedding}
              rows={rows}
              embeddingMinValues={embeddingMinValues}
              embeddingMaxValues={embeddingMaxValues}
              embeddings={embeddings}
            />
          </div> */}
        </div>

        <FilterDataTable
          height={tableHeight}
          dataset={dataset}
          scope={scope}
          indices={intersectedIndices}
          distances={distances}
          clusterMap={clusterMap}
          clusterLabels={clusterLabels}
          tagset={tagset}
          onTagset={fetchTagSet}
          onScope={() => {
            fetchScopeMeta();
            fetchScopeRows();
          }}
          onHover={(index) => handleHover(inputToScopeIndexMap[index])}
          onClick={handleClicked}
          onRows={setRows}
          showDifference={null}
          filtersContainerRef={filtersContainerRef}
          // showDifference={showDifference ? searchEmbedding : null}
          // showEmbeddings={showEmbeddings}
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
