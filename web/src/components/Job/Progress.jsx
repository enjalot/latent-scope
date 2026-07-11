import { useRef, useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Button } from 'react-element-forge';

import { Badge, StatusDiode, Readout } from '../ui';
import styles from './Progress.module.css';

// One shared vocabulary for job status: mono chip label, badge wash, diode state.
// Mapping: running=busy (pulse when live) · completed=ready · error=critical · dead=offline.
export const JOB_STATUS_META = {
  running: { chip: 'RUN', variant: 'warning', diode: 'busy', pulse: true },
  completed: { chip: 'OK', variant: 'success', diode: 'ready', pulse: false },
  error: { chip: 'ERR', variant: 'critical', diode: 'critical', pulse: false },
  dead: { chip: 'DEAD', variant: 'neutral', diode: 'offline', pulse: false },
};

// Elapsed seconds → mono telemetry, e.g. T+00:42 (minutes keep growing past 60)
export function formatElapsed(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

JobProgress.propTypes = {
  job: PropTypes.object,
  overrideOnlyLast: PropTypes.bool,
  alwaysOnlyLast: PropTypes.bool,
  clearJob: PropTypes.func,
  rerunJob: PropTypes.func,
  killJob: PropTypes.func,
};

function JobProgress({
  job,
  overrideOnlyLast = true,
  alwaysOnlyLast = false,
  clearJob,
  rerunJob,
  killJob,
}) {
  const preRef = useRef(null);
  const [onlyLast, setOnlyLast] = useState(overrideOnlyLast);

  // 'dead' covers killed jobs and vanished processes — they need the same
  // dismiss/rerun escape hatch as errors, or the step's form stays disabled
  const isError = job?.status == 'error' || job?.status == 'dead' || !!job?.error;

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
    if (isError && !alwaysOnlyLast) {
      setOnlyLast(false);
    }
  }, [job, isError, alwaysOnlyLast]);

  const history = useMemo(() => {
    return (job?.progress || []).filter((d) => !!d);
  }, [job]);

  const secondsSinceLastUpdate = Math.round((+new Date() - +new Date(job?.last_update)) / 1000);
  const totalTime = Math.round((+new Date(job?.last_update) - +new Date(job?.times?.[0])) / 1000);

  const statusMeta = JOB_STATUS_META[job?.status] ||
    (isError ? JOB_STATUS_META.error : null) || {
      chip: String(job?.status || 'unknown').toUpperCase(),
      variant: 'neutral',
      diode: 'offline',
      pulse: false,
    };

  return (
    <>
      {job ? (
        <div className={styles['job-progress']}>
          <div className={styles.header}>
            <StatusDiode status={statusMeta.diode} pulse={statusMeta.pulse} />
            <span className={styles['job-name']}>{job.job_name}</span>
            <Badge mono variant={statusMeta.variant}>
              {statusMeta.chip}
            </Badge>
          </div>
          <code className={styles.command}>
            {Array.isArray(job.command) ? job.command.join(' ') : job.command}
          </code>
          <pre
            ref={preRef}
            className={`ls-console ${onlyLast ? styles['log-collapsed'] : styles['log-expanded']}`}
          >
            {onlyLast ? history[history.length - 1] : history.join('\n')}
          </pre>
          {history.length > 1 && !alwaysOnlyLast ? (
            <button type="button" className={styles['log-toggle']} onClick={() => setOnlyLast((v) => !v)}>
              {onlyLast ? `▸ Show full log (${history.length} lines)` : '▾ Show latest only'}
            </button>
          ) : null}
          {isError ? (
            <div className={styles['job-progress-error']}>
              <span className={styles['error-message']}>
                {job.status == 'dead'
                  ? `Job ${job.cause_of_death == 'killed' ? 'killed' : 'died'}`
                  : `Job failed${job.error ? `: ${job.error}` : ''}`}
              </span>
              {history.length ? (
                <pre className="ls-console">
                  <span className="ls-console__line ls-console__line--error">
                    {history.slice(-5).join('\n')}
                  </span>
                </pre>
              ) : null}
            </div>
          ) : null}
          <div className={styles.footer}>
            <div className={styles.actions}>
              {clearJob && job.status == 'completed' ? (
                <Button
                  type="button"
                  color="secondary"
                  variant="clear"
                  size="small"
                  onClick={clearJob}
                  text="Dismiss"
                />
              ) : null}
              {killJob && job.status == 'running' ? (
                <Button
                  type="button"
                  color="delete"
                  size="small"
                  onClick={() => {
                    killJob(job);
                  }}
                  text="Kill"
                />
              ) : null}
              {isError && clearJob ? (
                <Button
                  type="button"
                  color="secondary"
                  variant="clear"
                  size="small"
                  onClick={clearJob}
                  text="Dismiss"
                />
              ) : null}
              {isError && rerunJob ? (
                <Button
                  type="button"
                  color="secondary"
                  size="small"
                  onClick={() => rerunJob(job)}
                  text="Rerun"
                />
              ) : null}
            </div>
            <Readout
              label={job.status == 'running' ? 'SINCE UPDATE' : 'TOTAL'}
              value={formatElapsed(job.status == 'running' ? secondsSinceLastUpdate : totalTime)}
            />
          </div>
        </div>
      ) : (
        <></>
      )}
    </>
  );
}

export default JobProgress;
