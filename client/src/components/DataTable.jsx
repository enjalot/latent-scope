// import React from 'react';
import PropTypes from 'prop-types';

import './DataTable.css';

DataTable.propTypes = {
  data: PropTypes.array.isRequired,
  tagset: PropTypes.object.isRequired,
  datasetId: PropTypes.string.isRequired,
  onTagset: PropTypes.func.isRequired,
};
function DataTable({ data, tagset, datasetId, onTagset }) {
  if (!data.length) {
    return <p>No data available.</p>;
  }

  const headers = Object.keys(data[0]);

  const tags = Object.keys(tagset)

  function handleTagClick(tag, index) {
    console.log("tag", tag)
    console.log("index", index)
    console.log("tagset", tagset)
    console.log("tagset[tag]", tagset[tag])
    if(tagset[tag].includes(index)) {
      console.log("removing")
      fetch(`http://localhost:5001/tags/remove?dataset=${datasetId}&tag=${tag}&index=${index}`)
        .then(response => response.json())
        .then(data => {
          console.log("removed", data)
          onTagset(data);
        });
    } else {
      console.log("adding")
      fetch(`http://localhost:5001/tags/add?dataset=${datasetId}&tag=${tag}&index=${index}`)
        .then(response => response.json())
        .then(data => {
          console.log("added", data)
          onTagset(data);
        });
    }
  
  }

  return (
    <table className="datatable">
      <thead>
        <tr>
          {headers.map((header, index) => <th key={index}>{header}</th>)}
          <th>tags</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, index) => (
          <tr key={index}>
            {headers.map((header, idx) => <td key={idx}>{row[header]}</td>)}
            <td>
              {tags.map((tag, idx) => (
                <button 
                  key={idx} 
                  onClick={() => handleTagClick(tag, row.index)}
                  className={tagset[tag].includes(row.index) ? 'tag-active' : 'tag-inactive'}>
                  {tag}
                </button>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default DataTable;
