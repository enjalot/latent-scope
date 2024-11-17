import { useState, useCallback, useEffect } from 'react';
import { useStartJobPolling } from './Job/Run';
import { apiService, apiUrl } from '../lib/apiService';
import { Button, Input } from 'react-element-forge';
import JobProgress from './Job/Progress';

import styles from './HFUpload.module.css';

function HFUpload({ dataset, scope }) {
  const [uploadJob, setUploadJob] = useState(null);
  const { startJob: startUploadJob } = useStartJobPolling(
    dataset,
    setUploadJob,
    `${apiUrl}/jobs/upload_dataset`
  );

  const [hfDataset, setHfDataset] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  const handleUpload = useCallback(() => {
    const mainParquet = scope ? `scopes/${scope.id}-input.parquet` : 'input.parquet';
    startUploadJob({
      dataset_name: dataset.id,
      hf_dataset: hfDataset || `ls-${dataset.id}`,
      main_parquet: mainParquet,
      private: isPrivate,
    });
  }, [dataset, scope, hfDataset, isPrivate, startUploadJob]);

  const handleKill = useCallback(
    (job) => {
      apiService
        .killJob(dataset.id, job.id)
        .then((data) => {
          console.log('killed job', data);
          setUploadJob(data);
        })
        .catch(console.error);
    },
    [dataset]
  );

  const handleRerun = useCallback(
    (job) => {
      apiService.rerunJob(dataset.id, job.id).catch(console.error);
    },
    [dataset]
  );

  const [hfRepo, setHfRepo] = useState('');
  useEffect(() => {
    if (uploadJob?.status == 'completed') {
      let repo_id = uploadJob.progress[uploadJob.progress.length - 1]?.replace('uploaded to: ', '');
      setHfRepo(repo_id);
    }
  }, [uploadJob]);

  return (
    <div className={styles.container}>
      <div className={styles.form}>
        <Input
          label="Hugging Face Dataset Name"
          placeholder={`ls-${dataset.id}`}
          value={hfDataset}
          onChange={(e) => setHfDataset(e.target.value)}
          disabled={!!uploadJob}
        />
        <label>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            disabled={!!uploadJob}
          />
          Private Repository
        </label>
        <Button
          variant="outline"
          onClick={handleUpload}
          disabled={!!uploadJob}
          text="Upload to Hugging Face 🤗"
        />
      </div>

      <JobProgress
        job={uploadJob}
        clearJob={() => setUploadJob(null)}
        killJob={handleKill}
        rerunJob={handleRerun}
      />

      {hfRepo ? (
        <div>
          <p>
            Uploaded to 🤗
            <a href={`https://huggingface.co/datasets/${hfRepo}`} target="_blank" rel="noreferrer">
              {hfRepo}
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default HFUpload;
