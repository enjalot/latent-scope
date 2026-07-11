import { useState, useEffect, useCallback } from 'react';
import JobProgress from '../Job/Progress';
import { useStartJobPolling } from '../Job/Run';

import { Button } from 'react-element-forge';

import { apiService, apiUrl } from '../../lib/apiService';
import { useSetup } from '../../contexts/SetupContext';

import styles from './Sae.module.scss';

// TODO: this component will for now just assume a single SAE for an embedding
// We only have one SAE model currently available really
// When we have more we can allow for multiple SAEs per embedding
function Sae({ embedding, model, onSAE = () => {} }) {
  const { dataset } = useSetup();

  const [sae, setSae] = useState(null);
  const [saes, setSaes] = useState([]);
  const [saeJob, setSaeJob] = useState(null);
  const { startJob: startSaeJob } = useStartJobPolling(dataset, setSaeJob, `${apiUrl}/jobs/sae`);
  const { startJob: deleteSaeJob } = useStartJobPolling(
    dataset,
    setSaeJob,
    `${apiUrl}/jobs/delete/sae`
  );
  const { startJob: rerunSaeJob } = useStartJobPolling(dataset, setSaeJob, `${apiUrl}/jobs/rerun`);

  useEffect(() => {
    apiService.fetchSaes(dataset.id).then((saes) => {
      setSaes(saes);
      if (saes.length) {
        setSae(saes[0]);
        onSAE(saes[0]);
      }
    });
  }, [dataset, setSaes]);

  useEffect(() => {
    if (saeJob?.status === 'completed') {
      apiService.fetchSaes(dataset.id).then((saes) => {
        setSaes(saes);
        let s;
        if (saeJob.job_name == 'sae') {
          s = saes.find((d) => d.id == saeJob.run_id);
        } else if (saeJob.job_name == 'rm') {
          s = saes[saes.length - 1];
        }
        setSae(s);
        onSAE(s);
      });
    }
  }, [saeJob, dataset, setSaes, setSae]);

  const handleNewSae = useCallback(
    (e) => {
      e.preventDefault();
      let job = {
        model_id: model.model_id,
        k_expansion: model.k_expansion,
        embedding_id: embedding.id,
      };
      startSaeJob(job);
    },
    [startSaeJob, model, embedding]
  );

  const handleRerunSae = (job) => {
    rerunSaeJob({ job_id: job?.id });
  };

  useEffect(() => {
    console.log('SAE', sae);
    console.log('SAES', saes);
  }, [sae, saes]);

  return (
    <div className={styles['sae']}>
      <div className={styles['saes-form']}>
        {/* The form for creating a new SAE */}
        {!sae && !saeJob ? (
          <form onSubmit={handleNewSae}>
            <Button type="submit" color="secondary" disabled={!!saeJob} text="Process SAE" />
          </form>
        ) : null}
      </div>

      {/*
      Render the progress for the current job
      TODO: automatically dismiss if successful
      */}
      <JobProgress
        job={saeJob}
        clearJob={() => {
          setSaeJob(null);
        }}
        killJob={(job) => apiService.killJob(dataset.id, job.id).then(setSaeJob).catch(console.error)}
        rerunJob={handleRerunSae}
      />

      {/* Render the existing SAE */}
      <div className={styles['saes-list']}>
        {sae ? (
          <div className={styles['item']} key={sae.id}>
            <label htmlFor={`sae${sae.id}`}>
              <span>
                <span className={styles['run-id']}>
                  {sae.id} - {sae.num_features} features
                </span>
              </span>
            </label>
            <Button
              color="delete"
              variant="outline"
              size="small"
              icon="trash"
              label="Delete SAE"
              className={styles['delete']}
              onClick={() => deleteSaeJob({ sae_id: sae.id })}
              disabled={saeJob && saeJob.status !== 'completed'}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Sae;
