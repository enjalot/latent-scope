import React from 'react';

export default function ClusterFilter({ clusterLabels, slide, slideAnnotations, setSlide }) {
  const handleSlideChange = (e) => {
    if (e.target.value === '-1') {
      setSlide(null);
      return;
    }
    const cl = clusterLabels.find((cluster) => cluster.cluster === +e.target.value);
    if (cl) setSlide(cl);
  };

  return (
    <div className={`clusters-select filter-row ${slideAnnotations.length ? 'active' : ''}`}>
      <div className="filter-cell left">
        <select onChange={handleSlideChange} value={slide?.cluster >= 0 ? slide.cluster : -1}>
          <option value="-1">Filter by cluster</option>
          {clusterLabels?.map((cluster, index) => (
            <option key={index} value={cluster.cluster}>
              {cluster.cluster}: {cluster.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-cell middle">
        {slideAnnotations.length ? (
          <span>
            {slideAnnotations.length} rows
            <button className="deselect" onClick={() => setSlide(null)}>
              X
            </button>
          </span>
        ) : (
          <span>
            0 rows
            <button
              style={{ visibility: 'hidden' }}
              className="deselect"
              disabled
              onClick={() => setSlide(null)}
            >
              X
            </button>
          </span>
        )}
      </div>
    </div>
  );
}