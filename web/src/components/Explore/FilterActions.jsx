import React, { useState } from 'react';
import styles from './FilterActions.module.scss';
import { Button } from 'react-element-forge';
import ClusterFilter from './ClusterFilter';
import ColumnFilter from './ColumnFilter';
import NearestNeighbor from './NearestNeighbor';
import FeatureFilter from './FeatureFilter';
import { SEARCH, CLUSTER, SELECT, COLUMN, FEATURE } from '../../pages/FullScreenExplore';
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
  scatter,
  activeFilterTab,
  toggleSearch,
  toggleFilter,
  toggleSelect,
  toggleColumn,
  toggleFeature,
  columnFilterIndices,
  setColumnFilterIndices,
  datasetId,
  dataset,
  features,
  feature,
  setFeature,
  featureIndices,
  setFeatureIndices,
  setThreshold,
  scope,
  searchText,
}) {
  const { columnFiltersActive, setColumnFiltersActive, columnFilters } = useColumnFilter(
    apiUrl,
    dataset,
    datasetId,
    setColumnFilterIndices
  );

  let filterComponent = null;
  if (activeFilterTab === CLUSTER) {
    filterComponent = (
      <ClusterFilter
        clusterLabels={clusterLabels}
        cluster={cluster}
        clusterIndices={clusterIndices}
        setCluster={setCluster}
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
      />
    );
  } else if (activeFilterTab === FEATURE) {
    filterComponent = (
      <FeatureFilter
        features={features}
        feature={feature}
        featureIndices={featureIndices}
        setFeature={setFeature}
        scope={scope}
        setFeatureIndices={setFeatureIndices}
        onThreshold={setThreshold}
      />
    );
  } else if (activeFilterTab === SELECT) {
    filterComponent = (
      <div className={`${styles.filterRow} ${selectedIndices?.length ? styles.active : ''}`}>
        {!selectedIndices?.length ? (
          <div className={`${styles.filterCell} ${styles.count}`}>
            Click, or Shift+Drag on the map to filter by points.
          </div>
        ) : (
          <div className={`${styles.filterCell} ${styles.count}`}>
            <span>{selectedIndices?.length} rows</span>
            <Button
              className="deselect"
              onClick={() => {
                setSelectedIndices([]);
                scatter?.select([]);
              }}
              icon="x"
              color="secondary"
            />
          </div>
        )}
      </div>
    );
  } else if (activeFilterTab === SEARCH) {
    filterComponent = (
      <NearestNeighbor
        searchIndices={searchIndices}
        searchLoading={searchLoading}
        setSearchText={setSearchText}
        clearSearch={clearSearch}
        defaultValue={searchText}
      />
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.actionsContainer}>
        <Button
          onClick={toggleFilter}
          className={`${styles.actionsButton} ${activeFilterTab === CLUSTER ? styles.active : styles.notActive}`}
          size="small"
          icon="filter"
          text={`Filter by Cluster (${clusterIndices?.length})`}
          color="secondary"
          title="Filter data points by cluster"
        />

        {columnFilters?.length > 0 && (
          <Button
            onClick={toggleColumn}
            className={`${styles.actionsButton} ${activeFilterTab === COLUMN ? styles.active : styles.notActive}`}
            size="small"
            icon="columns"
            text={`Filter by Column (${columnFilterIndices?.length})`}
            color="secondary"
            title="Filter data points by column"
          />
        )}

        <Button
          onClick={toggleSelect}
          className={`${styles.actionsButton} ${activeFilterTab === SELECT ? styles.active : styles.notActive}`}
          size="small"
          icon="crosshair"
          text={`Select (${selectedIndices?.length})`}
          color="secondary"
          title="Annotate"
        />
        <Button
          onClick={toggleSearch}
          className={`${styles.actionsButton} ${activeFilterTab === SEARCH ? styles.active : styles.notActive}`}
          size="small"
          icon="search"
          text={`Search (${searchIndices?.length})`}
          color="secondary"
          title="Search"
        />
        {features?.length ? (
          <Button
            onClick={toggleFeature}
            className={`${styles.actionsButton} ${activeFilterTab === FEATURE ? styles.active : styles.notActive}`}
            size="small"
            icon="search"
            text={`Feature (${featureIndices?.length})`}
            color="secondary"
            title="Feature"
          />
        ) : null}
      </div>
      <div className={styles.actionsRow}>{filterComponent}</div>
    </div>
  );
}
