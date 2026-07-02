// import React from 'react';
import PropTypes from 'prop-types';

import './DataTable.css';
const apiUrl = import.meta.env.VITE_API_URL

DataTable.propTypes = {
  data: PropTypes.array.isRequired,
  tagset: PropTypes.object,
  dataset: PropTypes.object,
  maxRows: PropTypes.number,
  onTagset: PropTypes.func,
  onHover: PropTypes.func,
  onClick: PropTypes.func,
  rowTooltipId: PropTypes.string,
};

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Build a readable "column: value" HTML block for a row's hover tooltip.
function rowTooltipHtml(row, headers) {
  return headers
    .filter((h) => h !== 'index')
    .map((h) => {
      let v = row[h];
      if (v == null) v = '';
      if (typeof v === 'object') v = JSON.stringify(v);
      return `<div><b>${escapeHtml(h)}:</b> ${escapeHtml(v)}</div>`;
    })
    .join('');
}

function DataTable({ data, tagset, dataset, maxRows, onTagset, onHover, onClick, rowTooltipId }) {
  if (!data.length) {
    return <p>No data available.</p>;
  }

  const headers = Object.keys(data[0]);

  let tags;
  function handleTagClick(tag, index) {
    console.log("tag", tag)
    console.log("index", index)
    console.log("tagset", tagset)
    console.log("tagset[tag]", tagset[tag])
    const params = new URLSearchParams({ dataset: dataset?.id, tag, index });
    if(tagset[tag].includes(index)) {
      console.log("removing")
      fetch(`${apiUrl}/tags/remove?${params}`)
        .then(response => response.json())
        .then(data => {
          console.log("removed", data)
          onTagset(data);
        });
    } else {
      console.log("adding")
      fetch(`${apiUrl}/tags/add?${params}`)
        .then(response => response.json())
        .then(data => {
          console.log("added", data)
          onTagset(data);
        });
    }
  }
  if(tagset){
    tags = Object.keys(tagset)
  }

  const rows = maxRows ? data.slice(0, maxRows) : data;
  // console.log("rows", rows)

  return (
    <>
    <table className="datatable">
      <thead>
        <tr>
          {headers.map((header, index) => <th key={index}>{header}</th>)}
          {tags ? <th>tags</th> : null }
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={index}
            onMouseEnter={() => onHover && onHover(row.index)}
            onMouseLeave={() => onHover && onHover()}
            onClick={() => onClick && onClick(row.index)}
            data-tooltip-id={rowTooltipId || undefined}
            data-tooltip-html={rowTooltipId ? rowTooltipHtml(row, headers) : undefined}
            >
            {headers.map((header, idx) => {
              let d = row[header]
              if(typeof d === 'object' && !Array.isArray(d)) {
                d = JSON.stringify(d)
              }
              let meta = dataset?.column_metadata && dataset?.column_metadata[header]
              if(meta && meta.image) {
                return <td key={idx}><img src={d} alt={header} height={64} /></td>
              } else if(meta && meta.url) {
                return <td key={idx}><a href={d}>url</a></td>
              } else if(meta && meta.type == "array") {
                return <td key={idx}>[{d.length}]</td>
              } else {
                return <td key={idx}>{d}</td>
              }
            })}
            {tags ? <td>
              {tags.map((tag, idx) => (
                <button 
                  key={idx} 
                  onClick={(e) => {
                    handleTagClick(tag, row.index)
                    e.preventDefault()
                    e.stopPropagation()

                  }}
                  className={tagset[tag].includes(row.index) ? 'tag-active' : 'tag-inactive'}>
                  {tag}
                </button>
              ))}
            </td> : null }
          </tr>
        ))}
      </tbody>
    </table>
    {maxRows && data.length > maxRows ? <p>Showing {maxRows} of {data.length} rows.</p> : null}
    </>
  );
}

export default DataTable;
