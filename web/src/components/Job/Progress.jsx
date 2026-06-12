import { useRef, useState, useEffect, useMemo } from 'react';
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

  const isError = job?.status == 'error' || !!job?.error;

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
    if (isError && !allwaysOnlyLast) {
      setOnlyLast(false);
    }
  }, [job, isError, allwaysOnlyLast]);

  const history = useMemo(() => {
    return (job?.progress || []).filter((d) => !!d);
  }, [job]);

  const secondsSinceLastUpdate = Math.round((+new Date() - +new Date(job?.last_update)) / 1000);
  const totalTime = Math.round((+new Date(job?.last_update) - +new Date(job?.times?.[0])) / 1000);

  return (
    <>
      {job ? (
        <div className="job-progress">
          Running <b>{job.job_name}</b>
          <br />
          <code>{job.command}</code>
          <pre ref={preRef}>{onlyLast ? history[history.length - 1] : history.join('\n')}</pre>
          {isError ? (
            <div className="job-progress-error" style={{ color: '#b00020' }}>
              <b>Job failed{job.error ? `: ${job.error}` : ''}</b>
              {history.length ? <pre>{history.slice(-5).join('\n')}</pre> : null}
            </div>
          ) : null}
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
          {isError ? (
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
