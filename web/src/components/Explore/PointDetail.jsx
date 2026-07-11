import { useState, useEffect, useRef } from 'react';

import { apiService } from '../../lib/apiService';
import { useScope } from '../../contexts/ScopeContext';
import { Spinner } from '../ui';
import PointDetailContent from './PointDetailContent';

import styles from './PointDetail.module.scss';

/**
 * Right-side drawer showing every column of a single clicked row; the body
 * (images with lightbox, text, typed field list) is PointDetailContent,
 * shared with the mobile table's expanded rows.
 */
function PointDetail({ selectedIndex, onClose }) {
  const { dataset, sae, clusterMap } = useScope();

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  // Guard against stale async responses when the selection, dataset, or sae
  // changes while a fetch is in flight — the key identifies the request, not
  // just the row index (the same index can exist in another dataset).
  const latestRequestRef = useRef(null);

  const isOpen = selectedIndex !== null && selectedIndex !== undefined;

  useEffect(() => {
    if (!isOpen || !dataset?.id) {
      latestRequestRef.current = null;
      setRow(null);
      return;
    }
    const requestKey = `${dataset.id}:${sae?.id ?? ''}:${selectedIndex}`;
    latestRequestRef.current = requestKey;
    setLoading(true);
    apiService
      .fetchDataFromIndices(dataset.id, [selectedIndex], sae?.id ?? null)
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
  }, [isOpen, selectedIndex, dataset?.id, sae?.id]);

  // Escape closes the drawer (PointDetailContent intercepts Escape first
  // while its lightbox is open).
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const cluster = isOpen ? clusterMap?.[selectedIndex] : null;

  return (
    <div className={`${styles.drawer} ${isOpen ? styles.open : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.title}>
            Row <span className={styles.titleIndex}>{isOpen ? selectedIndex : ''}</span>
          </span>
          {cluster?.label && <span className={styles.cluster}>{cluster.label}</span>}
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
        {isOpen && <PointDetailContent row={row} index={selectedIndex} />}
      </div>
    </div>
  );
}

export default PointDetail;
