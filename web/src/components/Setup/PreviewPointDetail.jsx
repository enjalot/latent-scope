import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import { apiService } from '../../lib/apiService';
import { Spinner } from '../ui';
import PointDetailContent from '../Explore/PointDetailContent';

import styles from './PreviewPointDetail.module.scss';

/**
 * Point-detail drawer for the Setup preview map. The Explore drawer
 * (PointDetail) reads from ScopeContext, which Setup doesn't provide, so
 * this thin wrapper fetches the clicked row itself — the same
 * fetchDataFromIndices path the preview's hover tooltip already uses — and
 * reuses PointDetailContent for the body. Anchored absolutely to the right
 * edge of the preview pane (position:relative container).
 */
function PreviewPointDetail({ dataset, selectedIndex, clusterLabel, onClose }) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  // Guard against stale async responses when the selection or dataset
  // changes while a fetch is in flight (mirrors Explore's PointDetail).
  const latestRequestRef = useRef(null);

  const isOpen = selectedIndex !== null && selectedIndex !== undefined;

  useEffect(() => {
    if (!isOpen || !dataset?.id) {
      latestRequestRef.current = null;
      setRow(null);
      return;
    }
    const requestKey = `${dataset.id}:${selectedIndex}`;
    latestRequestRef.current = requestKey;
    setLoading(true);
    apiService
      .fetchDataFromIndices(dataset.id, [selectedIndex])
      .then((rows) => {
        if (latestRequestRef.current !== requestKey) return;
        setRow(rows?.[0] ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (latestRequestRef.current !== requestKey) return;
        setRow(null);
        setLoading(false);
      });
  }, [isOpen, selectedIndex, dataset?.id]);

  // Escape closes the drawer. PointDetailContent's lightbox intercepts
  // Escape first (capture phase + stopPropagation), matching PointDetail.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Plain conditional render: nothing off-canvas that could extend the
  // Setup page's overflow chain while closed.
  if (!isOpen) return null;

  return (
    <div className={styles.drawer}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.title}>
            Row <span className={styles.titleIndex}>{selectedIndex}</span>
          </span>
          {clusterLabel && <span className={styles.cluster}>{clusterLabel}</span>}
        </div>
        <button
          type="button"
          className={`ls-icon-btn ${styles.closeButton}`}
          onClick={onClose}
          aria-label="Close point detail"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className={styles.content}>
        {loading && (
          <div className={styles.loading}>
            <Spinner size="sm" label="LOADING ROW" />
          </div>
        )}
        <PointDetailContent row={row} index={selectedIndex} dataset={dataset} />
      </div>
    </div>
  );
}

PreviewPointDetail.propTypes = {
  dataset: PropTypes.object,
  selectedIndex: PropTypes.number,
  clusterLabel: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

export default PreviewPointDetail;
