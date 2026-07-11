import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { Modal } from 'react-element-forge';
import Job from './Job';

import SubNav from '../components/SubNav';
import { Badge, StatusDiode } from '../components/ui';
import { JOB_STATUS_META } from '../components/Job/Progress';
import { apiService, apiUrl } from '../lib/apiService';
import styles from './Jobs.module.scss';

function Jobs() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams();
  const navigate = useNavigate();
  const [scopes, setScopes] = useState([]);

  useEffect(() => {
    apiService.fetchDataset(datasetId).then(setDataset).catch(console.error);
    apiService.fetchScopes(datasetId).then(setScopes);
  }, [datasetId]);

  const [scope, setScope] = useState(null);
  useEffect(() => {
    apiService.fetchScope(datasetId, scopeId).then(setScope).catch(console.error);
  }, [datasetId, scopeId, setScope]);

  const [jobs, setJobs] = useState([]);
  useEffect(() => {
    fetch(`${apiUrl}/jobs/all?dataset=${datasetId}`)
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        data.sort((a, b) => +new Date(b.last_update) - +new Date(a.last_update));
        console.log(
          'jobs list',
          data.map((d) => d.last_update)
        );
        setJobs(data);
      })
      .catch(console.error);
  }, [datasetId, setJobs]);

  const navigateToScope = (e) => {
    navigate(`/datasets/${datasetId}/jobs/${e.target.value}`);
  };

  const [selectedJob, setSelectedJob] = useState(null);

  const handleJobClick = (job) => {
    setSelectedJob(job);
  };

  return (
    <div className={styles.page}>
      <SubNav dataset={dataset} scope={scope} scopes={scopes} onScopeChange={navigateToScope} />
      <div className={styles.content}>
        <div className={styles.header}>
          <h2>{dataset?.id} jobs</h2>
        </div>
        <div className={styles['jobs-list']}>
          {jobs.map((job) => {
            const meta = JOB_STATUS_META[job.status] || JOB_STATUS_META.dead;
            return (
              <button
                type="button"
                className={styles.job}
                key={job.id}
                onClick={() => handleJobClick(job)}
              >
                {/* list is a one-time fetch, not live — no pulse */}
                <StatusDiode status={meta.diode} />
                <span className={styles['job-name']}>{job.job_name}</span>
                <Badge mono variant={meta.variant}>
                  {meta.chip}
                </Badge>
                <span className={styles['job-id']}>{job.id}</span>
                <code className={styles['job-command']}>{job.command}</code>
              </button>
            );
          })}
        </div>

        <Modal
          isVisible={!!selectedJob}
          onClose={() => setSelectedJob(null)}
          className={styles.modal}
        >
          {selectedJob && <Job jobId={selectedJob?.id} datasetId={datasetId} />}
        </Modal>
      </div>
    </div>
  );
}

export default Jobs;
