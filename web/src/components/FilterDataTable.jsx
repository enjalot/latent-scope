import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
// import DataTable from './DataTable';
const apiUrl = import.meta.env.VITE_API_URL

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
  dataset: PropTypes.object.isRequired,
  indices: PropTypes.array.isRequired,
  distances: PropTypes.array,
  clusterIndices: PropTypes.array,
  clusterLabels: PropTypes.array,
  height: PropTypes.string,
  maxRows: PropTypes.number,
  tagset: PropTypes.object,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
  onTagset: PropTypes.func,
};

function FilterDataTable({
  dataset,
  indices = [], 
  distances = [], 
  clusterIndices = [], 
  clusterLabels = [], 
  height="calc(100% - 40px)",
  maxRows, 
  tagset, 
  onHover, 
  onClick, 
  onTagset
}) {


  
  const [columns, setColumns] = useState([

  ])
  const [rows, setRows] = useState([]);
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)

  const hydrateIndices = useCallback((indices) => {
    console.log("hydrate!", dataset)
    if(dataset) {
      console.log("fetching query", dataset)
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
        console.log("rows", rows)
        console.log("pages", totalPages, total)
        setPageCount(totalPages)

        if(clusterIndices.length && clusterLabels.length) {
          rows.forEach(r => {
            let ri = r["ls_index"]
            let cli = clusterIndices[ri]
            let cluster = clusterLabels[cli]?.cluster
            r["ls_cluster"] = cluster?.label
          })
        }
        if(distances && distances.length) {
          rows.forEach(r => {
            let ri = r["ls_index"]
            r["ls_distance"] = distances[ri]
          })
        }

        // if(rows.length) {
        //   let columns = Object.keys(rows[0]).map((c, i) => {
        //     // console.log("COLUMN", c, i)
        //     return {
        //       id: ""+i,
        //       cell: info => info.getValue(),
        //       // header: () => "" + c,
        //       header: c,
        //       accessorKey: c,
        //       footer: props => props.column.id,
        //     }
        //   })
        //   console.log("COLUMNS", columns)
        //   setColumns(columns)
        // }
        setRows(rows)
      })
    }
  }, [dataset, distances, clusterIndices, clusterLabels, currentPage])

  useEffect(() => {
    console.log("refetching hydrate", indices, dataset)
    if(dataset) {
      let columns = ["ls_index"].concat(dataset.columns).map((c, i) => {
      // let columns = dataset.columns.map((c, i) => {
        const metadata = dataset.column_metadata ? dataset.column_metadata[c] : null;
        console.log("COLUMN", c, metadata)
        return {
          id: ""+i,
          cell: info => {
            const value = info.getValue();
            let val = value;
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
      setColumns(columns)
    }
    hydrateIndices(indices)
  }, [indices, dataset, currentPage]) // hydrateIndicies


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
  };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: height }}>
      {/* Fixed Header */}
      <div style={{ flexShrink: 0, paddingRight: `${scrollbarWidth}px`}} ref={headerRef}>
        <table>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id} style={{ 
              backgroundColor: '#f9f9f9', 
              }}>
              {headerGroup.headers.map(header => {
                return (
                  <th key={header.id} colSpan={header.colSpan} style={{ textAlign: 'left', paddingLeft: '6px' }}>
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
                    <td key={cell.id} style={{
                      padding: '6px',
                      borderBottom: '1px solid #eee'
                    }}>
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
      <div style={{ flexGrow: 1, overflowY: 'auto' }} className="table-body" ref={bodyRef}>
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
              <tr key={row.id} style={{ 
                // backgroundColor: '#f9f9f9', 
                }}>
                {row.getVisibleCells().map(cell => {
                  return (
                    <td key={cell.id} style={{
                      padding: '6px',
                      borderBottom: '1px solid #eee'
                    }}>
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
      <div style={{ flexShrink: 0, marginTop: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <button onClick={() => setCurrentPage(0)} disabled={currentPage === 0}>
          First
        </button>
        <button onClick={() => setCurrentPage(old => Math.max(0, old - 1))} disabled={currentPage === 0}>
          Previous
        </button>
        <span>
          Page {currentPage + 1} of {pageCount}
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

Filter.propTypes = {
  column: PropTypes.object.isRequired,
  table: PropTypes.object.isRequired,
};

function Filter({ column, table }) {
  const firstValue = table
    .getPreFilteredRowModel()
    .flatRows[0]?.getValue(column.id);
  const columnFilterValue = column.getFilterValue();
  const sortedUniqueValues = useMemo(
    () =>
      typeof firstValue === 'number'
        ? []
        : Array.from(column.getFacetedUniqueValues().keys()).sort(),
    [column.getFacetedUniqueValues()]
  );

  return typeof firstValue === 'number' ? (
    <div>
      <div className="flex space-x-2">
        <DebouncedInput
          type="number"
          min={Number(column.getFacetedMinMaxValues()?.[0] ?? '')}
          max={Number(column.getFacetedMinMaxValues()?.[1] ?? '')}
          value={(columnFilterValue || [])[0] ?? ''}
          onChange={(value) =>
            column.setFilterValue((old = []) => [value, old[1]])
          }
          placeholder={`Min ${
            column.getFacetedMinMaxValues()?.[0]
              ? `(${column.getFacetedMinMaxValues()?.[0]})`
              : ''
          }`}
          className="w-24 border shadow rounded"
        />
        <DebouncedInput
          type="number"
          min={Number(column.getFacetedMinMaxValues()?.[0] ?? '')}
          max={Number(column.getFacetedMinMaxValues()?.[1] ?? '')}
          value={(columnFilterValue || [])[1] ?? ''}
          onChange={(value) =>
            column.setFilterValue((old = []) => [old[0], value])
          }
          placeholder={`Max ${
            column.getFacetedMinMaxValues()?.[1]
              ? `(${column.getFacetedMinMaxValues()?.[1]})`
              : ''
          }`}
          className="w-24 border shadow rounded"
        />
      </div>
      <div className="h-1" />
    </div>
  ) : (
    <>
      <datalist id={column.id + 'list'}>
        {sortedUniqueValues.slice(0, 5000).map((value) => (
          <option value={value} key={value} />
        ))}
      </datalist>
      <DebouncedInput
        type="text"
        value={(columnFilterValue ?? '') + ''}
        onChange={(value) => column.setFilterValue(value)}
        placeholder={`Search... (${column.getFacetedUniqueValues().size})`}
        className="w-36 border shadow rounded"
        list={column.id + 'list'}
      />
      <div className="h-1" />
    </>
  );
}


// A debounced input react component
DebouncedInput.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  debounce: PropTypes.number,
  // This is a catch-all for any other props not explicitly defined above but passed to <input />
  // It's important for flexibility and usability of the DebouncedInput component in various contexts.
  props: PropTypes.object
};

function DebouncedInput({
  value: initialValue,
  onChange,
  debounce = 500,
  ...props
}) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(value)
    }, debounce)

    return () => clearTimeout(timeout)
  }, [value])

  return (
    <input {...props} value={value} onChange={e => setValue(e.target.value)} />
  )
}