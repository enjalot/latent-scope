import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { apiService, apiUrl } from '../lib/apiService';
import { saeAvailable } from '../lib/SAE';

const ScopeContext = createContext(null);

export function ScopeProvider({ children }) {
  const { user: userId, dataset: datasetId, scope: scopeId } = useParams();

  // Core scope data
  const [scope, setScope] = useState(null);
  const [dataset, setDataset] = useState(null);
  const [sae, setSae] = useState(null);

  const [scopeLoaded, setScopeLoaded] = useState(false);

  useEffect(() => {
    apiService.fetchScope(datasetId, scopeId).then((scope) => {
      if (saeAvailable[scope.embedding?.model_id]) {
        console.log('=== SAE ===', scope.sae);
        setSae(scope.sae);
      } else {
        delete scope.sae;
        delete scope.sae_id;
      }
      setScope(scope);
      setDataset(scope.dataset);
      console.log('=== Scope ===', scope);
    });
  }, [userId, datasetId, scopeId]);

  const [features, setFeatures] = useState([]);

  // all scopes available for this dataset
  const [scopes, setScopes] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes`)
      .then((response) => response.json())
      .then((data) => {
        setScopes(data);
      });
  }, [datasetId, setScopes]);

  // embeddings available for this dataset
  // TODO: don't think we need this actually if we are just
  // using the single embedding from the current scope
  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/embeddings`)
      .then((response) => response.json())
      .then((data) => {
        setEmbeddings(data);
      });
  }, [datasetId, setEmbeddings]);

  const [tagset, setTagset] = useState({});
  const fetchTagSet = useCallback(() => {
    fetch(`${apiUrl}/tags?dataset=${datasetId}`)
      .then((response) => response.json())
      .then((data) => setTagset(data));
  }, [datasetId, setTagset]);

  useEffect(() => {
    fetchTagSet();
  }, [fetchTagSet]);

  const tags = useMemo(() => {
    const tags = [];
    for (const tag in tagset) {
      tags.push(tag);
    }
    // console.log("tagset", tagset, tags)
    return tags;
  }, [tagset]);

  useEffect(() => {
    if (sae && embeddings && scope) {
      let embedding = embeddings.find((e) => e.id == scope.embedding_id);
      if (embedding && saeAvailable[embedding.model_id]) {
        apiService.getFeatures(saeAvailable[embedding.model_id]?.url).then((fts) => {
          apiService.getDatasetFeatures(datasetId, sae?.id).then((dsfts) => {
            dsfts.forEach((ft, i) => {
              fts[i].dataset_max = ft.max_activation;
              fts[i].dataset_avg = ft.avg_activation;
              fts[i].dataset_count = ft.count;
            });
            console.log('DATASET included FEATURES', fts);
            setFeatures(fts);
          });
        });
      }
    }
  }, [scope, sae, embeddings]);

  // useEffect(() => {
  //   if (scope?.sae_id) {
  //     apiService.getSaeFeatures(saeAvailable[scope.embedding?.model_id], (fts) => {
  //       apiService.getDatasetFeatures(userId, datasetId, scope.sae_id).then((dsfts) => {
  //         dsfts.forEach((ft, i) => {
  //           fts[i].dataset_max = ft.max_activation;
  //           fts[i].dataset_avg = ft.avg_activation;
  //           fts[i].dataset_count = ft.count;
  //         });
  //         setFeatures(fts);
  //       });
  //     });
  //   }
  // }, [scope]);

  const [clusterMap, setClusterMap] = useState({});
  const [clusterIndices, setClusterIndices] = useState([]);
  const [clusterLabels, setClusterLabels] = useState([]);

  const [scopeRows, setScopeRows] = useState([]);

  const [deletedIndices, setDeletedIndices] = useState([]);

  const fetchScopeRows = useCallback(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scope.id}/parquet`)
      .then((response) => response.json())
      .then((scopeRows) => {
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
        setScopeLoaded(true);
      })
      .catch((error) => console.error('Fetching data failed', error));
  }, [userId, datasetId, scope]);

  useEffect(() => {
    if (scope) fetchScopeRows();
  }, [scope, fetchScopeRows]);

  const value = {
    userId,
    datasetId,
    scopeId,
    dataset,
    scope,
    sae,
    scopeLoaded,
    clusterMap,
    clusterLabels,
    scopeRows,
    deletedIndices,
    features,
    setFeatures,
    scopes,
    embeddings,
    tags,
  };

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const context = useContext(ScopeContext);
  if (!context) {
    throw new Error('useScope must be used within a ScopeProvider');
  }
  return context;
}
