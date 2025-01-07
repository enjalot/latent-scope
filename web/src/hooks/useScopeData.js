import { useState, useCallback, useEffect } from 'react';
import { apiService } from '../lib/apiService';

const useScopeData = (apiUrl, datasetId, scope) => {
  const [clusterMap, setClusterMap] = useState({});
  const [clusterIndices, setClusterIndices] = useState([]);
  const [clusterLabels, setClusterLabels] = useState([]);

  const [scopeRows, setScopeRows] = useState([]);

  const [deletedIndices, setDeletedIndices] = useState([]);

  const [sae, setSae] = useState(null);
  useEffect(() => {
    if (scope?.sae_id) {
      apiService.fetchSae(datasetId, scope.sae_id).then((sae) => {
        console.log('SAE', sae);
        // only set the sae if the embedding_id matches the scope embedding_id
        if (sae.embedding_id && sae.embedding_id === scope.embedding_id) {
          setSae(sae);
        }
      });
    }
  }, [scope]);

  const fetchScopeRows = useCallback(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scope.id}/parquet`)
      .then((response) => response.json())
      .then((scopeRows) => {
        console.log('scopeRows', scopeRows);
        setScopeRows(scopeRows);

        let clusterMap = {};
        let nonDeletedClusters = new Set();

        // Reset all counts in cluster_labels_lookup first
        // to avoid overcounting clusters counts.
        // this is happening because fetchScopeRows is being called multiple times
        // and the cluster_labels_lookup is being mutated
        // TODO: fix this -> use a new object for cluster_labels_lookup
        if (scope.cluster_labels_lookup) {
          scope.cluster_labels_lookup.forEach((cluster) => {
            cluster.count = 0;
          });
        }

        scopeRows.forEach((d) => {
          const cluster = scope.cluster_labels_lookup?.[d.cluster];
          cluster.count += 1;

          clusterMap[d.ls_index] = cluster;
          //   clusterMap[d.ls_index] = { cluster: d.cluster, label: d.label };
          if (!d.deleted) {
            nonDeletedClusters.add(d.cluster);
          }
        });
        // only take the labels of clusters that belong to rows that are not deleted
        const labelsData =
          scope.cluster_labels_lookup.filter((l) => nonDeletedClusters.has(l.cluster)) || [];

        setClusterLabels(labelsData);
        setClusterIndices(scopeRows.map((d) => d.cluster));

        setClusterMap(clusterMap);

        setDeletedIndices(scopeRows.filter((d) => d.deleted).map((d) => d.ls_index));
      })
      .catch((error) => console.error('Fetching data failed', error));
  }, [apiUrl, datasetId, scope]);

  return {
    clusterMap,
    clusterIndices,
    clusterLabels,
    scopeRows,
    fetchScopeRows,
    deletedIndices,
    sae,
    setSae,
  };
};

export default useScopeData;
