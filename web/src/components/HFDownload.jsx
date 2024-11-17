import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button, Input } from 'react-element-forge';
import ModelSelect from './ModelSelect';
import JobProgress from './Job/Progress';
import { useStartJobPolling } from './Job/Run';
import { apiService, apiUrl } from '../lib/apiService';

import styles from './HFDownload.module.scss';

function HFDownload({ onComplete }) {
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [datasetName, setDatasetName] = useState('');
  const [HFDatasets, setHFDatasets] = useState([]);
  const [downloadJob, setDownloadJob] = useState(null);

  const dataset = useMemo(() => {
    return { id: datasetName };
  }, [datasetName]);

  const { startJob: startDownloadJob } = useStartJobPolling(
    dataset,
    setDownloadJob,
    `${apiUrl}/jobs/download_dataset`
  );

  // Search HuggingFace datasets with tag "latent-scope"
  const searchHFDatasets = useCallback((query) => {
    apiService.searchHFDatasets(query).then((datasets) => {
      setHFDatasets(datasets);
    });
  }, []);

  useEffect(() => {
    searchHFDatasets('');
  }, [searchHFDatasets]);

  const handleDatasetSelect = useCallback(
    (selected) => {
      setSelectedDataset(selected);
      // Set a default name based on the selected dataset
      setDatasetName(selected.name.split('/').pop());
    },
    [setSelectedDataset, setDatasetName]
  );

  const handleDownload = useCallback(
    (e) => {
      e.preventDefault();
      if (!selectedDataset || !datasetName) return;

      startDownloadJob({
        dataset_repo: selectedDataset.name,
        dataset_name: datasetName,
      });
    },
    [selectedDataset, datasetName, startDownloadJob]
  );

  // When job completes, notify parent
  useEffect(() => {
    if (downloadJob?.status === 'completed' && onComplete) {
      onComplete(datasetName);
      setDownloadJob(null);
    }
  }, [downloadJob, datasetName, onComplete]);

  const allOptionsGrouped = [
    {
      label: 'Latent Scope Datasets',
      options: HFDatasets,
    },
  ];

  return (
    <div className={styles.downloader}>
      <div className={styles.selector}>
        <ModelSelect
          options={allOptionsGrouped}
          onChange={handleDatasetSelect}
          onInputChange={searchHFDatasets}
          placeholder="Search Latent Scope datasets..."
        />
      </div>
      {selectedDataset ? (
        <Input
          label="Save as"
          value={datasetName}
          onChange={(e) => setDatasetName(e.target.value)}
        />
      ) : null}
      <Button
        onClick={handleDownload}
        disabled={!selectedDataset}
        variant="outline"
        text={`Download ${datasetName}`}
      />
      {downloadJob && <JobProgress job={downloadJob} clearJob={() => setDownloadJob(null)} />}
    </div>
  );
}

export default HFDownload;
