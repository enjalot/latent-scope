import React, { useRef, useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import './JobProgress.css';

JobProgress.propTypes = {
  job: PropTypes.object,
  onlyLast: PropTypes.bool,
};

function JobProgress({job, onlyLast}) {
  const preRef = useRef(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [job]);

  return (
    <div className='job-progress'>
      { job ? <>
      Running <b>{job.job_name}</b><br/>
      <code>{job.command}</code>
      <pre ref={preRef}>
      {onlyLast ? 
        job.progress[job.progress.length -1] :
        job.progress.join("\n") 
      } 
      </pre>
      </>
      : <></> }
    </div>
  );
}

export default JobProgress;
