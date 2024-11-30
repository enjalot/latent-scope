import React, { useState } from 'react';
import './FilterActions.css';
import { Button } from 'react-element-forge';
import ClusterFilter from './ClusterFilter';
import NearestNeighbor from './NearestNeighbor';
import { SEARCH, FILTER, SELECT } from '../../pages/FullScreenExplore';

export default function FilterActions({
  clusterLabels,
  cluster,
  setCluster,
  clusterIndices,
  searchIndices,
  searchLoading,
  setSearchText,
  clearSearch,
  selectedIndices,
  setSelectedIndices,
  setFilteredIndices,
  scatter,
  activeFilterTab,
  toggleSearch,
  toggleFilter,
  toggleSelect,
}) {
  let filterComponent = null;
  if (activeFilterTab === FILTER) {
    filterComponent = (
      <ClusterFilter
        clusterLabels={clusterLabels}
        cluster={cluster}
        clusterIndices={clusterIndices}
        setCluster={setCluster}
        setFilteredIndices={setFilteredIndices}
      />
    );
  } else if (activeFilterTab === SELECT) {
    filterComponent = (
      <div className={`filter-row ${selectedIndices?.length ? 'active' : ''}`}>
        <div className="filter-cell left filter-description">
          Click, or Shift+Drag on the map to filter by points.
        </div>
        <div className="filter-cell middle">
          <span>{selectedIndices?.length} rows</span>
          {selectedIndices?.length > 0 ? (
            <button
              className="deselect"
              onClick={() => {
                setSelectedIndices([]);
                setFilteredIndices([]);
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
  } else if (activeFilterTab === SEARCH) {
    filterComponent = (
      <NearestNeighbor
        searchIndices={searchIndices}
        searchLoading={searchLoading}
        setFilteredIndices={setFilteredIndices}
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
          className={`filter-actions-button ${activeFilterTab === FILTER ? 'active' : 'not-active'}`}
          size="small"
          icon="filter"
          text={`Filter (${clusterIndices?.length})`}
          color="secondary"
          title="Filter data points"
        />

        <Button
          onClick={toggleSelect}
          className={`filter-actions-button ${activeFilterTab === SELECT ? 'active' : 'not-active'}`}
          size="small"
          icon="crosshair"
          text={`Select (${selectedIndices?.length})`}
          color="secondary"
          title="Annotate"
        />
        <Button
          onClick={toggleSearch}
          className={`filter-actions-button ${activeFilterTab === SEARCH ? 'active' : 'not-active'}`}
          size="small"
          icon="search"
          text={`Search (${searchIndices?.length})`}
          color="secondary"
          title="Search"
        />
      </div>
      <div className="filter-actions-row">{filterComponent}</div>
    </>
  );
}
