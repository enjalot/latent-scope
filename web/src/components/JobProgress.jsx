import React, { useRef, useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import './JobProgress.css';

JobProgress.propTypes = {
  job: PropTypes.object,
  onlyLast: PropTypes.bool,
  clearJob: PropTypes.func.isRequired,
  rerunJob: PropTypes.func,
};

function JobProgress({job, onlyLast, clearJob, rerunJob}) {
  const preRef = useRef(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [job]);

  return (
    <>
      { job ? <div className='job-progress'>
      Running <b>{job.job_name}</b><br/>
      <code>{job.command}</code>
      <pre ref={preRef}>
      {onlyLast ? 
        job.progress[job.progress.length -1] :
        job.progress.join("\n") 
      } 
      </pre>
      {job.status == "completed" ? <button onClick={clearJob}>👍</button> : null }
      {job.status == "error" ? 
        <div className="error-choices">
          <button onClick={clearJob}>🤬</button> 
          {rerunJob ? <button onClick={() => rerunJob(job)}>Rerun</button>  : null }
        </div>
      : null }
      </div>
      : <></> }
    </>
  );
}

export default JobProgress;
