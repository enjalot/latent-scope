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

import SubNav from '../components/SubNav';
import ScopeHeader from '../components/Explore/ScopeHeader';
import VisualizationPane from '../components/Explore/VisualizationPane';
import NearestNeighbor from '../components/Explore/NearestNeighbor';
import ClusterFilter from '../components/Explore/ClusterFilter';
import ColumnFilter from '../components/Explore/ColumnFilter';
import BulkActions from '../components/Explore/BulkActions';

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

  const hydrateIndices = useCallback(
    (indices, setter, distances = []) => {
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
      // scatter?.zoomToPoints(nonDeletedIndices, { transition: true })
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
  // Tags
  // ====================================================================================================

  const [tag, setTag] = useState(tags[0]);
  const [tagAnnotations, setTagAnnotations] = useState([]);
  useEffect(() => {
    if (tagset[tag]) {
      const annots = tagset[tag].map((index) => [scopeRows[index].x, scopeRows[index].y]);
      setTagAnnotations(annots);
    } else {
      setTagAnnotations([]);
      if (scatter && scatter.config) {
        // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      }
    }
  }, [tagset, tag, scopeRows, scatter, setTagAnnotations]);

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
    } else {
      setSlideAnnotations([]);
      if (scatter && scatter.config) {
        // scatter?.zoomToOrigin({ transition: true, transitionDuration: 1500 })
      }
    }
  }, [slide, scopeRows, scatter, setSlideAnnotations]);

  const [clusterLabel, setClusterLabel] = useState(slide?.label || '');
  const [newClusterLabel, setNewClusterLabel] = useState('');
  useEffect(() => {
    setNewClusterLabel('');
  }, [slide]);

  const handleNewCluster = useCallback(
    (label) => {
      console.log('new cluster', label);
      fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scope.id}/new-cluster?label=${label}`)
        .then((response) => response.json())
        .then((data) => {
          console.log('what happened?', data);
          fetchScopeMeta();
        });
    },
    [datasetId, scope, fetchScopeMeta]
  );

  useEffect(() => {
    setClusterLabel(slide?.label || '');
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
    [scatter]
  );
  const handleHover = useCallback(
    (index) => {
      const nonDeletedIndex = deletedIndices.includes(index) ? null : index;
      setHoveredIndex(nonDeletedIndex);
    },
    [setHoveredIndex]
  );

  const handleLabelUpdate = useCallback(
    (cluster, label) => {
      console.log('update label', cluster, label);
      fetch(
        `${apiUrl}/bulk/change-cluster-name?dataset_id=${datasetId}&scope_id=${scope.id}&cluster=${cluster}&new_label=${label}`
      )
        .then((response) => response.json())
        .then((data) => {
          console.log('got new labels', data);
          fetchScopeMeta();
        });
    },
    [datasetId, scope]
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
  } = useColumnFilter(apiUrl, dataset, datasetId);

  const clearFilters = useCallback(() => {
    setSelectedIndices([]);
    setSearchIndices([]);
    setTag(null);
    setColumnIndices([]);
  }, [setSelectedIndices, setSearchIndices, setTag, setColumnIndices]);

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

  // ==== FILTER SELECT MODE ====
  const [filterMode, setFilterMode] = useState('all');
  const handleFilterModeChange = useCallback(
    (mode) => {
      setFilterMode(mode);
    },
    [setFilterMode]
  );

  // Tag indices are set on the original dataset, which may have rows deleted
  // so we need to filter them here to make sure we are working with all valid rows
  // in the current scope
  const filterTagIndices = useCallback(
    (indices) => {
      return indices.filter((d) => !deletedIndices.includes(d));
    },
    [deletedIndices]
  );

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
    const filteredTagset = filterTagIndices(tagset[tag] || []);
    let indices = intersectMultipleArrays(
      filterMode,
      selectedIndices || [],
      searchIndices || [],
      filteredClusterIndices || [],
      filteredTagset || [],
      columnIndices || []
    );
    // if (indices.length == 0 && selectedIndices.length > 0) {
    //   indices = selectedIndices;
    // }
    // console.log("indices!", indices)
    setIntersectedIndices(indices);
  }, [
    scopeRows,
    selectedIndices,
    searchIndices,
    slide,
    tagset,
    tag,
    columnIndices,
    filterMode,
    filterTagIndices,
  ]);

  const [bulkAction, setBulkAction] = useState(null);

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
      <div ref={containerRef} className="container">
        <div className="left-column">
          <ScopeHeader
            dataset={dataset}
            tags={tags}
            scope={scope}
            deletedIndices={deletedIndices}
          />

          {scopeRows?.length ? (
            <div
              onMouseLeave={() => {
                setHoveredIndex(null);
                setHoveredCluster(null);
                setHoverAnnotations([]);
                setHovered(null);
              }}
            >
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
              />
            </div>
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
            {/* <div
              className={`filter-row tags-box ${
                filterTagIndices(tagset[tag] || [])?.length ? 'active' : ''
              }`}
            >
              <div className="filter-cell left tags-select">
                <select
                  onChange={(e) => setTag(e.target.value === '-1' ? null : e.target.value)}
                  value={tag || '-1'}
                >
                  {'2'}
                  <option value="-1">Filter by tag</option>
                  {tags.map((t, index) => (
                    <option key={index} value={t}>
                      {t} ({filterTagIndices(tagset[t] || []).length})
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-cell middle">
                {tag && filterTagIndices(tagset[tag] || []).length ? (
                  <span>
                    {filterTagIndices(tagset[tag] || []).length} rows
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
                      fetch(`${apiUrl}/tags/new?dataset=${datasetId}&tag=${newTag}`)
                        .then((response) => response.json())
                        .then((data) => {
                          console.log('new tag', data);
                          e.target.elements.newTag.value = '';
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
                      fetch(`${apiUrl}/tags/delete?dataset=${datasetId}&tag=${tag}`)
                        .then((response) => response.json())
                        .then((data) => {
                          console.log('deleted tag', data);
                          setTag(null);
                          fetchTagSet();
                        });
                    }}
                  >
                    <button type="submit" title="Delete tag from Scope">
                      ➖ {tag}
                    </button>
                  </form>
                )}
              </div>
            </div> */}

            {/* row 4: column filters */}
            <ColumnFilter
              columnFilters={columnFilters}
              columnIndices={columnIndices}
              columnFiltersActive={columnFiltersActive}
              setColumnFiltersActive={setColumnFiltersActive}
              setColumnIndices={setColumnIndices}
            />

            <div className={`filter-row ${selectedIndices?.length ? 'active' : ''}`}>
              <div className="filter-cell left filter-description">
                Shift+Drag on the map to filter by points.
              </div>
              <div className="filter-cell middle">
                {selectedIndices?.length > 0 ? <span>{selectedIndices?.length} rows</span> : null}
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
              <div className="filter-cell left filter-description">
                Displaying rows matching
                <button
                  className={`filter-mode ${filterMode == 'all' ? 'active' : ''}`}
                  type="submit"
                  title="toggle to all"
                  onClick={() => handleFilterModeChange('all')}
                >
                  all
                </button>
                <button
                  className={`filter-mode ${filterMode == 'any' ? 'active' : ''}`}
                  style={{ marginLeft: 0 }}
                  type="submit"
                  title="toggle to any"
                  onClick={() => handleFilterModeChange('any')}
                >
                  any
                </button>
                {` `}filters
              </div>
              <div className="filter-cell middle intersected-count">
                <span>{intersectedIndices.length} rows</span>
              </div>

              <div className="filter-cell right bulk-actions">
                {intersectedIndices.length > 0 ? (
                  <BulkActions
                    bulkAction={bulkAction}
                    setBulkAction={setBulkAction}
                    dataset={dataset}
                    scope={scope}
                    intersectedIndices={intersectedIndices}
                    fetchTagSet={fetchTagSet}
                    fetchScopeMeta={fetchScopeMeta}
                    fetchScopeRows={fetchScopeRows}
                    clearFilters={clearFilters}
                  />
                ) : null}
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

          {intersectedIndices.length > 0 ? (
            <FilterDataTable
              height={tableHeight}
              dataset={dataset}
              scope={scope}
              scopeRows={scopeRows}
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
          ) : (
            <div className="filter-table no-data">Select a filter to display rows</div>
          )}

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
    </>
  );
}

export default Explore;
