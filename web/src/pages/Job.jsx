import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';

import { useStartJobPolling } from '../components/Job/Run';
import JobProgress from '../components/Job/Progress';

const apiUrl = import.meta.env.VITE_API_URL
const readonly = import.meta.env.MODE == "read_only"

function Job() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, job: jobId } = useParams(); 

  const [job, setJob] = useState(null);
  const { startJob: rerunJob } = useStartJobPolling(dataset, setJob, `${apiUrl}/jobs/rerun`);

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(setDataset)
      .catch(console.error);
  }, [datasetId, setDataset]);

  useEffect(() => {
    fetch(`${apiUrl}/jobs/job?dataset=${datasetId}&job_id=${jobId}`)
      .then(response => response.json())
      .then((data) => {
        console.log("job", data)
        setJob(data)
      })
      .catch(console.error);
  }, [datasetId, jobId, setJob]);


  function handleKill(job) {
    fetch(`${apiUrl}/jobs/kill?dataset=${datasetId}&job_id=${job.id}`)
      .then(response => response.json())
      .then(data => {
        console.log("killed job", data);
        setJob(data)
      })
      .catch(console.error);
  }

  function handleRerun(job) {
    // fetch(`${apiUrl}/jobs/rerun?dataset=${datasetId}&job_id=${job.id}`)
    //   .then(response => response.json())
    //   .then(data => {
    //     console.log("rerun job", data);
    //     setJob(data)
    //   })
    //   .catch(console.error);
    rerunJob({job_id: job?.id});
  }

  return (
    <div className="jobs-page">
      <h2><Link to={`/datasets/${datasetId}/jobs`}>Job List</Link></h2>
      <h3>{dataset?.id} job {job?.id}</h3>
      {job ? <div>
          <span className="job-status" style={{fontWeight:"bold", padding: "5px"}}>{job.status}</span>
          { job.status == "running" ? <button onClick={() => {handleKill(job)}}>💀</button> : null}
          { job.status == "error" || job.status == "dead" ? <button onClick={() => {handleRerun(job)}}>🔁</button> : null}
          <JobProgress job={job} clearJob={() => {}} />
      </div> : null }
    </div>
  );
}

export default Job;
