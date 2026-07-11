import { useState, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import styles from './MobileFilterDataTable.module.scss';
import { useFilter } from '@/contexts/FilterContext';
import { useScope } from '@/contexts/ScopeContext';
import ClusterIcon from './Search/ClusterIcon';
import PointDetailContent from './PointDetailContent';
import { Spinner } from '../ui';

const chevronProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

const PrevIcon = () => (
  <svg {...chevronProps}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const NextIcon = () => (
  <svg {...chevronProps}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// row disclosure chevrons (14px, match the pagination icon language)
const disclosureProps = { ...chevronProps, width: 14, height: 14 };

const ChevronRightIcon = () => (
  <svg {...disclosureProps}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg {...disclosureProps}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

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
          <span className="ls-chip ls-chip--index">{index + 1}</span>
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
        <div className={styles.rowChevron}>
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </div>
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
            type="button"
            className="ls-icon-btn"
            aria-label="Previous page"
            onClick={() => setPage((prevPage) => Math.max(0, prevPage - 1))}
            disabled={page === 0}
          >
            <PrevIcon />
          </button>
          <div className={styles.dragPill}></div>
          <span className="ls-pagination__readout">
            {page + 1} / {totalPages || 1}
          </span>
          <button
            type="button"
            className="ls-icon-btn"
            aria-label="Next page"
            onClick={() => setPage((prevPage) => Math.min(totalPages - 1, prevPage + 1))}
            disabled={page === totalPages - 1}
          >
            <NextIcon />
          </button>
        </div>
      </div>

      <div className={styles.filterDataTable}>
        {loading ? (
          <div className={styles.loadingContainer}>
            <Spinner size="sm" label="LOADING…" />
          </div>
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
