import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock the apiService before importing the hook so the module picks up the mock.
vi.mock('@/lib/apiService', () => ({
  apiService: {
    fetchColumnValues: vi.fn(),
  },
}));

import { apiService } from '@/lib/apiService';
import { useColorBy } from './useColorBy';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useColorBy', () => {
  it('is off (null colors/legend) with no column selected', async () => {
    const { result } = renderHook(() => useColorBy('ds', 'scope-1'));
    expect(result.current.column).toBe(null);
    expect(result.current.pointColors).toBe(null);
    expect(result.current.legend).toBe(null);
    expect(apiService.fetchColumnValues).not.toHaveBeenCalled();
  });

  it('produces per-point RGB triples + a ramp legend for a numeric column', async () => {
    apiService.fetchColumnValues.mockResolvedValue({
      column: 'score',
      values: [0, 5, 10, null],
      extent: [0, 10],
      type: 'numeric',
    });

    const { result } = renderHook(() => useColorBy('ds', 'scope-1', 'score'));

    await waitFor(() => expect(result.current.pointColors).not.toBe(null));

    const colors = result.current.pointColors;
    expect(colors).toHaveLength(4);
    // Each present value maps to an [r,g,b] triple in 0..1.
    for (const c of colors.slice(0, 3)) {
      expect(c).toHaveLength(3);
      c.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    }
    // Min and max map to different colors along the ramp.
    expect(colors[0]).not.toEqual(colors[2]);
    // Missing value -> null (scatter draws it neutral gray).
    expect(colors[3]).toBe(null);

    expect(result.current.legend).toMatchObject({
      type: 'numeric',
      column: 'score',
      extent: [0, 10],
    });
    expect(typeof result.current.legend.interpolator).toBe('function');
  });

  it('maps category indices to a palette + swatch legend for categorical columns', async () => {
    apiService.fetchColumnValues.mockResolvedValue({
      column: 'label',
      values: [0, 1, 2, 0, -1],
      type: 'categorical',
      categorical: {
        categories: ['a', 'b', 'c'],
        counts: [2, 1, 1],
      },
    });

    const { result } = renderHook(() => useColorBy('ds', 'scope-1', 'label'));

    await waitFor(() => expect(result.current.pointColors).not.toBe(null));

    const colors = result.current.pointColors;
    expect(colors).toHaveLength(5);
    // Same category -> same color.
    expect(colors[0]).toEqual(colors[3]);
    // Different categories -> different colors.
    expect(colors[0]).not.toEqual(colors[1]);
    // Out-of-range index -> null.
    expect(colors[4]).toBe(null);

    expect(result.current.legend.type).toBe('categorical');
    expect(result.current.legend.categories).toHaveLength(3);
    expect(result.current.legend.categories[0]).toMatchObject({ label: 'a', count: 2 });
    expect(result.current.legend.categories[0].color).toMatch(/^#/);
  });

  it('clears data when the column is set back to null (off)', async () => {
    apiService.fetchColumnValues.mockResolvedValue({
      column: 'score',
      values: [0, 1],
      extent: [0, 1],
      type: 'numeric',
    });

    const { result } = renderHook(() => useColorBy('ds', 'scope-1', 'score'));
    await waitFor(() => expect(result.current.pointColors).not.toBe(null));

    result.current.setColumn(null);
    await waitFor(() => expect(result.current.pointColors).toBe(null));
    expect(result.current.legend).toBe(null);
  });
});
