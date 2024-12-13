import React from 'react';
import Select from 'react-select';
import { selectStyles } from './SelectStyles';

export default function ClusterFilter({ clusterLabels, cluster, clusterIndices, setCluster }) {
  const selectOptions = clusterLabels?.map((cl) => ({
    value: cl.cluster,
    label: `${cl.cluster}: ${cl.label} (${cl.count})`,
  }));

  const handleClusterChange = (selectedOption) => {
    if (!selectedOption) {
      setCluster(null);
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
          styles={selectStyles}
        />
      </div>
      <div className="filter-cell middle">
        {clusterIndices?.length ? <span>{clusterIndices.length} rows</span> : <span>0 rows</span>}
      </div>
    </div>
  );
}
