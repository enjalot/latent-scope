// import React from 'react';
import PropTypes from 'prop-types';

import './DataTable.css';

DataTable.propTypes = {
  data: PropTypes.array.isRequired,
};
function DataTable({ data }) {
  if (!data.length) {
    return <p>No data available.</p>;
  }

  const headers = Object.keys(data[0]);

  return (
    <table className="datatable">
      <thead>
        <tr>
          {headers.map((header, index) => <th key={index}>{header}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map((row, index) => (
          <tr key={index}>
            {headers.map((header, idx) => <td key={idx}>{row[header]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default DataTable;
