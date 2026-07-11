import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { apiService } from '../lib/apiService';
import { saeAvailable, getLabelsForSaeModel } from '../lib/SAE';

const ScopeContext = createContext(null);

export function ScopeProvider({ children }) {
  const { dataset: datasetId, scope: scopeId } = useParams();

  // Core scope data
  const [scope, setScope] = useState(null);
  const [dataset, setDataset] = useState(null);
  const [sae, setSae] = useState(null);

  const [scopeLoaded, setScopeLoaded] = useState(false);
  // Set when fetching the scope (or its rows) fails, so consumers can render
  // an error instead of waiting on "Loading..." forever.
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    apiService
      .fetchScope(datasetId, scopeId)
      .then((scope) => {
        // The SAE surface is enabled either by a pretrained CDN-labeled SAE
        // for the embedding model (lib/SAE.js) or by the scope meta carrying
        // its own sae + sae_id (e.g. token-granularity SAEs trained on the
        // dataset itself).
        if (saeAvailable[scope.embedding?.model_id] || (scope.sae && scope.sae_id)) {
          setSae(scope.sae);
        } else {
          delete scope.sae;
          delete scope.sae_id;
        }
        setScope(scope);
        setDataset(scope.dataset);
      })
      .catch((err) => {
        console.error(`Error fetching scope ${scopeId} for dataset ${datasetId}`, err);
        setError(err);
      });
  }, [datasetId, scopeId]);

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
      } else if (sae?.id) {
        // SAE declared by the scope itself (e.g. token-granularity SAEs).
        // Labels come from a latent-taxonomy label parquet keyed by the SAE's
        // model repo when one exists; the per-dataset stats endpoint fills in
        // activations either way, and a missing/unpublished parquet falls
        // back to generic "Feature N" labels rather than an empty surface.
        const labelSource = getLabelsForSaeModel(sae.model_id);
        const labelsPromise = labelSource
          ? apiService.getFeatures(labelSource.url).catch((err) => {
              console.warn(
                `SAE label parquet unavailable (${labelSource.url}): ${err}; ` +
                  'falling back to generic feature labels'
              );
              return null;
            })
          : Promise.resolve(null);
        Promise.all([labelsPromise, apiService.getDatasetFeatures(datasetId, sae.id)]).then(
          ([labeled, dsfts]) => {
            const byFeature = new Map((labeled || []).map((f) => [f.feature, f]));
            setFeatures(
              dsfts.map((ft, i) => {
                const featureId = ft.feature_id ?? i;
                const lf = byFeature.get(featureId);
                return {
                  feature: featureId,
                  label: lf?.label || `Feature ${featureId}`,
                  max_activation: lf?.max_activation ?? ft.max_activation,
                  order: lf?.order ?? featureId,
                  dataset_max: ft.max_activation,
                  dataset_avg: ft.avg_activation,
                  dataset_count: ft.count,
                };
              })
            );
          }
        );
      }
    }
  }, [scope, sae, embeddings, datasetId]);

  const [clusterMap, setClusterMap] = useState({});
  const [, setClusterIndices] = useState([]);
  const [clusterLabels, setClusterLabels] = useState([]);

  const [scopeRows, setScopeRows] = useState([]);

  const [deletedIndices, setDeletedIndices] = useState([]);

  const fetchScopeRows = useCallback(() => {
    // Token scopes have 100-300x the points of a row scope; fetch the scope
    // parquet directly (binary, dictionary-encoded) instead of row JSON, and
    // only the columns the Explore view actually reads.
    const rowsPromise =
      scope?.granularity === 'tokens'
        ? apiService.fetchScopeRowsParquet(datasetId, scope.id, [
            'ls_index',
            'x',
            'y',
            'cluster',
            'tile_index_64',
            'deleted',
            'parent_index',
            'token_pos',
            'token_str',
          ])
        : apiService.fetchScopeRows(datasetId, scope.id);
    rowsPromise
      .then((scopeRows) => {
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
      })
      .catch((err) => {
        console.error(`Error fetching scope rows for scope ${scope.id}`, err);
        setError(err);
      });
  }, [datasetId, scope]);

  useEffect(() => {
    if (scope) fetchScopeRows();
  }, [scope, fetchScopeRows]);

  // Token scopes (granularity: "tokens") map one point per token of a
  // late-interaction embedding instead of one per dataset row.
  const isTokenScope = scope?.granularity === 'tokens';

  const value = {
    datasetId,
    scopeId,
    dataset,
    scope,
    sae,
    isTokenScope,
    scopeLoaded,
    error,
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
