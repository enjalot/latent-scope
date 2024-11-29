import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
const { asyncBufferFromUrl, parquetRead } = await import('hyparquet');

import './Explore.css';
import useCurrentScope from '../hooks/useCurrentScope';
import useNearestNeighborsSearch from '../hooks/useNearestNeighborsSearch';
import useScopeData from '../hooks/useScopeData';
import { saeAvailable } from '../lib/SAE';
import { apiUrl } from '../lib/apiService';

import FilterActions from '../components/Explore/FilterActions';
import SubNav from '../components/SubNav';
import LeftPane from '../components/Explore/LeftPane';
import VisualizationPane from '../components/Explore/VisualizationPane';
import FilterDataTable from '../components/FilterDataTable';

export const SEARCH = 'search';
export const FILTER = 'filter';
export const SELECT = 'select';

function Explore() {
  const { dataset: datasetId, scope: scopeId } = useParams();
  const navigate = useNavigate();

  // fetch dataset and current scope metadata
  // - scopes: all scopes available for this dataset
  // - embeddings: embeddings available for this dataset
  const { embeddings, dataset, scope, fetchScopeMeta, scopes, tagset, fetchTagSet, tags } =
    useCurrentScope(datasetId, scopeId, apiUrl);

  // fetch data for the current scope and populate data structures for scatterplot and clustering
  const {
    fetchScopeRows,
    setClusterLabels,
    clusterMap,
    clusterLabels,
    scopeRows,
    sae,
    deletedIndices,
  } = useScopeData(apiUrl, datasetId, scope);

  // TODO: the user should be able to highlight a feature
  // when passed to the data table it will show that feature first?
  const [feature, setFeature] = useState(-1);
  const [features, setFeatures] = useState([]);

  useEffect(() => {
    const asyncRead = async (meta) => {
      // console.log("META", meta)
      if (!meta) return;
      const buffer = await asyncBufferFromUrl(meta.url);
      parquetRead({
        file: buffer,
        onComplete: (data) => {
          // let pts = []
          // console.log("DATA", data)
          let fts = data.map((f) => {
            // pts.push([f[2], f[3], parseInt(f[5])])
            return {
              feature: parseInt(f[0]),
              max_activation: f[1],
              label: f[6],
              order: f[7],
            };
          });
          // .filter(d => d.label.indexOf("linear") >= 0)
          // .sort((a,b) => a.order - b.order)
          console.log('FEATURES', fts);
          setFeatures(fts);
        },
      });
    };
    if (sae && embeddings && scope) {
      let embedding = embeddings.find((e) => e.id == scope.embedding_id);
      if (embedding) {
        asyncRead(saeAvailable[embedding.model_id]);
      }
    }
  }, [scope, sae, embeddings]);

  // fectches a set of indexes from the server, and updates some state with the results
  // used to render points in the table after a user clicks on a point in the scatterplot
  const hydrateIndices = useCallback(
    (indices, setter) => {
      fetch(`${apiUrl}/indexed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    [dataset, datasetId]
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
      const nonDeletedIndices = indices.filter((index) => !deletedIndices.includes(index));
      setSelectedIndices(nonDeletedIndices);
      setFilteredIndices(nonDeletedIndices);
      // for now we dont zoom because if the user is selecting via scatter they can easily zoom themselves
      // scatter?.zoomToPoints(nonDeletedIndices, { transition: true });
    },
    [setSelectedIndices]
  );

  // Hover via scatterplot or tables
  // index of item being hovered over
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  useEffect(() => {
    if (
      hoveredIndex !== null &&
      hoveredIndex !== undefined &&
      !deletedIndices.includes(hoveredIndex)
    ) {
      hydrateIndices([hoveredIndex], (results) => {
        setHovered(results[0]);
      });
    } else {
      setHovered(null);
    }
  }, [hoveredIndex, setHovered, hydrateIndices]);

  const [hoveredCluster, setHoveredCluster] = useState(null);
  useEffect(() => {
    if (hoveredIndex) {
      setHoveredCluster(clusterMap[hoveredIndex]);
    } else {
      setHoveredCluster(null);
    }
  }, [hoveredIndex, clusterMap, setHoveredCluster]);

  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      let sr = scopeRows[hoveredIndex];
      setHoverAnnotations([sr.x, sr.y]);
    } else {
      setHoverAnnotations([]);
    }
  }, [hoveredIndex, scopeRows]);

  // ====================================================================================================
  // Filtering
  // ====================================================================================================
  // indices of items in the current filter. default to cluster indices to start
  const [activeFilterTab, setActiveFilterTab] = useState(FILTER);

  const toggleSearch = () => {
    setActiveFilterTab(SEARCH);
    setFilteredIndices(searchIndices);
  };

  const toggleFilter = () => {
    setActiveFilterTab(FILTER);
    setFilteredIndices(clusterIndices);
  };

  const toggleSelect = () => {
    setActiveFilterTab(SELECT);
    setFilteredIndices(selectedIndices);
  };

  const [filteredIndices, setFilteredIndices] = useState([]);

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
    clearSearch,
  } = useNearestNeighborsSearch({
    apiUrl,
    datasetId,
    scope,
    embeddings,
    deletedIndices,
    setFilteredIndices,
  });

  // ====================================================================================================
  // Clusters
  // ====================================================================================================
  // indices of items in a chosen slide
  const [cluster, setCluster] = useState(null);
  const [clusterAnnotations, setClusterAnnotations] = useState([]);

  useEffect(() => {
    if (scope) {
      fetchScopeRows();
    }
  }, [fetchScopeRows, scope, embeddings, setClusterLabels]);

  // automatically set the first cluster filter when the scope rows are loaded
  useEffect(() => {
    if (clusterMap) {
      setCluster(clusterMap[0]);
    }
  }, [clusterMap]);

  useEffect(() => {
    if (cluster) {
      const annots = scopeRows.filter((d) => d.cluster == cluster.cluster);
      setClusterAnnotations(annots);
      const indices = annots.map((d) => d.ls_index);
      setClusterIndices(indices);
      setFilteredIndices(indices);
      // scatter?.zoomToPoints(
      //   annots.map((d) => d.ls_index),
      //   { transition: true, transitionDuration: 1500, padding: 1.5 }
      // );
    } else {
      setClusterAnnotations([]);
      // if (scatter && scatter.zoomToOrigin) {
      //   console.log('==== zoom to origin', scatter.zoomToOrigin);
      //   // scatter?.zoomToLocation([0, 0], 1);
      //   scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 });
      // }
    }
  }, [cluster, scopeRows, scatter, setClusterAnnotations]);

  // Handlers for responding to individual data points
  const handleClicked = useCallback(
    (index) => {
      console.log('====clicked====', index);
      // if (scatter && scatter.zoomToPoints) {
      //   scatter?.zoomToPoints([index], {
      //     transition: true,
      //     padding: 0.9,
      //     transitionDuration: 1500,
      //   });
      // }
    },
    [scatter]
  );
  const handleHover = useCallback(
    (index) => {
      const nonDeletedIndex = deletedIndices.includes(index) ? null : index;
      setHoveredIndex(nonDeletedIndex);
    },
    [setHoveredIndex]
  );

  const clearScope = useCallback(() => {
    setCluster(null);
  }, []);

  const [clusterIndices, setClusterIndices] = useState([]);
  useEffect(() => {
    if (cluster) {
      const indices = clusterAnnotations.map((d) => d.ls_index);
      setClusterIndices(indices);
    } else {
      setClusterIndices([]);
      // clear the filtered indices when the cluster is clearedS
      // this should only happen when the cluster filter is the active filter.
      setFilteredIndices([]);
    }
  }, [cluster, clusterMap]);

  const handleScopeChange = useCallback(
    (e) => {
      clearScope();
      navigate(`/datasets/${dataset?.id}/explore/${e.target.value}`);
    },
    [dataset, clearScope, navigate]
  );

  const containerRef = useRef(null);
  const filtersContainerRef = useRef(null);

  const [filtersHeight, setFiltersHeight] = useState(250);
  const FILTERS_PADDING = 62;
  const tableHeight = useMemo(
    () => `calc(100% - ${filtersHeight + FILTERS_PADDING}px)`,
    [filtersHeight]
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
          setFiltersHeight(0);
        }
      }, 100);
    }

    return () => {
      if (node) {
        resizeObserver.unobserve(node);
      }
    };
  }, []);

  // ====================================================================================================
  // Fullscreen related logic
  // ====================================================================================================
  const [size, setSize] = useState([500, 500]);
  const visualizationContainerRef = useRef(null);

  function updateSize() {
    if (visualizationContainerRef.current) {
      const vizRect = visualizationContainerRef.current.getBoundingClientRect();
      setSize([vizRect.width, vizRect.height]);
    }
  }

  // initial size
  useEffect(() => {
    const observer = new MutationObserver((mutations, obs) => {
      updateSize();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // let's fill the container and update the width and height if window resizes
  useEffect(() => {
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, [visualizationContainerRef, containerRef]);

  const [width, height] = size;

  // ====================================================================================================
  // Draggable State
  // ====================================================================================================
  const [gridTemplate, setGridTemplate] = useState('50% 50%');

  const startDragging = (e) => {
    e.preventDefault();
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDragging);
  };

  const onDrag = (e) => {
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const percentage = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      const newTemplate = `${Math.min(Math.max(percentage, 20), 80)}% 1fr`;
      setGridTemplate(newTemplate);
    }
  };

  const stopDragging = () => {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDragging);
  };

  // Add this CSS-in-JS style object near the top of the component
  const styles = {
    dragHandle: {
      position: 'absolute',
      right: -4,
      top: 0,
      bottom: 0,
      width: 8,
      cursor: 'ew-resize',
      backgroundColor: 'transparent',
      transition: 'background-color 0.2s',
      '&:hover': {
        backgroundColor: '#e0e0e0',
      },
      zIndex: 10,
    },
  };

  if (!dataset)
    return (
      <>
        <SubNav dataset={dataset} scope={scope} scopes={scopes} onScopeChange={handleScopeChange} />
        <div>Loading...</div>
      </>
    );

  return (
    <>
      <SubNav dataset={dataset} scope={scope} scopes={scopes} onScopeChange={handleScopeChange} />
      <div style={{ display: 'flex', gap: '4px', height: '100%' }}>
        <LeftPane
          dataset={dataset}
          scope={scope}
          scopes={scopes}
          deletedIndices={deletedIndices}
          tags={tags}
          onScopeChange={handleScopeChange}
        />
        {/* full-screen-explore-container is a grid with 50% for the filter table and 50% for the scatter plot */}
        <div
          ref={containerRef}
          className="full-screen-explore-container"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="filter-table-container" style={{ position: 'relative' }}>
            <div style={styles.dragHandle} onMouseDown={startDragging} />
            <div ref={filtersContainerRef}>
              <FilterActions
                clusterLabels={clusterLabels}
                slide={cluster}
                setCluster={setCluster}
                clusterIndices={clusterIndices}
                searchIndices={searchIndices}
                searchLoading={searchLoading}
                setSearchText={setSearchText}
                clearSearch={clearSearch}
                selectedIndices={selectedIndices}
                setSelectedIndices={setSelectedIndices}
                scatter={scatter}
                setFilteredIndices={setFilteredIndices}
                activeFilterTab={activeFilterTab}
                toggleSearch={toggleSearch}
                toggleFilter={toggleFilter}
                toggleSelect={toggleSelect}
              />
            </div>
            <div
              style={{
                height: tableHeight,
                overflowY: 'auto',
                display: 'flex',
              }}
            >
              <FilterDataTable
                dataset={dataset}
                scope={scope}
                indices={filteredIndices}
                deletedIndices={deletedIndices}
                distances={distances}
                clusterMap={clusterMap}
                clusterLabels={clusterLabels}
                tagset={tagset}
                sae_id={sae?.id}
                feature={feature}
                onTagset={fetchTagSet}
                onScope={() => {
                  fetchScopeMeta();
                  fetchScopeRows();
                }}
                onHover={handleHover}
                onClick={handleClicked}
              />
            </div>
          </div>
          <div
            ref={visualizationContainerRef}
            className="visualization-pane-container"
            onMouseLeave={() => {
              setHoveredIndex(null);
              setHovered(null);
            }}
          >
            {scopeRows?.length ? (
              <VisualizationPane
                scopeRows={scopeRows}
                clusterLabels={clusterLabels}
                hoveredIndex={hoveredIndex}
                hoverAnnotations={hoverAnnotations}
                intersectedIndices={filteredIndices}
                hoveredCluster={hoveredCluster}
                slide={cluster}
                scope={scope}
                containerRef={containerRef}
                onScatter={setScatter}
                onSelect={handleSelected}
                onHover={handleHover}
                hovered={hovered}
                dataset={dataset}
                deletedIndices={deletedIndices}
                width={width}
                height={height}
                showHull={activeFilterTab === FILTER}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default Explore;
