import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import DataTable from './DataTable';
const apiUrl = import.meta.env.VITE_API_URL

IndexDataTable.propTypes = {
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

function IndexDataTable({
  dataset, 
  indices, 
  distances = [], 
  clusterIndices = [], 
  clusterLabels = [], 
  maxRows, 
  tagset, 
  onHover, 
  onClick, 
  onTagset
}) {

  const [rows, setRows] = useState([]);
  const hydrateIndices = useCallback((indices) => {
    if(dataset)
      fetch(`${apiUrl}/indexed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataset: dataset.id, indices: indices }),
      })
      .then(response => response.json())
      .then(data => {
        let rows = data.map((row, index) => {
          let idx = indices[index]
          let ret = {
            index: idx,
            ...row
          }
          if(distances && distances.length)
            ret['distance'] = distances[index]
          if(clusterIndices && clusterIndices.length && clusterLabels && clusterLabels.length)
            ret['cluster'] = clusterLabels[clusterIndices[idx].cluster].label // note the idx is the data points index into the original data
          return ret
        })
        // TODO dataset.sort_column
        // rows.sort((a, b) => b.score - a.score)
        setRows(rows)
        // console.log("rows", rows)
      })
  }, [dataset, distances, clusterIndices, clusterLabels])

  useEffect(() => {
    if(indices && indices.length) {
      // console.log("refetching hydrate")
      hydrateIndices(indices)
    }
  }, [indices])

  return (
    <div>
      <DataTable 
        data={rows} 
        tagset={tagset} 
        dataset={dataset} 
        maxRows={maxRows} 
        onTagset={onTagset} 
        onHover={onHover} 
        onClick={onClick}
        />
    </div>
  )
}
export default IndexDataTable;