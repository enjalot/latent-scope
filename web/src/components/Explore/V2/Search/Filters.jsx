// FilterResults.jsx
import React from 'react';
import Select from 'react-select';

/*
 * FilterResults uses react-select to display grouped filtering options related to the query.
 * It provides options for different categories (e.g., Nearest Neighbor, Clusters, Features) and
 * triggers a filter-specific logic when an option is selected.
 */
const FilterResults = ({ query }) => {
  // Define grouped options dynamically based on the current query
  const groupedOptions = [
    {
      label: 'Nearest Neighbor',
      options: [{ value: 'nn', label: `Nearest Neighbor search for "${query}"` }],
    },
    {
      label: 'Clusters',
      options: [{ value: 'cluster', label: `${query} impact on NBA` }],
    },
    {
      label: 'Features',
      options: [{ value: 'feature', label: query }],
    },
  ];

  // Handle filter option selection; trigger filter-specific code here
  const handleSelectChange = (selectedOption) => {
    console.log('Selected filter:', selectedOption);
  };

  return (
    <div className="filter-results">
      <Select
        options={groupedOptions}
        onChange={handleSelectChange}
        placeholder={`Filter results for "${query}"`}
        isMulti={false}
      />
    </div>
  );
};

export default FilterResults;
