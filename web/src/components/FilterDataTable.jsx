import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Button } from 'react-element-forge';
import { Modal } from 'react-element-forge';
import PropTypes from 'prop-types';
import { Tooltip } from 'react-tooltip';
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

function FeatureModal({
  isOpen,
  onClose,
  rowIndex,
  features,
  topIndices,
  topActs,
  selectedFeature,
  handleFeatureClick,
}) {
  const TO_SHOW = 15;

  const baseUrl = 'https://enjalot.github.io/latent-taxonomy#model=NOMIC_FWEDU_25k&feature=';
  const maxAct = Math.max(...topActs);
  const getWidth = (act) => {
    return `${(act / maxAct) * 100}%`;
  };

  const itemStyle = (featIdx) => ({
    fontWeight: featIdx === selectedFeature ? 'bold' : 'normal',
  });

  const handleFilterClick = (featIdx, activation) => {
    handleFeatureClick(featIdx, activation);
    onClose();
  };

  return (
    <Modal
      className="feature-modal"
      isVisible={isOpen}
      onClose={onClose}
      title={`Features for Index ${rowIndex}`}
    >
      <div className="feature-modal-close">
        <span className="feature-modal-text">Top {TO_SHOW} Activated SAE Features</span>
        <Button onClick={onClose} icon="x" color="primary" variant="outline" size="small" />
      </div>
      <div className="feature-modal-content">
        {topIndices.slice(0, TO_SHOW).map((featIdx, i) => (
          <div className="feature-modal-item" key={i} style={itemStyle(featIdx)}>
            <div
              className="feature-modal-item-background"
              style={{ width: getWidth(topActs[i]) }}
            />
            <div className="feature-label">
              <span
                title={`${baseUrl}${featIdx}`}
                onClick={() => window.open(`${baseUrl}${featIdx}`, '_blank', 'noopener,noreferrer')}
                className="feature-modal-item-filter-link"
              >
                {featIdx}:
              </span>
              <span className="feature-modal-item-filter-label">
                {features?.[featIdx]?.label} ({topActs?.[i]?.toFixed(3)})
              </span>
              <div
                className="feature-modal-item-filter-text-container"
                onClick={(event) => {
                  event.stopPropagation();
                  handleFilterClick(featIdx, topActs[i]);
                }}
              >
                <span className="feature-modal-item-filter-text">Filter by this feature</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function FeaturePlot({ row, feature, features, width, handleFeatureClick }) {
  const { idx } = row;

  const showTicks = idx !== undefined;

  const [isModalOpen, setIsModalOpen] = useState(false);

  const height = 45;
  const padding = { left: 20, right: 20, top: 2.5, bottom: showTicks ? 15 : 1.5 }; // Add bottom padding for ticks

  const activations = row.ls_features.top_acts || [];

  // Create power scale to compress smaller values and expand larger values
  const logScale = scalePow()
    .exponent(2.5)
    .domain(extent(activations))
    .range([padding.left, width - padding.right]);

  // if feature is -1, we want to plot all the activations the same color
  // otherwise, we want to highlight the selected feature darker than the others.
  // i is in the space of all features (0 to features.length - 1)
  const featureLineStyle = (f, idx) => {
    if (hoveredIdx !== null) {
      if (idx === hoveredIdx) {
        return {
          stroke: '#b87333',
          strokeWidth: 2,
          opacity: 0.8,
        };
      } else {
        return {
          stroke: '#ccc',
          strokeWidth: 2,
          opacity: 0.25,
        };
      }
    }

    // no feature selected, so plot all the activations the same color
    if (feature === -1) {
      return {
        stroke: '#b87333',
        strokeWidth: 2,
        opacity: 0.8,
      };
    } else if (f === feature) {
      // we are plotting the selected feature, so make it darker, and thicker than the others
      return {
        stroke: '#b87333',
        strokeWidth: 2,
        opacity: 0.8,
      };
    } else {
      // we are plotting a feature that is not the selected feature, so make it lighter and thinner
      // than the selected feature
      return {
        stroke: '#f5f5f5',
        strokeWidth: 2,
        opacity: 0.5,
      };
    }
  };

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // row -> the row being rendered
  // row.ls_features -> an object with top_indices and top_acts
  // top_indices -> list of feature indices sorted by activation strength
  // top_acts -> list of activation strengths for the top_indices (extracted into a list activations)
  // features -> list of {feature, label, max_activation, order?}. feature is the index of the entry in the list.
  // feature -> the feature index being used as a filter (between 0 and features.length - 1, or -1 if no feature is selected)

  let featuresToActivations = row.ls_features.top_indices.map((idx, i) => {
    return {
      feature: idx,
      activation: row.ls_features.top_acts[i],
    };
  });

  if (feature !== -1) {
    const nonSelectedFeatures = featuresToActivations.filter(
      ({ feature: feat_idx }) => feat_idx !== feature
    );
    const selectedFeature = featuresToActivations.filter(
      ({ feature: feat_idx }) => feat_idx === feature
    );
    // add the selected feature to the end of the list, so it's on top of the others
    featuresToActivations = [...nonSelectedFeatures, ...selectedFeature];
  }

  const [tooltipContent, setTooltipContent] = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <div className="feature-plot-container">
      <svg width={width} height={height} onClick={() => setIsModalOpen(true)}>
        {featuresToActivations.map(({ feature: feat_idx, activation }, idx) => (
          <line
            data-tooltip-id={`feature-tooltip`}
            key={feat_idx}
            x1={logScale(activation)}
            y1={height - padding.bottom}
            x2={logScale(activation)}
            y2={padding.top}
            onMouseEnter={() => {
              setHoveredIdx(idx);
              setTooltipContent(
                `Feature ${feat_idx}: ${features?.[feat_idx]?.label} (${activation.toFixed(3)})`
              );
            }}
            onMouseLeave={() => {
              setTooltipContent(null);
              setHoveredIdx(null);
            }}
            {...featureLineStyle(feat_idx, idx)}
          />
        ))}

        {/* Add axis ticks and labels */}
        {extent(activations).map((tick) => (
          <g
            key={tick}
            // transform={`translate(${xScale(logScale(tick))},${height - padding.bottom})`}
            transform={`translate(${logScale(tick)},${height - padding.bottom})`}
          >
            {/* <line y2="4" stroke="#666" /> */}
            <text y="10" textAnchor="middle" fill="#666" style={{ fontSize: '8px' }}>
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
      </svg>

      {/* <div data-tooltip-id="feature-tooltip" /> */}
      <Tooltip
        id="feature-tooltip"
        isOpen={true}
        place="top"
        effect="solid"
        content={tooltipContent}
        className="feature-tooltip"
        // positionStrategy="fixed"
        style={{
          zIndex: 9999,
          maxWidth: 'none',
          whiteSpace: 'nowrap',
          backgroundColor: '#D3965E',
        }}
      />

      <FeatureModal
        isOpen={isModalOpen}
        onClose={handleClose}
        rowIndex={row.ls_index}
        features={features}
        topIndices={row.ls_features.top_indices}
        topActs={row.ls_features.top_acts}
        selectedFeature={feature}
        handleFeatureClick={handleFeatureClick}
      />
    </div>
  );
}

function FilterDataTable({
  handleFeatureClick,
  dataset,
  filteredIndices = [],
  defaultIndices = [],
  distances = [],
  clusterMap = {},
  onDataTableRows,
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
  const [rows, setRows] = useState([]);

  // page count is the total number of pages available
  const [pageCount, setPageCount] = useState(0);

  const [rowsLoading, setRowsLoading] = useState(false);
  const hydrateIndices = useCallback(
    (indices) => {
      // console.log("hydrate!", dataset)
      if (dataset && indices.length) {
        // setRowsLoading(true);
        const body = {
          dataset: dataset.id,
          indices: indices,
          embedding_id: showEmbeddings,
          page,
          sae_id: sae_id,
        };
        const timestamp = Date.now();
        console.log('fetching query', body, timestamp);

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
            console.log('======= SETTING ROWS =======', rows, timestamp);
            setRows(rows.map((row, idx) => ({ ...row, idx })));
            onDataTableRows(rows);
            // setRowsLoading(false);
          });
      } else {
        setRows([]);
        onDataTableRows([]);
        // setRowsLoading(false);
        // setPageCount(totalPages);
      }
    },
    [dataset, page, showEmbeddings, sae_id, setRowsLoading]
  );

  const formattedColumns = useMemo(() => {
    const ls_features_column = 'ls_features';
    let columns = ['ls_index'];
    // Text column is always the first column (after index)

    columns.push(dataset.text_column);

    if (distances && distances.length) columns.push('ls_similarity');
    if (showEmbeddings) columns.push('ls_embedding');
    if (sae_id) columns.push(ls_features_column);
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

      if (col === ls_features_column) {
        const baseWidth = 200;

        return {
          ...baseCol,
          width: baseWidth,
          renderHeaderCell: () => (
            <div className="feature-column-header" style={{ position: 'relative' }}>
              <span>{ls_features_column}</span>
              <span
                data-tooltip-id="feature-column-info-tooltip"
                className="feature-column-info-tooltip-icon"
              >
                🤔
              </span>
              <Tooltip
                id="feature-column-info-tooltip"
                className="feature-column-info-tooltip"
                place="bottom"
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
                  features corresponding to each embedding. Higher activations indicate that the
                  feature captures an important semantic element of the embedding.
                  <br />
                  <br />
                  Click each cell to see the labels for each feature and to filter rows by a
                  particular feature.
                </div>
              </Tooltip>
            </div>
          ),
          renderCell: ({ row }) => (
            <FeaturePlot
              width={baseWidth}
              row={row}
              feature={feature}
              features={features}
              handleFeatureClick={handleFeatureClick}
            />
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
  }, [dataset, clusterMap, distances, features, feature, sae_id, showEmbeddings]);

  useEffect(() => {
    let indicesToUse = [];
    if (feature >= 0) {
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

  // console.log('==== FILTER DATA TABLE =====', { filteredIndices, defaultIndices, rows });

  return (
    <div
      className={`filter-data-table ${rowsLoading ? 'loading' : ''}`}
      // style={{ visibility: indices.length ? 'visible' : 'hidden' }}
    >
      {/* Scrollable Table Body */}
      <div className="filter-table-scrollable-body table-body" style={{ overflowY: 'auto' }}>
        <DataGrid
          rows={rows}
          columns={formattedColumns}
          rowClass={(row, index) => {
            if (row.ls_index === 0) {
              return 'test';
            }
            return '';
          }}
          rowGetter={(i) => rows[i]}
          rowHeight={sae_id ? 50 : 35}
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
