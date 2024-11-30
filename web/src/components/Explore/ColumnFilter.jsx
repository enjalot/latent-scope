import React from 'react';

const ColumnFilter = ({
  columnFilters,
  columnIndices,
  columnFiltersActive,
  setColumnFiltersActive,
  setColumnIndices,
}) => {
  return columnFilters?.length ? (
    <div className={`filter-row column-filter ${columnIndices?.length ? 'active' : ''}`}>
      <div className="filter-cell">
        {columnFilters.map((column) => (
          <span key={column.column} style={{ marginRight: 8 }}>
            {column.column}:
            <select
              onChange={(e) => {
                let active = { ...columnFiltersActive };
                active[column.column] = e.target.value;
                setColumnFiltersActive(active);
              }}
              value={columnFiltersActive[column.column] || ''}
            >
              <option value="">Select a value</option>
              {column.categories.map((c) => (
                <option key={c} value={c}>
                  {c} ({column.counts[c]})
                </option>
              ))}
            </select>
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
