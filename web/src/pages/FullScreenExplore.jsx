import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
const { asyncBufferFromUrl, parquetRead } = await import('hyparquet');

import './Explore.css';
import useCurrentScope from '../hooks/useCurrentScope';
import useNearestNeighborsSearch from '../hooks/useNearestNeighborsSearch';
import useScopeData from '../hooks/useScopeData';
import useColumnFilter from '../hooks/useColumnFilter';
import { saeAvailable } from '../lib/SAE';
import { apiUrl } from '../lib/apiService';

import FilterActions from '../components/Explore/FilterActions';
import SubNav from '../components/SubNav';
import LeftPane from '../components/Explore/LeftPane';
import VisualizationPane from '../components/Explore/VisualizationPane';
import FilterDataTable from '../components/FilterDataTable';

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
      const annots = scopeRows.filter((d) => d.cluster == slide.cluster);
      setSlideAnnotations(annots);
      // scatter?.zoomToPoints(
      //   annots.map((d) => d.ls_index),
      //   { transition: true, transitionDuration: 1500, padding: 1.5 }
      // );
    } else {
      console.log('==== no slide', scatter);
      setSlideAnnotations([]);
      // if (scatter && scatter.zoomToOrigin) {
      //   console.log('==== zoom to origin', scatter.zoomToOrigin);
      //   // scatter?.zoomToLocation([0, 0], 1);
      //   scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 });
      // }
    }
  }, [slide, scopeRows, scatter, setSlideAnnotations]);

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
    setSlide(null);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedIndices([]);
    setSearchIndices([]);
    setIntersectedIndices([]);
    setSlide(null);
  }, [setSelectedIndices, setSearchIndices]);

  function intersectMultipleArrays(filterMode, ...arrays) {
    arrays = arrays.filter((d) => d.length > 0);
    if (arrays.length === 0) return [];
    if (arrays.length == 1) return arrays[0];

    if (filterMode === 'all') {
      // AND mode - intersection
      return arrays.reduce((acc, curr) => {
        const currSet = new Set(curr);
        return acc.filter((x) => currSet.has(x));
      });
    } else {
      // ANY mode - union
      const unionSet = new Set();
      arrays.forEach((arr) => {
        arr.forEach((x) => unionSet.add(x));
      });
      return Array.from(unionSet);
    }
  }

  const [intersectedIndices, setIntersectedIndices] = useState([]);
  // intersect the indices from the various filters
  useEffect(() => {
    // console.log("selectedIndices", selectedIndices)
    // console.log("searchIndices", searchIndices)
    // console.log("tag", tag)
    // console.log("tagset", tagset[tag])

    // these are all in the original scope space
    const filteredClusterIndices = scopeRows
      .filter((d) => d.cluster == slide?.cluster)
      .map((d) => d.ls_index);
    let indices = intersectMultipleArrays(
      'all',
      selectedIndices || [],
      searchIndices || [],
      filteredClusterIndices || []
    );
    // if (indices.length == 0 && selectedIndices.length > 0) {
    //   indices = selectedIndices;
    // }
    // console.log("indices!", indices)
    setIntersectedIndices(indices);
  }, [scopeRows, selectedIndices, searchIndices, slide, tagset]);

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

  // initial size
  useEffect(() => {
    const observer = new MutationObserver((mutations, obs) => {
      if (containerRef.current && visualizationContainerRef.current) {
        const vizRect = visualizationContainerRef.current.getBoundingClientRect();
        setSize([vizRect.width, vizRect.height]);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  const xOffset = 50;
  const yOffset = 100;

  // let's fill the container and update the width and height if window resizes
  // useEffect(() => {
  //   const node = containerRef.current;
  //   if (!node) return;

  //   const rect = containerRef.current.getBoundingClientRect();
  //   const vizRect = visualizationContainerRef.current.getBoundingClientRect();
  //   // const width = rect.width;
  //   // let swidth = width > 500 ? 500 : width - 50;
  //   setSize([vizRect.width, rect.height - vizRect.top + 30]);
  //   // const windowWidth = node.clientWidth;
  //   // const windowHeight = node.clientHeight;
  //   // setSize([windowWidth - xOffset, windowHeight - yOffset]);
  //   // window.addEventListener('resize', updateSize);
  //   // updateSize();
  //   // return () => window.removeEventListener('resize', updateSize);
  // }, [containerRef]);

  // let's fill the container and update the width and height if window resizes
  useEffect(() => {
    function updateSize() {
      // console.log('updateSize', containerRef.current);
      if (!containerRef.current) return;

      // if (isFullScreen) {
      // const rect = visualizationContainerRef.current.getBoundingClientRect();
      // setSize([rect.width, rect.height]);
      // else {
      const vizRect = visualizationContainerRef.current.getBoundingClientRect();
      setSize([vizRect.width, vizRect.height]);
      // }

      // console.log("UMAP OFFSET", rect.top + top)
    }
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, [containerRef]);

  // // Create resize observer effect
  // useEffect(() => {
  //   const resizeObserver = new ResizeObserver((entries) => {
  //     for (let entry of entries) {
  //       const { width, height } = entry.contentRect;
  //       // Update visualization size
  //       setSize([width - xOffset, height - yOffset]);
  //     }
  //   });

  //   if (visualizationContainerRef.current) {
  //     resizeObserver.observe(visualizationContainerRef.current);
  //   }

  //   return () => {
  //     if (visualizationContainerRef.current) {
  //       resizeObserver.unobserve(visualizationContainerRef.current);
  //     }
  //   };
  // }, [xOffset, yOffset]);

  const [width, height] = size;
  console.log('=== SIZE ====', width, height);

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
          <div
            className="filter-table-container"
            style={{ cursor: 'ew-resize' }}
            onMouseDown={startDragging}
          >
            <div ref={filtersContainerRef}>
              <FilterActions
                clusterLabels={clusterLabels}
                slide={slide}
                slideAnnotations={slideAnnotations}
                setSlide={setSlide}
                searchIndices={searchIndices}
                searchLoading={searchLoading}
                setSearchText={setSearchText}
                clearSearch={clearSearch}
                selectedIndices={selectedIndices}
                setSelectedIndices={setSelectedIndices}
                scatter={scatter}
                clearFilters={clearFilters}
              />
            </div>
            <div
              style={{
                height: tableHeight,
                overflowY: 'auto',
                display: 'flex',
                // alignItems: 'center',
              }}
            >
              <FilterDataTable
                height={tableHeight}
                dataset={dataset}
                scope={scope}
                indices={intersectedIndices}
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
                editMode={true}
                showDifference={null}
                // showDifference={showDifference ? searchEmbedding : null}
              />
            </div>
          </div>
          <div
            ref={visualizationContainerRef}
            className="visualization-pane-container"
            onMouseLeave={() => {
              setHoveredIndex(null);
              setHoveredCluster(null);
              setHoverAnnotations([]);
              setHovered(null);
            }}
          >
            {scopeRows?.length ? (
              <VisualizationPane
                scopeRows={scopeRows}
                clusterLabels={clusterLabels}
                hoveredIndex={hoveredIndex}
                hoverAnnotations={hoverAnnotations}
                intersectedIndices={intersectedIndices}
                hoveredCluster={hoveredCluster}
                slide={slide}
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
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

export default Explore;
