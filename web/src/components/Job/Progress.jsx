import React, { useRef, useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';

import './Progress.css';

JobProgress.propTypes = {
  job: PropTypes.object,
  allwaysOnlyLast: PropTypes.bool,
  clearJob: PropTypes.func,
  rerunJob: PropTypes.func,
  killJob: PropTypes.func,
};

function JobProgress({
  job,
  overrideOnlyLast = true,
  allwaysOnlyLast = false,
  clearJob,
  rerunJob,
  killJob,
}) {
  const preRef = useRef(null);
  const [onlyLast, setOnlyLast] = useState(overrideOnlyLast);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
    if (job?.status == 'error' && !allwaysOnlyLast) {
      setOnlyLast(false);
    }
  }, [job, allwaysOnlyLast]);

  const history = useMemo(() => {
    return job?.progress.filter((d) => !!d);
  }, [job]);

  const secondsSinceLastUpdate = Math.round((+new Date() - +new Date(job?.last_update)) / 1000);
  const totalTime = Math.round((+new Date(job?.last_update) - +new Date(job?.times[0])) / 1000);

  return (
    <>
      {job ? (
        <div className="job-progress">
          Running <b>{job.job_name}</b>
          <br />
          <code>{job.command}</code>
          <pre ref={preRef}>{onlyLast ? history[history.length - 1] : history.join('\n')}</pre>
          {clearJob && job.status == 'completed' ? (
            <button onClick={clearJob}>👍 Dismiss</button>
          ) : null}
          {killJob && job.status == 'running' ? (
            <button
              onClick={() => {
                killJob(job);
              }}
            >
              💀 Kill
            </button>
          ) : null}
          {job.status == 'error' ? (
            <div className="error-choices">
              {clearJob ? <button onClick={clearJob}>🤬 Dismiss</button> : null}
              {rerunJob ? <button onClick={() => rerunJob(job)}>🔁 Rerun</button> : null}
            </div>
          ) : null}
          <span className="timer">
            {job.status == 'running'
              ? `${secondsSinceLastUpdate} seconds since last update`
              : `Total time: ${totalTime} seconds`}
          </span>
        </div>
      ) : (
        <></>
      )}
    </>
  );
}

export default JobProgress;
