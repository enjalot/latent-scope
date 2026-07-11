import { useState, useEffect, useCallback, useRef } from 'react';
import { scaleOrdinal } from 'd3-scale';
import { schemeTableau10 } from 'd3-scale-chromatic';
import { Button } from 'react-element-forge';
import IndexDataTable from '../IndexDataTable';
import { Readout } from '../ui';
import styles from './Compare.module.css';

const apiUrl = import.meta.env.VITE_API_URL;

const tabs = [
  { id: 0, name: 'Selected' },
  { id: 1, name: 'Search' },
];

const neighborColorScale = scaleOrdinal(schemeTableau10);

// 16px feather "x" for the clear icon-buttons
const XIcon = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function CompareDataPanel({
  dataset,
  datasetId,
  embeddings,
  selectedIndices,
  neighborSelectedIndex,
  neighborIndices,
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
  const searchInputRef = useRef(null);

  // Auto-switch to Selected tab when neighbors are selected
  useEffect(() => {
    if (neighborSelectedIndex != null) {
      setActiveTab(0);
    }
  }, [neighborSelectedIndex]);

  const handleSearchSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const query = searchInputRef.current?.value;
      onSearch(query);
      setActiveTab(1);
    },
    [onSearch]
  );

  const isNeighborMode = neighborSelectedIndex != null && neighborIndices?.length > 0;

  return (
    <div className={styles['data-panel']}>
      <div className={styles['tab-header']} role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="ls-tab"
            role="tab"
            aria-selected={tab.id === activeTab}
          >
            {tab.name}
            {tab.id === 0 && isNeighborMode && (
              <span className="ls-tab__count">{1 + neighborIndices.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 0 && (
        <div className={styles['tab-content']}>
          {isNeighborMode ? (
            <div className={styles['neighbor-list']}>
              <div className={styles['neighbor-list-header']}>
                <span>
                  Selected point + {neighborIndices.length} neighbors
                </span>
                <button
                  className="ls-icon-btn"
                  aria-label="Clear selection"
                  onClick={onClearSelection}
                >
                  {XIcon}
                </button>
              </div>
              {/* Selected point */}
              <NeighborRow
                index={neighborSelectedIndex}
                rank={null}
                dataset={dataset}
                datasetId={datasetId}
                onHover={onHover}
                onClick={onClick}
                isSelected
              />
              {/* Neighbor rows */}
              {neighborIndices.map((idx, rank) => (
                <NeighborRow
                  key={idx}
                  index={idx}
                  rank={rank}
                  dataset={dataset}
                  datasetId={datasetId}
                  onHover={onHover}
                  onClick={onClick}
                />
              ))}
            </div>
          ) : (
            <>
              <span className={styles['selection-summary']}>
                <Readout label="SELECTED" value={selectedIndices?.length || 0} />
                {selectedIndices?.length > 0 && (
                  <button
                    className="ls-icon-btn"
                    aria-label="Clear selection"
                    onClick={onClearSelection}
                  >
                    {XIcon}
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
            </>
          )}
        </div>
      )}

      {activeTab === 1 && (
        <div className={styles['tab-content']}>
          <div className={styles['search-box']}>
            <form onSubmit={handleSearchSubmit}>
              <input
                type="text"
                ref={searchInputRef}
                placeholder="Search by similarity..."
              />
              <Button
                type="submit"
                size="small"
                text="Search"
                className={styles['search-submit']}
              />
              <br />
              <select
                className="ls-select"
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
          <span className={styles['selection-summary']}>
            {searchIndices.length > 0 && (
              <span>Nearest Neighbors: {searchIndices.length} (capped at 150) </span>
            )}
            {searchIndices.length > 0 && (
              <button
                className="ls-icon-btn"
                aria-label="Clear search"
                onClick={() => {
                  onClearSearch();
                  if (searchInputRef.current) searchInputRef.current.value = '';
                }}
              >
                {XIcon}
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

/**
 * A single row showing a neighbor (or selected point) with rank badge and text preview.
 */
function NeighborRow({ index, rank, dataset, datasetId, onHover, onClick, isSelected }) {
  const [text, setText] = useState(null);

  useEffect(() => {
    if (index == null || !datasetId) return;
    fetch(`${apiUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: datasetId, indices: [index], page: 0 }),
    })
      .then((r) => r.json())
      .then((data) => {
        const t = data.rows?.[0]?.[dataset?.text_column];
        setText(t);
      })
      .catch(() => setText(null));
  }, [index, datasetId, dataset]);

  // Selected point uses the chrome selection token; neighbor ranks keep the
  // data-viz categorical scale (matches the NeighborPlot circles on the map).
  const color = isSelected ? 'var(--ls-color-selection)' : neighborColorScale(rank);

  return (
    <div
      className={styles['neighbor-row']}
      onMouseEnter={() => onHover && onHover(index)}
      onMouseLeave={() => onHover && onHover(null)}
      onClick={() => onClick && onClick(index)}
    >
      <span
        className={styles['neighbor-badge']}
        style={{ backgroundColor: color }}
      >
        {isSelected ? '★' : rank + 1}
      </span>
      <span className={styles['neighbor-index']}>#{index}</span>
      <span className={styles['neighbor-text']}>
        {text ? (text.length > 150 ? text.slice(0, 150) + '...' : text) : '...'}
      </span>
    </div>
  );
}

export default CompareDataPanel;
