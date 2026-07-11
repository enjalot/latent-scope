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

  // A dataset can hold SAE runs for several embeddings (and, now that the
  // registry has more than one entry, several SAE models). Only surface runs
  // computed for THIS embedding with THIS SAE model — otherwise a nomic run
  // could get attached to a MiniLM scope.
  const relevantSaes = useCallback(
    (saes) =>
      saes.filter(
        (s) => s.embedding_id === embedding?.id && s.model_id === model?.model_id
      ),
    [embedding, model]
  );

  useEffect(() => {
    apiService.fetchSaes(dataset.id).then((saes) => {
      const relevant = relevantSaes(saes);
      setSaes(relevant);
      setSae(relevant.length ? relevant[0] : null);
      onSAE(relevant.length ? relevant[0] : null);
    });
  }, [dataset, setSaes, relevantSaes]);

  useEffect(() => {
    if (saeJob?.status === 'completed') {
      apiService.fetchSaes(dataset.id).then((saes) => {
        const relevant = relevantSaes(saes);
        setSaes(relevant);
        let s;
        if (saeJob.job_name == 'sae') {
          s = relevant.find((d) => d.id == saeJob.run_id);
        } else if (saeJob.job_name == 'rm') {
          s = relevant[relevant.length - 1];
        }
        setSae(s || null);
        onSAE(s || null);
      });
    }
  }, [saeJob, dataset, setSaes, setSae, relevantSaes]);

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
