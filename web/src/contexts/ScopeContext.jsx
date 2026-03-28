import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { apiService } from '../lib/apiService';
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
        setSae(scope.sae);
      } else {
        delete scope.sae;
        delete scope.sae_id;
      }
      setScope(scope);
      setDataset(scope.dataset);
    });
  }, [userId, datasetId, scopeId]);

  const [features, setFeatures] = useState([]);

  const [scopes, setScopes] = useState([]);
  useEffect(() => {
    apiService.fetchScopes(datasetId).then(setScopes);
  }, [datasetId]);

  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    apiService.fetchEmbeddings(datasetId).then(setEmbeddings);
  }, [datasetId]);

  const [tagset, setTagset] = useState({});
  const fetchTagSet = useCallback(() => {
    apiService.fetchTags(datasetId).then(setTagset);
  }, [datasetId]);

  useEffect(() => {
    fetchTagSet();
  }, [fetchTagSet]);

  const tags = useMemo(() => Object.keys(tagset), [tagset]);

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
            setFeatures(fts);
          });
        });
      }
    }
  }, [scope, sae, embeddings]);

  const [clusterMap, setClusterMap] = useState({});
  const [clusterIndices, setClusterIndices] = useState([]);
  const [clusterLabels, setClusterLabels] = useState([]);

  const [scopeRows, setScopeRows] = useState([]);

  const [deletedIndices, setDeletedIndices] = useState([]);

  const fetchScopeRows = useCallback(() => {
    apiService.fetchScopeRows(datasetId, scope.id).then((scopeRows) => {
      setScopeRows(scopeRows);
      let clusterMap = {};
      let nonDeletedClusters = new Set();

      // Build a fresh lookup copy to avoid mutating the scope object across re-fetches.
      const freshLookup = scope.cluster_labels_lookup.map((c) => ({ ...c, count: 0 }));

      scopeRows.forEach((d) => {
        const cluster = freshLookup[d.cluster];
        cluster.count += 1;
        clusterMap[d.ls_index] = cluster;
        if (!d.deleted) {
          nonDeletedClusters.add(d.cluster);
        }
      });

      // Also update the scope object's lookup so callers reading scope.cluster_labels_lookup
      // see the updated counts without mutation across calls.
      scope.cluster_labels_lookup = freshLookup;

      const labelsData = freshLookup.filter((l) => nonDeletedClusters.has(l.cluster));
      setClusterLabels(labelsData);
      setClusterIndices(scopeRows.map((d) => d.cluster));
      setClusterMap(clusterMap);
      setDeletedIndices(scopeRows.filter((d) => d.deleted).map((d) => d.ls_index));
      setScopeLoaded(true);
    });
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
