import { useState, useEffect, useRef } from 'react';
import { Button } from 'react-element-forge';

import { apiService } from '../../lib/apiService';
import { useScope } from '../../contexts/ScopeContext';
import PointDetailContent from './PointDetailContent';

import styles from './PointDetail.module.scss';

/**
 * Right-side drawer showing every column of a single clicked row; the body
 * (images with lightbox, text, typed field list) is PointDetailContent,
 * shared with the mobile table's expanded rows.
 */
function PointDetail({ selectedIndex, onClose }) {
  const { dataset, scope, sae, clusterMap, isTokenScope } = useScope();

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
    // Token scopes: selectedIndex is a token index, so the row comes from the
    // token endpoint (parent-document columns + token metadata).
    const fetchRow = isTokenScope
      ? apiService.fetchTokensFromIndices(
          dataset.id,
          [selectedIndex],
          scope?.embedding_id || scope?.embedding?.id,
          sae?.id ?? null
        )
      : apiService.fetchDataFromIndices(dataset.id, [selectedIndex], sae?.id ?? null);
    fetchRow
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
  }, [isOpen, selectedIndex, dataset?.id, sae?.id, isTokenScope, scope?.embedding_id, scope?.embedding?.id]);

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
          <span className={styles.title}>Row {isOpen ? selectedIndex : ''}</span>
          {cluster?.label && <span className={styles.cluster}>{cluster.label}</span>}
        </div>
        <Button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close point detail"
          icon="x"
          variant="outline"
          size="small"
        />
      </div>

      <div className={styles.content}>
        {loading && <div className={styles.loading}>Loading…</div>}
        {isOpen && <PointDetailContent row={row} index={selectedIndex} />}
      </div>
    </div>
  );
}

export default PointDetail;
