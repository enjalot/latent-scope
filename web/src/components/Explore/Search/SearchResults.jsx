import React, { useMemo } from 'react';

import PropTypes from 'prop-types';
import Select, { components } from 'react-select';
import styles from './SearchResults.module.scss';
import { Button } from 'react-element-forge';
import { useScope } from '@/contexts/ScopeContext';
import { filterConstants, findFeaturesByQuery, findClustersByQuery } from './utils';
import useColumnFilter from '@/hooks/useColumnFilter';
import ClusterIcon from './ClusterIcon';

const COLUMNS = 'Columns';
const CLUSTERS = 'Clusters';
const FEATURES = 'Features';

// Function to underline the search term
const underlineText = (text, query) => {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={index} className={styles.underline}>
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    )
  );
};

// Custom Option component that includes an icon. Note the added branch for NN options.
const Option = (props) => {
  const { data, selectProps } = props;
  const { onSelect, inputValue, setFilterQuery } = selectProps;

  const handleClick = (e) => {
    e.preventDefault();
    if (data.isNN) {
      // Call the onSelect for NN search
      onSelect({ type: filterConstants.SEARCH, value: data.value, label: data.value });
      setFilterQuery(data.value);
      return;
    }
    // Determine which group this option belongs to
    const groupType = props.options.find((group) =>
      group.options?.some((opt) => opt.value === data.value && opt.label === data.label)
    )?.label;

    if (groupType === COLUMNS) {
      const label = `${data.column}: ${data.value}`;
      onSelect({
        type: filterConstants.COLUMN,
        value: data.value,
        column: data.column,
        label,
      });
      setFilterQuery(label);
    } else if (groupType === CLUSTERS) {
      onSelect({ type: filterConstants.CLUSTER, value: data.value, label: data.label });
      const label = `Cluster ${data.value}`;
      setFilterQuery(label);
    } else if (groupType === FEATURES) {
      onSelect({ type: filterConstants.FEATURE, value: data.value, label: data.label });
      setFilterQuery(data.label);
    }
  };

  // If this is our nearest-neighbors option, render it specially.
  if (data.isNN) {
    return (
      <div onClick={handleClick}>
        <components.Option {...props}>
          <div className={styles.resultContent}>
            <Button
              onClick={handleClick}
              icon="search"
              color="primary"
              variant="clear"
              size="small"
              className={styles.resultButton}
            />
            <span>Search for nearest neighbors to: "{data.value}"</span>
          </div>
        </components.Option>
      </div>
    );
  }

  // Get the group type to determine which icon to show
  const groupType = props.options.find((group) =>
    group.options?.some((opt) => opt.value === data.value && opt.label === data.label)
  )?.label;

  const getIcon = (type) => {
    switch (type) {
      case 'Clusters':
        return 'cloud';
      case 'Features':
        return 'compass';
      case 'Columns':
        return 'columns';
      default:
        return 'search';
    }
  };

  if (groupType === COLUMNS) {
    return (
      <div onClick={handleClick}>
        <components.Option {...props}>
          <div className={styles.columnResultContent}>
            <Button
              onClick={handleClick}
              icon={getIcon(groupType)}
              color="primary"
              variant="clear"
              size="small"
              className={styles.resultButton}
            />
            <span>{underlineText(data.label, inputValue)}</span>
            <span className={styles.columnLabel}>{data.column}</span>
          </div>
        </components.Option>
      </div>
    );
  }

  return (
    <div onClick={handleClick}>
      <components.Option {...props}>
        <div className={styles.resultContent}>
          {groupType === 'Clusters' ? (
            <ClusterIcon />
          ) : (
            <Button
              onClick={handleClick}
              icon={getIcon(groupType)}
              color="primary"
              variant="clear"
              size="small"
              className={styles.resultButton}
            />
          )}
          <div>{underlineText(data.label, inputValue)}</div>
        </div>
      </components.Option>
    </div>
  );
};

// Custom Group component
const Group = ({ children, ...props }) => {
  return <components.Group {...props}>{children}</components.Group>;
};

// A simplified custom Menu component (only for styling)
const CustomMenu = ({ children, ...props }) => {
  return (
    <components.Menu {...props}>
      <div className={styles.resultsList}>{children}</div>
    </components.Menu>
  );
};

export const NUM_SEARCH_RESULTS = 4;

const SearchResults = ({ query, menuIsOpen, onSelect, setFilterQuery }) => {
  const { features, userId, datasetId, scope, clusterLabels } = useScope();
  const columnFilter = useColumnFilter(userId, datasetId, scope);
  const { columnFilters } = columnFilter;

  const featureOptions = useMemo(
    () => (features.length > 0 ? findFeaturesByQuery(features, query, NUM_SEARCH_RESULTS) : []),
    [features, query]
  );

  const clusterOptions = useMemo(
    () => findClustersByQuery(clusterLabels, query, NUM_SEARCH_RESULTS),
    [clusterLabels, query]
  );

  // Transform column values into options
  const columnOptions = useMemo(() => {
    if (!columnFilters) {
      return [];
    }

    // Flatten all column values into searchable options
    const options = columnFilters.flatMap((column) =>
      column.categories.map((category) => ({
        value: category,
        label: category, // Just the value
        column: column.column, // Store column name for display
      }))
    );

    // Filter based on query
    if (!query) return options.slice(0, NUM_SEARCH_RESULTS);
    const searchTerm = query.toLowerCase();
    return options
      .filter((option) => option.value.toString().toLowerCase().includes(searchTerm))
      .slice(0, NUM_SEARCH_RESULTS);
  }, [columnFilters, query]);

  // Build grouped options.
  // First, if the user has typed something, add a NN option.
  const groupedOptions = [];
  if (query.trim() !== '') {
    groupedOptions.push({
      label: 'Nearest Neighbors',
      options: [
        {
          value: query,
          label: query,
          isNN: true, // flag so Option knows to render the NN option
        },
      ],
    });
  }

  // Then add the other group(s).
  groupedOptions.push({
    label: CLUSTERS,
    options: clusterOptions,
  });

  if (featureOptions.length > 0) {
    groupedOptions.push({
      label: FEATURES,
      options: featureOptions,
    });
  }

  if (columnOptions.length > 0) {
    groupedOptions.push({
      label: COLUMNS,
      options: columnOptions,
    });
  }

  const filterOption = (option, inputValue) => {
    if (!inputValue) return true;

    // If this is a group, check if any of its options match
    if (option.options) {
      return option.options.some((subOption) =>
        subOption.label.toLowerCase().includes(inputValue.toLowerCase())
      );
    }
    // For individual options
    return option.label.toLowerCase().includes(inputValue.toLowerCase());
  };

  return (
    <Select
      options={groupedOptions}
      components={{
        Option,
        Group,
        Menu: CustomMenu, // using our simplified custom Menu just to wrap the children
      }}
      styles={{
        control: () => ({
          display: 'none',
        }),
        menu: (base) => ({
          ...base,
          border: 'none',
          boxShadow: 'none',
          backgroundColor: 'transparent',
          position: 'static',
        }),
        group: (base) => ({
          ...base,
          padding: '8px 0',
        }),
        groupHeading: (base) => ({
          ...base,
          color: 'var(--text-color-text-subtle)',
          fontSize: '0.9em',
          fontWeight: 600,
          textTransform: 'uppercase',
          padding: '0 10px',
          marginBottom: '8px',
        }),
        option: (base, state) => ({
          ...base,
          padding: '8px 16px',
          backgroundColor: state.isFocused ? 'var(--neutrals-color-neutral-1)' : 'transparent',
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: 'var(--neutrals-color-neutral-1)',
          },
        }),
        menuList: (base) => ({
          ...base,
          padding: 0,
          overflowY: 'visible',
          maxHeight: 'none',
        }),
      }}
      query={query}
      setFilterQuery={setFilterQuery}
      onMenuOpen={() => true}
      onMenuClose={() => false}
      onChange={() => false}
      onSelect={onSelect}
      controlShouldRenderValue={false}
      filterOption={filterOption}
      inputValue={query}
      isSearchable={true}
      hideSelectedOptions={false}
      closeMenuOnSelect={false}
      menuIsOpen={menuIsOpen}
    />
  );
};

SearchResults.propTypes = {
  query: PropTypes.string.isRequired,
  menuIsOpen: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  setFilterQuery: PropTypes.func.isRequired,
};

export default SearchResults;
