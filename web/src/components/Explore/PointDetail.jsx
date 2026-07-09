import { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Button } from 'react-element-forge';

import { apiService } from '../../lib/apiService';
import { imageUrlFor } from '../../lib/imageUrl';
import { organizeDetailColumns, describeCellValue, formatDetailNumber } from '../../lib/pointDetail';
import { useScope } from '../../contexts/ScopeContext';

import styles from './PointDetail.module.scss';

// Drawer width for inline images; the lightbox fetches the original.
const DRAWER_IMAGE_SIZE = 600;

function DetailValue({ cell }) {
  if (cell.kind === 'empty') return <span className={styles.empty}>—</span>;
  if (cell.kind === 'url') {
    return (
      <a href={cell.value} target="_blank" rel="noreferrer">
        {cell.value}
      </a>
    );
  }
  if (cell.kind === 'array' || cell.kind === 'object') {
    const summary =
      cell.kind === 'array'
        ? `${cell.value.length} item${cell.value.length === 1 ? '' : 's'}`
        : 'object';
    return (
      <details className={styles.expandable}>
        <summary>{summary}</summary>
        <pre>{JSON.stringify(cell.value, null, 2)}</pre>
      </details>
    );
  }
  return <span>{cell.display}</span>;
}

/**
 * Right-side drawer showing every column of a single clicked row: images
 * large (with a click-to-original lightbox), the main text prominently, and
 * the remaining columns as a definition list formatted per data type.
 */
function PointDetail({ selectedIndex, onClose }) {
  const { dataset, sae, clusterMap } = useScope();

  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  // { src, alt, href? } for the full-size image modal
  const [lightbox, setLightbox] = useState(null);
  // Guard against stale async responses when the selection changes quickly.
  const latestIndexRef = useRef(null);

  const isOpen = selectedIndex !== null && selectedIndex !== undefined;

  useEffect(() => {
    if (!isOpen || !dataset?.id) {
      latestIndexRef.current = null;
      setRow(null);
      setLightbox(null);
      return;
    }
    latestIndexRef.current = selectedIndex;
    setLightbox(null);
    setLoading(true);
    apiService
      .fetchDataFromIndices(dataset.id, [selectedIndex], sae?.id ?? null)
      .then((rows) => {
        if (latestIndexRef.current !== selectedIndex) return;
        setRow(rows?.[0] ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (latestIndexRef.current !== selectedIndex) return;
        setRow(null);
        setLoading(false);
      });
  }, [isOpen, selectedIndex, dataset?.id, sae?.id]);

  // Escape closes the lightbox first, then the drawer.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (lightbox) {
        setLightbox(null);
      } else {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, lightbox, onClose]);

  const { imageColumns, textColumn, listColumns } = useMemo(
    () => organizeDetailColumns(dataset),
    [dataset]
  );

  const cluster = isOpen ? clusterMap?.[selectedIndex] : null;
  const metadata = dataset?.column_metadata || {};

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

        {isOpen &&
          imageColumns.map(({ column, kind }) => {
            const src =
              kind === 'binary'
                ? imageUrlFor(dataset.id, column, selectedIndex, DRAWER_IMAGE_SIZE)
                : row?.[column];
            const fullSrc =
              kind === 'binary' ? imageUrlFor(dataset.id, column, selectedIndex) : row?.[column];
            if (!src) return null;
            return (
              <div key={column} className={styles.imageSection}>
                <img
                  className={styles.image}
                  src={src}
                  alt={`${column} ${selectedIndex}`}
                  title="Click to view full size"
                  onClick={() =>
                    setLightbox({
                      src: fullSrc,
                      alt: `${column} ${selectedIndex}`,
                      href: kind === 'url' ? fullSrc : null,
                    })
                  }
                />
                <div className={styles.imageCaption}>
                  <span>{column}</span>
                  {kind === 'url' && (
                    <a href={row[column]} target="_blank" rel="noreferrer">
                      open ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}

        {row && textColumn && row[textColumn] !== undefined && (
          <div className={styles.textSection}>
            <div className={styles.sectionLabel}>{textColumn}</div>
            <div className={styles.text}>{row[textColumn]}</div>
          </div>
        )}

        {row && (
          <dl className={styles.fields}>
            {row.ls_similarity !== undefined && row.ls_similarity !== null && (
              <div className={styles.field}>
                <dt>similarity</dt>
                <dd>{formatDetailNumber(row.ls_similarity)}</dd>
              </div>
            )}
            {listColumns.map((column) => (
              <div key={column} className={styles.field}>
                <dt>{column}</dt>
                <dd>
                  <DetailValue cell={describeCellValue(row[column], metadata[column])} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {lightbox && (
        <Modal
          className={styles.lightbox}
          isVisible={!!lightbox}
          onClose={() => setLightbox(null)}
        >
          <div className={styles.lightboxContent}>
            <img
              className={styles.lightboxImage}
              src={lightbox.src}
              alt={lightbox.alt}
              onClick={() => setLightbox(null)}
            />
            <div className={styles.lightboxCaption}>
              <span>{lightbox.alt}</span>
              {lightbox.href && (
                <a href={lightbox.href} target="_blank" rel="noreferrer">
                  open original ↗
                </a>
              )}
              <Button
                onClick={() => setLightbox(null)}
                aria-label="Close full size image"
                icon="x"
                variant="outline"
                size="small"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PointDetail;
