import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('hyparquet', () => ({
  asyncBufferFromUrl: vi.fn(),
  parquetRead: vi.fn(),
}));
vi.mock('../lib/SAE', () => ({ saeAvailable: {}, getSaeForModel: () => null }));
vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

// Shared mock scope rows used across tests
const makeScopeRows = (count, deletedSet = new Set()) =>
  Array.from({ length: count }, (_, i) => ({
    ls_index: i,
    x: i * 0.1,
    y: i * 0.1,
    cluster: i % 3,
    deleted: deletedSet.has(i),
  }));

const mockScope = {
  id: 'scope-0',
  embedding_id: 'emb-0',
  embedding: { model_id: 'bge-small-en-v1.5' },
  dataset: { id: 'ds1', text_column: 'text', length: 25 },
  cluster_labels_lookup: [
    { cluster: 0, label: 'A', count: 0 },
    { cluster: 1, label: 'B', count: 0 },
    { cluster: 2, label: 'C', count: 0 },
  ],
  ls_version: '0.6.0',
};

vi.mock('../lib/apiService', () => ({
  apiUrl: 'http://localhost:5001/api',
  apiService: {
    fetchScope: vi.fn(),
    fetchScopes: vi.fn(),
    fetchEmbeddings: vi.fn(),
    fetchTags: vi.fn(),
    fetchScopeRows: vi.fn(),
    fetchDataFromIndices: vi.fn(),
    getFeatures: vi.fn(),
    getDatasetFeatures: vi.fn(),
  },
}));

// Mock all hooks used by FilterContext to isolate its own logic.
// searchFilterMock is hoisted + stable so individual tests can control
// the promises returned by filter().
const { searchFilterMock } = vi.hoisted(() => ({
  searchFilterMock: { filter: vi.fn(), distances: [] },
}));
vi.mock('../hooks/useColumnFilter', () => ({
  default: () => ({ filter: vi.fn().mockResolvedValue([]), columnFilters: [] }),
}));
vi.mock('../hooks/useNearestNeighborsSearch', () => ({
  default: () => searchFilterMock,
}));
vi.mock('../hooks/useClusterFilter', () => ({
  default: () => ({ filter: vi.fn().mockReturnValue([]), setCluster: vi.fn() }),
}));
vi.mock('../hooks/useFeatureFilter', () => ({
  default: () => ({ filter: vi.fn().mockResolvedValue([]), setFeature: vi.fn(), feature: null }),
}));

const { ScopeProvider } = await import('./ScopeContext');
const { FilterProvider, useFilter } = await import('./FilterContext');
const { apiService } = await import('../lib/apiService');
const { filterConstants } = await import('../components/Explore/Search/utils');

function FilterConsumer() {
  const { shownIndices, filteredIndices, totalPages, page, loading, setFilterConfig } = useFilter();
  return (
    <div>
      <div data-testid="shown-count">{shownIndices.length}</div>
      <div data-testid="filtered-count">{filteredIndices.length}</div>
      <div data-testid="filtered-indices">{filteredIndices.join(',')}</div>
      <div data-testid="total-pages">{totalPages}</div>
      <div data-testid="page">{page}</div>
      <div data-testid="loading">{loading ? 'true' : 'false'}</div>
      <button
        data-testid="search-first"
        onClick={() =>
          setFilterConfig({ type: filterConstants.SEARCH, value: 'first', label: 'first' })
        }
      >
        search first
      </button>
      <button
        data-testid="search-second"
        onClick={() =>
          setFilterConfig({ type: filterConstants.SEARCH, value: 'second', label: 'second' })
        }
      >
        search second
      </button>
    </div>
  );
}

function renderWithProviders({ scopeRows = makeScopeRows(25) } = {}) {
  apiService.fetchScope.mockResolvedValue(mockScope);
  apiService.fetchScopes.mockResolvedValue([mockScope]);
  apiService.fetchEmbeddings.mockResolvedValue([]);
  apiService.fetchTags.mockResolvedValue({});
  apiService.fetchScopeRows.mockResolvedValue(scopeRows);
  apiService.fetchDataFromIndices.mockResolvedValue([]);

  return render(
    <MemoryRouter initialEntries={['/datasets/ds1/explore/scope-0']}>
      <Routes>
        <Route
          path="/datasets/:dataset/explore/:scope"
          element={
            <ScopeProvider>
              <FilterProvider>
                <FilterConsumer />
              </FilterProvider>
            </ScopeProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('FilterContext', () => {
  beforeEach(() => {
    searchFilterMock.filter.mockReset();
    searchFilterMock.filter.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('throws when useFilter is used outside FilterProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<FilterConsumer />)).toThrow(
      'useFilter must be used within a FilterProvider'
    );
    consoleError.mockRestore();
  });

  it('shows all non-deleted indices on first page when no filter is active', async () => {
    renderWithProviders({ scopeRows: makeScopeRows(25) });

    await waitFor(() => {
      // 25 rows, first page shows 20 (ROWS_PER_PAGE)
      expect(screen.getByTestId('shown-count').textContent).toBe('20');
    });
    expect(screen.getByTestId('filtered-count').textContent).toBe('25');
  });

  it('calculates correct total pages', async () => {
    renderWithProviders({ scopeRows: makeScopeRows(25) });

    await waitFor(() => {
      // ceil(25/20) = 2
      expect(screen.getByTestId('total-pages').textContent).toBe('2');
    });
  });

  it('excludes deleted indices from shown results', async () => {
    const scopeRows = makeScopeRows(25, new Set([0, 1, 2, 3, 4])); // 5 deleted
    renderWithProviders({ scopeRows });

    await waitFor(() => {
      // 20 non-deleted rows, all fit on page 1
      expect(screen.getByTestId('filtered-count').textContent).toBe('20');
      expect(screen.getByTestId('total-pages').textContent).toBe('1');
    });
  });

  it('starts on page 0', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId('page').textContent).toBe('0');
    });
  });

  it('shows correct count when rows fit on a single page', async () => {
    renderWithProviders({ scopeRows: makeScopeRows(10) });

    await waitFor(() => {
      expect(screen.getByTestId('shown-count').textContent).toBe('10');
      expect(screen.getByTestId('total-pages').textContent).toBe('1');
    });
  });

  it('discards stale filter results when a newer run resolves first', async () => {
    // Controllable promises keyed by the search value.
    const resolvers = {};
    searchFilterMock.filter.mockImplementation(
      (value) =>
        new Promise((resolve) => {
          resolvers[value] = resolve;
        })
    );

    renderWithProviders({ scopeRows: makeScopeRows(25) });

    await waitFor(() => {
      expect(screen.getByTestId('filtered-count').textContent).toBe('25');
    });

    // Start the first search, then a second one before the first resolves.
    fireEvent.click(screen.getByTestId('search-first'));
    await waitFor(() => expect(resolvers.first).toBeDefined());
    fireEvent.click(screen.getByTestId('search-second'));
    await waitFor(() => expect(resolvers.second).toBeDefined());

    // Resolve out of order: the newer (second) run resolves first...
    await act(async () => {
      resolvers.second([1, 2]);
    });
    await waitFor(() => {
      expect(screen.getByTestId('filtered-indices').textContent).toBe('1,2');
    });

    // ...then the stale first run resolves. It must not overwrite the results.
    await act(async () => {
      resolvers.first([3, 4, 5]);
    });
    expect(screen.getByTestId('filtered-indices').textContent).toBe('1,2');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });
});
