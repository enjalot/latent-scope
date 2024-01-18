import { useState, useEffect, useCallback } from 'react';

function useJobPolling(dataset, setJob, url) {
  const [intervalId, setIntervalId] = useState(null);
  const startJob = useCallback((params) => {
    fetch(`${url}?dataset=${dataset.id}&${new URLSearchParams(params)}`)
      .then(response => response.json())
      .then(data => {
        const jobId = data.job_id;
        console.log("start polling", jobId);
        const newIntervalId = setInterval(() => {
          fetch(`http://localhost:5001/scripts/job?dataset=${dataset.id}&job_id=${jobId}`)
            .then(response => {
              if (!response.ok) {
                clearInterval(newIntervalId);
                setIntervalId(null);
                setJob(null);
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.json();
            })
            .then(jobData => {
              console.log("polling job status", jobData);
              setJob(jobData);
              if (jobData.status === "completed") {
                clearInterval(newIntervalId);
                setIntervalId(null);
                setTimeout(() => {
                  setJob(null);
                  setJob(jobData);
                }, 200)
              }
            })
            .catch(error => {
              console.error("Error polling job status", error);
              clearInterval(newIntervalId);
              setIntervalId(null)
              setJob(null)
              // TODO: have some kind of error state persist
            });
        }, 100);
        setIntervalId(newIntervalId);
      });
  }, [dataset, setJob, url]);

  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  return { startJob };
}

export default useJobPolling;