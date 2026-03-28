// SearchContainer.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Button } from 'react-element-forge';
import { useSearchParams } from 'react-router-dom';

import SearchResults from './SearchResults';
import { useScope } from '../../../contexts/ScopeContext';
import styles from './Container.module.scss';
import { useFilter } from '../../../contexts/FilterContext';
import { filterConstants } from './utils';
/*
 * SearchContainer is the main parent component that manages the overall search state.
 * It holds the current query and suggestion data, and conditionally renders subcomponents.
 *
 * - When the query is empty, it shows the SuggestionsPanel for general search suggestions.
 * - When a query is present, it always renders:
 *    1. NearestNeighborResults: to display the NN search result based on the query.
 *    2. FilterResults: to display grouped filter options (e.g., Clusters, Features) related to the query.
 */
const Container = () => {
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [urlParams, setUrlParams] = useSearchParams();

  const { clusterLabels, scopeLoaded } = useScope();
  const {
    searchFilter,
    featureFilter,
    clusterFilter,
    filterQuery,
    setFilterQuery,
    columnFilter,
    filterConfig,
    setFilterConfig,
    filterActive,
    setFilterActive,
  } = useFilter();

  // Handle updates to the search query from the input field
  const handleInputChange = (val) => {
    setFilterQuery(val);
    // Optionally update suggestions based on the current input value

    // re-open the dropdown whenever the query changes
    setDropdownIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsInputFocused(true);
  };

  const handleInputBlur = () => {
    setIsInputFocused(false);
  };

  // ==== DROPDOWN RELATED STATE ====
  // we need to manage this here because we need to re-open the dropdown whenever the query changes.

  const [dropdownIsOpen, setDropdownIsOpen] = useState(false);
  const selectRef = useRef(null);
  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setDropdownIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (selection) => {
    setDropdownIsOpen(false);
    setFilterConfig(selection);
    setFilterActive(true);

    const { type, value, column } = selection;

    setUrlParams((prev) => {
      if (type === filterConstants.COLUMN) {
        prev.set('column', column);
        prev.set('value', value);
      } else {
        prev.set(type, value);
      }
      return prev;
    });
  };

  const handleClear = () => {
    const { type } = filterConfig;
    if (type === filterConstants.SEARCH) {
      const { clear } = searchFilter;
      clear();
    } else if (type === filterConstants.CLUSTER) {
      const { clear } = clusterFilter;
      clear();
    } else if (type === filterConstants.FEATURE) {
      const { clear } = featureFilter;
      clear();
    } else if (type === filterConstants.COLUMN) {
      const { clear } = columnFilter;
      clear();
    }

    setFilterQuery('');
    setDropdownIsOpen(false);
    setFilterActive(false);
    setFilterConfig(null);

    // delete all filter params from the url
    setUrlParams((prev) => {
      prev.delete('cluster');
      prev.delete('feature');
      prev.delete('search');
      prev.delete('column');
      prev.delete('value');
      return new URLSearchParams(prev);
    });
  };

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchBarContainer}>
        {/* SearchInput receives the current query and change handler */}
        <div className={styles.inputWrapper}>
          <input
            className={styles.searchInput}
            type="text"
            value={filterQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filterQuery) {
                handleSelect({
                  type: filterConstants.SEARCH,
                  value: filterQuery,
                  label: filterQuery,
                });
              }
            }}
            placeholder="Search dataset for..."
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />
          {filterConfig !== null && (
            <Button
              color="secondary"
              className={styles.searchButton}
              onClick={handleClear}
              icon="x"
            />
          )}
        </div>

        {/* When a query exists, show the NN search result and filter options */}
        <div className={styles.searchResults} ref={selectRef}>
          <div className={styles.searchResultsHeader}>
            <SearchResults
              query={filterQuery}
              setFilterQuery={setFilterQuery}
              onSelect={handleSelect}
              menuIsOpen={dropdownIsOpen || (isInputFocused && filterQuery === '')}
            />
          </div>
        </div>
      </div>
      <SearchResultsMetadata filterConfig={filterConfig} />
    </div>
  );
};

const SearchResultsMetadata = ({ filterConfig }) => {
  const { shownIndices, filteredIndices } = useFilter();

  // if no selection, show the default metadata
  if (!filterConfig) {
    return (
      <div className={styles.searchResultsMetadata}>
        <div className={styles.searchResultsMetadataItem}>
          <span className={styles.searchResultsMetadataLabel}>
            Showing first {shownIndices.length} rows in dataset:
          </span>
        </div>
        <div className={styles.searchResultsMetadataItem}>
          <span className={styles.searchResultsMetadataValue}>
            {filteredIndices.length} results
          </span>
        </div>
      </div>
    );
  }

  const { type, label } = filterConfig;

  const totalResults = filteredIndices.length;
  const headerLabel =
    type === filterConstants.CLUSTER
      ? 'Cluster'
      : type === filterConstants.FEATURE
        ? 'Feature'
        : type === filterConstants.COLUMN
          ? 'Column'
          : 'Nearest Neighbor Search';

  return (
    <div className={styles.searchResultsMetadata}>
      <div className={styles.searchResultsMetadataItem}>
        <span className={styles.searchResultsMetadataLabel}>{headerLabel}: </span>
        <span className={styles.searchResultsMetadataValue}>{label}</span>
      </div>
      <div className={styles.searchResultsMetadataItem}>
        <span className={styles.searchResultsMetadataLabel}>Total Rows: </span>
        <span className={styles.searchResultsMetadataValue}>{totalResults}</span>
      </div>
    </div>
  );
};

export default Container;
