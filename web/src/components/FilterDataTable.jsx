import { useState, useEffect, useCallback, useMemo } from 'react';
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
  getPaginationRowModel,
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
  maxRows, 
  tagset, 
  onHover, 
  onClick, 
  onTagset
}) {


  
  const [columns, setColumns] = useState([
    {
      id: '0', 
      header: "Job Title", 
      accessorKey:"JobTitle",
      cell: info => info.getValue(),
    }
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
      let columns = dataset.columns.map((c, i) => {
        // console.log("COLUMN", c, i)
        return {
          id: ""+i,
          cell: info => info.getValue(),
          // header: () => "" + c,
          header: c,
          accessorKey: c,
          footer: props => props.column.id,
        }
      })
      setColumns(columns)
    }
    hydrateIndices(indices)
  }, [indices, dataset]) // hydrateIndicies


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
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: fuzzyFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    debugTable: true,
    debugHeaders: true,
    debugColumns: false,
  })

  // React.useEffect(() => {
  //   if (table.getState().columnFilters[0]?.id === 'fullName') {
  //     if (table.getState().sorting[0]?.id !== 'fullName') {
  //       table.setSorting([{ id: 'fullName', desc: false }])
  //     }
  //   }
  // }, [table.getState().columnFilters[0]?.id])

  return (
    <div>
      {/* <DataTable 
        data={rows} 
        tagset={tagset} 
        datasetId={dataset?.id} 
        maxRows={maxRows} 
        onTagset={onTagset} 
        onHover={onHover} 
        onClick={onClick}
        /> */}

        <table>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
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
                        {header.column.getCanFilter() ? (
                          <div>
                            <Filter column={header.column} table={table} />
                          </div>
                        ) : null}
                      </>
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => {
            return (
              <tr key={row.id}>
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