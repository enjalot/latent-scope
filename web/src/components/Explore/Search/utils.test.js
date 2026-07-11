import { describe, it, expect } from 'vitest';
import { applyFilterToUrlParams, filterConstants } from './utils';

describe('applyFilterToUrlParams', () => {
  it('replaces an existing cluster param when a feature is selected', () => {
    const params = new URLSearchParams('cluster=5');
    applyFilterToUrlParams(params, { type: filterConstants.FEATURE, value: 123 });
    expect(params.get('feature')).toBe('123');
    expect(params.has('cluster')).toBe(false);
  });

  it('replaces an existing feature param when a cluster is selected', () => {
    const params = new URLSearchParams('feature=123');
    applyFilterToUrlParams(params, { type: filterConstants.CLUSTER, value: 5 });
    expect(params.get('cluster')).toBe('5');
    expect(params.has('feature')).toBe(false);
  });

  it('clears column+value pairs when another filter is selected', () => {
    const params = new URLSearchParams('column=topic&value=science');
    applyFilterToUrlParams(params, { type: filterConstants.SEARCH, value: 'query' });
    expect(params.get('search')).toBe('query');
    expect(params.has('column')).toBe(false);
    expect(params.has('value')).toBe(false);
  });

  it('sets column and value for column filters', () => {
    const params = new URLSearchParams('feature=9');
    applyFilterToUrlParams(params, {
      type: filterConstants.COLUMN,
      column: 'topic',
      value: 'science',
    });
    expect(params.get('column')).toBe('topic');
    expect(params.get('value')).toBe('science');
    expect(params.has('feature')).toBe(false);
  });

  it('preserves unrelated params', () => {
    const params = new URLSearchParams('cluster=5&debug=1');
    applyFilterToUrlParams(params, { type: filterConstants.FEATURE, value: 7 });
    expect(params.get('debug')).toBe('1');
  });
});
