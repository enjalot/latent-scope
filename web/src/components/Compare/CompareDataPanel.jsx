import { useState, useCallback } from 'react';
import IndexDataTable from '../IndexDataTable';
import styles from './Compare.module.css';

const apiUrl = import.meta.env.VITE_API_URL;

const tabs = [
  { id: 0, name: 'Selected' },
  { id: 1, name: 'Search' },
];

function CompareDataPanel({
  dataset,
  datasetId,
  embeddings,
  selectedIndices,
  onClearSelection,
  searchIndices,
  distances,
  onClearSearch,
  onSearch,
  searchModel,
  onSearchModelChange,
  onHover,
  onClick,
}) {
  const [activeTab, setActiveTab] = useState(0);

  const handleSearchSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const query = e.target.elements.searchBox.value;
      onSearch(query);
      setActiveTab(1);
    },
    [onSearch]
  );

  return (
    <div className={styles['data-panel']}>
      <div className={styles['tab-header']}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={tab.id === activeTab ? styles['tab-active'] : styles['tab-inactive']}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className={styles['tab-content']}>
          <span>
            Selected: {selectedIndices?.length || 0}
            {selectedIndices?.length > 0 && (
              <button className={styles['deselect']} onClick={onClearSelection}>
                X
              </button>
            )}
          </span>
          {selectedIndices?.length > 0 && (
            <IndexDataTable
              indices={selectedIndices}
              dataset={dataset}
              maxRows={150}
              onHover={onHover}
              onClick={onClick}
            />
          )}
        </div>
      )}

      {activeTab === 1 && (
        <div className={styles['tab-content']}>
          <div className={styles['search-box']}>
            <form onSubmit={handleSearchSubmit}>
              <input type="text" id="searchBox" placeholder="Search by similarity..." />
              <button type="submit">Search</button>
              <br />
              <select
                onChange={(e) => onSearchModelChange(e.target.value)}
                value={searchModel?.id || ''}
              >
                {embeddings.map((emb) => (
                  <option key={emb.id} value={emb.id}>
                    {emb.id} - {emb.model_id} - {emb.dimensions}
                  </option>
                ))}
              </select>
            </form>
          </div>
          <span>
            {searchIndices.length > 0 && (
              <span>Nearest Neighbors: {searchIndices.length} (capped at 150) </span>
            )}
            {searchIndices.length > 0 && (
              <button
                className={styles['deselect']}
                onClick={() => {
                  onClearSearch();
                  const searchBox = document.getElementById('searchBox');
                  if (searchBox) searchBox.value = '';
                }}
              >
                X
              </button>
            )}
          </span>
          {searchIndices.length > 0 && (
            <IndexDataTable
              indices={searchIndices}
              distances={distances}
              dataset={dataset}
              onHover={onHover}
              onClick={onClick}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default CompareDataPanel;
