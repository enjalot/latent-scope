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

  return (
    <>
      <div className="feature-cell-button-container">
        <Button
          className="feature-cell-button"
          color="primary"
          variant="clear"
          onClick={() => setIsModalOpen(true)}
          icon="maximize-2"
          size="small"
        />
        <FeatureModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          rowIndex={row.ls_index}
          features={features}
          topIndices={row.ls_features.top_indices}
          topActs={row.ls_features.top_acts}
          selectedFeature={feature}
        />
      </div>
    </>
  );
}

function FeatureModal({
  isOpen,
  onClose,
  rowIndex,
  features,
  topIndices,
  topActs,
  selectedFeature,
}) {
  const TO_SHOW = 15;

  const baseUrl = 'https://enjalot.github.io/latent-taxonomy#model=NOMIC_FWEDU_25k&feature=';

  return (
    <Modal isVisible={isOpen} onClose={onClose} title={`Features for Index ${rowIndex}`}>
      <div className="feature-modal-close">
        <span className="feature-modal-text">Top {TO_SHOW} Activated SAE Features</span>
        <Button onClick={onClose} icon="x" color="primary" variant="outline" size="small" />
      </div>
      <div className="feature-modal-content">
        {topIndices.slice(0, TO_SHOW).map((featIdx, i) => (
          <div
            className="feature-modal-item"
            key={i}
            style={{
              cursor: 'pointer',
              fontWeight: featIdx === selectedFeature ? 'bold' : 'normal',
            }}
            onClick={() => window.open(`${baseUrl}${featIdx}`, '_blank', 'noopener,noreferrer')}
          >
            <span style={{ textDecoration: 'none', color: 'inherit' }}>
              {featIdx}: {features?.[featIdx]?.label} ({topActs?.[i]?.toFixed(3)})
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function FeaturePlot({ row, feature, features, width }) {
  const featureSelected = feature !== -1;

  const { idx } = row;

  const showTicks = idx !== undefined;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const TO_SHOW = 15; // number of activations to show in the modal

  const height = showTicks ? 35 : 20; // Increase height for the row with ticks
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
  const featureLineStyle = (i) => {
    // no feature selected, so plot all the activations the same color
    if (feature === -1) {
      return {
        stroke: '#b87333',
        strokeWidth: 1,
        opacity: 0.8,
      };
    } else if (i === feature) {
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
        strokeWidth: 1,
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

  return (
    <>
      <svg width={width} height={height} onClick={() => setIsModalOpen(true)}>
        {/* Activation lines */}

        {featuresToActivations.map(({ feature: feat_idx, activation }) => (
          <line
            key={feat_idx}
            x1={logScale(activation)}
            y1={height - padding.bottom}
            x2={logScale(activation)}
            y2={padding.top}
            {...featureLineStyle(feat_idx)}
          >
            <title>
              {feat_idx}: {features?.[feat_idx]?.label}
            </title>
          </line>
        ))}

        {/* Add axis ticks and labels */}
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
      </svg>

      <FeatureModal
        isOpen={isModalOpen}
        onClose={handleClose}
        rowIndex={row.ls_index}
        features={features}
        topIndices={row.ls_features.top_indices}
        topActs={row.ls_features.top_acts}
        selectedFeature={feature}
      />
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
    const ls_features_column = 'ls_features (click to expand)';
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
