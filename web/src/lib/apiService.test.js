import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock hyparquet before importing apiService (it uses top-level await)
vi.mock('hyparquet', () => ({
  asyncBufferFromUrl: vi.fn(),
  parquetRead: vi.fn(),
}));

// Mock import.meta.env
vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { apiService, fetchJson } = await import('./apiService.js');

// Build a minimal ok Response-like object
const okJson = (data) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(data),
});

describe('fetchJson', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('parses JSON on ok responses', async () => {
    fetch.mockResolvedValueOnce(okJson({ hello: 'world' }));
    const result = await fetchJson('http://localhost:5001/api/thing');
    expect(result).toEqual({ hello: 'world' });
  });

  it('rejects on non-ok responses without parsing the body as JSON', async () => {
    const jsonSpy = vi.fn();
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('<html>Internal Server Error page</html>'),
      json: jsonSpy,
    });

    await expect(fetchJson('http://localhost:5001/api/thing')).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining('HTTP 500'),
    });
    // It must not try to JSON.parse the HTML error page.
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('includes a snippet of the error body in the error message', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('scope not found'),
    });

    await expect(fetchJson('http://localhost:5001/api/thing')).rejects.toThrow(
      /scope not found/
    );
  });

  it('still rejects when reading the error body fails', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: () => Promise.reject(new Error('body stream error')),
    });

    await expect(fetchJson('http://localhost:5001/api/thing')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('passes an AbortSignal through to fetch', async () => {
    fetch.mockResolvedValueOnce(okJson({}));
    const controller = new AbortController();

    await fetchJson('http://localhost:5001/api/thing', { signal: controller.signal });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5001/api/thing',
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('propagates abort errors from fetch', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    fetch.mockRejectedValueOnce(abortError);
    const controller = new AbortController();

    await expect(
      fetchJson('http://localhost:5001/api/thing', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

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
      fetch.mockResolvedValueOnce(okJson(mockData));

      const result = await apiService.fetchDataset('ds1');

      expect(fetch).toHaveBeenCalledWith('http://localhost:5001/api/datasets/ds1/meta', {});
      expect(result).toEqual(mockData);
    });

    it('throws on fetch error', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetch.mockRejectedValueOnce(new Error('network error'));
      await expect(apiService.fetchDataset('ds1')).rejects.toThrow('network error');
      consoleError.mockRestore();
    });

    it('throws on non-ok response', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('<html>error</html>'),
      });
      await expect(apiService.fetchDataset('ds1')).rejects.toMatchObject({ status: 500 });
      consoleError.mockRestore();
    });
  });

  describe('fetchScope', () => {
    it('fetches a scope by id', async () => {
      const mockScope = { id: 'scope-0', embedding_id: 'emb-0' };
      fetch.mockResolvedValueOnce(okJson(mockScope));

      const result = await apiService.fetchScope('ds1', 'scope-0');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/datasets/ds1/scopes/scope-0',
        {}
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
      fetch.mockResolvedValueOnce(okJson(mockScopes));

      const result = await apiService.fetchScopes('ds1');

      expect(result[0].id).toBe('scope-0');
      expect(result[1].id).toBe('scope-1');
      expect(result[2].id).toBe('scope-2');
    });
  });

  describe('fetchEmbeddings', () => {
    it('fetches embeddings for a dataset', async () => {
      const mockEmbeddings = [{ id: 'emb-0', model_id: 'bge-small' }];
      fetch.mockResolvedValueOnce(okJson(mockEmbeddings));

      const result = await apiService.fetchEmbeddings('ds1');

      expect(fetch).toHaveBeenCalledWith('http://localhost:5001/api/datasets/ds1/embeddings', {});
      expect(result).toEqual(mockEmbeddings);
    });
  });

  describe('fetchUmaps', () => {
    it('attaches image URL to each umap', async () => {
      const mockUmaps = [{ id: 'umap-0' }];
      fetch.mockResolvedValueOnce(okJson(mockUmaps));

      const result = await apiService.fetchUmaps('ds1');

      expect(result[0].url).toBe('http://localhost:5001/api/files/ds1/umaps/umap-0.png');
    });
  });

  describe('fetchClusters', () => {
    it('attaches image URL to each cluster', async () => {
      const mockClusters = [{ id: 'cluster-0' }];
      fetch.mockResolvedValueOnce(okJson(mockClusters));

      const result = await apiService.fetchClusters('ds1');

      expect(result[0].url).toBe('http://localhost:5001/api/files/ds1/clusters/cluster-0.png');
    });
  });

  describe('updateDataset', () => {
    it('URL-encodes key and value', async () => {
      fetch.mockResolvedValueOnce(okJson({}));

      await apiService.updateDataset('ds1', 'text_column', 'a value & more = stuff');

      const url = fetch.mock.calls[0][0];
      expect(url).toContain('key=text_column');
      expect(url).toContain('value=a+value+%26+more+%3D+stuff');
    });
  });

  describe('updateScopeLabelDescription', () => {
    it('URL-encodes label and description', async () => {
      fetch.mockResolvedValueOnce(okJson({}));

      await apiService.updateScopeLabelDescription('ds1', 'scope-0', 'My Label', 'a & b = c?');

      const url = fetch.mock.calls[0][0];
      expect(url).toContain('label=My+Label');
      expect(url).toContain('description=a+%26+b+%3D+c%3F');
    });
  });

  describe('searchNearestNeighbors', () => {
    it('constructs query params and returns indices with distances', async () => {
      const mockResponse = {
        indices: [5, 10, 15],
        distances: [0.1, 0.2, 0.3],
        search_embedding: [[0.1, 0.2]],
      };
      fetch.mockResolvedValueOnce(okJson(mockResponse));

      const embedding = { id: 'emb-0', dimensions: 384 };
      const result = await apiService.searchNearestNeighbors('ds1', embedding, 'hello');

      expect(result.indices).toEqual([5, 10, 15]);
      expect(result.distances).toEqual([0.1, 0.2, 0.3]);
      expect(result.searchEmbedding).toEqual([0.1, 0.2]);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('query=hello'), {});
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('dimensions=384'), {});
    });

    it('includes scope_id when scope is provided', async () => {
      const mockResponse = { indices: [], distances: [], search_embedding: [[]] };
      fetch.mockResolvedValueOnce(okJson(mockResponse));

      const embedding = { id: 'emb-0' };
      const scope = { id: 'scope-0' };
      await apiService.searchNearestNeighbors('ds1', embedding, 'test', scope);

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('scope_id=scope-0'), {});
    });
  });

  describe('fetchDataFromIndices', () => {
    it('sends indices as POST body and attaches index to each row', async () => {
      const mockRows = [{ text: 'hello' }, { text: 'world' }];
      fetch.mockResolvedValueOnce(okJson(mockRows));

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
      fetch.mockResolvedValueOnce(okJson(mockResponse));

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
      fetch.mockResolvedValueOnce(okJson({ ok: true }));

      await apiService.killJob('ds1', 'job-123');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5001/api/jobs/kill?dataset=ds1&job_id=job-123',
        {}
      );
    });
  });

  describe('columnFilter', () => {
    it('sends filter config as POST body', async () => {
      const mockResult = { indices: [1, 2, 3] };
      fetch.mockResolvedValueOnce(okJson(mockResult));

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
