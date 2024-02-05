import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';

import { useStartJobPolling } from '../components/Job/Run';
import JobProgress from '../components/Job/Progress';

const apiUrl = import.meta.env.VITE_API_URL
const readonly = import.meta.env.MODE == "read_only"

function Jobs() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams(); 

  useEffect(() => {
    fetch(`${apiUrl}/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(setDataset)
      .catch(console.error);
  }, [datasetId, setDataset]);

  const [jobs, setJobs] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/jobs/all?dataset=${datasetId}`)
      .then(response => response.json())
      .then((data) => {
        data.sort((a,b) => +new Date(b.last_updated) - +new Date(a.last_updated))
        setJobs(data)
      })
      .catch(console.error);
  }, [datasetId, setJobs]);


  function handleKill(job) {
    fetch(`${apiUrl}/jobs/kill?dataset=${datasetId}&job_id=${job.id}`)
      .then(response => response.json())
      .then(data => {
        console.log("killed job", data);
        setJobs((jobs) => jobs.map(j => j.id === job.id ? data : j));
      })
      .catch(console.error);
  }

  function handleRerun(job) {
    fetch(`${apiUrl}/jobs/rerun?dataset=${datasetId}&job_id=${job.id}`)
      .then(response => response.json())
      .then(data => {
        console.log("rerun job", data);
        setJobs((jobs) => jobs.map(j => j.id === job.id ? data : j));
      })
      .catch(console.error);
  }

  return (
    <div className="jobs-page">
      <h2>Dataset: {dataset?.id} Jobs</h2>
      <ul>
      {jobs.map(job => (
        <li key={job.id}>
          <Link to={`/datasets/${datasetId}/jobs/${job.id}`}>Job Details</Link>
          <span className="job-status" style={{fontWeight:"bold", padding: "5px"}}>{job.status}</span>
          <code>{job.command}</code>
          <span className="job-id" style={{fontSize: "10px", padding: "5px"}}>{job.id}</span>
          { job.status == "running" ? <button onClick={() => {handleKill(job)}}>💀</button> : null}
          { job.status == "error" || job.status == "dead" ? <button onClick={() => {handleRerun(job)}}>🔁</button> : null}
          {/* <JobProgress job={job} clearJob={() => {}} /> */}
        </li>
      ))}
      </ul>
    </div>
  );
}

export default Jobs;
