import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock hyparquet (required by apiService top-level await)
vi.mock('hyparquet', () => ({
  asyncBufferFromUrl: vi.fn(),
  parquetRead: vi.fn(),
}));

vi.mock('../lib/SAE', () => ({
  saeAvailable: {},
}));

vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const mockScope = {
  id: 'scope-0',
  embedding_id: 'emb-0',
  embedding: { model_id: 'bge-small-en-v1.5' },
  dataset: { id: 'ds1', text_column: 'text', length: 3 },
  cluster_labels_lookup: [
    { cluster: 0, label: 'Cluster A', count: 0 },
    { cluster: 1, label: 'Cluster B', count: 0 },
  ],
  ls_version: '0.6.0',
};

const mockScopeRows = [
  { ls_index: 0, x: 0.1, y: 0.2, cluster: 0, deleted: false },
  { ls_index: 1, x: 0.3, y: 0.4, cluster: 1, deleted: false },
  { ls_index: 2, x: 0.5, y: 0.6, cluster: 0, deleted: true },
];

vi.mock('../lib/apiService', () => ({
  apiUrl: 'http://localhost:5001/api',
  apiService: {
    fetchScope: vi.fn(),
    fetchScopes: vi.fn(),
    fetchEmbeddings: vi.fn(),
    fetchTags: vi.fn(),
    fetchScopeRows: vi.fn(),
    getFeatures: vi.fn(),
    getDatasetFeatures: vi.fn(),
  },
}));

const { ScopeProvider, useScope } = await import('./ScopeContext');
const { apiService } = await import('../lib/apiService');

// Consumer component that renders context values for assertions
function ScopeConsumer() {
  const { scope, dataset, clusterLabels, clusterMap, deletedIndices, scopeLoaded } = useScope();
  if (!scopeLoaded) return <div>loading</div>;
  return (
    <div>
      <div data-testid="scope-id">{scope?.id}</div>
      <div data-testid="dataset-id">{dataset?.id}</div>
      <div data-testid="cluster-labels-count">{clusterLabels.length}</div>
      <div data-testid="deleted-count">{deletedIndices.length}</div>
      <div data-testid="cluster-map-0">{clusterMap[0]?.label}</div>
      <div data-testid="cluster-map-1">{clusterMap[1]?.label}</div>
      <div data-testid="cluster-a-count">{clusterLabels.find((c) => c.cluster === 0)?.count}</div>
      <div data-testid="cluster-b-count">{clusterLabels.find((c) => c.cluster === 1)?.count}</div>
    </div>
  );
}

function renderWithRouter(component, { datasetId = 'ds1', scopeId = 'scope-0' } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/datasets/${datasetId}/explore/${scopeId}`]}>
      <Routes>
        <Route
          path="/datasets/:dataset/explore/:scope"
          element={<ScopeProvider>{component}</ScopeProvider>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ScopeContext', () => {
  // Return a deep clone each call so tests cannot cross-contaminate via object mutation.
  const freshScope = () => JSON.parse(JSON.stringify(mockScope));

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    apiService.fetchScope.mockImplementation(() => Promise.resolve(freshScope()));
    apiService.fetchScopes.mockResolvedValue([mockScope]);
    apiService.fetchEmbeddings.mockResolvedValue([{ id: 'emb-0', model_id: 'bge-small-en-v1.5' }]);
    apiService.fetchTags.mockResolvedValue({});
    apiService.fetchScopeRows.mockResolvedValue(mockScopeRows);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('throws when useScope is used outside ScopeProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ScopeConsumer />)).toThrow(
      'useScope must be used within a ScopeProvider'
    );
    consoleError.mockRestore();
  });

  it('loads scope and dataset from API', async () => {
    renderWithRouter(<ScopeConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('scope-id').textContent).toBe('scope-0');
    });
    expect(screen.getByTestId('dataset-id').textContent).toBe('ds1');
  });

  it('builds clusterMap correctly from scope rows', async () => {
    renderWithRouter(<ScopeConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('cluster-map-0').textContent).toBe('Cluster A');
      expect(screen.getByTestId('cluster-map-1').textContent).toBe('Cluster B');
    });
  });

  it('identifies deleted indices', async () => {
    renderWithRouter(<ScopeConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('deleted-count').textContent).toBe('1');
    });
  });

  it('filters out deleted rows from clusterLabels', async () => {
    // Row 2 (ls_index=2) is in cluster 0 and deleted.
    // Both cluster 0 and 1 have non-deleted rows, so both labels should appear.
    renderWithRouter(<ScopeConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('cluster-labels-count').textContent).toBe('2');
    });
  });

  it('computes correct cluster counts from scope rows', async () => {
    // mockScopeRows: indices 0,2 → cluster 0; index 1 → cluster 1.
    // Counts are computed fresh each load, not accumulated.
    renderWithRouter(<ScopeConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('cluster-a-count').textContent).toBe('2');
    });
    expect(screen.getByTestId('cluster-b-count').textContent).toBe('1');
  });

  it('produces the same counts regardless of how many times the component mounts', async () => {
    // Render twice (simulates re-mount or strict mode double-invoke) and verify counts are stable.
    const { unmount } = renderWithRouter(<ScopeConsumer />);
    await waitFor(() => {
      expect(screen.getByTestId('cluster-a-count').textContent).toBe('2');
    });
    unmount();

    renderWithRouter(<ScopeConsumer />);
    await waitFor(() => {
      expect(screen.getByTestId('cluster-a-count').textContent).toBe('2');
    });
    expect(screen.getByTestId('cluster-b-count').textContent).toBe('1');
  });
});
