import React from 'react';
import Select from 'react-select';

export default function ClusterFilter({
  setFilteredIndices,
  clusterLabels,
  cluster,
  clusterIndices,
  setCluster,
}) {
  const selectOptions = clusterLabels?.map((cl) => ({
    value: cl.cluster,
    label: `${cl.cluster}: ${cl.label} (${cl.count})`,
  }));
  console.log('CLUSTER LABELS', clusterLabels);

  const handleClusterChange = (selectedOption) => {
    if (!selectedOption) {
      setCluster(null);
      setFilteredIndices([]);
      return;
    }
    const cl = clusterLabels.find((cluster) => cluster.cluster === selectedOption.value);
    if (cl) setCluster(cl);
  };

  return (
    <div className={`clusters-select filter-row ${clusterIndices?.length ? 'active' : ''}`}>
      <div className="filter-cell left">
        <Select
          value={
            cluster
              ? {
                  value: cluster.cluster,
                  label: `${cluster.cluster}: ${cluster.label}`,
                }
              : null
          }
          onChange={handleClusterChange}
          options={selectOptions}
          isClearable
          placeholder="Filter by cluster"
          className="cluster-react-select"
        />
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
