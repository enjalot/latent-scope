export const apiUrl = import.meta.env.VITE_API_URL;


/**
 * Fetch a URL and parse the response as JSON, throwing a useful Error on
 * non-ok responses instead of attempting to JSON.parse an error page.
 *
 * Supports an optional AbortSignal via options.signal (passed straight
 * through to fetch).
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<any>} parsed JSON body
 * @throws {Error} with .status and .body set when response is not ok
 */
export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let snippet = '';
    try {
      snippet = (await response.text()).slice(0, 200);
    } catch {
      // ignore failures reading the error body
    }
    const error = new Error(
      `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''} for ${url}${
        snippet ? `: ${snippet}` : ''
      }`
    );
    error.status = response.status;
    error.body = snippet;
    throw error;
  }
  return response.json();
}

/**
 * Same as fetchJson but returns the raw response text.
 */
export async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

const postJsonOptions = (body) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

export const apiService = {
  fetchDataset: async (datasetId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/meta`).catch((error) => {
      console.error('Error fetching dataset metadata', error);
      throw error;
    });
  },
  updateDataset: async (datasetId, key, value) => {
    const params = new URLSearchParams({ key, value });
    return fetchJson(`${apiUrl}/datasets/${datasetId}/meta/update?${params}`);
  },
  fetchScope: async (datasetId, scopeId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`);
  },
  fetchScopes: async (datasetId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/scopes`).then((data) => {
      const sorted = data.sort((a, b) => a.id.localeCompare(b.id));
      return sorted;
    });
  },
  fetchEmbeddings: async (datasetId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/embeddings`);
  },
  fetchUmaps: async (datasetId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/umaps`).then((data) => {
      const array = data.map((d) => {
        return {
          ...d,
          url: `${apiUrl}/files/${datasetId}/umaps/${d.id}.png`,
        };
      });
      return array;
    });
  },
  fetchClusters: async (datasetId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/clusters`).then((data) => {
      const array = data.map((d) => {
        return {
          ...d,
          url: `${apiUrl}/files/${datasetId}/clusters/${d.id}.png`,
        };
      });
      return array;
    });
  },
  fetchEmbeddingFormat: async (datasetId, embeddingId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/embeddings/${embeddingId}/format`);
  },
  migrateEmbedding: async (datasetId, embeddingId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/embeddings/${embeddingId}/migrate`, {
      method: 'POST',
    });
  },
  fetchClusterQuality: async (datasetId, clusterId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/clusters/${clusterId}/quality`);
  },
  compareClusters: async (datasetId, clusterLeft, clusterRight) => {
    const params = new URLSearchParams({
      dataset: datasetId,
      cluster_left: clusterLeft,
      cluster_right: clusterRight,
    });
    return fetchJson(`${apiUrl}/search/compare-clusters?${params}`);
  },
  getEmbeddingModels: async () => {
    return fetchJson(`${apiUrl}/models/embedding_models`);
  },
  getRecentEmbeddingModels: async () => {
    return fetchJson(`${apiUrl}/models/embedding_models/recent`);
  },
  getRecentChatModels: async () => {
    return fetchJson(`${apiUrl}/models/chat_models/recent`);
  },
  searchHFSTModels: async (query) => {
    let limit = query ? 5 : 5; // TODO: could change this
    let url = `https://huggingface.co/api/models?filter=sentence-transformers&sort=downloads&limit=${limit}&full=false&config=false`;
    if (query) {
      url += `&search=${encodeURIComponent(query)}`;
    }
    return fetchJson(url).then((data) => {
      // convert the HF data format to ours
      const hfm = data.map((d) => {
        return {
          id: 'huggingface-' + d.id.replace('/', '___'),
          name: d.id,
          provider: 'huggingface',
          downloads: d.downloads,
          params: {},
        };
      });
      return hfm;
    });
  },
  searchHFChatModels: async (query) => {
    let limit = 100; //query ? 5 : 5; // TODO: could change this
    let url = `https://huggingface.co/api/models?pipeline_tag=text-generation&library=transformers,safetensors&other=conversational&sort=downloads&limit=${limit}&full=false&config=false`;
    if (query) {
      url += `&search=${encodeURIComponent(query)}`;
    }
    return fetchJson(url).then((data) => {
      // convert the HF data format to ours
      const hfm = data
        .filter((d) => d.tags.includes('conversational') && !d.tags.includes('gguf'))
        .map((d) => {
          return {
            id: 'huggingface-' + d.id.replace('/', '___'),
            name: d.id,
            provider: 'huggingface',
            downloads: d.downloads,
            params: {},
          };
        })
        .slice(0, 5); // TODO: figure out why the "conversational" filter in url isn't working
      return hfm;
    });
  },
  searchHFDatasets: async (query) => {
    let limit = query ? 5 : 10; // TODO: could change this
    let url = `https://huggingface.co/api/datasets?filter=latent-scope&sort=downloads&limit=${limit}&full=false&config=false`;
    if (query) {
      url += `&search=${encodeURIComponent(query)}`;
    }
    return fetchJson(url).then((data) => {
      return data.map((d) => {
        let size = d.description.match(/Total size of dataset files: (\d+\.\d+ [A-Za-z]+)/)?.[1];
        return {
          id: d.id,
          name: d.id,
          provider: '',
          downloads: d.downloads,
          size: size,
          params: {},
        };
      });
    });
  },
  fetchOllamaChatModels: async () => {
    return fetchJson(`http://localhost:11434/api/tags`)
      .then((data) => {
        return data?.models?.map((d) => {
          return {
            id: 'ollama-' + d.name,
            name: d.name,
            provider: 'ollama',
            params: {},
          };
        });
      })
      .catch((error) => {
        console.error('Error fetching Ollama chat models', error);
        // throw error;
      });
  },
  searchNearestNeighbors: async (datasetId, embedding, query, scope = null) => {
    const embeddingDimensions = embedding?.dimensions;
    const searchParams = new URLSearchParams({
      dataset: datasetId,
      query,
      embedding_id: embedding.id,
      ...(scope !== null ? { scope_id: scope.id } : {}),
      ...(embeddingDimensions !== undefined ? { dimensions: embeddingDimensions } : {}),
    });

    const nearestNeigborsUrl = `${apiUrl}/search/nn?${searchParams.toString()}`;
    return fetchJson(nearestNeigborsUrl).then((data) => {
      let dists = [];
      let inds = data.indices.map((idx, i) => {
        dists.push(data.distances[i]);
        return idx;
      });
      return {
        distances: dists,
        indices: inds,
        searchEmbedding: data.search_embedding[0],
      };
    });
  },
  searchSaeFeature: async (datasetId, saeId, featureId, threshold, topN) => {
    const searchParams = new URLSearchParams({
      dataset: datasetId,
      sae_id: saeId,
      feature_id: featureId,
      threshold,
      top_n: topN,
    });
    return fetchJson(`${apiUrl}/search/feature?${searchParams.toString()}`);
  },
  fetchUmapPoints: async (datasetId, umapId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/umaps/${umapId}/points`);
  },
  fetchDataFromIndices: async (datasetId, indices, saeId) => {
    return fetchJson(
      `${apiUrl}/indexed`,
      postJsonOptions({ dataset: datasetId, indices: indices, sae_id: saeId })
    ).then((data) => {
      let rows = data.map((row, index) => {
        return {
          index: indices[index],
          ...row,
        };
      });
      return rows;
    });
  },
  fetchClusterLabelsAvailable: async (datasetId, clusterId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/clusters/${clusterId}/labels_available`);
  },
  fetchClusterLabels: async (datasetId, clusterId, labelId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/clusters/${clusterId}/labels/${labelId}`);
  },
  fetchClusterIndices: async (datasetId, clusterId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/clusters/${clusterId}/indices`).then(
      (data) => {
        data.cluster_id = clusterId;
        return data;
      }
    );
  },
  fetchChatModels: async () => {
    return fetchJson(`${apiUrl}/models/chat_models`);
  },
  killJob: async (datasetId, jobId) => {
    const params = new URLSearchParams({ dataset: datasetId, job_id: jobId });
    return fetchJson(`${apiUrl}/jobs/kill?${params}`);
  },
  updateScopeLabelDescription: async (datasetId, scopeId, label, description) => {
    const params = new URLSearchParams({ label, description });
    return fetchJson(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}/description?${params}`);
  },
  // Edit the name/description of an existing umap run (experiment gallery,
  // named steps). Served by datasets_write_bp (WP-C); see CONTRACT.md.
  updateUmapMeta: async (datasetId, umapId, { name, description } = {}) => {
    return fetchJson(
      `${apiUrl}/datasets/${datasetId}/umaps/${umapId}/meta`,
      postJsonOptions({ name, description })
    );
  },
  // Edit the name/description of an existing cluster run.
  updateClusterMeta: async (datasetId, clusterId, { name, description } = {}) => {
    return fetchJson(
      `${apiUrl}/datasets/${datasetId}/clusters/${clusterId}/meta`,
      postJsonOptions({ name, description })
    );
  },
  // Per-point numeric (or categorical) values for a column, aligned to
  // ls_index order, for color-by (#131). Served by datasets_bp (WP-C).
  // `idOrScope` scopes the values to a scope/umap id via the ?scope= query.
  fetchColumnValues: async (datasetId, idOrScope, column) => {
    const params = new URLSearchParams();
    if (idOrScope !== null && idOrScope !== undefined) {
      params.set('scope', idOrScope);
    }
    const query = params.toString();
    const url = `${apiUrl}/datasets/${datasetId}/column/${encodeURIComponent(column)}${
      query ? `?${query}` : ''
    }`;
    return fetchJson(url);
  },
  fetchSaes: async (datasetId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/saes`);
  },
  fetchSae: async (datasetId, saeId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/saes/${saeId}`);
  },
  fetchVersion: async () => {
    return fetchText(`${apiUrl}/version`);
  },
  fetchSettings: async () => {
    return fetchJson(`${apiUrl}/settings`);
  },
  fetchExportList: async (datasetId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/export/list`);
  },
  fetchDatasets: async () => {
    return fetchJson(`${apiUrl}/datasets`);
  },
  fetchCustomModels: async () => {
    return fetchJson(`${apiUrl}/models/custom-models`);
  },
  addCustomModel: async (modelData) => {
    return fetchJson(`${apiUrl}/models/custom-models`, postJsonOptions(modelData));
  },
  deleteCustomModel: async (modelId) => {
    return fetchJson(`${apiUrl}/models/custom-models/${modelId}`, {
      method: 'DELETE',
    });
  },
  fetchCustomEmbeddingModels: async () => {
    return fetchJson(`${apiUrl}/models/custom-embedding-models`);
  },
  addCustomEmbeddingModel: async (modelData) => {
    return fetchJson(`${apiUrl}/models/custom-embedding-models`, postJsonOptions(modelData));
  },
  deleteCustomEmbeddingModel: async (modelId) => {
    return fetchJson(`${apiUrl}/models/custom-embedding-models/${modelId}`, {
      method: 'DELETE',
    });
  },
  getFeatures: async (url) => {
    // Load hyparquet lazily so the (large) parquet parser is only fetched
    // when features are actually requested, instead of blocking app boot.
    const { asyncBufferFromUrl, parquetRead } = await import('hyparquet');
    // hyparquet handles fetching the parquet file itself; asyncBufferFromUrl
    // performs its own response status checks and throws on failure.
    const buffer = await asyncBufferFromUrl(url);
    return new Promise((resolve) => {
      parquetRead({
        file: buffer,
        // rowFormat: 'object',
        onComplete: (data) => {
          let fts = data.map((f) => {
            return {
              feature: parseInt(f[0]),
              max_activation: f[1],
              label: f[6],
              order: f[7],
            };
          });
          resolve(fts);
        },
      });
    });
  },
  getDatasetFeatures: async (datasetId, saeId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/features/${saeId}`);
  },
  getHoverText: async (scope, index) => {
    return fetchJson(
      `${apiUrl}/query`,
      postJsonOptions({
        dataset: scope.dataset.id,
        indices: [index],
        page: 0,
      })
    ).then((data) => {
      return data.rows[0][scope.dataset.text_column];
    });
  },
  fetchTags: async (datasetId) => {
    return fetchJson(`${apiUrl}/tags?dataset=${datasetId}`);
  },
  fetchScopeRows: async (datasetId, scopeId) => {
    return fetchJson(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}/parquet`);
  },
  columnFilter: async (datasetId, filters) => {
    return fetchJson(
      `${apiUrl}/column-filter`,
      postJsonOptions({ dataset: datasetId, filters: filters })
    );
  },

  // Estimation API
  estimateEmbed: async (datasetId, modelId, textColumn, dimensions) => {
    const params = new URLSearchParams({
      dataset: datasetId,
      model_id: modelId,
      text_column: textColumn,
      ...(dimensions ? { dimensions } : {}),
    });
    return fetchJson(`${apiUrl}/estimate/embed?${params}`);
  },
  estimateUmap: async (datasetId, embeddingId, neighbors) => {
    const params = new URLSearchParams({
      dataset: datasetId,
      embedding_id: embeddingId,
      ...(neighbors ? { neighbors } : {}),
    });
    return fetchJson(`${apiUrl}/estimate/umap?${params}`);
  },
  estimateCluster: async (datasetId, umapId) => {
    const params = new URLSearchParams({
      dataset: datasetId,
      umap_id: umapId,
    });
    return fetchJson(`${apiUrl}/estimate/cluster?${params}`);
  },
  benchmarkEmbed: async (datasetId, modelId, textColumn, sampleSize = 10, dimensions) => {
    const params = new URLSearchParams({
      dataset: datasetId,
      model_id: modelId,
      text_column: textColumn,
      sample_size: sampleSize,
      ...(dimensions ? { dimensions } : {}),
    });
    return fetchJson(`${apiUrl}/estimate/benchmark/embed?${params}`);
  },
};
