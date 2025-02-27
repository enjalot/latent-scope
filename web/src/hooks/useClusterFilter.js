import { useState, useEffect } from 'react';

export default function useClusterFilter({ scopeRows, scopeLoaded, setFilteredIndices }) {
  const [cluster, setCluster] = useState(null);

  const filter = (cluster) => {
    if (cluster) {
      const annots = scopeRows.filter((d) => d.cluster === cluster.cluster);
      const indices = annots.map((d) => d.ls_index);
      return indices;
    }
    return [];
  };

  const clear = () => {
    setCluster(null);
  };

  return {
    cluster,
    setCluster,
    filter,
    clear,
  };
}
