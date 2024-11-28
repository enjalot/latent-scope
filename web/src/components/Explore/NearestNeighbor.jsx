import React from 'react';
// import '../../pages/Explore.css';

export default function NearestNeighbor({
  searchIndices,
  searchLoading,
  setSearchText,
  clearSearch,
  setFilteredIndices,
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    setSearchText(e.target.elements.searchBox.value);
  };

  const handleClear = () => {
    clearSearch();
    document.getElementById('searchBox').value = '';
    setFilteredIndices([]);
  };

  return (
    <div
      className={`clusters-select filter-row search-box ${searchIndices.length ? 'active' : ''}`}
    >
      <div className="filter-cell left">
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            id="searchBox"
            placeholder="Filter by nearest neighbors to search query..."
          />
          {searchLoading ? 'Querying...' : <button type="submit">🔍</button>}
        </form>
      </div>
      <div className="filter-cell middle">
        <span>
          {searchIndices.length ? <span>{searchIndices.length} rows</span> : null}
          {searchIndices.length > 0 ? (
            <button className="deselect" onClick={handleClear}>
              X
            </button>
          ) : null}
        </span>
      </div>
      <div className="filter-cell right" />
    </div>
  );
}