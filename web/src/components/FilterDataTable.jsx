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
  hoveredIdx,
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
              style={{
                width: getWidth(topActs[i]),
                borderBottom: hoveredIdx === i ? '2px solid #b87333' : 'none',
                backgroundColor: hoveredIdx === i ? '#b87333' : '#aaa',
              }}
            />
            <div className="feature-label">
              <Button
                className="feature-modal-item-filter-button"
                icon="filter"
                color="primary"
                variant="outline"
                size="small"
                onClick={() => handleFeatureClick(featIdx, topActs[i])}
              />
              <span
                title={`${baseUrl}${featIdx}`}
                onClick={() => window.open(`${baseUrl}${featIdx}`, '_blank', 'noopener,noreferrer')}
                className="feature-modal-item-filter-link"
              >
                {featIdx}:
              </span>
              <span className="feature-modal-item-filter-label">
                {features?.[featIdx]?.label} ({topActs?.[i]?.toFixed(3)} /{' '}
                {features?.[featIdx]?.dataset_max?.toFixed(3)}){/* [count:{' '} */}
                {/* {features?.[featIdx]?.dataset_count}] */}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function FeaturePlot({
  row,
  feature,
  features,
  width,
  handleFeatureClick,
  setFeatureTooltipContent,
}) {
  const { idx } = row;
  const showTicks = idx !== undefined;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const canvasRef = useRef(null);

  const height = 45;
  const padding = { left: 10, right: 20, top: 2.5, bottom: showTicks ? 15 : 1.5 };

  const activations = row.ls_features?.top_acts || [];

  const logScale = scalePow()
    .exponent(2.5)
    .domain(extent(activations))
    .range([padding.left, width - padding.right]);

  // Prepare feature data
  const featuresToActivations = useMemo(() => {
    let data = row.ls_features.top_indices.map((idx, i) => ({
      feature: idx,
      activation: row.ls_features.top_acts[i],
    }));

    if (feature !== -1) {
      const nonSelected = data.filter(({ feature: feat_idx }) => feat_idx !== feature);
      const selected = data.filter(({ feature: feat_idx }) => feat_idx === feature);
      return [...nonSelected, ...selected];
    }
    return data;
  }, [row.ls_features, feature]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas DPI for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw lines
    featuresToActivations.forEach(({ feature: feat_idx, activation }, idx) => {
      const x = logScale(activation);

      ctx.beginPath();
      ctx.moveTo(x, height - padding.bottom);
      ctx.lineTo(x, padding.top);

      // Set line style based on hover/feature state
      if (hoveredIdx !== null) {
        if (idx === hoveredIdx) {
          ctx.strokeStyle = '#b87333';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
        } else {
          ctx.strokeStyle = '#ccc';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.25;
        }
      } else if (feature === -1) {
        ctx.strokeStyle = '#b87333';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
      } else if (feat_idx === feature) {
        ctx.strokeStyle = '#b87333';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
      } else {
        ctx.strokeStyle = '#f5f5f5';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
      }

      ctx.stroke();
    });

    // Draw ticks
    if (showTicks) {
      ctx.font = '8px sans-serif';
      ctx.fillStyle = '#666';
      ctx.textAlign = 'center';

      extent(activations).forEach((tick) => {
        const x = logScale(tick);
        ctx.fillText(tick.toFixed(2), x, height - padding.bottom + 10);
      });
    }
  }, [
    width,
    height,
    featuresToActivations,
    hoveredIdx,
    feature,
    logScale,
    showTicks,
    padding,
    activations,
  ]);

  // Handle mouse interactions
  const handleMouseMove = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // Find closest line
      let closestIdx = null;
      let minDistance = Infinity;

      featuresToActivations.forEach(({ activation }, idx) => {
        const lineX = logScale(activation);
        const distance = Math.abs(x - lineX);
        if (distance < minDistance && distance < 5) {
          // 5px threshold
          minDistance = distance;
          closestIdx = idx;
        }
      });

      setHoveredIdx(closestIdx);

      if (closestIdx !== null) {
        const { feature: feat_idx, activation } = featuresToActivations[closestIdx];
        const rect = canvas.getBoundingClientRect();
        const tooltipX = rect.left + logScale(activation) - padding.left;
        const tooltipY = rect.bottom + 25;

        // Update tooltip state in a single setState call
        setFeatureTooltipContent({
          content: `Feature ${feat_idx}: ${features?.[feat_idx]?.label} (${activation.toFixed(3)})`,
          x: tooltipX,
          y: tooltipY,
        });
      } else {
        setFeatureTooltipContent(null);
      }
    },
    [featuresToActivations, logScale, features, setFeatureTooltipContent, padding]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
    setFeatureTooltipContent(null);
  }, [setFeatureTooltipContent]);

  const [modalHoveredIdx, setModalHoveredIdx] = useState(null);

  return (
    <div className="feature-plot-container">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width, height }}
        data-tooltip-id="feature-tooltip"
        onClick={useCallback(() => {
          setIsModalOpen(true);
          setModalHoveredIdx(hoveredIdx);
        }, [hoveredIdx])}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      <FeatureModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        rowIndex={row.ls_index}
        hoveredIdx={modalHoveredIdx}
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

  // feature tooltip content
  const [featureTooltipContent, setFeatureTooltipContent] = useState(null);

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
        // console.log('fetching query', body, timestamp);

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
            // console.log('query fetched data', data);
            // console.log("pages", totalPages, total)
            setPageCount(totalPages);
            // console.log('======= SETTING ROWS =======', rows, timestamp);
            setRows(rows.map((row, idx) => ({ ...row, idx })));
            if (onDataTableRows) onDataTableRows(rows);
            // setRowsLoading(false);
          });
      } else {
        setRows([]);
        onDataTableRows && onDataTableRows([]);
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
            </div>
          ),
          renderCell: ({ row }) =>
            row.ls_features && (
              <FeaturePlot
                width={baseWidth}
                row={row}
                feature={feature}
                features={features}
                handleFeatureClick={handleFeatureClick}
                setFeatureTooltipContent={setFeatureTooltipContent}
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

  // console.log('==== FILTER DATA TABLE =====', { filteredIndices, defaultIndices, rows });

  return (
    <div
      className={`filter-data-table ${rowsLoading ? 'loading' : ''}`}
      // style={{ visibility: indices.length ? 'visible' : 'hidden' }}
    >
      {/* Scrollable Table Body */}
      <div className="filter-table-scrollable-body table-body" style={{ overflowY: 'auto' }}>
        <Tooltip
          id="feature-tooltip"
          place="bottom"
          effect="solid"
          content={featureTooltipContent?.content || ''}
          className="feature-tooltip"
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

        <Tooltip
          id="feature-column-info-tooltip"
          className="feature-column-info-tooltip"
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
