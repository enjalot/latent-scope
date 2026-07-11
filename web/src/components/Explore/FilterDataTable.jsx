import { useState, useCallback, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'react-tooltip';
import { useFilter } from '../../contexts/FilterContext';
import { useScope } from '../../contexts/ScopeContext';
import { tokenSnippet, cleanTokenString, DEFAULT_SNIPPET_WINDOW } from '../../lib/tokenSnippet';
// import DataTable from './DataTable';
import 'react-data-grid/lib/styles.css';

import DataGrid, { Row } from 'react-data-grid';
import FeaturePlot from './FeaturePlot';
import { imageUrlFor } from '../../lib/imageUrl';

import styles from './FilterDataTable.module.css';

FilterDataTable.propTypes = {
  height: PropTypes.string,
  dataset: PropTypes.object.isRequired,
  distances: PropTypes.array,
  clusterMap: PropTypes.object,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
};

// Token-scope text cell: window the parent document's text around the token's
// character span and highlight the token in place (built from substring
// slices — no innerHTML). Tokens without a surface form (CLS/SEP/markers,
// char_start === -1) fall back to the plain truncated text plus a muted note.
function TokenSnippetCell({ row, column }) {
  const text = row[column];
  const snippet = tokenSnippet(text, row.char_start, row.char_end, DEFAULT_SNIPPET_WINDOW);
  if (!snippet) {
    const plain = typeof text === 'string' ? text : '';
    return (
      <span title={plain}>
        <span className={styles.tokenSpecialNote}>{row.token_str} (special token) </span>
        {plain.length > 2 * DEFAULT_SNIPPET_WINDOW
          ? `${plain.slice(0, 2 * DEFAULT_SNIPPET_WINDOW)}…`
          : plain}
      </span>
    );
  }
  return (
    <span title={text}>
      {snippet.truncatedStart ? '…' : ''}
      {snippet.before}
      <span className={styles.tokenHighlight}>{snippet.match}</span>
      {snippet.after}
      {snippet.truncatedEnd ? '…' : ''}
    </span>
  );
}

function RowWithHover({ props, onHover, onClick }) {
  const { row } = props;
  const { ls_index } = row;
  return (
    <Row
      key={ls_index}
      {...props}
      onMouseEnter={() => {
        onHover(ls_index);
      }}
      onMouseLeave={() => {
        onHover(null);
      }}
      onClick={(event) => {
        // Ignore clicks on interactive cell content: links, buttons, and the
        // SAE feature plot canvas (which opens its own modal).
        if (event.target.closest('a, button, canvas')) return;
        onClick(ls_index);
      }}
    />
  );
}

function FilterDataTable({
  handleFeatureClick,
  dataset,
  distances = [],
  clusterMap = {},
  sae_id = null,
  feature = -1,
  features = [],
  onHover = () => {},
  onClick = () => {},
}) {
  const { dataTableRows, page, setPage, totalPages, loading } = useFilter();
  const { scope, isTokenScope } = useScope();

  // feature tooltip content
  const [featureTooltipContent, setFeatureTooltipContent] = useState(null);

  // binary image columns get taller rows so thumbnails are visible
  const hasBinaryImageColumns = useMemo(
    () => Object.values(dataset?.column_metadata || {}).some((m) => m?.type === 'image'),
    [dataset]
  );

  const formattedColumns = useMemo(() => {
    // Add index circle column as the first column
    const indexColumn = {
      key: 'index-circle',
      name: '', // Empty header
      width: 50,
      renderCell: IndexCircleCell,
      frozen: true, // Optional: keeps it visible during horizontal scroll
    };

    const ls_features_column = 'ls_features';
    const ls_token_column = 'ls_token';
    // Token scopes window the text column the embedding was computed over.
    const textColumn = (isTokenScope && scope?.embedding?.text_column) || dataset.text_column;
    let columns = ['ls_index'];
    if (isTokenScope) columns.push(ls_token_column);
    // Text column is always the first column (after index)

    columns.push(textColumn);

    if (distances && distances.length) columns.push('ls_similarity');
    if (sae_id) columns.push(ls_features_column);
    if (clusterMap && Object.keys(clusterMap).length) columns.push('ls_cluster');
    // if (tagset && Object.keys(tagset).length) columns.push('tags');

    columns = columns.concat(dataset.columns.filter((d) => d !== textColumn));

    let columnDefs = columns.map((col) => {
      const metadata = dataset.column_metadata ? dataset.column_metadata[col] : null;

      const baseCol = {
        key: col,
        name: col,
        resizable: true,
        className: styles.filterDataTableRow,
      };

      // dropping tag support for now.
      // if (col === 'tags') {
      //   return {
      //     ...baseCol,
      //     width: 100,
      //     renderCell: ({ row }) => renderTags(tags, row, tagset, handleTagClick),
      //   };
      // }

      if (metadata?.type === 'image') {
        // binary image column: the value is excluded from row payloads, so
        // reconstruct the display from dataset id + column + row index
        return {
          ...baseCol,
          renderCell: ({ row }) => (
            <img
              loading="lazy"
              src={imageUrlFor(dataset.id, col, row.ls_index, 150)}
              alt={`${col} ${row.ls_index}`}
              style={{ height: '100%', maxHeight: '48px', objectFit: 'contain' }}
            />
          ),
        };
      } else if (metadata?.image) {
        return {
          ...baseCol,
          renderCell: ({ row }) => (
            <a href={row[col]} target="_blank" rel="noreferrer">
              <img src={row[col]} alt="" style={{ height: '100px' }} />
            </a>
          ),
        };
      } else if (metadata?.url) {
        return {
          ...baseCol,
          renderCell: ({ row }) => (
            <a href={row[col]} target="_blank" rel="noreferrer">
              url
            </a>
          ),
        };
      } else if (metadata?.type === 'array') {
        return {
          ...baseCol,
          renderCell: ({ row }) => <span>{`[${row[col].length}]`}</span>,
        };
      }

      if (col === ls_token_column) {
        // Compact token column (frozen, so react-data-grid keeps it up front
        // near the index column) showing the cleaned surface string.
        return {
          ...baseCol,
          name: 'token',
          width: 90,
          frozen: true,
          renderCell: ({ row }) => (
            <span className={styles.tokenCell} title={row.token_str}>
              {cleanTokenString(row.token_str)}
            </span>
          ),
        };
      }

      if (col === 'ls_cluster') {
        return {
          ...baseCol,
          width: 200,
          renderCell({ row }) {
            const cluster = clusterMap[row.ls_index];
            return cluster ? <span>{cluster.label}</span> : null;
          },
        };
      }

      if (col === textColumn) {
        return {
          ...baseCol,
          width: 500,
          renderHeaderCell: () => <div className={styles.textColumn}>{textColumn}</div>,
          renderCell: ({ row }) => {
            if (isTokenScope) {
              return <TokenSnippetCell row={row} column={col} />;
            }
            return <span title={row[col]}>{row[col]}</span>;
          },
        };
      }

      if (col === ls_features_column) {
        const baseWidth = 200;

        return {
          ...baseCol,
          width: baseWidth,
          renderHeaderCell: () => (
            <div className={styles.featureColumnHeader} style={{ position: 'relative' }}>
              <span>{ls_features_column}</span>
              <span
                data-tooltip-id="feature-column-info-tooltip"
                className={styles.featureColumnInfoTooltipIcon}
              >
                🤔
              </span>
            </div>
          ),
          renderCell: ({ row }) => {
            // console.log('=== row ===', row);
            return (
              row.sae_indices && (
                <FeaturePlot
                  width={baseWidth}
                  row={row}
                  feature={feature}
                  features={features}
                  handleFeatureClick={handleFeatureClick}
                  setFeatureTooltipContent={setFeatureTooltipContent}
                />
              )
            );
          },
        };
      }

      const renderCell = ({ row }) => {
        if (typeof row[col] === 'object') {
          return <span>{JSON.stringify(row[col])}</span>;
        }
        if (col === 'ls_similarity') {
          return <span>{parseFloat(1 - distances[row.idx]).toFixed(4)}</span>;
        }
        if (typeof row[col] === 'string') {
          if (row[col].startsWith('http')) {
            return (
              <a href={row[col]} target="_blank" rel="noopener noreferrer">
                {row[col]}
              </a>
            );
          }
        }

        return <span title={row[col]}>{row[col]}</span>;
      };

      return {
        ...baseCol,
        width: col == 'ls_index' ? 60 : 150,
        renderCell,
      };
    });

    // Add index column as first column
    return [indexColumn, ...columnDefs];
    // return columnDefs;
  }, [dataset, scope, isTokenScope, clusterMap, distances, features, feature, sae_id]);

  const renderRowWithHover = useCallback(
    (key, props) => {
      return <RowWithHover key={key} props={props} onHover={onHover} onClick={onClick} />;
    },
    [onHover, onClick]
  );

  return (
    <div
      className={`${styles.filterDataTable} ${loading ? styles.loading : ''}`}
      // style={{ visibility: indices.length ? 'visible' : 'hidden' }}
    >
      {loading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <div>Loading</div>
          </div>
        </div>
      )}
      <div className={`${styles.filterTableScrollableBody} ${styles.tableBody}`}>
        <Tooltip
          id="feature-tooltip"
          place="bottom"
          effect="solid"
          content={featureTooltipContent?.content || ''}
          className={styles.featureTooltip}
          float={true}
          isOpen={!!featureTooltipContent}
          // float={true}
          position="fixed"
          style={{
            zIndex: 9999,
            maxWidth: 'none',
            whiteSpace: 'nowrap',
            backgroundColor: '#D3965E',
            position: 'fixed',
            marginTop: 10,
            top: -200,
            // left: featureTooltipContent?.x || 0,
            // top: (featureTooltipContent?.y || 0) - 30,
          }}
        />
        <DataGrid
          rows={dataTableRows}
          columns={formattedColumns}
          rowClass={(row) => {
            if (row.ls_index === 0) {
              return 'test';
            }
            return '';
          }}
          rowGetter={(i) => dataTableRows[i]}
          rowHeight={sae_id ? 50 : hasBinaryImageColumns ? 48 : 35}
          style={{ height: '100%', color: 'var(--text-color-main-neutral)' }}
          renderers={{ renderRow: renderRowWithHover }}
          className={styles.dataGrid}
        />

        <Tooltip
          id="feature-column-info-tooltip"
          className={styles.featureColumnInfoTooltip}
          place="top"
          effect="solid"
          clickable={true}
          delayHide={500} // give the user a chance to click the tooltip links
        >
          <div onClick={(e) => e.stopPropagation()}>
            The vertical bars represent activations for different{' '}
            <a
              href="https://enjalot.github.io/latent-taxonomy/articles/about"
              target="_blank"
              rel="noreferrer"
            >
              Sparse Autoencoder (SAE)
            </a>{' '}
            features corresponding to each embedding. Higher activations indicate that the feature
            captures an important semantic element of the embedding.
            <br />
            <br />
            Click each cell to see the labels for each feature and to filter rows by a particular
            feature.
          </div>
        </Tooltip>
      </div>
      {page >= 0 && (
        <div className={styles.filterDataTablePageControls}>
          <button onClick={() => setPage(0)} disabled={page === 0}>
            First
          </button>
          <button onClick={() => setPage((old) => Math.max(0, old - 1))} disabled={page === 0}>
            ←
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((old) => Math.min(totalPages - 1, old + 1))}
            disabled={page === totalPages - 1}
          >
            →
          </button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page === totalPages - 1}>
            Last
          </button>
        </div>
      )}
    </div>
  );
}

const IndexCircleCell = ({ row }) => {
  return (
    <div className={styles.indexCircleContainer}>
      <div className={styles.indexCircle}>{row.idx + 1}</div>
    </div>
  );
};

export default memo(FilterDataTable);
