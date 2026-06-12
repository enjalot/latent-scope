import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { jobPolling, useStartJobPolling } from './Run';

const dataset = { id: 'ds1' };
const URL = 'http://api/jobs/embed';

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

async function tick(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useStartJobPolling', () => {
  it('polls until the job completes, then stops', async () => {
    const responses = [
      { job_id: 'j1' }, // startJob response
      { id: 'j1', status: 'running', progress: ['step 1'] },
      { id: 'j1', status: 'running', progress: ['step 1', 'step 2'] },
      { id: 'j1', status: 'completed', progress: ['step 1', 'step 2', 'done'] },
    ];
    const fetchMock = vi.fn(() => jsonResponse(responses.shift()));
    vi.stubGlobal('fetch', fetchMock);

    const setJob = vi.fn();
    const { result } = renderHook(() => useStartJobPolling(dataset, setJob, URL));

    await act(async () => {
      result.current.startJob({ foo: 'bar' });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(`${URL}?dataset=ds1&foo=bar`);

    await tick(500);
    expect(setJob).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'running' }));

    await tick(500);
    await tick(500);
    expect(setJob).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // terminal status reached: interval must be cleared, no more polling
    await tick(3000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps polling through transient errors and recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ job_id: 'j1' }))
      .mockImplementationOnce(() => Promise.reject(new Error('blip')))
      .mockImplementationOnce(() => jsonResponse({}, false, 500))
      .mockImplementation(() => jsonResponse({ id: 'j1', status: 'running', progress: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const setJob = vi.fn();
    const { result } = renderHook(() => useStartJobPolling(dataset, setJob, URL));
    await act(async () => {
      result.current.startJob({});
    });

    await tick(500); // network error — swallowed
    await tick(500); // HTTP 500 — swallowed
    expect(setJob).not.toHaveBeenCalled();

    await tick(500); // recovers
    expect(setJob).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'running' }));
  });

  it('sets an error-shaped job (not null) after persistent fetch failures', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ job_id: 'j1' }))
      .mockImplementation(() => Promise.reject(new Error('network down')));
    vi.stubGlobal('fetch', fetchMock);

    const setJob = vi.fn();
    const { result } = renderHook(() => useStartJobPolling(dataset, setJob, URL));
    await act(async () => {
      result.current.startJob({});
    });

    for (let i = 0; i < 5; i++) {
      await tick(500);
    }
    expect(setJob).toHaveBeenCalledTimes(1);
    const arg = setJob.mock.calls[0][0];
    expect(arg).not.toBeNull();
    expect(arg.status).toBe('error');
    expect(arg.error).toBe('network down');
    expect(arg.id).toBe('j1');

    // polling stopped after giving up
    const calls = fetchMock.mock.calls.length;
    await tick(3000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('reports an error when starting the job fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('boom')))
    );
    const setJob = vi.fn();
    const { result } = renderHook(() => useStartJobPolling(dataset, setJob, URL));
    await act(async () => {
      result.current.startJob({});
    });
    expect(setJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', error: 'boom' }));
  });

  it('clears the interval on unmount: no fetch or setJob afterwards', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ job_id: 'j1' }))
      .mockImplementation(() => jsonResponse({ id: 'j1', status: 'running', progress: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const setJob = vi.fn();
    const { result, unmount } = renderHook(() => useStartJobPolling(dataset, setJob, URL));
    await act(async () => {
      result.current.startJob({});
    });
    await tick(500);
    expect(setJob).toHaveBeenCalledTimes(1);

    const fetchCalls = fetchMock.mock.calls.length;
    const setJobCalls = setJob.mock.calls.length;
    unmount();

    await tick(5000);
    expect(fetchMock.mock.calls.length).toBe(fetchCalls);
    expect(setJob.mock.calls.length).toBe(setJobCalls);
  });
});

describe('jobPolling (plain function API)', () => {
  it('returns a cleanup function that stops polling', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ id: 'j1', status: 'running', progress: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const setJob = vi.fn();
    const stop = jobPolling(dataset, setJob, 'j1', 500);
    await tick(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setJob).toHaveBeenCalledTimes(1);

    stop();
    await tick(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setJob).toHaveBeenCalledTimes(1);
  });
});
