import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Button } from 'react-element-forge';
import { Modal } from 'react-element-forge';
import PropTypes from 'prop-types';
// import DataTable from './DataTable';
import 'react-data-grid/lib/styles.css';

import DataGrid, { Row } from 'react-data-grid';
import { scaleLog, scaleLinear, scalePow } from 'd3-scale';

const apiUrl = import.meta.env.VITE_API_URL;

import './FilterDataTable.css';

FilterDataTable.propTypes = {
  height: PropTypes.string,
  dataset: PropTypes.object.isRequired,
  scope: PropTypes.object,
  filteredIndices: PropTypes.array.isRequired,
  defaultIndices: PropTypes.array.isRequired,
  distances: PropTypes.array,
  clusterMap: PropTypes.object,
  // clusterLabels: PropTypes.array,
  tagset: PropTypes.object,
  onTagset: PropTypes.func,
  onScope: PropTypes.func,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
};

function RowWithHover({ props, onHover }) {
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
    />
  );
}

function extent(activations) {
  const min = Math.min(...activations);
  const max = Math.max(...activations);
  return [min, max];
}

function FeatureCell({ row, feature, features }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
  }, [setIsModalOpen]);

  const TO_SHOW = 15;

  return (
    <>
      <div className="feature-cell-button-container">
        <Button
          className="feature-cell-button"
          color="primary"
          variant="clear"
          // variant="outline"
          onClick={() => setIsModalOpen(true)}
          icon="maximize-2"
          size="small"
        />
        <Modal
          isVisible={isModalOpen}
          onClose={handleClose}
          title={`Features for Index ${row.ls_index}`}
        >
          <div className="feature-modal-close">
            <span className="feature-modal-text">Top {TO_SHOW} Activated SAE Features</span>
            <Button onClick={handleClose} icon="x" color="primary" variant="outline" size="small" />
          </div>
          <div className="feature-modal-content">
            {row.ls_features.top_indices.slice(0, TO_SHOW).map((featIdx, i) => (
              <div
                className="feature-modal-item"
                key={i}
                style={{ fontWeight: featIdx === feature ? 'bold' : 'normal' }}
              >
                {featIdx}: {features?.[featIdx]?.label} ({row.ls_features.top_acts?.[i]?.toFixed(3)}
                )
              </div>
            ))}
          </div>
        </Modal>
      </div>
    </>
  );
}

function invertedLogScale(x, base = 10) {
  // Ensure input is between 0 and 1
  x = Math.max(0, Math.min(1, x));

  // Invert the input first
  const inverted = 1 - x;

  // Apply log transformation
  const logTransformed = Math.log(1 + inverted * (base - 1)) / Math.log(base);

  // Invert back
  return 1 - logTransformed;
}

function mapToRange(value, min, max) {
  return min + value * (max - min);
}

function FeaturePlot({ row, feature, features, width }) {
  const { idx } = row;

  const showTicks = idx !== undefined;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const TO_SHOW = 15; // number of activations to show in the modal

  const height = showTicks ? 35 : 20; // Increase height for the row with ticks
  const padding = { left: 20, right: 20, top: 2.5, bottom: showTicks ? 15 : 1.5 }; // Add bottom padding for ticks

  const activations = row.ls_features.top_acts || [];

  // Create scale from 0 to 1
  const logScale = scalePow()
    .exponent(2) // Exponent > 1 compresses smaller values
    .domain(extent(activations))
    .range([padding.left, width - padding.right]);

  // .range([padding.left, width - padding.right]);

  const indices = row.ls_features.top_indices || [];

  // if feature is -1, we want to plot all the activations the same color
  // otherwise, we want to highlight the selected feature darker than the others.
  /// we should actually render the selected feature last so it's on top of the others.
  const color = (i) => {
    if (feature === -1) {
      return '#b87333';
    } else if (i === feature) {
      return '#b87333';
    } else {
      return '#f5f5f5';
    }
  };

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return (
    <>
      <svg width={width} height={height} onClick={() => setIsModalOpen(true)}>
        {/* Activation lines */}
        {activations.map((act, i) => (
          <line
            key={i}
            x1={logScale(act)}
            y1={height - padding.bottom}
            x2={logScale(act)}
            y2={padding.top}
            stroke={color(indices[i])}
            strokeWidth={indices[i] === feature ? 2 : 1}
            opacity={feature === -1 ? 0.8 : indices[i] === feature ? 0.8 : 0.5}
          >
            <title>
              {indices[i]}: {features?.[indices[i]]?.label}
            </title>
          </line>
        ))}

        {/* Add tick marks and labels when idx === 0 */}
        {showTicks && (
          <>
            {extent(activations).map((tick) => (
              <g
                key={tick}
                // transform={`translate(${xScale(logScale(tick))},${height - padding.bottom})`}
                transform={`translate(${logScale(tick)},${height - padding.bottom})`}
              >
                <line y2="4" stroke="#666" />
                <text y="12" textAnchor="middle" fill="#666" style={{ fontSize: '8px' }}>
                  {tick.toFixed(2)}
                </text>
              </g>
            ))}
          </>
        )}
      </svg>

      <Modal
        isVisible={isModalOpen}
        onClose={handleClose}
        title={`Features for Index ${row.ls_index}`}
      >
        <div className="feature-modal-close">
          <span className="feature-modal-text">Top {TO_SHOW} Activated SAE Features</span>
          <Button onClick={handleClose} icon="x" color="primary" variant="outline" size="small" />
        </div>
        <div className="feature-modal-content">
          {row.ls_features.top_indices.slice(0, TO_SHOW).map((featIdx, i) => (
            <div
              className="feature-modal-item"
              key={i}
              style={{ fontWeight: featIdx === feature ? 'bold' : 'normal' }}
            >
              {featIdx}: {features?.[featIdx]?.label} ({row.ls_features.top_acts?.[i]?.toFixed(3)})
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function FilterDataTable({
  dataset,
  filteredIndices = [],
  defaultIndices = [],
  distances = [],
  clusterMap = {},
  tagset,
  showEmbeddings = null,
  showNavigation = true,
  sae_id = null,
  feature = -1,
  features = [],
  onHover,
  deletedIndices = [],
  page,
  setPage,
}) {
  console.log('==== FILTER DATA TABLE =====', { feature, features });

  console.log('activations', feature, features);

  const [rows, setRows] = useState([]);

  // page count is the total number of pages available
  const [pageCount, setPageCount] = useState(0);

  // when filteredIndices is empty, we use defaultIndices and show the pageCount as totalPages
  // otherwise, we use filteredIndices and show the pageCount as the query result totalPages

  const [expandedFeatureRows, setExpandedFeatureRows] = useState(new Set());

  // const [tags, setTags] = useState([]);
  // useEffect(() => {
  //   if (tagset) {
  //     setTags(Object.keys(tagset));
  //   }
  // }, [tagset]);

  const hydrateIndices = useCallback(
    (indices) => {
      // console.log("hydrate!", dataset)
      console.log('indices', indices);
      if (dataset && indices.length) {
        console.log('fetching query', dataset);
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
            let { rows, totalPages, total } = data;
            console.log('query fetched data', data);
            // console.log("pages", totalPages, total)
            setPageCount(totalPages);
            console.log('======= SETTING ROWS =======', rows);
            setRows(rows.map((row, idx) => ({ ...row, idx })));
          });
      } else {
        setRows([]);
        // setPageCount(totalPages);
      }
    },
    [dataset, page, showEmbeddings, sae_id]
  );

  const formattedColumns = useMemo(() => {
    let columns = ['ls_index'];
    // Text column is always the first column (after index)
    columns.push(dataset.text_column);

    if (distances && distances.length) columns.push('ls_similarity');
    if (showEmbeddings) columns.push('ls_embedding');
    if (sae_id) columns.push('ls_features');
    if (clusterMap && Object.keys(clusterMap).length) columns.push('ls_cluster');
    // if (tagset && Object.keys(tagset).length) columns.push('tags');

    columns = columns.concat(dataset.columns.filter((d) => d !== dataset.text_column));

    let columnDefs = columns.map((col) => {
      const metadata = dataset.column_metadata ? dataset.column_metadata[col] : null;

      const baseCol = {
        key: col,
        name: col,
        resizable: true,
        className: 'filter-data-table-row',
      };

      // dropping tag support for now.
      // if (col === 'tags') {
      //   return {
      //     ...baseCol,
      //     width: 100,
      //     renderCell: ({ row }) => renderTags(tags, row, tagset, handleTagClick),
      //   };
      // }

      if (metadata?.image) {
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

      if (col === dataset.text_column) {
        return {
          ...baseCol,
          width: 500,
          renderHeaderCell: () => <div className="text-column">{dataset.text_column}</div>,
          renderCell: ({ row }) => {
            return <span title={row[col]}>{row[col]}</span>;
          },
        };
      }

      if (col === 'ls_features') {
        const baseWidth = 200;
        return {
          ...baseCol,
          width: expandedFeatureRows.size > 0 ? baseWidth + 100 : baseWidth,
          renderCell: ({ row }) => (
            <FeaturePlot width={baseWidth} row={row} feature={feature} features={features} />
          ),
        };
      }

      const renderCell = ({ row }) => {
        if (typeof row[col] === 'object') {
          return <span>{JSON.stringify(row[col])}</span>;
        }
        if (col === 'ls_similarity') {
          return <span>{parseFloat(1 - distances[row.ls_index]).toFixed(4)}</span>;
        }

        return <span title={row[col]}>{row[col]}</span>;
      };

      return {
        ...baseCol,
        width: col == 'ls_index' ? 60 : 150,
        renderCell,
      };
    });
    return columnDefs;
  }, [
    dataset,
    /*tags, tagset,*/
    clusterMap,
    distances,
    features,
    expandedFeatureRows,
    feature,
    sae_id,
    showEmbeddings,
  ]);

  useEffect(() => {
    let indicesToUse = [];
    if (filteredIndices.length) {
      indicesToUse = filteredIndices.filter((i) => !deletedIndices.includes(i));
    } else {
      indicesToUse = defaultIndices;
    }
    hydrateIndices(indicesToUse);
  }, [filteredIndices, page, defaultIndices, deletedIndices, hydrateIndices]);

  const renderRowWithHover = useCallback(
    (key, props) => {
      return <RowWithHover key={key} props={props} onHover={onHover} />;
    },
    [onHover]
  );

  const getRowHeight = useCallback(
    (row) => {
      if (expandedFeatureRows.has(row.ls_index)) {
        return 200; // or however tall you want expanded rows to be
      }
      return 35; // default row height
    },
    [expandedFeatureRows]
  );

  // console.log('==== FILTER DATA TABLE =====', { filteredIndices, defaultIndices, rows });

  return (
    <div
      className="filter-data-table"
      // style={{ visibility: indices.length ? 'visible' : 'hidden' }}
    >
      {/* Scrollable Table Body */}
      <div className="filter-table-scrollable-body table-body" style={{ overflowY: 'auto' }}>
        <DataGrid
          rows={rows}
          columns={formattedColumns}
          rowClass={(row, index) => {
            debugger;
            if (row.ls_index === 0) {
              return 'test';
            }
            return '';
          }}
          rowGetter={(i) => rows[i]}
          rowHeight={getRowHeight}
          style={{ height: '100%', color: 'var(--text-color-main-neutral)' }}
          renderers={{ renderRow: renderRowWithHover }}
        />
      </div>
      {showNavigation && (
        <div className="filter-data-table-page-controls">
          <button onClick={() => setPage(0)} disabled={page === 0}>
            First
          </button>
          <button onClick={() => setPage((old) => Math.max(0, old - 1))} disabled={page === 0}>
            ←
          </button>
          <span>
            Page {page + 1} of {pageCount || 1}
          </span>
          <button
            onClick={() => setPage((old) => Math.min(pageCount - 1, old + 1))}
            disabled={page === pageCount - 1}
          >
            →
          </button>
          <button onClick={() => setPage(pageCount - 1)} disabled={page === pageCount - 1}>
            Last
          </button>
        </div>
      )}
    </div>
  );
}
export default memo(FilterDataTable);
