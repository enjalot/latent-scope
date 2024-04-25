import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
// import DataTable from './DataTable';
const apiUrl = import.meta.env.VITE_API_URL

import './FilterDataTable.css'

import {
//   Column,
//   ColumnFiltersState,
//   FilterFn,
//   SortingFn,
  // Table,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  // getPaginationRowModel,
  getSortedRowModel,
  sortingFns,
  useReactTable,
} from '@tanstack/react-table'

import {
  rankItem,
  compareItems,
} from '@tanstack/match-sorter-utils'


const fuzzyFilter = (row, columnId, value, addMeta) => {
  // Rank the item
  const itemRank = rankItem(row.getValue(columnId), value)
  // Store the itemRank info
  addMeta({
    itemRank,
  })
  // Return if the item should be filtered in/out
  return itemRank.passed
}

const fuzzySort = (rowA, rowB, columnId) => {
  let dir = 0
  // Only sort by rank if the column has ranking information
  if (rowA.columnFiltersMeta[columnId]) {
    dir = compareItems(
      rowA.columnFiltersMeta[columnId]?.itemRank,
      rowB.columnFiltersMeta[columnId]?.itemRank
    )
  }
  // Provide an alphanumeric fallback for when the item ranks are equal
  return dir === 0 ? sortingFns.alphanumeric(rowA, rowB, columnId) : dir
}



FilterDataTable.propTypes = {
  height: PropTypes.string,
  dataset: PropTypes.object.isRequired,
  scope: PropTypes.object.isRequired,
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

function FilterDataTable({
  height="calc(100% - 40px)",
  dataset,
  scope,
  indices = [], 
  distances = [], 
  clusterMap = {},
  // clusterIndices = [], 
  clusterLabels, 
  tagset,
  onTagset,
  onScope,
  onHover, 
  onClick, 
}) {


  
  const [columns, setColumns] = useState([

  ])
  const [rows, setRows] = useState([]);
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)

  const [tags, setTags] = useState([])
  useEffect(() => {
    if(tagset){
      setTags(Object.keys(tagset))
    }
  }, [tagset])

  function handleTagClick(tag, index) {
    // console.log("tag", tag)
    // console.log("index", index)
    // console.log("tagset", tagset)
    // console.log("tagset[tag]", tagset[tag])
    if(tagset[tag].includes(index)) {
      console.log("removing")
      fetch(`${apiUrl}/tags/remove?dataset=${dataset?.id}&tag=${tag}&index=${index}`)
        .then(response => response.json())
        .then(data => {
          console.log("removed", data)
          onTagset();
        });
    } else {
      console.log("adding")
      fetch(`${apiUrl}/tags/add?dataset=${dataset?.id}&tag=${tag}&index=${index}`)
        .then(response => response.json())
        .then(data => {
          console.log("added", data)
          onTagset();
        });
    }
  }

  const hydrateIndices = useCallback((indices) => {
    // console.log("hydrate!", dataset)
    if(dataset && indices.length) {
      // console.log("fetching query", dataset)
      fetch(`${apiUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          dataset: dataset.id, 
          indices: indices, 
          page: currentPage 
        }),
      })
      .then(response => response.json())
      .then(data => {
        let { rows, totalPages, total } = data;
        // console.log("rows", rows)
        // console.log("pages", totalPages, total)
        setPageCount(totalPages)

        if(Object.keys(clusterMap).length){
          rows.forEach(r => {
            let ri = r["ls_index"]
            let cluster = clusterMap[ri]
            if(cluster) {
              r["ls_cluster"] = cluster
            }
          })
        }

        if(distances && distances.length) {
          rows.forEach(r => {
            let ri = r["ls_index"]
            r["ls_distance"] = distances[ri]
          })
        }

        setRows(rows)
      })
    } else {
      setRows([])
    }
  }, [dataset, distances, clusterMap, currentPage])

  useEffect(() => {
    if(dataset) {
      // console.log("refetching hydrate", indices, dataset)
      // console.log("Tagset", tagset)
      let columns = ["ls_index"]
      if(scope) columns.push("ls_cluster")
      if(tagset && Object.keys(tagset).length) columns.push("tags")
      columns.push(dataset.text_column)
      columns = columns.concat(dataset.columns.filter(d => d !== dataset.text_column))
      let columnDefs = columns.map((c, i) => {
      // let columns = dataset.columns.map((c, i) => {
        const metadata = dataset.column_metadata ? dataset.column_metadata[c] : null;
        // console.log("COLUMN", c, metadata)
        return {
          id: ""+i,
          cell: info => {
            const value = info.getValue();
            let val = value;
            let idx = info.row.getValue("0")
            // If metadata specifies image, render as an image tag
            if (metadata?.image) {
              return <a href={value} target="_blank" rel="noreferrer"><img src={value} alt="" style={{ height: '100px' }} /></a>;
            }
            // If metadata specifies URL, render as a link
            else if (metadata?.url) {
              return <a href={value} target="_blank" rel="noopener noreferrer">url</a>;
            }
            // If type is "array", display the array's length
            else if (metadata?.type === "array") {
              val = Array.isArray(value) ? `[${value.length}]` : '';
            } 
            else if (typeof value === "object") {
              val = JSON.stringify(value)
            }
            if(c === "tags") {
              
              return <div className="tags">
                {tags.map(t => {
                  let ti = tagset[t]?.indexOf(idx) >= 0
                  // console.log(t, ti, idx)
                  return <button className={ti ? 'tag-active' : 'tag-inactive'} key={t} onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleTagClick(t, idx)
                  }}>{t}</button>
                })}
              </div>
            }
            if(c === "ls_cluster") {
              return <div className="ls-cluster" onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                
              }}>
                <select value={value?.cluster} onChange={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  console.log("was cluster", value)
                  console.log("updating to cluster", e.target.value)
                  fetch(`${apiUrl}/bulk/change-cluster`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                      dataset_id: dataset.id,
                      scope_id: scope.id,
                      row_ids: [idx],
                      new_cluster: e.target.value
                    }),
                  })
                  .then(response => response.json())
                  .then(data => {
                    onScope();
                  });
                }}>
                  {clusterLabels.map((c,i) => {
                    return <option key={i} value={c.cluster}>{c.cluster}: {c.label}</option>
                  })}
                </select>
              </div>
              // return <span>{value.cluster}: {value.label}</span>
            }
            // Default text rendering
            return <div
            style={{
              // maxWidth: c == dataset.text_column ? '640px' : '200px', 
              // maxHeight: '64px', 
              // height: '64px',
              // overflow: 'hidden',
              // textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3, // Adjust the number of lines you want to show before truncating
              overflow: 'hidden',
              maxWidth: c === dataset.text_column ? '640px' : '200px',
              // maxHeight: '3em',
              textOverflow: 'ellipsis',
              whiteSpace: 'normal',
            }}
            title={val} // Shows the full text on hover
            onClick={() => navigator.clipboard.writeText(val)} // Copies the text to clipboard on click
          >
            {val}
          </div> 
          },
          header: c,
          accessorKey: c,
          footer: props => props.column.id,
        }
      })
      // console.log("COLUMNS", columns, columnDefs)
      setColumns(columnDefs)
    }
    hydrateIndices(indices)
  // }, [ indices, dataset, scope, tagset, tags, currentPage, clusterLabels]) // hydrateIndicies
  }, [dataset, indices, tags, scope, tagset, currentPage, clusterLabels])


  const [columnFilters, setColumnFilters] = useState([])
  const [globalFilter, setGlobalFilter] = useState('')


  const table = useReactTable({
    data: rows,
    columns,
    filterFns: {
      fuzzy: fuzzyFilter,
    },
    state: {
      columnFilters,
      globalFilter,
      // pagination: {
      //   pageSize: 100,
      // },
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    debugTable: false,
    debugHeaders: false,
    debugColumns: false,
  })

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
    const resizeObserver = new ResizeObserver(entries => {
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
    <div className="filter-data-table" style={{  height: height, visibility: indices.length ? 'visible' : 'hidden' }}>
      {/* Fixed Header */}
      <div className="filter-data-table-fixed-header" style={{ flexShrink: 0, paddingRight: `${scrollbarWidth}px`}} ref={headerRef}>
        <table>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id} style={{ 
              backgroundColor: '#f9f9f9', 
              }}>
              {headerGroup.headers.map(header => {
                return (
                  <th key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : (
                      <>
                        <div
                          {...{
                            className: header.column.getCanSort()
                              ? 'cursor-pointer select-none'
                              : '',
                            onClick: header.column.getToggleSortingHandler(),
                          }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {{
                            asc: ' 🔼',
                            desc: ' 🔽',
                          }[header.column.getIsSorted()] ?? null}
                        </div>
                        {/* {header.column.getCanFilter() ? (
                          <div>
                            <Filter column={header.column} table={table} />
                          </div>
                        ) : null} */}
                      </>
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {/* the hidden table body to make sure header rows are proper size */}
          {table.getRowModel().rows.map(row => {
            return (
              <tr key={row.id} style={{  visibility: 'collapse' }}>
                {row.getVisibleCells().map(cell => {
                  return (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      {/* Scrollable Table Body */}
      <div className="filter-table-scrollable-body table-body" style={{ flexGrow: 1, overflowY: 'auto' }} ref={bodyRef}>
        <table style={{width: '100%'}}>
        <thead style={{ visibility: 'collapse' }}>
          {/* Invisible header mimicking the real header for column width synchronization */}
          <tr>
            {columns.map((column, index) => (
              <th key={index} style={{ textAlign: 'left', paddingLeft: '6px' }}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => {
            return (
              <tr key={row.id}
                onMouseEnter={() => {
                  onHover && onHover(row.getValue("0")) 
                }}
                onClick={() => onClick && onClick(row.getValue("0"))}
                >
                {row.getVisibleCells().map(cell => {
                  return (
                    <td key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      <div className="filter-data-table-page-controls">
        <button onClick={() => setCurrentPage(0)} disabled={currentPage === 0}>
          First
        </button>
        <button onClick={() => setCurrentPage(old => Math.max(0, old - 1))} disabled={currentPage === 0}>
          Previous
        </button>
        <span>
          Page {currentPage + 1} of {pageCount || 1}
        </span>
        <button onClick={() => setCurrentPage(old => Math.min(pageCount - 1, old + 1))} disabled={currentPage === pageCount - 1}>
          Next
        </button>
        <button onClick={() => setCurrentPage(pageCount - 1)} disabled={currentPage === pageCount - 1}>
          Last
        </button>
      </div>
    </div>
  )
}
export default FilterDataTable;
