import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
const { asyncBufferFromUrl, parquetRead } = await import('hyparquet');

import './Explore.css';
import useCurrentScope from '../hooks/useCurrentScope';
import useNearestNeighborsSearch from '../hooks/useNearestNeighborsSearch';
import useScopeData from '../hooks/useScopeData';
import { saeAvailable } from '../lib/SAE';
import { apiUrl, apiService } from '../lib/apiService';

import FilterActions from '../components/Explore/FilterActions';
import SubNav from '../components/SubNav';
import LeftPane from '../components/Explore/LeftPane';
import VisualizationPane from '../components/Explore/VisualizationPane';
import FilterDataTable from '../components/FilterDataTable';

export const SEARCH = 'search';
export const CLUSTER = 'filter';
export const SELECT = 'select';
export const COLUMN = 'column';
export const FEATURE = 'feature';
export const PER_PAGE = 100;


function Explore() {
  const { dataset: datasetId, scope: scopeId } = useParams();
  const navigate = useNavigate();

  // fetch dataset and current scope metadata
  // - scopes: all scopes available for this dataset
  // - embeddings: embeddings available for this dataset
  const { embeddings, dataset, scope, fetchScopeMeta, scopes, fetchTagSet, tags } = useCurrentScope(
    datasetId,
    scopeId,
    apiUrl
  );

  // fetch data for the current scope and populate data structures for scatterplot and clustering
  const { fetchScopeRows, clusterMap, clusterLabels, scopeRows, sae, deletedIndices, setSae } =
    useScopeData(apiUrl, datasetId, scope);

  // TODO: the user should be able to highlight a feature
  // when passed to the data table it will show that feature first?
  const [feature, setFeature] = useState(-1);
  const [features, setFeatures] = useState([]);
  const [threshold, setThreshold] = useState(0.1);

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
      } else {
        console.log('==== no embedding ====');
        setFeatures([]);
      }
    } else {
      console.log('==== no sae or embeddings ====');
      setFeatures([]);
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

  // the indices to show in the table when no other filters are active.
  const [defaultIndices, setDefaultIndices] = useState([]);

  // the indices to show in the table when other filters are active.
  const [filteredIndices, setFilteredIndices] = useState([]);

  // ====================================================================================================
  // Default rows logic.
  // ====================================================================================================
  // Contains state for the default rows that are shown in the table when the page loads.
  // These are the rows that are shown when there are no filters active.
  // ====================================================================================================
  const [page, setPage] = useState(0);

  // Update defaultIndices when scopeRows changes
  useEffect(() => {
    if (scopeRows?.length) {
      const indexes = scopeRows
        .filter((row) => !deletedIndices.includes(row.ls_index))
        .map((row) => row.ls_index);
      setDefaultIndices(indexes);
      setFilteredIndices([]);
    }
  }, [scopeRows]);

  // ====================================================================================================
  // Scatterplot related logic
  // ====================================================================================================
  // this is a reference to the regl scatterplot instance
  // so we can do stuff like clear selections without re-rendering
  const [scatter, setScatter] = useState({});

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

  // contains the rows that are currently being displayed in the data table
  // this is used potentially color the points in the scatterplot when the filter is feature
  const [dataTableRows, setDataTableRows] = useState([]);

  // ====================================================================================================
  // Filtering
  // ====================================================================================================
  // Selection via Scatterplot
  // indices of items selected by the scatter plot
  // indices of items in the current filter. default to cluster indices to start
  const [activeFilterTab, setActiveFilterTab] = useState(CLUSTER);

  const [selectedIndices, setSelectedIndices] = useState([]);

  const [columnFilterIndices, setColumnFilterIndices] = useState([]);

  const toggleSearch = () => {
    setActiveFilterTab(SEARCH);
    setFilteredIndices(searchIndices);
  };

  const toggleColumn = () => {
    setActiveFilterTab(COLUMN);
    setFilteredIndices(columnFilterIndices);
  };

  const toggleFilter = () => {
    setActiveFilterTab(CLUSTER);
    setFilteredIndices(clusterIndices);
  };

  const toggleSelect = () => {
    setActiveFilterTab(SELECT);
    setFilteredIndices(selectedIndices);
  };

  const toggleFeature = () => {
    setActiveFilterTab(FEATURE);
    setFilteredIndices(featureIndices);
  };

  // ====================================================================================================
  // NN Search
  // ====================================================================================================
  // the text that the user has entered into the nearest neighbor search input
  const [searchText, setSearchText] = useState('');

  // the indices returned from similarity search
  const {
    searchIndices,
    distances,
    isLoading: searchLoading,
    clearSearch,
  } = useNearestNeighborsSearch({
    apiUrl,
    datasetId,
    scope,
    embeddings,
    deletedIndices,
    searchText,
    setSearchText,
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
      setFilteredIndices(defaultIndices);
      setActiveFilterTab(CLUSTER);
      setCluster(null);
      setClusterAnnotations([]);
      setClusterIndices([]);
      setFeature(null);
      setFeatureAnnotations([]);
      setFeatureIndices([]);
      setSearchText('');
      setFeatures([]);
      setDataTableRows([]);
      setHovered(null);
      setHoveredIndex(null);
      setHoveredCluster(null);
      setHoverAnnotations([]);
      setSelectedIndices([]);
      setColumnFilterIndices([]);
      setSae(null);
    }
  }, [fetchScopeRows, scope]);

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

  // behavior for when a user selects point(s) in the scatterplot
  // if the filter tab is CLUSTER, we should set the cluster to the cluster of the point
  // otherwise we should select the point(s) and toggle the filter tab to SELECT
  const handleSelected = useCallback(
    (indices) => {
      const nonDeletedIndices = indices.filter((index) => !deletedIndices.includes(index));
      if (activeFilterTab === CLUSTER) {
        let selected = scopeRows.filter((row) => nonDeletedIndices.includes(row.ls_index))?.[0];
        setCluster(clusterLabels.find((d) => d.cluster == selected?.cluster));
      } else {
        if (activeFilterTab !== SELECT) {
          setActiveFilterTab(SELECT);
        }
        setSelectedIndices(nonDeletedIndices);
      }
    },
    [activeFilterTab, setSelectedIndices, deletedIndices]
  );

  const clearScope = useCallback(() => {
    setCluster(null);
  }, []);

  // ==== CLUSTERS ====

  const [clusterIndices, setClusterIndices] = useState([]);
  useEffect(() => {
    if (cluster && activeFilterTab === CLUSTER) {
      const annots = scopeRows.filter((d) => d.cluster == cluster.cluster);
      setClusterAnnotations(annots);
      const indices = annots.map((d) => d.ls_index);
      setClusterIndices(indices);
    } else {
      setClusterAnnotations([]);
      setClusterIndices([]);
    }
  }, [cluster, scopeRows, setClusterAnnotations, setClusterIndices]);

  // ==== COLUMNS ====

  const [featureIndices, setFeatureIndices] = useState([]);
  const [featureAnnotations, setFeatureAnnotations] = useState([]);
  useEffect(() => {
    if (feature >= 0 && activeFilterTab === FEATURE) {
      console.log('==== feature ==== ', feature);
      console.log('==== threshold ==== ', threshold);
      apiService.searchSaeFeature(datasetId, sae?.id, feature, threshold, 100).then((data) => {
        console.log('==== data ==== ', data);
        setFeatureIndices(data.top_row_indices);
      });
    } else {
      // The feature filter is active, but the feature is no longer set
      // so we should clear the filtered indices
      setFeatureIndices([]);
    }
  }, [datasetId, sae, feature, threshold, setFeatureIndices]);

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
  const FILTERS_PADDING = 2;
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
  // set the filtered indices based on the active filter tab
  // ====================================================================================================
  useEffect(() => {
    if (activeFilterTab === COLUMN) {
      setFilteredIndices(columnFilterIndices);
    } else if (activeFilterTab === FEATURE) {
      setFilteredIndices(featureIndices);
    } else if (activeFilterTab === CLUSTER) {
      setFilteredIndices(clusterIndices);
    } else if (activeFilterTab === SELECT) {
      setFilteredIndices(selectedIndices);
    } else if (activeFilterTab === SEARCH) {
      setFilteredIndices(searchIndices);
    }
  }, [
    activeFilterTab,
    columnFilterIndices,
    featureIndices,
    clusterIndices,
    selectedIndices,
    searchIndices,
  ]);

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
      updateSize();
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
      right: -15,
      top: 0,
      bottom: 0,
      width: 30,
      cursor: 'ew-resize',
      backgroundColor: 'transparent',
      transition: 'background-color 0.2s',
      '&:hover': {
        backgroundColor: '#e0e0e0',
      },
      zIndex: 10,
    },
  };

  const handleFeatureClick = useCallback(
    (featIdx, activation) => {
      setActiveFilterTab(FEATURE);
      setFeature(featIdx);
      // TODO: for setting the threshold the FeatureFilter component would need to have threshold passed in
      // setThreshold(activation);
    },
    [setActiveFilterTab, setFeature, setThreshold]
  );

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
                cluster={cluster}
                setCluster={setCluster}
                clusterIndices={clusterIndices}
                columnFilterIndices={columnFilterIndices}
                setColumnFilterIndices={setColumnFilterIndices}
                searchIndices={searchIndices}
                searchLoading={searchLoading}
                setSearchText={setSearchText}
                clearSearch={clearSearch}
                selectedIndices={selectedIndices}
                setSelectedIndices={setSelectedIndices}
                scatter={scatter}
                activeFilterTab={activeFilterTab}
                toggleSearch={toggleSearch}
                toggleColumn={toggleColumn}
                toggleFilter={toggleFilter}
                toggleSelect={toggleSelect}
                toggleFeature={toggleFeature}
                dataset={dataset}
                datasetId={datasetId}
                scope={scope}
                features={features}
                feature={feature}
                setFeature={setFeature}
                featureIndices={featureIndices}
                setFeatureIndices={setFeatureIndices}
                setThreshold={setThreshold}
                searchText={searchText}
              />
            </div>
            <div
              style={{
                height: tableHeight,
                overflowY: 'auto',
                display: 'flex',
              }}
            >
              {/* FilterDataTable renders defaultIndices if filteredIndices is empty */}
              <FilterDataTable
                dataset={dataset}
                scope={scope}
                filteredIndices={filteredIndices}
                defaultIndices={defaultIndices}
                deletedIndices={deletedIndices}
                distances={distances}
                clusterMap={clusterMap}
                clusterLabels={clusterLabels}
                onDataTableRows={setDataTableRows}
                sae_id={sae?.id}
                feature={feature}
                features={features}
                onTagset={fetchTagSet}
                onScope={() => {
                  fetchScopeMeta();
                  fetchScopeRows();
                }}
                onHover={handleHover}
                onClick={handleClicked}
                page={page}
                setPage={setPage}
                handleFeatureClick={handleFeatureClick}
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
                activeFilterTab={activeFilterTab}
                dataTableRows={dataTableRows}
                feature={feature}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default Explore;
