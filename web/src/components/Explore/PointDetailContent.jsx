import { useState, useEffect } from 'react';
import { Modal } from 'react-element-forge';

import { imageUrlFor } from '../../lib/imageUrl';
import {
  organizeDetailColumns,
  describeCellValue,
  formatDetailNumber,
} from '../../lib/pointDetail';

import styles from './PointDetail.module.scss';

// Default inline image width; the lightbox fetches the original.
const DEFAULT_IMAGE_SIZE = 600;

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
 * The body of a single row's detail view: images large (with a
 * click-to-original lightbox), the main text prominently, and the remaining
 * columns as a definition list formatted per data type. Shared between the
 * desktop drawer (PointDetail), the mobile table's expanded rows, and the
 * Setup preview's drawer (PreviewPointDetail).
 *
 * `dataset` is a prop (not ScopeContext) so contexts other than Explore can
 * reuse the view. `row` may be null while it loads — binary images only need
 * the index, so they render immediately.
 */
function PointDetailContent({ row, index, dataset, imageSize = DEFAULT_IMAGE_SIZE }) {
  // { src, alt, href? } for the full-size image modal
  const [lightbox, setLightbox] = useState(null);

  // Close the lightbox when the row changes under us.
  useEffect(() => {
    setLightbox(null);
  }, [index, dataset?.id]);

  // While the lightbox is open, Escape closes it and stops there (capture
  // phase, so an enclosing drawer's own Escape handler doesn't also fire).
  useEffect(() => {
    if (!lightbox) return;
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setLightbox(null);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [lightbox]);

  const { imageColumns, textColumn, listColumns } = organizeDetailColumns(dataset);
  const metadata = dataset?.column_metadata || {};
  const hasIndex = index !== null && index !== undefined;

  return (
    <>
      {hasIndex &&
        imageColumns.map(({ column, kind }) => {
          const src =
            kind === 'binary' ? imageUrlFor(dataset.id, column, index, imageSize) : row?.[column];
          const fullSrc =
            kind === 'binary' ? imageUrlFor(dataset.id, column, index) : row?.[column];
          if (!src) return null;
          return (
            <div key={column} className={styles.imageSection}>
              <img
                className={styles.image}
                src={src}
                alt={`${column} ${index}`}
                title="Click to view full size"
                onClick={() =>
                  setLightbox({
                    src: fullSrc,
                    alt: `${column} ${index}`,
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

      {lightbox && (
        <Modal
          className={styles.lightbox}
          isVisible={!!lightbox}
          onClose={() => setLightbox(null)}
          // --ls-z-modal: sits above the point detail drawer (--ls-z-drawer)
          zIndex={510}
        >
          <div className={styles.lightboxContent}>
            <img
              className={styles.lightboxImage}
              src={lightbox.src}
              alt={lightbox.alt}
              onClick={() => setLightbox(null)}
            />
            <div className={styles.lightboxCaption}>
              <span className={styles.lightboxName}>{lightbox.alt}</span>
              {lightbox.href && (
                <a href={lightbox.href} target="_blank" rel="noreferrer">
                  open original ↗
                </a>
              )}
              <button
                type="button"
                className="ls-icon-btn"
                onClick={() => setLightbox(null)}
                aria-label="Close full size image"
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
          </div>
        </Modal>
      )}
    </>
  );
}

export default PointDetailContent;
