import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import PropTypes from 'prop-types';
// import DataTable from './DataTable';
import 'react-data-grid/lib/styles.css';

import DataGrid from 'react-data-grid';

const apiUrl = import.meta.env.VITE_API_URL;

import './FilterDataTable.css';

const fuzzyFilter = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value);
  // Store the itemRank info
  addMeta({
    itemRank,
  });
  // Return if the item should be filtered in/out
  return itemRank.passed;
};

const fuzzySort = (rowA, rowB, columnId) => {
  let dir = 0;
  // Only sort by rank if the column has ranking information
  if (rowA.columnFiltersMeta[columnId]) {
    dir = compareItems(
      rowA.columnFiltersMeta[columnId]?.itemRank,
      rowB.columnFiltersMeta[columnId]?.itemRank
    );
  }
  // Provide an alphanumeric fallback for when the item ranks are equal
  return dir === 0 ? sortingFns.alphanumeric(rowA, rowB, columnId) : dir;
};

const TableHeader = memo(
  ({ table, highlightColumn, columns }) => {
    return (
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                colSpan={header.colSpan}
                style={{
                  backgroundColor:
                    header.column.columnDef.accessorKey === highlightColumn ? '#d3d3d3' : '',
                }}
              >
                {header.isPlaceholder ? null : (
                  <div
                    className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                      asc: ' 🔼',
                      desc: ' 🔽',
                    }[header.column.getIsSorted()] ?? null}
                  </div>
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.highlightColumn === nextProps.highlightColumn &&
      prevProps.columns === nextProps.columns
    );
  }
);
TableHeader.displayName = 'TableHeader';

// Memoized TableCell component
const TableCell = memo(({ cell }) => {
  return <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>;
});
TableCell.displayName = 'TableCell';

const renderTags = (tags, row, tagset, handleTagClick) => {
  const { ls_index } = row;
  return (
    <div className="tags">
      {tags.map((t) => {
        let ti = tagset[t]?.indexOf(ls_index) >= 0;
        return (
          <button
            title={`add ${t} tag`}
            className={ti ? 'tag-active' : 'tag-inactive'}
            key={t}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleTagClick(t, ls_index);
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
};

FilterDataTable.propTypes = {
  height: PropTypes.string,
  dataset: PropTypes.object.isRequired,
  scope: PropTypes.object,
  indices: PropTypes.array.isRequired,
  distances: PropTypes.array,
  clusterMap: PropTypes.object,
  clusterLabels: PropTypes.array,
  tagset: PropTypes.object,
  onTagset: PropTypes.func,
  onScope: PropTypes.func,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
};

const ROWS_PER_PAGE = 100;

function FilterDataTable({
  height,
  dataset,
  scope,
  indices = [],
  distances = [],
  clusterMap = {},
  clusterLabels,
  tagset,
  showEmbeddings = null,
  showDifference = null,
  showNavigation = true,
  sae_id = null,
  feature = -1,
  onTagset,
  onScope,
  onHover,
  onClick,
  deletedIndices = [],
}) {
  const lsIndexCol = '0';

  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  // add a pageIndices state

  // const highlightColumn = useMemo(() => dataset?.text_column, [dataset])
  const [highlightColumn, setHighlightColumn] = useState(null);
  useEffect(() => {
    console.log('changed?', dataset);
    setHighlightColumn(dataset?.text_column || null);
  }, [dataset]);

  const [tags, setTags] = useState([]);
  useEffect(() => {
    if (tagset) {
      setTags(Object.keys(tagset));
    }
  }, [tagset]);

  const [embeddingMinValues, setEmbeddingMinValues] = useState([]);
  const [embeddingMaxValues, setEmbeddingMaxValues] = useState([]);
  useEffect(() => {
    if (dataset && showEmbeddings) {
      fetch(`${apiUrl}/datasets/${dataset.id}/embeddings/${showEmbeddings}`)
        .then((response) => response.json())
        .then((data) => {
          console.log('embedding stats', data);
          setEmbeddingMinValues(data.min_values);
          setEmbeddingMaxValues(data.max_values);
        });
    }
  }, [dataset, showEmbeddings]);

  function handleTagClick(tag, index) {
    // console.log("tag", tag)
    // console.log("index", index)
    // console.log("tagset", tagset)
    // console.log("tagset[tag]", tagset[tag])
    if (tagset[tag].includes(index)) {
      console.log('removing');
      fetch(`${apiUrl}/tags/remove?dataset=${dataset?.id}&tag=${tag}&index=${index}`)
        .then((response) => response.json())
        .then((data) => {
          console.log('removed', data);
          onTagset();
        });
    } else {
      console.log('adding');
      fetch(`${apiUrl}/tags/add?dataset=${dataset?.id}&tag=${tag}&index=${index}`)
        .then((response) => response.json())
        .then((data) => {
          console.log('added', data);
          onTagset();
        });
    }
  }

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
            page: currentPage,
            sae_id: sae_id,
          }),
        })
          .then((response) => response.json())
          .then((data) => {
            let { rows, totalPages, total } = data;
            console.log('query fetched data', data);
            // console.log("pages", totalPages, total)
            setPageCount(totalPages);

            if (Object.keys(clusterMap).length) {
              rows.forEach((r) => {
                let ri = r['ls_index'];
                let cluster = clusterMap[ri];
                if (cluster) {
                  r['ls_cluster'] = cluster;
                }
              });
            }

            if (distances && distances.length) {
              rows.forEach((r) => {
                let ri = r['ls_index'];
                r['ls_similarity'] = distances[ri];
              });
            }
            console.log('======= SETTING ROWS =======', rows);
            setRows(rows);
          });
      } else {
        setRows([]);
      }
    },
    [dataset, distances, clusterMap, currentPage, showEmbeddings, sae_id]
  );

  const formattedColumns = useMemo(() => {
    let columns = ['ls_index'];
    if (distances && distances.length) columns.push('ls_similarity');
    if (showEmbeddings) columns.push('ls_embedding');
    if (sae_id) columns.push('ls_features');
    if (clusterMap && Object.keys(clusterMap).length) columns.push('ls_cluster');
    if (tagset && Object.keys(tagset).length) columns.push('tags');

    columns.push(dataset.text_column);
    columns = columns.concat(dataset.columns.filter((d) => d !== dataset.text_column));

    let columnDefs = columns.map((col) => {
      const metadata = dataset.column_metadata ? dataset.column_metadata[col] : null;

      const baseCol = {
        key: col,
        name: col,
        resizable: true,
      };

      if (col === 'tags') {
        return {
          ...baseCol,
          width: 100,
          renderCell: ({ row }) => renderTags(tags, row, tagset, handleTagClick),
        };
      }

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
          width: 250,
          renderCell({ row, onRowChange }) {
            const { ls_index, ls_cluster } = row;
            return (
              <select
                value={ls_cluster?.cluster}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
                onChange={(event) => {
                  event.stopPropagation();
                  event.preventDefault();

                  fetch(`${apiUrl}/bulk/change-cluster`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      dataset_id: dataset.id,
                      scope_id: scope.id,
                      row_ids: [ls_index],
                      new_cluster: event.target.value,
                    }),
                  })
                    .then((response) => response.json())
                    .then((data) => {
                      onScope();
                    });
                  onRowChange({ ...row, cluster: event.target.value }, true);
                }}
              >
                {clusterLabels.map((c, i) => (
                  <option key={i} value={c.cluster}>
                    {c.cluster}: {c.label}
                  </option>
                ))}
              </select>
            );
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
          renderCell: ({ row }) => {
            let featIdx = 0;
            if (feature >= 0) {
              featIdx = row.ls_features.top_indices.findIndex((i) => i === feature);
            }
            return (
              <div>
                {row.ls_features.top_acts?.[featIdx]?.toFixed(3)} (
                {row.ls_features.top_indices?.[featIdx]})
              </div>
            );
          },
        };
      }

      const renderCell = ({ row }) => {
        if (typeof row[col] === 'object') {
          return <span>{JSON.stringify(row[col])}</span>;
        }
        if (col === 'ls_similarity' && row[col]) {
          return <span>{parseFloat(row[col]).toFixed(4)}</span>;
        }

        return <span title={row[col]}>{row[col]}</span>;
      };

      return {
        ...baseCol,
        renderCell,
      };
    });
    return columnDefs;
  }, [dataset.columns, tags, tagset]);

  useEffect(() => {
    setColumns(formattedColumns);
  }, [formattedColumns]);

  useEffect(() => {
    const indicesToUse = indices.filter((i) => !deletedIndices.includes(i));
    hydrateIndices(indicesToUse);
  }, [indices, currentPage]);

  console.log('======= rerendering =======');

  // useEffect(() => {
  //   if (dataset) {
  //     // adapt this to use react-data-grid
  //     // https://github.com/adazzle/react-data-grid
  //     console.log({ columns: dataset.columns });

  //     console.log('======= SETTING COLUMNS =======');
  //     let columns = ['ls_index'];
  //     if (distances && distances.length) columns.push('ls_similarity');
  //     if (showEmbeddings) columns.push('ls_embedding');
  //     if (sae_id) columns.push('ls_features');
  //     if (clusterMap && Object.keys(clusterMap).length) columns.push('ls_cluster');
  //     if (tagset && Object.keys(tagset).length) columns.push('tags');
  //     columns.push(dataset.text_column);
  //     columns = columns.concat(dataset.columns.filter((d) => d !== dataset.text_column));
  //     let columnDefs = columns.map((c, i) => {
  //       // if (c === "selection") {
  //       //   return {
  //       //     id: "selection",
  //       //     header: ({ table }) => (
  //       //       <input
  //       //         type="checkbox"
  //       //         // Check if we have any rows and if the number of selected rows equals total rows
  //       //         checked={table.getIsAllRowsSelected()}
  //       //         indeterminate={table.getIsSomeRowsSelected()}
  //       //         onChange={table.getToggleAllRowsSelectedHandler()}
  //       //       />
  //       //     ),
  //       //     cell: ({ row }) => (
  //       //       <input
  //       //         type="checkbox"
  //       //         checked={row.getIsSelected()}
  //       //         disabled={!row.getCanSelect()}
  //       //         onChange={row.getToggleSelectedHandler()}
  //       //       />
  //       //     ),
  //       //     enableSorting: false,
  //       //   }
  //       // }
  //       const metadata = dataset.column_metadata ? dataset.column_metadata[c] : null;
  //       // console.log("COLUMN", c, metadata)
  //       return {
  //         id: '' + i,
  //         cell: (info) => {
  //           const value = info.getValue();
  //           let val = value;
  //           let idx = info.row.getValue(lsIndexCol);
  //           // If metadata specifies image, render as an image tag
  //           if (metadata?.image) {
  //             return (
  //               <a href={value} target="_blank" rel="noreferrer">
  //                 <img src={value} alt="" style={{ height: '100px' }} />
  //               </a>
  //             );
  //           }
  //           // If metadata specifies URL, render as a link
  //           else if (metadata?.url) {
  //             return (
  //               <a href={value} target="_blank" rel="noopener noreferrer">
  //                 url
  //               </a>
  //             );
  //           }
  //           // If type is "array", display the array's length
  //           else if (metadata?.type === 'array') {
  //             val = Array.isArray(value) ? `[${value.length}]` : '';
  //           } else if (typeof value === 'object') {
  //             val = JSON.stringify(value);
  //           } else if (c === 'ls_similarity' && val) {
  //             val = parseFloat(val).toFixed(4);
  //           }
  //           // if (c === 'tags') {
  //           //   return (

  //           //     {renderTags(tags, idx)}
  //           //   );
  //           // }
  //           if (c === 'ls_cluster') {
  //             return (
  //               <div
  //                 className="ls-cluster"
  //                 onClick={(e) => {
  //                   e.stopPropagation();
  //                   e.preventDefault();
  //                 }}
  //               >
  //                 {scope ? (
  //                   <select
  //                     value={value?.cluster}
  //                     onChange={(e) => {
  //                       e.stopPropagation();
  //                       e.preventDefault();
  //                       console.log('was cluster', value);
  //                       console.log('updating to cluster', e.target.value);
  //                       fetch(`${apiUrl}/bulk/change-cluster`, {
  //                         method: 'POST',
  //                         headers: {
  //                           'Content-Type': 'application/json',
  //                         },
  //                         body: JSON.stringify({
  //                           dataset_id: dataset.id,
  //                           scope_id: scope.id,
  //                           row_ids: [idx],
  //                           new_cluster: e.target.value,
  //                         }),
  //                       })
  //                         .then((response) => response.json())
  //                         .then((data) => {
  //                           onScope();
  //                         });
  //                     }}
  //                   >
  //                     {clusterLabels.map((c, i) => {
  //                       return (
  //                         <option key={i} value={c.cluster}>
  //                           {c.cluster}: {c.label}
  //                         </option>
  //                       );
  //                     })}
  //                   </select>
  //                 ) : (
  //                   <span>{value}</span>
  //                 )}
  //               </div>
  //             );
  //             // return <span>{value.cluster}: {value.label}</span>
  //           }
  //           if (c === 'ls_embedding') {
  //             return (
  //               <div>
  //                 {showDifference ? (
  //                   <EmbeddingVis
  //                     embedding={value}
  //                     minValues={embeddingMinValues}
  //                     maxValues={embeddingMaxValues}
  //                     height={64}
  //                     spacing={0}
  //                     difference={showDifference}
  //                   />
  //                 ) : (
  //                   <EmbeddingVis
  //                     embedding={value}
  //                     minValues={embeddingMinValues}
  //                     maxValues={embeddingMaxValues}
  //                     height={64}
  //                     spacing={0}
  //                   />
  //                 )}
  //               </div>
  //             );
  //           }
  //           if (c === 'ls_features') {
  //             let featIdx = 0;
  //             if (feature >= 0) {
  //               featIdx = value.top_indices.findIndex((i) => i === feature);
  //             }
  //             return (
  //               <div>
  //                 {value.top_acts?.[featIdx]?.toFixed(3)} ({value.top_indices?.[featIdx]})
  //               </div>
  //             );
  //           }

  //           // Default text rendering
  //           return (
  //             <div
  //               style={{
  //                 display: '-webkit-box',
  //                 WebkitBoxOrient: 'vertical',
  //                 WebkitLineClamp: 3,
  //                 overflow: 'hidden',
  //                 maxWidth: c == dataset.text_column ? '480px' : '200px',
  //                 width: c == dataset.text_column ? '480px' : '',
  //                 fontWeight: c == dataset.text_column ? '300' : '',
  //                 // maxHeight: '3em',
  //                 textOverflow: 'ellipsis',
  //                 whiteSpace: 'normal',
  //               }}
  //               title={val?.toString() || ''} // Shows the full text on hover
  //               onClick={() => navigator.clipboard.writeText(val)} // Copies the text to clipboard on click
  //             >
  //               {val}
  //             </div>
  //           );
  //         },
  //         header: c,
  //         accessorKey: c,
  //         footer: (props) => props.column.id,
  //       };
  //     });
  //     // console.log("COLUMNS", columns, columnDefs)
  //     setColumns(columnDefs);
  //   }
  //   hydrateIndices(indices);
  // }, [
  //   dataset,
  //   indices,
  //   distances,
  //   tags,
  //   scope,
  //   tagset,
  //   currentPage,
  //   clusterMap,
  //   clusterLabels,
  //   showEmbeddings,
  //   embeddingMinValues,
  //   embeddingMaxValues,
  //   showDifference,
  // ]);

  const [columnFilters, setColumnFilters] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // const tableData = useMemo(() => rows.slice(0, 100), [rows]);
  // React.useEffect(() => {
  //   if (table.getState().columnFilters[0]?.id === 'fullName') {
  //     if (table.getState().sorting[0]?.id !== 'fullName') {
  //       table.setSorting([{ id: 'fullName', desc: false }])
  //     }
  //   }
  // }, [table.getState().columnFilters[0]?.id])

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

  return (
    <div
      className="filter-data-table"
      style={{ height: height, visibility: indices.length ? 'visible' : 'hidden' }}
    >
      {/* Scrollable Table Body */}
      <div
        className="filter-table-scrollable-body table-body"
        style={{ flexGrow: 1, overflowY: 'auto' }}
        ref={bodyRef}
      >
        <DataGrid rows={rows} columns={formattedColumns} rowGetter={(i) => rows[i]} />
      </div>
      {showNavigation && (
        <div className="filter-data-table-page-controls">
          <button onClick={() => setCurrentPage(0)} disabled={currentPage === 0}>
            First
          </button>
          <button
            onClick={() => setCurrentPage((old) => Math.max(0, old - 1))}
            disabled={currentPage === 0}
          >
            ←
          </button>
          <span>
            Page {currentPage + 1} of {pageCount || 1}
          </span>
          <button
            onClick={() => setCurrentPage((old) => Math.min(pageCount - 1, old + 1))}
            disabled={currentPage === pageCount - 1}
          >
            →
          </button>
          <button
            onClick={() => setCurrentPage(pageCount - 1)}
            disabled={currentPage === pageCount - 1}
          >
            Last
          </button>
        </div>
      )}
    </div>
  );
}
export default FilterDataTable;
