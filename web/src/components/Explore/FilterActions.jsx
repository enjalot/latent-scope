import React, { useState } from 'react';
import './FilterActions.css';
import { Icon, Button } from 'react-element-forge';
import ClusterFilter from './ClusterFilter';
import NearestNeighbor from './NearestNeighbor';

function FilterComponent({ searchOpen, filterOpen, selectOpen }) {
  if (searchOpen) {
    return <div>Search</div>;
  }

  if (selectOpen) {
    return <div>Select</div>;
  }

  return null;
}

const SEARCH = 'search';
const FILTER = 'filter';
const SELECT = 'select';

export default function FilterActions({
  clusterLabels,
  slide,
  slideAnnotations,
  setSlide,
  searchIndices,
  searchLoading,
  setSearchText,
  clearSearch,
  selectedIndices,
  setSelectedIndices,
  clearFilters,
  scatter,
}) {
  const [activeFilter, setActiveFilter] = useState(FILTER);

  const toggleSearch = () => {
    clearFilters();
    setActiveFilter(SEARCH);
  };

  const toggleFilter = () => {
    clearFilters();
    setActiveFilter(FILTER);
  };

  const toggleSelect = () => {
    clearFilters();
    setActiveFilter(SELECT);
  };

  let filterComponent = null;
  if (activeFilter === FILTER) {
    filterComponent = (
      <ClusterFilter
        clusterLabels={clusterLabels}
        slide={slide}
        slideAnnotations={slideAnnotations}
        setSlide={setSlide}
      />
    );
  } else if (activeFilter === SELECT) {
    filterComponent = (
      <div className={`filter-row ${selectedIndices?.length ? 'active' : ''}`}>
        <div className="filter-cell left filter-description">
          Click, or Shift+Drag on the map to filter by points.
        </div>
        <div className="filter-cell middle">
          {selectedIndices?.length > 0 ? <span>{selectedIndices?.length} rows</span> : null}
          {selectedIndices?.length > 0 ? (
            <button
              className="deselect"
              onClick={() => {
                setSelectedIndices([]);
                scatter?.select([]);
              }}
            >
              X
            </button>
          ) : null}
        </div>
        <div className="filter-cell right"></div>
      </div>
    );
  } else if (activeFilter === SEARCH) {
    filterComponent = (
      <NearestNeighbor
        searchIndices={searchIndices}
        searchLoading={searchLoading}
        setSearchText={setSearchText}
        clearSearch={clearSearch}
      />
    );
  }

  return (
    <>
      <div className="filter-actions-container">
        <Button
          onClick={toggleFilter}
          className={`filter-actions-button ${activeFilter === FILTER ? 'active' : ''}`}
          size="small"
          icon="filter"
          color="secondary"
          title="Filter data points"
        />
        <Button
          onClick={toggleSearch}
          className={`filter-actions-button ${activeFilter === SEARCH ? 'active' : ''}`}
          size="small"
          icon="search"
          color="secondary"
          title="Search"
        />
        <Button
          onClick={toggleSelect}
          className={`filter-actions-button ${activeFilter === SELECT ? 'active' : ''}`}
          size="small"
          icon="crosshair"
          color="secondary"
          title="Annotate"
        />
      </div>
      <div className="filter-actions-row">{filterComponent}</div>
    </>
  );
}