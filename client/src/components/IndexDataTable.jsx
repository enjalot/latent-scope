import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import DataTable from './DataTable';

IndexDataTable.propTypes = {
  dataset: PropTypes.object.isRequired,
  indices: PropTypes.array.isRequired,
  distances: PropTypes.array,
  maxRows: PropTypes.number,
  tagset: PropTypes.object,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
  onTagset: PropTypes.func,
};

function IndexDataTable({dataset, indices, distances = [], maxRows, tagset, onHover, onClick, onTagset}) {

  const [rows, setRows] = useState([]);
  const hydrateIndices = useCallback((indices) => {
    if(dataset)
      fetch(`http://localhost:5001/indexed?dataset=${dataset.id}&indices=${JSON.stringify(indices)}`)
        .then(response => response.json())
        .then(data => {
          let rows = data.map((row, index) => {
            let ret = {
              index: indices[index],
              ...row
            }
            if(distances && distances.length)
              ret['distance'] = distances[index]
            return ret
          })
          // TODO dataset.sort_column
          // rows.sort((a, b) => b.score - a.score)
          setRows(rows)
          // console.log("rows", rows)
        })
  }, [dataset, setRows, distances])

  useEffect(() => {
    if(indices && indices.length)
      hydrateIndices(indices)
  }, [indices, hydrateIndices])

  return (
    <div>
      <DataTable 
        data={rows} 
        tagset={tagset} 
        datasetId={dataset?.id} 
        maxRows={maxRows} 
        onTagset={onTagset} 
        onHover={onHover} 
        onClick={onClick}
        />
    </div>
  )
}
export default IndexDataTable;