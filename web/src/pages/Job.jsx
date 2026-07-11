import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useStartJobPolling, useJobPolling } from '../components/Job/Run';
import JobProgress from '../components/Job/Progress';

import { apiUrl } from '../lib/apiService';
import styles from './Job.module.css';

function Job({ datasetId, jobId }) {
  const [dataset, setDataset] = useState(null);

  const navigate = useNavigate();
  const [job, setJob] = useState(null);

  // jobPolling only needs the dataset id; memoize so the polling callbacks
  // stay stable and don't restart when the dataset metadata loads
  const datasetRef = useMemo(() => ({ id: datasetId }), [datasetId]);
  const { startPolling, stopPolling } = useJobPolling(datasetRef, setJob, 200);

  const jobCB = useCallback(
    (job) => {
      if (job?.id) {
        navigate(`/datasets/${datasetId}/jobs/${job.id}`);
      } else if (job) {
        // error-shaped object from a failed start/rerun (no id):
        // show it on this page instead of navigating to /jobs/undefined
        setJob(job);
      }
    },
    [datasetId, navigate]
  );
  const { startJob: rerunJob } = useStartJobPolling(datasetRef, jobCB, `${apiUrl}/jobs/rerun`);

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then((response) => response.json())
      .then(setDataset)
      .catch(console.error);
  }, [datasetId, setDataset]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/jobs/job?dataset=${datasetId}&job_id=${jobId}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setJob(data);
        if (data?.status === 'running') {
          startPolling(data.id);
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [datasetId, jobId, startPolling, stopPolling]);

  function handleKill(job) {
    fetch(`${apiUrl}/jobs/kill?dataset=${datasetId}&job_id=${job.id}`)
      .then((response) => response.json())
      .then((data) => {
        console.log('killed job', data);
        setJob(data);
      })
      .catch(console.error);
  }

  function handleRerun(job) {
    rerunJob({ job_id: job?.id });
  }

  return (
    <div className={styles.page}>
      <h3 className={styles.title}>
        {dataset?.id} job <span className={styles['job-id']}>{job?.id}</span>
      </h3>
      {job ? (
        <JobProgress
          job={job}
          rerunJob={handleRerun}
          killJob={handleKill}
          overrideOnlyLast={false}
        />
      ) : null}
    </div>
  );
}

export default Job;
