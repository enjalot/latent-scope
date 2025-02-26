// FilterContext.js
import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useScope } from './ScopeContext'; // Assuming this provides scopeRows, deletedIndices, etc.
import useColumnFilter from '../hooks/useColumnFilter';
import useNearestNeighborsSearch from '../hooks/useNearestNeighborsSearch';
import useClusterFilter from '../hooks/useClusterFilter';
import useFeatureFilter from '../hooks/useFeatureFilter';
import { apiService } from '../lib/apiService';

import {
  filterConstants,
  findFeatureLabel,
  validateColumnAndValue,
} from '../components/Explore/V2/Search/utils';

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  // Global filter config: { type, value } or null when no filter is active.
  const [filterConfig, setFilterConfig] = useState(null);
  const [filteredIndices, setFilteredIndices] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState(''); // Optional query string for UI
  const [filterActive, setFilterActive] = useState(false);

  const [urlParams, setUrlParams] = useSearchParams();
  // Pull shared data from a higher-level context.
  const {
    features,
    scopeRows,
    deletedIndices,
    userId,
    datasetId,
    scope,
    scopeLoaded,
    clusterLabels,
  } = useScope();

  // Base set of non-deleted indices from the dataset.
  const baseIndices = useMemo(() => {
    return scopeRows.map((row) => row.ls_index).filter((index) => !deletedIndices.includes(index));
  }, [scopeRows, deletedIndices]);

  // Column filter
  const columnFilter = useColumnFilter(userId, datasetId, scope);
  const featureFilter = useFeatureFilter({ userId, datasetId, scope, scopeLoaded });
  const clusterFilter = useClusterFilter({ scopeRows, scope, scopeLoaded });
  const searchFilter = useNearestNeighborsSearch({ userId, datasetId, scope, deletedIndices });

  const hasFilterInUrl = useMemo(() => {
    return (
      urlParams.has('column') ||
      urlParams.has('cluster') ||
      urlParams.has('feature') ||
      urlParams.has('search')
    );
  }, [urlParams]);

  // Populate filter state from url params
  useEffect(() => {
    if (!scopeLoaded || !hasFilterInUrl) return;

    // let's just grab the first key for now
    const key = urlParams.keys().next().value;
    const value = urlParams.get(key);
    const numericValue = parseInt(value);

    if (key === filterConstants.SEARCH) {
      console.log('==== search filter url param ==== ', { value });
      setFilterQuery(value);
      setFilterConfig({ type: filterConstants.SEARCH, value, label: value });
    } else if (key === filterConstants.CLUSTER) {
      const cluster = clusterLabels.find((cluster) => cluster.cluster === numericValue);
      if (cluster) {
        const { setCluster } = clusterFilter;
        setCluster(cluster);
        setFilterQuery(cluster.label);
        setFilterConfig({
          type: filterConstants.CLUSTER,
          value: numericValue,
          label: cluster.label,
        });
      }
    } else if (key === filterConstants.FEATURE) {
      const featureLabel = findFeatureLabel(features, numericValue);
      if (featureLabel) {
        const { setFeature } = featureFilter;
        setFeature(numericValue);
        setFilterQuery(featureLabel);
        setFilterConfig({
          type: filterConstants.FEATURE,
          value: numericValue,
          label: featureLabel,
        });
      }
    } else if (urlParams.has('column') && urlParams.has('value')) {
      const value = urlParams.get('value');
      const column = urlParams.get('column');
      const { columnFilters } = columnFilter;
      if (validateColumnAndValue(column, value, columnFilters)) {
        setFilterQuery(`${column}: ${value}`);
        setFilterConfig({
          type: filterConstants.COLUMN,
          value,
          column,
          label: `${column}: ${value}`,
        });
      }
    }
  }, [features, urlParams, scopeLoaded]);

  // ==== Filtering ====
  // compute filteredIndices based on the active filter.
  useEffect(() => {
    async function applyFilter() {
      setLoading(true);
      let indices = [];
      // If no filter is active, use the full baseIndices.
      if (!filterConfig && !hasFilterInUrl) {
        indices = baseIndices;
      } else if (filterConfig) {
        const { type, value } = filterConfig;

        switch (type) {
          case filterConstants.CLUSTER: {
            const { setCluster, filter } = clusterFilter;
            const cluster = clusterLabels.find((cluster) => cluster.cluster === value);
            if (cluster) {
              setCluster(cluster);
              indices = filter(cluster);
            }
            break;
          }
          case filterConstants.SEARCH: {
            const { filter } = searchFilter;
            indices = await filter(value);
            break;
          }
          case filterConstants.FEATURE: {
            const { setFeature, filter } = featureFilter;
            const featureLabel = findFeatureLabel(features, parseInt(value));
            if (featureLabel) {
              setFeature(value);
              indices = await filter();
            }
            break;
          }
          case filterConstants.COLUMN: {
            const { filter } = columnFilter;
            const { column } = filterConfig;
            indices = await filter(column, value);
            break;
          }
          default: {
            indices = baseIndices;
          }
        }
      }
      setFilteredIndices(indices);
      setPage(0); // Reset to first page when filter changes.
      setLoading(false);
    }
    if (scopeLoaded) {
      applyFilter();
    }
  }, [filterConfig, baseIndices, scopeRows, deletedIndices, userId, datasetId, scope, scopeLoaded]);

  // === Fetch Data Table Rows Logic

  const [dataTableRows, setDataTableRows] = useState([]);

  // === Pagination ===
  const ROWS_PER_PAGE = 20;
  const totalPages = useMemo(
    () => Math.ceil(filteredIndices.length / ROWS_PER_PAGE),
    [filteredIndices]
  );
  const shownIndices = useMemo(() => {
    const start = page * ROWS_PER_PAGE;
    const nonDeletedIndices = filteredIndices.filter((index) => !deletedIndices.includes(index));
    return nonDeletedIndices.slice(start, start + ROWS_PER_PAGE);
  }, [filteredIndices, page, deletedIndices]);

  // Keep track of the latest request
  const lastRequestRef = useRef('');

  // Create a cache Map to store API responses for default requests.
  const rowsCache = useRef(new Map());

  useEffect(() => {
    if (shownIndices.length) {
      const nonDeletedIndices = shownIndices.filter((index) => !deletedIndices.includes(index));
      setLoading(true);

      // Use a timestamp in ms as a unique key for this request.
      const requestTimestamp = Date.now();
      lastRequestRef.current = requestTimestamp;

      const cacheKey = `${JSON.stringify(nonDeletedIndices)}-${page}`;

      if (!filterConfig) {
        const cachedResult = rowsCache.current.get(cacheKey);
        if (cachedResult) {
          setDataTableRows(cachedResult);
          setLoading(false);
          return;
        }
      }

      apiService.fetchDataFromIndices(datasetId, nonDeletedIndices, scope?.sae_id).then((rows) => {
        // Only update state if this is the latest request.
        if (lastRequestRef.current !== requestTimestamp) {
          // Discard stale result.
          return;
        }
        const rowsWithIdx = rows.map((row, idx) => ({
          ...row,
          idx,
          ls_index: row.index,
        }));
        setDataTableRows(rowsWithIdx);
        setLoading(false);

        // only cache the result if there is no filter config
        // i.e. we are showing the default set of rows

        if (!filterConfig) {
          rowsCache.current.set(cacheKey, rowsWithIdx);
        }
      });
    } else {
      setDataTableRows([]);
    }
  }, [shownIndices, deletedIndices, userId, datasetId, scope, filterConfig, page]);

  // The context exposes only the state and setters that consumer components need.
  const value = {
    // Filter configuration state.
    filterConfig,
    setFilterConfig,
    filterQuery,
    setFilterQuery,

    // Filtered indices and pagination state.
    filteredIndices, // Complete set of indices after filtering.
    shownIndices, // Paginated indices for table views.
    page,
    setPage,
    totalPages,
    ROWS_PER_PAGE,

    loading,
    setLoading,
    filterActive,
    setFilterActive,

    searchFilter,
    // distances
    // searchText (shouldn't need this)

    clusterFilter,
    // cluster

    featureFilter,
    // feature
    // setFeature (needed by the Feature modal)
    // threshold

    columnFilter,
    // columnToValue
    // columnFilters
    // columnIndices

    setUrlParams,

    // Data Table Rows
    dataTableRows,
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilter() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
}
