import { useCallback, useEffect, useRef } from 'react';
const apiUrl = import.meta.env.VITE_API_URL;

const TERMINAL_STATUSES = ['completed', 'error', 'dead'];
// number of consecutive failed polls tolerated before giving up
const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Start polling a job's status file. Plain function (no React) so it can be
 * used outside hooks; returns a cleanup function that stops the polling.
 *
 * On transient fetch/HTTP errors it keeps polling for up to
 * MAX_CONSECUTIVE_ERRORS attempts, then stops and reports an error-shaped job
 * ({ ...lastKnownJob, status: 'error', error }) instead of null so the UI can
 * keep showing the terminal output.
 */
function jobPolling(dataset, setJob, jobId, intervalms = 500) {
  let intervalId = null;
  let stopped = false;
  let consecutiveErrors = 0;
  let lastKnownJob = { id: jobId };

  const stop = () => {
    stopped = true;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  const poll = () => {
    fetch(`${apiUrl}/jobs/job?dataset=${dataset?.id}&job_id=${jobId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((jobData) => {
        if (stopped) return;
        consecutiveErrors = 0;
        lastKnownJob = jobData;
        if (TERMINAL_STATUSES.includes(jobData.status)) {
          stop();
        }
        setJob(jobData);
      })
      .catch((error) => {
        if (stopped) return;
        consecutiveErrors += 1;
        console.error('Error polling job status', error);
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          stop();
          setJob({ ...lastKnownJob, status: 'error', error: error.message });
        }
      });
  };

  intervalId = setInterval(poll, intervalms);
  return stop;
}

/**
 * Hook wrapper around jobPolling with proper lifecycle:
 * - keeps the active poller in a ref; starting a new poll stops the previous
 *   one (no duplicate pollers)
 * - stops polling and suppresses setJob calls after unmount
 */
function useJobPolling(dataset, setJob, intervalms = 500) {
  const stopRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (stopRef.current) {
        stopRef.current();
        stopRef.current = null;
      }
    };
  }, []);

  const safeSetJob = useCallback(
    (job) => {
      if (mountedRef.current) setJob(job);
    },
    [setJob]
  );

  const stopPolling = useCallback(() => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (jobId) => {
      stopPolling();
      stopRef.current = jobPolling(dataset, safeSetJob, jobId, intervalms);
    },
    [dataset, safeSetJob, intervalms, stopPolling]
  );

  return { startPolling, stopPolling, safeSetJob };
}

/**
 * Kick off a job via a GET endpoint and poll its status until it reaches a
 * terminal state. Returns { startJob }.
 */
function useStartJobPolling(dataset, setJob, url, intervalms = 500) {
  const { startPolling, safeSetJob } = useJobPolling(dataset, setJob, intervalms);

  const startJob = useCallback(
    (params) => {
      fetch(`${url}?dataset=${dataset?.id}&${new URLSearchParams(params)}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          startPolling(data.job_id);
        })
        .catch((error) => {
          console.error('Error starting job', error);
          safeSetJob({ status: 'error', error: error.message });
        });
    },
    [dataset, url, startPolling, safeSetJob]
  );

  return { startJob };
}

export { jobPolling, useJobPolling, useStartJobPolling };
