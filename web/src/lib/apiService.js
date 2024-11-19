export const apiUrl = import.meta.env.VITE_API_URL;

export const apiService = {
  fetchDataset: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then((response) => response.json())
      .then((data) => {
        console.log('dataset meta', data);
        return data;
      })
      .catch((error) => {
        console.error('Error fetching dataset metadata', error);
        throw error;
      });
  },
  updateDataset: async (datasetId, key, value) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/meta/update?key=${key}&value=${value}`).then(
      (response) => response.json()
    );
  },
  fetchScope: async (datasetId, scopeId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`).then((response) =>
      response.json()
    );
  },
  fetchScopes: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/scopes`)
      .then((response) => response.json())
      .then((data) => {
        const sorted = data.sort((a, b) => a.id.localeCompare(b.id));
        return sorted;
      });
  },
  fetchEmbeddings: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/embeddings`).then((response) => response.json());
  },
  fetchUmaps: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/umaps`)
      .then((response) => response.json())
      .then((data) => {
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
    return fetch(`${apiUrl}/datasets/${datasetId}/clusters`)
      .then((response) => response.json())
      .then((data) => {
        const array = data.map((d) => {
          return {
            ...d,
            url: `${apiUrl}/files/${datasetId}/clusters/${d.id}.png`,
          };
        });
        return array;
      });
  },
  getEmbeddingModels: async () => {
    return fetch(`${apiUrl}/embedding_models`).then((response) => response.json());
  },
  getRecentEmbeddingModels: async () => {
    return fetch(`${apiUrl}/embedding_models/recent`).then((response) => response.json());
  },
  getRecentChatModels: async () => {
    return fetch(`${apiUrl}/chat_models/recent`).then((response) => response.json());
  },
  searchHFSTModels: async (query) => {
    let limit = query ? 5 : 5; // TODO: could change this
    let url = `https://huggingface.co/api/models?filter=sentence-transformers&sort=downloads&limit=${limit}&full=false&config=false`;
    if (query) {
      url += `&search=${query}`;
    }
    return fetch(url)
      .then((response) => response.json())
      .then((data) => {
        // convert the HF data format to ours
        const hfm = data.map((d) => {
          return {
            id: '🤗-' + d.id.replace('/', '___'),
            name: d.id,
            provider: '🤗',
            downloads: d.downloads,
            params: {},
          };
        });
        return hfm;
      });
  },
  searchHFChatModels: async (query) => {
    let limit = query ? 5 : 5; // TODO: could change this
    let url = `https://huggingface.co/api/models?pipeline_tag=text-generation&filter=transformers&library=transformers,safetensors&other=conversational,text-generation-inference&sort=downloads&limit=${limit}&full=false&config=false`;
    if (query) {
      url += `&search=${query}`;
    }
    return fetch(url)
      .then((response) => response.json())
      .then((data) => {
        // convert the HF data format to ours
        const hfm = data.map((d) => {
          return {
            id: '🤗-' + d.id.replace('/', '___'),
            name: d.id,
            provider: '🤗',
            downloads: d.downloads,
            params: {},
          };
        });
        return hfm;
      });
  },
  searchHFDatasets: async (query) => {
    let limit = query ? 5 : 10; // TODO: could change this
    let url = `https://huggingface.co/api/datasets?filter=latent-scope&sort=downloads&limit=${limit}&full=false&config=false`;
    if (query) {
      url += `&search=${query}`;
    }
    return fetch(url)
      .then((response) => response.json())
      .then((data) => {
        console.log('DATASET SEARCH DATA', data);
        return data.map((d) => {
          let size = d.description.match(/Total size of dataset files: (\d+\.\d+ [A-Za-z]+)/)?.[1];
          console.log('size', size);
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
  searchNearestNeighbors: async (datasetId, embedding, query) => {
    const embeddingDimensions = embedding?.dimensions;
    const searchParams = new URLSearchParams({
      dataset: datasetId,
      query,
      embedding_id: embedding.id,
      ...(embeddingDimensions !== undefined ? { dimensions: embeddingDimensions } : {}),
    });

    const nearestNeigborsUrl = `${apiUrl}/search/nn?${searchParams.toString()}`;
    return fetch(nearestNeigborsUrl)
      .then((response) => response.json())
      .then((data) => {
        let dists = [];
        let inds = data.indices.map((idx, i) => {
          dists[idx] = data.distances[i];
          return idx;
        });
        return {
          distances: dists,
          indices: inds,
          searchEmbedding: data.search_embedding[0],
        };
      });
  },
  fetchUmapPoints: async (datasetId, umapId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/umaps/${umapId}/points`).then((response) =>
      response.json()
    );
  },
  fetchDataFromIndices: async (datasetId, indices) => {
    return fetch(`${apiUrl}/indexed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataset: datasetId, indices: indices }),
    })
      .then((response) => response.json())
      .then((data) => {
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
    return fetch(`${apiUrl}/datasets/${datasetId}/clusters/${clusterId}/labels_available`).then(
      (response) => response.json()
    );
  },
  fetchClusterLabels: async (datasetId, clusterId, labelId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/clusters/${clusterId}/labels/${labelId}`).then(
      (response) => response.json()
    );
  },
  fetchClusterIndices: async (datasetId, clusterId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/clusters/${clusterId}/indices`)
      .then((response) => response.json())
      .then((data) => {
        data.cluster_id = clusterId;
        return data;
      });
  },
  fetchChatModels: async () => {
    return fetch(`${apiUrl}/chat_models`).then((response) => response.json());
  },
  killJob: async (datasetId, jobId) => {
    return fetch(`${apiUrl}/jobs/kill?dataset=${datasetId}&job_id=${jobId}`).then((response) =>
      response.json()
    );
  },
  updateScopeLabelDescription: async (datasetId, scopeId, label, description) => {
    return fetch(
      `${apiUrl}/datasets/${datasetId}/scopes/${scopeId}/description?label=${label}&description=${description}`
    ).then((response) => response.json());
  },
  fetchSaes: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/saes`).then((response) => response.json());
  },
  fetchSae: async (datasetId, saeId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/saes/${saeId}`).then((response) =>
      response.json()
    );
  },
  fetchVersion: async () => {
    return fetch(`${apiUrl}/version`).then((response) => response.text());
  },
  fetchSettings: async () => {
    return fetch(`${apiUrl}/settings`).then((response) => response.json());
  },
  fetchExportList: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/export/list`).then((response) => response.json());
  },
  fetchDatasets: async () => {
    return fetch(`${apiUrl}/datasets`).then((response) => response.json());
  },
};
