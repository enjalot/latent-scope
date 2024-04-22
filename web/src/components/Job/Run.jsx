import { useState, useEffect, useCallback } from 'react';
const apiUrl = import.meta.env.VITE_API_URL

function jobPolling(dataset, setJob, jobId, intervalms = 500) {
  let intervalId = null
  console.log("start polling", jobId);
  intervalId = setInterval(() => {
    fetch(`${apiUrl}/jobs/job?dataset=${dataset?.id}&job_id=${jobId}`)
      .then(response => {
        if (!response.ok) {
          clearInterval(intervalId);
          setJob(null);
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(jobData => {
        console.log("polling job status", jobData);
        setJob(jobData);
        if (jobData.status === "completed" || jobData.status === "error" || jobData.status == "dead") {
          clearInterval(intervalId);
          setTimeout(() => {
            setJob(null);
            setJob(jobData);
          }, intervalms)
        }
      })
      .catch(error => {
        console.error("Error polling job status", error);
        clearInterval(intervalId);
        setJob(null)
        // TODO: have some kind of error state persist
      });
  }, intervalms);
  // console.log("returning jobPolling cleanup")
  return () => {
    console.log("inside cleanup", intervalId)
    if (intervalId) {
      clearInterval(intervalId);
    }
  }
}

function useStartJobPolling(dataset, setJob, url, intervalms = 500) {
  // const [cleanup, setCleanup] = useState(() => {})
  const startJob = useCallback((params) => {
    fetch(`${url}?dataset=${dataset.id}&${new URLSearchParams(params)}`)
      .then(response => response.json())
      .then(data => {
        const jobId = data.job_id;
        const cleanup = jobPolling(dataset, setJob, jobId, intervalms)
        // console.log("start job cleanup", cleanup)
        // setCleanup(cleanup)
      });
  }, [dataset, setJob, url]);
  // useEffect(() => {
  //   return () => {
  //     if(cleanup)
  //       cleanup()
  //   };
  // }, [cleanup])
  return { startJob };
}

export { 
  jobPolling,
  useStartJobPolling
}