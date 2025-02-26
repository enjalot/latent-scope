import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import './Explore.css';
import { isMobileDevice } from '../../components/Explore/V2/util';
import { apiService } from '../../lib/apiService';

import FilterActions from '../../components/Explore/V2/FilterActions';
import SubNav from '../../components/SubNav';
import LeftPane from '../../components/Explore/LeftPane';
import VisualizationPane from '../../components/Explore/V2/VisualizationPane';
import FilterDataTable from '../../components/Explore/V2/FilterDataTable';

import { ScopeProvider, useScope } from '../../contexts/ScopeContext';
import { FilterProvider, useFilter } from '../../contexts/FilterContext';
import useDebounce from '../../hooks/useDebounce';

import { filterConstants } from '../../components/Explore/V2/Search/utils';

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

// Create a new component that wraps the main content
function ExploreContent() {
  // Get scope-related state from ScopeContext
  const {
    userId,
    datasetId,
    dataset,
    scope,
    scopeLoaded,
    scopeRows,
    deletedIndices,
    clusterMap,
    clusterLabels,
    features,
    sae,
    scopes,
    tags,
  } = useScope();

  // Get filter-related state from FilterContext
  const {
    // filterLoading,
    loading: filterLoading,
    shownIndices,
    setFilterQuery,
    featureFilter,
    searchFilter,
    setFilterConfig,
    setFilterActive,
    setUrlParams,
  } = useFilter();

  // Keep visualization-specific state
  const [scatter, setScatter] = useState({});
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [hoveredCluster, setHoveredCluster] = useState(null);
  const [hoverAnnotations, setHoverAnnotations] = useState([]);
  const [dataTableRows, setDataTableRows] = useState([]);
  const [selectedAnnotations, setSelectedAnnotations] = useState([]);

  // Add a ref to track the latest requested index
  const latestHoverIndexRef = useRef(null);

  // Modify the hover text hydration with debouncing
  const hydrateHoverText = useCallback(
    (index, setter) => {
      latestHoverIndexRef.current = index;
      apiService.getHoverText(userId, datasetId, scope?.id, index).then((data) => {
        // Only update if this is still the latest requested index
        if (latestHoverIndexRef.current === index) {
          setter(data);
        }
      });
    },
    [userId, datasetId, scope]
  );

  const debouncedHydrateHoverText = useDebounce(hydrateHoverText, 5);

  useEffect(() => {
    if (
      hoveredIndex !== null &&
      hoveredIndex !== undefined &&
      !deletedIndices.includes(hoveredIndex)
    ) {
      debouncedHydrateHoverText(hoveredIndex, (text) => {
        setHovered({
          text: text,
          index: hoveredIndex,
          cluster: clusterMap[hoveredIndex],
        });
      });
    } else {
      setHovered(null);
      latestHoverIndexRef.current = null; // Reset the ref when hover is cleared
    }
  }, [hoveredIndex, deletedIndices, clusterMap, debouncedHydrateHoverText]);

  // Update hover annotations
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      let sr = scopeRows[hoveredIndex];
      setHoverAnnotations([[sr.x, sr.y]]);
    } else {
      setHoverAnnotations([]);
    }
  }, [hoveredIndex, scopeRows]);

  // Handlers for responding to individual data points
  const handleClicked = useCallback((index) => {
    console.log('====clicked====', index);
  }, []);

  const handleHover = useCallback(
    (index) => {
      const nonDeletedIndex = deletedIndices.includes(index) ? null : index;
      setHoveredIndex(nonDeletedIndex);
      if (nonDeletedIndex >= 0) {
        setHoveredCluster(clusterMap[nonDeletedIndex]);
      } else {
        setHoveredCluster(null);
      }
    },
    [deletedIndices]
  );

  // const handleSelected = useCallback(
  //   (indices) => {
  //     const nonDeletedIndices = indices.filter((index) => !deletedIndices.includes(index));
  //     if (activeFilterTab === filterConstants.CLUSTER) {
  //       let selected = scopeRows.filter((row) => nonDeletedIndices.includes(row.ls_index))?.[0];
  //       if (selected) {
  //         const selectedCluster = clusterLabels.find((d) => d.cluster === selected.cluster);
  //         //   setCluster(selectedCluster);
  //       }
  //     } else {
  //       setSelectedIndices(nonDeletedIndices);
  //     }
  //   },
  //   [activeFilterTab, deletedIndices, scopeRows, clusterLabels, setSelectedIndices]
  // );

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

  const handleFeatureClick = useCallback(
    (featIdx, activation, label) => {
      setFilterQuery(label);
      setFilterConfig({ type: filterConstants.FEATURE, value: featIdx, label });
      featureFilter.setFeature(featIdx);
      setFilterActive(true);
      setUrlParams((prev) => {
        prev.set('feature', featIdx);
        return new URLSearchParams(prev);
      });
    },
    [featureFilter.setFeature, setFilterQuery, setFilterConfig, setFilterActive, setUrlParams]
  );

  if (!dataset)
    return (
      <>
        <SubNav user={userId} dataset={dataset} scope={scope} scopes={scopes} />
        <div>Loading...</div>
      </>
    );

  console.log({ features });

  return (
    <>
      <SubNav user={userId} dataset={dataset} scope={scope} scopes={scopes} />
      <div className="page-container">
        {!isMobileDevice() && (
          <LeftPane dataset={dataset} scope={scope} deletedIndices={deletedIndices} tags={tags} />
        )}
        <div
          ref={containerRef}
          className="full-screen-explore-container"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div
            className="filter-table-container"
            style={{ position: 'relative', overflowX: 'hidden' }}
          >
            <div style={styles.dragHandle} onMouseDown={startDragging} />
            <div ref={filtersContainerRef}>
              <FilterActions
                clusterLabels={clusterLabels}
                scatter={scatter}
                scope={scope}
                dataset={dataset}
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
                userId={userId}
                dataset={dataset}
                scope={scope}
                distances={searchFilter.distances}
                clusterMap={clusterMap}
                clusterLabels={clusterLabels}
                sae_id={sae?.id}
                feature={featureFilter.feature}
                features={features}
                onHover={handleHover}
                onClick={handleClicked}
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
            {scopeRows?.length && scopeLoaded ? (
              <VisualizationPane
                width={width}
                height={height}
                onScatter={setScatter}
                hovered={hovered}
                hoveredIndex={hoveredIndex}
                onHover={handleHover}
                onSelect={() => {}}
                hoverAnnotations={hoverAnnotations}
                selectedAnnotations={selectedAnnotations}
                hoveredCluster={hoveredCluster}
                dataTableRows={dataTableRows}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

// Make the main Explore component just handle the providers
function Explore() {
  return (
    <ScopeProvider>
      <FilterProvider>
        <ExploreContent />
      </FilterProvider>
    </ScopeProvider>
  );
}

export default Explore;
