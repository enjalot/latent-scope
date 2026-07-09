import { useState, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import styles from './MobileFilterDataTable.module.scss';
import { useFilter } from '@/contexts/FilterContext';
import { useScope } from '@/contexts/ScopeContext';
import ClusterIcon from './Search/ClusterIcon';
import PointDetailContent from './PointDetailContent';

const DataRow = memo(function DataRow({ dataset, row, onHover, clusterMap, index, onExpanded }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggle = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      if (next) onExpanded?.();
      return next;
    });
  }, [onExpanded]);

  return (
    <div
      className={`${styles.dataRow} ${isExpanded ? styles.expanded : ''}`}
      onMouseEnter={() => onHover(row.ls_index)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Tap the header to expand/collapse; the detail body below is the
          same per-datatype view as the desktop drawer. */}
      <div className={styles.rowHeader} onClick={toggle}>
        <div className={styles.rowIndex}>
          <div className={styles.indexCircle}>{index + 1}</div>
        </div>
        <div className={styles.rowPreview}>
          <div className={styles.rowText}>{row[dataset.text_column]}</div>
          <div className={styles.rowCluster}>
            <p className={styles.textPreview}>
              <ClusterIcon cluster={row.ls_cluster} />
              {clusterMap[row.ls_index]?.label}
            </p>
          </div>
        </div>
        <div className={styles.rowChevron}>{isExpanded ? '▾' : '▸'}</div>
      </div>
      {isExpanded && (
        <div className={styles.rowDetail} onClick={(e) => e.stopPropagation()}>
          <PointDetailContent row={row} index={row.ls_index} />
        </div>
      )}
    </div>
  );
});

function MobileFilterDataTable({ dataset, onHover = () => {}, onClick }) {
  const { clusterMap } = useScope();
  const { dataTableRows, totalPages, page, setPage, loading } = useFilter();

  const DEFAULT_HEIGHT = 150;
  const [containerHeight, setContainerHeight] = useState(DEFAULT_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(0);

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setStartY(touch.clientY);
    setStartHeight(containerHeight);
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const deltaY = startY - touch.clientY;
    const newHeight = Math.max(DEFAULT_HEIGHT, Math.min(800, startHeight + deltaY));
    setContainerHeight(newHeight);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // When a row expands, make sure the sheet is tall enough to actually see
  // the detail (images especially) without having to drag it up first.
  const handleRowExpanded = useCallback(() => {
    setContainerHeight((height) => Math.max(height, Math.min(520, window.innerHeight * 0.6)));
  }, []);

  if (dataTableRows.length === 0) {
    return null;
  }

  return (
    <div className={styles.mobileFilterDataTable} style={{ height: containerHeight }}>
      <div
        className={styles.dragHandle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={styles.dragIndicator}>
          <button
            onClick={() => setPage((prevPage) => Math.max(0, prevPage - 1))}
            disabled={page === 0}
          >
            ← {page - 1 >= 0 ? page : ''}
          </button>
          <div className={styles.dragPill}></div>
          <button
            onClick={() => setPage((prevPage) => Math.min(totalPages - 1, prevPage + 1))}
            disabled={page === totalPages - 1}
          >
            → {page + 1 < totalPages ? page + 2 : ''}
          </button>
        </div>
      </div>

      <div className={styles.filterDataTable}>
        {loading ? (
          <div className={styles.loadingContainer}>Loading...</div>
        ) : (
          <div className={styles.rowsContainer}>
            {dataTableRows.map((row, index) => (
              <DataRow
                key={row.ls_index}
                index={row.idx || index}
                row={row}
                onHover={onHover}
                onClick={onClick}
                dataset={dataset}
                clusterMap={clusterMap}
                onExpanded={handleRowExpanded}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

MobileFilterDataTable.propTypes = {
  dataset: PropTypes.object.isRequired,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
};

export default memo(MobileFilterDataTable);
