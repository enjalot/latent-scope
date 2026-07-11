import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

import { Pagination } from '../ui';
import { apiService } from '../../lib/apiService';
import { useScope } from '../../contexts/ScopeContext';
import { clusterColorHex } from '../../lib/clusterColor';

import styles from './CellDetail.module.scss';

const PAGE_SIZE = 50;
const COLLAPSED_CHARS = 120;

/**
 * Right-side drawer listing ALL datapoints in a clicked cell — a heatmap tile
 * (2D scopes) or a voxel (3D). Mirrors the PointDetail drawer's visual language.
 *
 * Membership is derived client-side from scopeRows (the cell's column value ===
 * the clicked key). The list is windowed/paginated (PAGE_SIZE per page) so a
 * cell with hundreds of members stays responsive; each visible entry is
 * collapsible (a ~120-char preview that expands to the full text) and can
 * deep-link into the full PointDetail drawer via onOpenPoint.
 */
function CellDetail({ selectedCell, onClose, onOpenPoint }) {
  const { scopeRows, scope, clusterMap } = useScope();
  const isOpen = !!selectedCell;

  // scopeRow positions whose cell column matches the clicked key.
  const members = useMemo(() => {
    if (!selectedCell || !scopeRows) return [];
    const { key, column } = selectedCell;
    const out = [];
    for (let i = 0; i < scopeRows.length; i++) {
      const r = scopeRows[i];
      if (r.deleted) continue;
      if (r[column] === key) out.push(i);
    }
    return out;
  }, [selectedCell, scopeRows]);

  // Dominant cluster label for the header.
  const summary = useMemo(() => {
    if (!members.length) return null;
    const counts = new Map();
    for (const i of members) {
      const c = scopeRows[i].cluster;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    let dom = -1;
    let dn = -1;
    for (const [c, n] of counts) if (n > dn) { dn = n; dom = c; }
    const lookup = scope?.cluster_labels_lookup || [];
    const label = lookup[dom]?.label ?? (dom >= 0 ? `Cluster ${dom}` : 'noise');
    return { count: members.length, dominantCluster: dom, label };
  }, [members, scopeRows, scope]);

  const numClusters = scope?.cluster_labels_lookup?.length || 1;

  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());
  const [textByPos, setTextByPos] = useState({}); // scopeRow pos -> preview text
  const cacheRef = useRef(new Map()); // pageIndex -> {pos: text}
  const reqSeq = useRef(0);

  // Reset paging + caches whenever a different cell opens.
  useEffect(() => {
    setPage(0);
    setExpanded(new Set());
    setTextByPos({});
    cacheRef.current = new Map();
  }, [selectedCell]);

  const pageCount = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const pageMembers = members.slice(pageStart, pageStart + PAGE_SIZE);

  // Fetch text previews for the visible page (cached per page, cancel-on-change).
  useEffect(() => {
    if (!isOpen || !pageMembers.length || !scope) return;
    if (cacheRef.current.has(page)) {
      setTextByPos((prev) => ({ ...prev, ...cacheRef.current.get(page) }));
      return;
    }
    const seq = ++reqSeq.current;
    const lsIndices = pageMembers.map((i) => scopeRows[i].ls_index);
    apiService
      .getSnippets(scope, lsIndices)
      .then((texts) => {
        if (seq !== reqSeq.current) return;
        const map = {};
        pageMembers.forEach((pos, k) => {
          map[pos] = texts[k];
        });
        cacheRef.current.set(page, map);
        setTextByPos((prev) => ({ ...prev, ...map }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, page, selectedCell, scope]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const toggle = useCallback((pos) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  }, []);

  // data-driven swatch: dominant-cluster hue from the shared palette
  const headerColor = summary ? clusterColorHex(summary.dominantCluster, numClusters) : null;

  return (
    <div className={`${styles.drawer} ${isOpen ? styles.open : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.title}>
            <span className={styles.titleCount}>
              {summary ? summary.count.toLocaleString() : 0}
            </span>{' '}
            datapoint{summary && summary.count === 1 ? '' : 's'} in cell
          </span>
          {summary && (
            <span className={styles.cluster}>
              <span className={styles.dot} style={{ background: headerColor }} />
              {summary.label}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`ls-icon-btn ${styles.closeButton}`}
          onClick={onClose}
          aria-label="Close cell detail"
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
        {pageMembers.map((pos) => {
          const row = scopeRows[pos];
          const text = textByPos[pos];
          const isExp = expanded.has(pos);
          const cl = clusterMap?.[pos];
          const preview =
            text == null
              ? null
              : isExp
                ? String(text)
                : String(text).slice(0, COLLAPSED_CHARS) +
                  (String(text).length > COLLAPSED_CHARS ? '…' : '');
          return (
            <div key={pos} className={styles.entry}>
              <div className={styles.entryHeader}>
                <button
                  className={styles.entryToggle}
                  onClick={() => toggle(pos)}
                  aria-expanded={isExp}
                >
                  <span className={`${styles.caret} ${isExp ? styles.caretOpen : ''}`}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                  <span className={styles.entryIndex}>Row {row?.ls_index ?? pos}</span>
                  {cl?.label && <span className={styles.entryCluster}>{cl.label}</span>}
                </button>
                <button
                  className={styles.openLink}
                  onClick={() => onOpenPoint && onOpenPoint(pos)}
                  title="Open full detail"
                >
                  detail →
                </button>
              </div>
              <div className={`${styles.entryText} ${isExp ? styles.expanded : ''}`}>
                {preview == null ? (
                  <span className={styles.muted}>loading…</span>
                ) : preview === '' ? (
                  <span className={styles.muted}>(empty)</span>
                ) : (
                  preview
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pageCount > 1 && (
        <div className={styles.pager}>
          <Pagination page={page + 1} totalPages={pageCount} onPage={(p) => setPage(p - 1)} />
        </div>
      )}
    </div>
  );
}

export default CellDetail;
