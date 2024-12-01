import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Button } from 'react-element-forge';
import PropTypes from 'prop-types';
// import DataTable from './DataTable';
import 'react-data-grid/lib/styles.css';

import DataGrid, { Row } from 'react-data-grid';

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
            setRows(rows);
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
        return {
          ...baseCol,
          width: expandedFeatureRows.size > 0 ? 400 : 200, // dynamic width
          renderCell: ({ row }) => {
            const isExpanded = expandedFeatureRows.has(row.ls_index);
            const topN = isExpanded ? 10 : 1;

            return (
              <div
                className={`feature-cell ${isExpanded ? 'expanded' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                {isExpanded ? (
                  <>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedFeatureRows((prev) => {
                          const next = new Set(prev);
                          next.delete(row.ls_index);
                          return next;
                        });
                      }}
                      size="small"
                      color="secondary"
                      variant="solid"
                      icon="minimize"
                    />
                    <div>
                      {row.ls_features.top_indices.map((featIdx, i) => (
                        <div
                          key={i}
                          style={{ fontWeight: featIdx === feature ? 'bold' : 'normal' }}
                        >
                          {featIdx}: {features?.[featIdx]?.label} (
                          {row.ls_features.top_acts?.[i]?.toFixed(3)})
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log('expanding', row.ls_index);
                      setExpandedFeatureRows((prev) => {
                        const next = new Set(prev);
                        next.add(row.ls_index);
                        return next;
                      });
                    }}
                  >
                    {feature >= 0 ? (
                      <>
                        {feature}: {!!features?.length && features[feature]?.label} (
                        {row.ls_features.top_acts?.[
                          row.ls_features?.top_indices?.indexOf(feature)
                        ]?.toFixed(3)}
                        )
                      </>
                    ) : (
                      <>
                        {row.ls_features.top_indices[0]}:{' '}
                        {!!features?.length && features[row.ls_features.top_indices[0]]?.label} (
                        {row.ls_features.top_acts?.[0]?.toFixed(3)})
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          },
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

  const headerRef = useRef(null);
  const bodyRef = useRef(null);

  const [scrollbarWidth, setScrollbarWidth] = useState(0);

  const calculateScrollbarWidth = () => {
    if (bodyRef.current) {
      const width = bodyRef.current.offsetWidth - bodyRef.current.clientWidth;
      setScrollbarWidth(width);
    }
  };

  // these useEffects seem janky. I want to have the table body scroll independently in Y but not in X
  useEffect(() => {
    calculateScrollbarWidth();
    // Recalculate on window resize
    window.addEventListener('resize', calculateScrollbarWidth);

    // Adjust header width to match body's scrollWidth
    const adjustHeaderWidth = () => {
      if (headerRef.current && bodyRef.current) {
        const bodyScrollWidth = bodyRef.current.scrollWidth;
        headerRef.current.querySelector('table').style.width = `${bodyScrollWidth}px`;
        headerRef.current.style.overflowX = 'hidden'; // Hide horizontal overflow
      }
    };

    // Call it initially and whenever the window resizes
    adjustHeaderWidth();
    window.addEventListener('resize', adjustHeaderWidth);
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === bodyRef.current) {
          adjustHeaderWidth();
        }
      }
    });

    if (bodyRef.current) {
      resizeObserver.observe(bodyRef.current);
    }

    // Start: Code to synchronize horizontal scroll
    const syncHorizontalScroll = () => {
      if (headerRef.current && bodyRef.current) {
        headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
      }
    };

    const bodyEl = bodyRef.current;
    bodyEl.addEventListener('scroll', syncHorizontalScroll);

    // End: Code to synchronize horizontal scroll

    return () => {
      window.removeEventListener('resize', calculateScrollbarWidth);
      window.removeEventListener('resize', adjustHeaderWidth);
      // Clean up the scroll listener
      bodyEl.removeEventListener('scroll', syncHorizontalScroll);
      resizeObserver.disconnect();
    };
  }, []);

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
      <div
        className="filter-table-scrollable-body table-body"
        style={{ overflowY: 'auto' }}
        ref={bodyRef}
      >
        <DataGrid
          rows={rows}
          columns={formattedColumns}
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
