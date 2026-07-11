import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import './Explore.css';
import { apiService } from '../lib/apiService';

import FilterActions from '../components/Explore/FilterActions';
import SubNav from '../components/SubNav';
import LeftPane from '../components/Explore/LeftPane';
import VisualizationPane from '../components/Explore/VisualizationPane';
import FilterDataTable from '../components/Explore/FilterDataTable';
import ClusterLabelsPanel from '../components/Explore/ClusterLabelsPanel';
import PointDetail from '../components/Explore/PointDetail';

import { ScopeProvider, useScope } from '../contexts/ScopeContext';
import { cleanTokenString, tokenSnippet } from '../lib/tokenSnippet';
import { FilterProvider, useFilter } from '../contexts/FilterContext';
import useDebounce from '../hooks/useDebounce';
import { useSmallScreen } from '../hooks/useSmallScreen';
import MobileExplore from './MobileExplore';

import { filterConstants, applyFilterToUrlParams } from '../components/Explore/Search/utils';
import { Spinner } from '../components/ui';

// Create a new component that wraps the main content
function ExploreContent() {
  // Get scope-related state from ScopeContext
  const {
    datasetId,
    scopeId,
    dataset,
    scope,
    scopeLoaded,
    error: scopeError,
    scopeRows,
    deletedIndices,
    clusterMap,
    clusterLabels,
    features,
    sae,
    scopes,
    tags,
    isTokenScope,
  } = useScope();

  const navigate = useNavigate();

  // Set view of deletedIndices for O(1) membership checks in hot paths
  // (hover handlers); the array remains the source of truth.
  const deletedIndicesSet = useMemo(() => new Set(deletedIndices), [deletedIndices]);

  // Get filter-related state from FilterContext
  const {
    setFilterQuery,
    featureFilter,
    searchFilter,
    clusterFilter,
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
  // Index of the point whose detail drawer is open (null = closed).
  const [selectedIndex, setSelectedIndex] = useState(null);

  // Highlight the selected point on the map (same [x, y] annotation shape as
  // the hover annotations).
  const selectedAnnotations = useMemo(() => {
    if (selectedIndex === null || selectedIndex === undefined) return [];
    const sr = scopeRows?.[selectedIndex];
    return sr ? [[sr.x, sr.y]] : [];
  }, [selectedIndex, scopeRows]);

  // Add a ref to track the latest requested index
  const latestHoverIndexRef = useRef(null);

  // Modify the hover text hydration with debouncing
  const hydrateHoverText = useCallback(
    (index, setter) => {
      latestHoverIndexRef.current = index;
      apiService.getHoverText(scope, index).then((data) => {
        // Only update if this is still the latest requested index
        if (latestHoverIndexRef.current === index) {
          setter(data);
        }
      });
    },
    [datasetId, scope]
  );

  const debouncedHydrateHoverText = useDebounce(hydrateHoverText, 5);

  // Token scopes: hydrate the hovered token's passage context (parent text +
  // char span) so the hover card can show the token highlighted in place.
  const hydrateTokenHover = useCallback(
    (index, setter) => {
      latestHoverIndexRef.current = index;
      const embeddingId = scope?.embedding_id || scope?.embedding?.id;
      const textColumn = scope?.embedding?.text_column;
      apiService.fetchTokensFromIndices(datasetId, [index], embeddingId).then((rows) => {
        if (latestHoverIndexRef.current !== index || !rows?.length) return;
        const row = rows[0];
        setter({
          text: row[textColumn],
          snippet: tokenSnippet(row[textColumn], row.char_start, row.char_end, 120),
        });
      });
    },
    [datasetId, scope]
  );

  const debouncedHydrateTokenHover = useDebounce(hydrateTokenHover, 5);

  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined && !deletedIndicesSet.has(hoveredIndex)) {
      // Invalidate any in-flight hydration for the previous point before we
      // render this one. The hydration fetch is debounced 5ms, so without this
      // the ref would still point at the old index during that window and a
      // late response for the old point could overwrite the new tooltip/image.
      latestHoverIndexRef.current = hoveredIndex;
      if (isTokenScope) {
        // Token scopes: the token string renders instantly from scopeRows
        // (scopeRows[i].ls_index === i); the passage context (token
        // highlighted in the parent text) hydrates behind it.
        const token = cleanTokenString(scopeRows[hoveredIndex]?.token_str);
        setHovered({
          text: null,
          token,
          loading: true,
          index: hoveredIndex,
          cluster: clusterMap[hoveredIndex],
        });
        debouncedHydrateTokenHover(hoveredIndex, ({ text, snippet }) => {
          setHovered({
            text,
            tokenSnippet: snippet,
            token,
            loading: false,
            index: hoveredIndex,
            cluster: clusterMap[hoveredIndex],
          });
        });
        return;
      }
      // Update the tooltip immediately with the new index + cluster so the
      // image (keyed on the index) swaps right away; the text arrives after
      // the hydration fetch, marked loading until then.
      setHovered({
        text: null,
        loading: true,
        index: hoveredIndex,
        cluster: clusterMap[hoveredIndex],
      });
      debouncedHydrateHoverText(hoveredIndex, (text) => {
        setHovered({
          text: text,
          loading: false,
          index: hoveredIndex,
          cluster: clusterMap[hoveredIndex],
        });
      });
    } else {
      setHovered(null);
      latestHoverIndexRef.current = null; // Reset the ref when hover is cleared
    }
  }, [
    hoveredIndex,
    deletedIndicesSet,
    clusterMap,
    debouncedHydrateHoverText,
    debouncedHydrateTokenHover,
    isTokenScope,
    scopeRows,
  ]);

  // Update hover annotations
  useEffect(() => {
    if (hoveredIndex !== null && hoveredIndex !== undefined) {
      let sr = scopeRows[hoveredIndex];
      setHoverAnnotations([[sr.x, sr.y]]);
    } else {
      setHoverAnnotations([]);
    }
  }, [hoveredIndex, scopeRows]);

  const [showClusters, setShowClusters] = useState(false);

  // Handlers for responding to individual data points.
  // Clicking a table row opens the detail drawer for that row.
  const handleClicked = useCallback(
    (index) => {
      if (index === null || index === undefined || deletedIndicesSet.has(index)) return;
      setSelectedIndex(index);
    },
    [deletedIndicesSet]
  );

  // Clicking a point on the map opens the detail drawer; clicking empty
  // space (ScatterGL sends an empty selection) closes it.
  const handleSelected = useCallback(
    (indices) => {
      const index = indices?.[0];
      if (index === undefined || index === -1 || deletedIndicesSet.has(index)) {
        setSelectedIndex(null);
        return;
      }
      setSelectedIndex(index);
    },
    [deletedIndicesSet]
  );

  const handleDetailClose = useCallback(() => setSelectedIndex(null), []);

  const handleHover = useCallback(
    (index) => {
      const nonDeletedIndex = deletedIndicesSet.has(index) ? null : index;
      setHoveredIndex(nonDeletedIndex);
      if (nonDeletedIndex >= 0) {
        setHoveredCluster(clusterMap[nonDeletedIndex]);
      } else {
        setHoveredCluster(null);
      }
    },
    [deletedIndicesSet]
  );

  const containerRef = useRef(null);
  const filtersContainerRef = useRef(null);

  const [filtersHeight, setFiltersHeight] = useState(250);
  const FILTERS_PADDING = 2;
  const tableHeight = useMemo(
    () => `calc(100% - ${filtersHeight + FILTERS_PADDING}px)`,
    [filtersHeight]
  );

  const handleScopeChange = useCallback(
    (e) => {
      navigate(`/datasets/${dataset?.id}/explore/${e.target.value}`);
    },
    [dataset, navigate]
  );

  // Track the filters container height. Depends on `dataset` because the
  // container only renders once the dataset has loaded.
  useEffect(() => {
    const node = filtersContainerRef.current;
    if (!node) {
      setFiltersHeight(0);
      return;
    }
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { height } = entry.contentRect;
        setFiltersHeight(height);
      }
    });
    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, [dataset]);

  // ====================================================================================================
  // Fullscreen related logic
  // ====================================================================================================
  const [size, setSize] = useState([500, 500]);
  const visualizationContainerRef = useRef(null);

  // Size the visualization to its container. A ResizeObserver fires on
  // initial observe and on any subsequent container resize (window resizes,
  // drag-resizing the split panes, etc.). Depends on `dataset` because the
  // container only renders once the dataset has loaded.
  useEffect(() => {
    const node = visualizationContainerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setSize([width, height]);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [dataset]);

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
      // The visualization container's ResizeObserver picks up the resulting resize.
    }
  };

  const stopDragging = () => {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDragging);
  };

  const handleFeatureClick = useCallback(
    (featIdx, activation, label) => {
      // Filters are single-select: selecting a feature replaces whatever
      // filter was active (e.g. an open cluster) in both hook state and the
      // URL, so the active-filter chip shows the feature and clearing it
      // doesn't take a hidden cluster filter down with it.
      if (clusterFilter.cluster) clusterFilter.clear();
      setFilterQuery(label);
      setFilterConfig({ type: filterConstants.FEATURE, value: featIdx, label });
      featureFilter.setFeature(featIdx);
      setFilterActive(true);
      setUrlParams((prev) =>
        applyFilterToUrlParams(new URLSearchParams(prev), {
          type: filterConstants.FEATURE,
          value: featIdx,
        })
      );
    },
    [
      featureFilter.setFeature,
      clusterFilter,
      setFilterQuery,
      setFilterConfig,
      setFilterActive,
      setUrlParams,
    ]
  );

  if (scopeError)
    return (
      <>
        <SubNav dataset={dataset} scope={scope} scopes={scopes} />
        <div style={{ padding: 'var(--ls-space-4)' }}>
          <p>
            Failed to load scope {scopeId} for dataset {datasetId}.
          </p>
          <p>{scopeError.message}</p>
          <a href="/">Back to home</a>
        </div>
      </>
    );

  if (!dataset)
    return (
      <>
        <SubNav dataset={dataset} scope={scope} scopes={scopes} />
        <div className="explore-loading">
          <Spinner label="LOADING SCOPE…" />
        </div>
      </>
    );

  return (
    <>
      <SubNav
        dataset={dataset}
        scope={scope}
        scopes={scopes}
        onScopeChange={handleScopeChange}
      />
      <div className="page-container">
        <LeftPane
          dataset={dataset}
          scope={scope}
          deletedIndices={deletedIndices}
          tags={tags}
          showClusters={showClusters}
          onToggleClusters={() => setShowClusters(!showClusters)}
        />
        <div
          ref={containerRef}
          className="full-screen-explore-container"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="filter-table-container">
            <div className="drag-handle" onMouseDown={startDragging} />
            {showClusters && (
              <div className="cluster-accordion">
                <ClusterLabelsPanel />
              </div>
            )}
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
                onSelect={handleSelected}
                hoverAnnotations={hoverAnnotations}
                selectedAnnotations={selectedAnnotations}
                hoveredCluster={hoveredCluster}
              />
            ) : null}
            <PointDetail selectedIndex={selectedIndex} onClose={handleDetailClose} />
          </div>
        </div>
      </div>
    </>
  );
}

// Make the main Explore component just handle the providers
function Explore() {
  const isSmallScreen = useSmallScreen();

  return (
    <ScopeProvider>
      <FilterProvider>
        {isSmallScreen ? <MobileExplore /> : <ExploreContent />}
      </FilterProvider>
    </ScopeProvider>
  );
}

export default Explore;
