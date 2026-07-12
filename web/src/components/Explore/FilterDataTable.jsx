import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'react-tooltip';
import { useFilter } from '../../contexts/FilterContext';
import { useScope } from '../../contexts/ScopeContext';
import { tokenSnippet, cleanTokenString, DEFAULT_SNIPPET_WINDOW } from '../../lib/tokenSnippet';
// import DataTable from './DataTable';
import 'react-data-grid/lib/styles.css';

import DataGrid, { Row } from 'react-data-grid';
import FeaturePlot from './FeaturePlot';
import { Spinner, Pagination } from '../ui';
import { imageUrlFor } from '../../lib/imageUrl';

import styles from './FilterDataTable.module.css';
import './FilterDataTableGlobal.css';

const apiUrl = import.meta.env.VITE_API_URL;

FilterDataTable.propTypes = {
  dataset: PropTypes.object.isRequired,
  distances: PropTypes.array,
  clusterMap: PropTypes.object,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
  // Standalone mode (no FilterContext, e.g. Setup/Preview): pass the indices
  // to display and the table fetches its own rows from the API.
  filteredIndices: PropTypes.array,
  defaultIndices: PropTypes.array,
  deletedIndices: PropTypes.array,
  page: PropTypes.number,
  setPage: PropTypes.func,
  showNavigation: PropTypes.bool,
  showIndexColumn: PropTypes.bool,
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
  // Three-segment flex so the highlighted token stays visible regardless of
  // cell width: the before-context clips from the LEFT (dir="rtl" on the
  // clipping span puts the ellipsis on the left; the inner <bdi dir="ltr">
  // isolates the text so its rendering order is unaffected), the
  // after-context clips from the right, and the token itself never shrinks.
  return (
    <span className={styles.tokenSnippetCell} title={text}>
      <span className={styles.tokenSnippetBefore} dir="rtl">
        <bdi dir="ltr">{snippet.before}</bdi>
      </span>
      <span className={styles.tokenHighlight}>{snippet.match}</span>
      <span className={styles.tokenSnippetAfter}>{snippet.after}</span>
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

const IndexCircleCell = ({ row }) => {
  return (
    <div className={styles.indexCircleContainer}>
      <span className="ls-chip ls-chip--index">{row.idx + 1}</span>
    </div>
  );
};

// feather "info" icon — tooltip trigger for the SAE features column header
const InfoIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

// Presentational table shared by the context-connected (Explore) and
// standalone (Setup/Preview) variants.
function FilterDataTableBody({
  handleFeatureClick,
  dataset,
  rows,
  page,
  setPage,
  totalPages,
  loading = false,
  distances = [],
  clusterMap = {},
  sae_id = null,
  feature = -1,
  features = [],
  showEmbeddings = null,
  showNavigation = true,
  showIndexColumn = true,
  standalone = false,
  onHover = () => {},
  onClick = () => {},
  // Token scopes (granularity: "tokens"): rows are tokens; the text column is
  // rendered as a snippet with the token highlighted. Passed down by the
  // connected variant; standalone (Setup/Preview) tables are always row-level.
  scope = null,
  isTokenScope = false,
}) {
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
    if (showEmbeddings) columns.push('ls_embedding');
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
                <InfoIcon />
              </span>
            </div>
          ),
          renderCell: ({ row }) => {
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

      // machine-measured numerics get the mono tabular treatment
      const isNumericCol = col === 'ls_index' || col === 'ls_similarity';

      return {
        ...baseCol,
        width: col == 'ls_index' ? 60 : 150,
        cellClass: isNumericCol ? 'ls-rdg-cell--num' : undefined,
        renderCell,
      };
    });

    // Add index column as first column
    return showIndexColumn ? [indexColumn, ...columnDefs] : columnDefs;
  }, [
    dataset,
    scope,
    isTokenScope,
    clusterMap,
    distances,
    features,
    feature,
    sae_id,
    showEmbeddings,
    showIndexColumn,
  ]);

  const renderRowWithHover = useCallback(
    (key, props) => {
      return <RowWithHover key={key} props={props} onHover={onHover} onClick={onClick} />;
    },
    [onHover, onClick]
  );

  return (
    <div
      className={`ls-rdg ${styles.filterDataTable} ${standalone ? styles.standalone : ''}`}
      // style={{ visibility: indices.length ? 'visible' : 'hidden' }}
    >
      {loading && (
        <div className="ls-scrim">
          <Spinner label="LOADING ROWS…" />
        </div>
      )}
      <div className={styles.filterTableScrollableBody}>
        <Tooltip
          id="feature-tooltip"
          place="bottom"
          effect="solid"
          content={featureTooltipContent?.content || ''}
          className="ls-tooltip"
          float={true}
          isOpen={!!featureTooltipContent}
        />
        <DataGrid
          rows={rows}
          columns={formattedColumns}
          rowGetter={(i) => rows[i]}
          headerRowHeight={32}
          rowHeight={sae_id || hasBinaryImageColumns ? 48 : 32}
          style={{ height: '100%' }}
          renderers={{ renderRow: renderRowWithHover }}
        />

        <Tooltip
          id="feature-column-info-tooltip"
          className={`ls-tooltip ${styles.featureInfoTooltip}`}
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
      {showNavigation && page >= 0 && (
        <div className={styles.filterDataTablePageControls}>
          <Pagination
            page={page + 1}
            totalPages={totalPages || 1}
            onPage={(p) => setPage(p - 1)}
          />
        </div>
      )}
    </div>
  );
}

// Explore variant: rows, pagination and loading state come from FilterContext;
// token-scope awareness (snippet highlighting, token column) from ScopeContext.
function ConnectedFilterDataTable(props) {
  const { dataTableRows, page, setPage, totalPages, loading } = useFilter();
  const { scope, isTokenScope } = useScope();
  return (
    <FilterDataTableBody
      {...props}
      rows={dataTableRows}
      page={page}
      setPage={setPage}
      totalPages={totalPages}
      loading={loading}
      scope={scope}
      isTokenScope={isTokenScope}
    />
  );
}

// Standalone variant (e.g. Setup/Preview): fetches its own rows for the
// indices passed in as props, matching the legacy components/FilterDataTable
// behavior (server-side pagination via the /query endpoint).
function StandaloneFilterDataTable({
  filteredIndices = [],
  defaultIndices = [],
  deletedIndices = [],
  onDataTableRows,
  page = 0,
  setPage = () => {},
  showIndexColumn = false,
  ...rest
}) {
  const { dataset, showEmbeddings = null, sae_id = null } = rest;

  const [rows, setRows] = useState([]);
  // page count is the total number of pages available
  const [pageCount, setPageCount] = useState(0);

  const hydrateIndices = useCallback(
    (indices) => {
      if (dataset && indices.length) {
        fetch(`${apiUrl}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dataset: dataset.id,
            indices: indices,
            embedding_id: showEmbeddings,
            page,
            sae_id: sae_id,
          }),
        })
          .then((response) => response.json())
          .then((data) => {
            let { rows, totalPages } = data;
            setPageCount(totalPages);
            setRows(rows.map((row, idx) => ({ ...row, idx })));
            if (onDataTableRows) onDataTableRows(rows);
          });
      } else {
        setRows([]);
        onDataTableRows && onDataTableRows([]);
      }
    },
    [dataset, page, showEmbeddings, sae_id, onDataTableRows]
  );

  useEffect(() => {
    let indicesToUse = [];
    if (filteredIndices.length) {
      indicesToUse = filteredIndices.filter((i) => !deletedIndices.includes(i));
    } else {
      indicesToUse = defaultIndices;
    }
    hydrateIndices(indicesToUse);
  }, [filteredIndices, page, defaultIndices, deletedIndices, hydrateIndices]);

  return (
    <FilterDataTableBody
      {...rest}
      rows={rows}
      page={page}
      setPage={setPage}
      totalPages={pageCount}
      loading={false}
      showIndexColumn={showIndexColumn}
      standalone={true}
    />
  );
}

function FilterDataTable(props) {
  // Callers that pass their own indices (Setup/Preview) get the standalone,
  // self-fetching table; everything else reads from FilterContext.
  if (props.filteredIndices || props.defaultIndices) {
    return <StandaloneFilterDataTable {...props} />;
  }
  return <ConnectedFilterDataTable {...props} />;
}

export default memo(FilterDataTable);
