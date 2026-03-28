import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock hyparquet before importing apiService (it uses top-level await)
vi.mock('hyparquet', () => ({
  asyncBufferFromUrl: vi.fn(),
  parquetRead: vi.fn(),
}));

// Mock import.meta.env
vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { apiService } = await import('./apiService.js');

describe('apiService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('fetchDataset', () => {
    it('fetches dataset metadata and returns parsed JSON', async () => {
      const mockData = { id: 'ds1', length: 100, text_column: 'text' };
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockData) });

      const result = await apiService.fetchDataset('ds1');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/datasets/ds1/meta'
      );
      expect(result).toEqual(mockData);
    });

    it('throws on fetch error', async () => {
      fetch.mockRejectedValueOnce(new Error('network error'));
      await expect(apiService.fetchDataset('ds1')).rejects.toThrow('network error');
    });
  });

  describe('fetchScope', () => {
    it('fetches a scope by id', async () => {
      const mockScope = { id: 'scope-0', embedding_id: 'emb-0' };
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockScope) });

      const result = await apiService.fetchScope('ds1', 'scope-0');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/datasets/ds1/scopes/scope-0'
      );
      expect(result).toEqual(mockScope);
    });
  });

  describe('fetchScopes', () => {
    it('fetches all scopes and sorts them by id', async () => {
      const mockScopes = [
        { id: 'scope-2', label: 'Second' },
        { id: 'scope-0', label: 'First' },
        { id: 'scope-1', label: 'Middle' },
      ];
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockScopes) });

      const result = await apiService.fetchScopes('ds1');

      expect(result[0].id).toBe('scope-0');
      expect(result[1].id).toBe('scope-1');
      expect(result[2].id).toBe('scope-2');
    });
  });

  describe('fetchEmbeddings', () => {
    it('fetches embeddings for a dataset', async () => {
      const mockEmbeddings = [{ id: 'emb-0', model_id: 'bge-small' }];
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockEmbeddings) });

      const result = await apiService.fetchEmbeddings('ds1');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/datasets/ds1/embeddings'
      );
      expect(result).toEqual(mockEmbeddings);
    });
  });

  describe('fetchUmaps', () => {
    it('attaches image URL to each umap', async () => {
      const mockUmaps = [{ id: 'umap-0' }];
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockUmaps) });

      const result = await apiService.fetchUmaps('ds1');

      expect(result[0].url).toBe(
        'http://localhost:5001/api/files/ds1/umaps/umap-0.png'
      );
    });
  });

  describe('fetchClusters', () => {
    it('attaches image URL to each cluster', async () => {
      const mockClusters = [{ id: 'cluster-0' }];
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockClusters) });

      const result = await apiService.fetchClusters('ds1');

      expect(result[0].url).toBe(
        'http://localhost:5001/api/files/ds1/clusters/cluster-0.png'
      );
    });
  });

  describe('searchNearestNeighbors', () => {
    it('constructs query params and returns indices with distances', async () => {
      const mockResponse = {
        indices: [5, 10, 15],
        distances: [0.1, 0.2, 0.3],
        search_embedding: [[0.1, 0.2]],
      };
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockResponse) });

      const embedding = { id: 'emb-0', dimensions: 384 };
      const result = await apiService.searchNearestNeighbors('ds1', embedding, 'hello');

      expect(result.indices).toEqual([5, 10, 15]);
      expect(result.distances).toEqual([0.1, 0.2, 0.3]);
      expect(result.searchEmbedding).toEqual([0.1, 0.2]);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('query=hello')
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('dimensions=384')
      );
    });

    it('includes scope_id when scope is provided', async () => {
      const mockResponse = { indices: [], distances: [], search_embedding: [[]] };
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockResponse) });

      const embedding = { id: 'emb-0' };
      const scope = { id: 'scope-0' };
      await apiService.searchNearestNeighbors('ds1', embedding, 'test', scope);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('scope_id=scope-0')
      );
    });
  });

  describe('fetchDataFromIndices', () => {
    it('sends indices as POST body and attaches index to each row', async () => {
      const mockRows = [{ text: 'hello' }, { text: 'world' }];
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockRows) });

      const result = await apiService.fetchDataFromIndices('ds1', [3, 7]);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/indexed',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ dataset: 'ds1', indices: [3, 7], sae_id: undefined }),
        })
      );
      expect(result[0].index).toBe(3);
      expect(result[1].index).toBe(7);
    });
  });

  describe('getHoverText', () => {
    it('extracts text_column value from query response', async () => {
      const mockResponse = { rows: [{ text: 'Some hover text' }] };
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockResponse) });

      const scope = { dataset: { id: 'ds1', text_column: 'text' } };
      const result = await apiService.getHoverText(scope, 42);

      expect(result).toBe('Some hover text');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ dataset: 'ds1', indices: [42], page: 0 }),
        })
      );
    });
  });

  describe('killJob', () => {
    it('calls kill endpoint with dataset and job id', async () => {
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve({ ok: true }) });

      await apiService.killJob('ds1', 'job-123');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/jobs/kill?dataset=ds1&job_id=job-123'
      );
    });
  });

  describe('columnFilter', () => {
    it('sends filter config as POST body', async () => {
      const mockResult = { indices: [1, 2, 3] };
      fetch.mockResolvedValueOnce({ json: () => Promise.resolve(mockResult) });

      const filters = [{ column: 'category', value: 'sports' }];
      const result = await apiService.columnFilter('ds1', filters);

      expect(result).toEqual(mockResult);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/column-filter',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ dataset: 'ds1', filters }),
        })
      );
    });
  });
});
