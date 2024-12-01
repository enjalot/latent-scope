import React from 'react';

export default function ClusterFilter({
  setFilteredIndices,
  clusterLabels,
  cluster,
  clusterIndices,
  setCluster,
}) {
  const handleClusterChange = (e) => {
    if (e.target.value === '-1') {
      setCluster(null);
      return;
    }
    const cl = clusterLabels.find((cluster) => cluster.cluster === +e.target.value);
    if (cl) setCluster(cl);
  };

  return (
    <div className={`clusters-select filter-row ${clusterIndices?.length ? 'active' : ''}`}>
      <div className="filter-cell left">
        <select onChange={handleClusterChange} value={cluster?.cluster >= 0 ? cluster.cluster : -1}>
          <option value="-1">Filter by cluster</option>
          {clusterLabels?.map((cluster, index) => (
            <option key={index} value={cluster.cluster}>
              {cluster.cluster}: {cluster.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-cell middle">
        {clusterIndices?.length ? (
          <span>
            {clusterIndices.length} rows
            <button
              className="deselect"
              onClick={() => {
                setCluster(null);
                setFilteredIndices([]);
              }}
            >
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
              onClick={() => setCluster(null)}
            >
              X
            </button>
          </span>
        )}
      </div>
    </div>
  );
}