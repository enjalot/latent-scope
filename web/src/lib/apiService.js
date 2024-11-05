export const apiUrl = import.meta.env.VITE_API_URL;

export const apiService = {
  getDataset: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => {
        console.log("dataset meta", data)
        return data
      })
      .catch(error => {
        console.error('Error fetching dataset metadata', error);
        throw error;
      });
  },
  updateDataset: async (datasetId, key, value) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/meta/update?key=${key}&value=${value}`)
      .then(response => response.json())
  },
  getScope: async (datasetId, scopeId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/scopes/${scopeId}`)
      .then(response => response.json())
  },
  getScopes: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/scopes`)
      .then(response => response.json())
      .then(data => {
        const sorted = data.sort((a,b) => a.id.localeCompare(b.id))
        return sorted
      })
  },
  fetchEmbeddings: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/embeddings`)
      .then(response => response.json())
  },
  fetchUmaps: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/umaps`)
      .then(response => response.json())
      .then(data => {
        const array = data.map(d=> {
          return {
            ...d,
            url: `${apiUrl}/files/${datasetId}/umaps/${d.id}.png`,
          }
        })
        return array
      })
  },
  fetchClusters: async (datasetId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/clusters`)
      .then(response => response.json())
      .then(data => {
        const array = data.map(d=> {
          return {
            ...d,
            url: `${apiUrl}/files/${datasetId}/clusters/${d.id}.png`,
          }
        })
        return array
      })
  },
  getEmbeddingModels: async () => {
    return fetch(`${apiUrl}/embedding_models`)
      .then(response => response.json())
  },
  getRecentModels: async () => {
    return fetch(`${apiUrl}/embedding_models/recent`)
      .then(response => response.json())
  },
  searchHFModels: async (query) => {
    let limit = query ? 5 : 5 // TODO: could change this
    let url = `https://huggingface.co/api/models?filter=sentence-transformers&sort=downloads&limit=${limit}&full=false&config=false`
    if(query) {
      url += `&search=${query}`
    }
    return fetch(url)
      .then(response => response.json())
      .then(data => {
        // convert the HF data format to ours
        const hfm = data.map(d => {
          return {
            id: "🤗-" + d.id.replace("/", '___'),
            name: d.id,
            provider: "🤗",
            downloads: d.downloads,
            params: {}
          }
        })
        return hfm
      })
  },
  searchNearestNeighbors: async (datasetId, embedding, query) => {
    const embeddingDimensions = embedding?.dimensions
    const searchParams = new URLSearchParams({
      dataset: datasetId,
      query,
      embedding_id: embedding.id,
      ...(embeddingDimensions !== undefined ? { dimensions: embeddingDimensions } : {} )
    })

    const nearestNeigborsUrl = `${apiUrl}/search/nn?${searchParams.toString()}`;
    return fetch(nearestNeigborsUrl)
      .then(response => response.json())
      .then(data => {
        let dists = []
        let inds = data.indices.map((idx,i) => {
          dists[idx] = data.distances[i]
          return idx
        })
        return {
          distances: dists,
          indices: inds,
          searchEmbedding: data.search_embedding[0]
        }
      })
  },
  fetchUmapPoints: async (datasetId, umapId) => {
    return fetch(`${apiUrl}/datasets/${datasetId}/umaps/${umapId}/points`)
      .then(response => response.json())
  },
  fetchDataFromIndices: async (datasetId, indices) => {
    return fetch(`${apiUrl}/indexed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataset: datasetId, indices: indices }),
      })
      .then(response => response.json())
      .then(data => {
        let rows = data.map((row, index) => {
          return {
            index: indices[index],
            ...row
          }
        })
        return rows
      })
  }
}

