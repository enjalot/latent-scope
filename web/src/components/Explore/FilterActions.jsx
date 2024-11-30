import React, { useState } from 'react';
import './FilterActions.css';
import { Button } from 'react-element-forge';
import ClusterFilter from './ClusterFilter';
import ColumnFilter from './ColumnFilter';
import NearestNeighbor from './NearestNeighbor';
import { SEARCH, FILTER, SELECT, COLUMN } from '../../pages/FullScreenExplore';
import useColumnFilter from '../../hooks/useColumnFilter';
import { apiUrl } from '../../lib/apiService';

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
  toggleColumn,
  columnFilterIndices,
  setColumnFilterIndices,
  datasetId,
  dataset,
}) {
  const { columnFiltersActive, setColumnFiltersActive, columnFilters } = useColumnFilter(
    apiUrl,
    dataset,
    datasetId,
    setColumnFilterIndices,
    setFilteredIndices
  );

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
  } else if (activeFilterTab === COLUMN) {
    filterComponent = (
      <ColumnFilter
        columnFiltersActive={columnFiltersActive}
        setColumnFiltersActive={setColumnFiltersActive}
        columnFilters={columnFilters}
        columnIndices={columnFilterIndices}
        setColumnIndices={setColumnFilterIndices}
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
          text={`Filter by Cluster (${clusterIndices?.length})`}
          color="secondary"
          title="Filter data points by cluster"
        />

        {columnFilters?.length > 0 && (
          <Button
            onClick={toggleColumn}
            className={`filter-actions-button ${activeFilterTab === COLUMN ? 'active' : 'not-active'}`}
            size="small"
            icon="columns"
            text={`Filter by Column (${columnFilterIndices?.length})`}
            color="secondary"
            title="Filter data points by column"
          />
        )}

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
