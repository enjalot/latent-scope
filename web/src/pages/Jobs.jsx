import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { Button, Modal } from 'react-element-forge';
import Job from './Job';

import SubNav from '../components/SubNav';
import { apiService, apiUrl } from '../lib/apiService';
import styles from './Jobs.module.scss';

function Jobs() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId, scope: scopeId } = useParams();
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

  function handleKill(job) {
    fetch(`${apiUrl}/jobs/kill?dataset=${datasetId}&job_id=${job.id}`)
      .then((response) => response.json())
      .then((data) => {
        console.log('killed job', data);
        setJobs((jobs) => jobs.map((j) => (j.id === job.id ? data : j)));
      })
      .catch(console.error);
  }

  function handleRerun(job) {
    fetch(`${apiUrl}/jobs/rerun?dataset=${datasetId}&job_id=${job.id}`)
      .then((response) => response.json())
      .then((data) => {
        console.log('rerun job', data);
        setJobs((jobs) => jobs.map((j) => (j.id === job.id ? data : j)));
      })
      .catch(console.error);
  }

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
          {jobs.map((job) => (
            <div className={styles.job} key={job.id} onClick={() => handleJobClick(job)}>
              <span className={styles['job-name']}>{job.job_name}</span>
              <span className={styles['job-status']}>
                {job.status === 'completed' && '👍'}
                {job.status === 'error' && '🤬'}
                {job.status === 'dead' && '💀'}
                {job.status === 'running' && '🏃‍♂️'}
              </span>
              <span className={styles['job-id']}>{job.id}</span>
              <span>
                <code>{job.command}</code>
              </span>
            </div>
          ))}
        </div>

        <Modal isVisible={!!selectedJob} onClose={() => setSelectedJob(null)}>
          {selectedJob && <Job jobId={selectedJob?.id} datasetId={datasetId} />}
        </Modal>
      </div>
    </div>
  );
}

export default Jobs;
