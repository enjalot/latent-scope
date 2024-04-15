import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';

import { useStartJobPolling } from '../components/Job/Run';
import JobProgress from '../components/Job/Progress';

const apiUrl = import.meta.env.VITE_API_URL
const readonly = import.meta.env.MODE == "read_only"

import './Jobs.css';

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
        console.log(data)
        data.sort((a,b) => +new Date(b.last_update) - +new Date(a.last_update))
        console.log("jobs list", data.map(d => d.last_update))
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
      <div className="jobs-header">
        <h2>{dataset?.id} jobs</h2>
        <Link to={`/datasets/${datasetId}/setup`}>Setup {dataset?.id}</Link>
      </div>
      <div className="jobs-list">
      {jobs.map(job => (
        <div className="job" key={job.id}>
          <span><Link to={`/datasets/${datasetId}/jobs/${job.id}`}>Job Details</Link></span>
          <span className="job-name">{job.job_name}</span>
          <span className="job-status" style={{fontWeight:"bold", padding: "5px"}}>
            {job.status == "completed" ? "👍" : ""} 
            {job.status == "error" ? "🤬" : ""} 
            {job.status == "dead" ? "💀" : ""}
            {job.status == "running" ? "🏃‍♂️" : ""} 
            {/* {job.status} */}
            </span>
          <span className="job-id" style={{fontSize: "10px", padding: "5px"}}>{job.id}</span>
          <span><code>{job.command}</code></span>
          {/* { job.status == "running" ? <button onClick={() => {handleKill(job)}}>💀</button> : null} */}
          {/* { job.status == "error" || job.status == "dead" ? <button onClick={() => {handleRerun(job)}}>🔁</button> : null} */}
          {/* <JobProgress job={job} clearJob={() => {}} /> */}
        </div>
      ))}
      </div>
    </div>
  );
}

export default Jobs;
