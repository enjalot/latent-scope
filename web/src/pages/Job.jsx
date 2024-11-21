import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { useStartJobPolling, jobPolling } from '../components/Job/Run';
import JobProgress from '../components/Job/Progress';

import { apiService, apiUrl } from '../lib/apiService';

function Job({ datasetId, jobId }) {
  const [dataset, setDataset] = useState(null);

  const navigate = useNavigate();
  const [job, setJob] = useState(null);

  const jobCB = useCallback(
    (job) => {
      console.log('new job', job);
      if (job) navigate(`/datasets/${datasetId}/jobs/${job.id}`);
    },
    [datasetId, navigate]
  );
  const { startJob: rerunJob } = useStartJobPolling(dataset, jobCB, `${apiUrl}/jobs/rerun`);

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then((response) => response.json())
      .then(setDataset)
      .catch(console.error);
  }, [datasetId, setDataset]);

  useEffect(() => {
    fetch(`${apiUrl}/jobs/job?dataset=${datasetId}&job_id=${jobId}`)
      .then((response) => response.json())
      .then((data) => {
        console.log('job', data);
        setJob(data);
        if (data?.status === 'running') {
          // start polling
          jobPolling(dataset, setJob, data.id, 200);
        }
      })
      .catch(console.error);
  }, [datasetId, jobId, setJob, dataset]);

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
    <div className="jobs-page">
      <h3>
        {dataset?.id} job {job?.id}
      </h3>
      {job ? (
        <div>
          <span className="job-status" style={{ fontWeight: 'bold', padding: '5px' }}>
            {job.status}
          </span>
          {/* { job.status == "running" ? <button onClick={() => {handleKill(job)}}>💀 Kill</button> : null} */}
          {/* { job.status == "error" || job.status == "dead" ? <button onClick={() => {handleRerun(job)}}>🔁 Rerun</button> : null} */}
          <JobProgress
            job={job}
            rerunJob={handleRerun}
            killJob={handleKill}
            overrideOnlyLast={false}
          />
        </div>
      ) : null}
    </div>
  );
}

export default Job;
