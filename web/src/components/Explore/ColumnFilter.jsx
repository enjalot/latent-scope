import React from 'react';
import Select from 'react-select';

const ColumnFilter = ({
  columnFilters,
  columnIndices,
  columnFiltersActive,
  setColumnFiltersActive,
  setColumnIndices,
  setFilteredIndices,
}) => {
  return columnFilters?.length ? (
    <div className={`filter-row column-filter ${columnIndices?.length ? 'active' : ''}`}>
      <div className="filter-cell columns">
        {columnFilters.map((column) => (
          <span key={column.column} style={{ marginRight: 8 }}>
            {/* {column.column}: */}
            <Select
              value={
                columnFiltersActive[column.column]
                  ? {
                      value: columnFiltersActive[column.column],
                      label: `${columnFiltersActive[column.column]} (${
                        column.counts[columnFiltersActive[column.column]]
                      })`,
                    }
                  : null
              }
              onChange={(selectedOption) => {
                let active = { ...columnFiltersActive };
                active[column.column] = selectedOption ? selectedOption.value : '';
                setColumnFiltersActive(active);
              }}
              options={column.categories.map((c) => ({
                value: c,
                label: `${c} (${column.counts[c]})`,
              }))}
              isClearable
              placeholder={`Filter by ${column.column}`}
              className="column-react-select"
            />
          </span>
        ))}
      </div>
      <div className="filter-cell middle">
        {columnIndices?.length ? <span>{columnIndices?.length} rows</span> : null}
        {columnIndices?.length ? (
          <button
            className="deselect"
            onClick={() => {
              setColumnFiltersActive({});
              setColumnIndices([]);
              setFilteredIndices([]);
            }}
          >
            X
          </button>
        ) : null}
      </div>
      <div className="filter-cell right"></div>
    </div>
  ) : null;
};

export default ColumnFilter;
