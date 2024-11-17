import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobPolling } from './Job/Run';
import JobProgress from './Job/Progress';
import HFDownload from './HFDownload';
import { Button, Input } from 'react-element-forge';
import { apiUrl, apiService } from '../lib/apiService';
const readonly = import.meta.env.MODE == 'read_only';

import './Home.css';

function Home() {
  const [datasets, setDatasets] = useState([]);

  useEffect(() => {
    apiService.fetchDatasets().then(setDatasets);
  }, []);

  const [scopes, setScopes] = useState({});

  useEffect(() => {
    datasets.forEach((dataset) => {
      apiService.fetchScopes(dataset.id).then((data) =>
        setScopes((prevScopes) => {
          const ret = { ...prevScopes };
          ret[dataset.id] = data;
          return ret;
        })
      );
    });
  }, [datasets]);
  useEffect(() => {
    console.log('scopes', scopes);
  }, [scopes]);

  const [ingestJob, setIngestJob] = useState(null);
  const handleNewDataset = (event) => {
    event.preventDefault();
    const dataset = event.target[1].value;
    const files = event.target[0].files;
    const file = files[0];
    const formData = new FormData();
    formData.append('dataset', dataset);
    formData.append('file', file);

    fetch(`${apiUrl}/jobs/ingest`, {
      method: 'POST',
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        console.log('Job ID:', data.job_id);
        jobPolling({ id: dataset }, setIngestJob, data.job_id);
      })
      .catch((error) => {
        console.error('Error:', error);
      });
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  function sanitizeName(fileName) {
    let datasetName = fileName.substring(0, fileName.lastIndexOf('.'));
    datasetName = datasetName.replace(/\s/g, '-');
    return datasetName;
  }
  const [datasetName, setDatasetName] = useState('');
  const [nameTaken, setNameTaken] = useState(false);

  const handleFileChange = useCallback(
    (event) => {
      const fileName = event.target.files[0].name;
      const suggestedName = sanitizeName(fileName);
      const isNameTaken = datasets.some((dataset) => dataset.id === suggestedName);

      setDatasetName(suggestedName);
      setNameTaken(isNameTaken);
    },
    [datasets]
  );

  const handleDrop = (event) => {
    event.preventDefault();
    document.getElementById('upload-button').files = event.dataTransfer.files;
    const fileName = event.dataTransfer.files[0].name;
    const suggestedName = sanitizeName(fileName);

    const isNameTaken = datasets.some((dataset) => dataset.id === suggestedName);
    setDatasetName(suggestedName);
    setNameTaken(isNameTaken);
  };

  const handleNameChange = (e) => {
    const newName = e.target.value;
    setDatasetName(newName);
    const isNameTaken = datasets.some((dataset) => dataset.id === newName);
    setNameTaken(isNameTaken);
  };

  const navigate = useNavigate();
  useEffect(() => {
    if (ingestJob && ingestJob.status === 'completed') {
      setTimeout(function () {
        navigate(`/datasets/${ingestJob.dataset}/setup`);
      }, 1000);
    }
  }, [ingestJob, navigate]);

  return (
    <div className="home">
      {readonly ? null : (
        <div className="new section">
          <div className="new-dataset">
            <form onSubmit={handleNewDataset} onDragOver={handleDragOver} onDrop={handleDrop}>
              <h3>Create new dataset</h3>
              <label htmlFor="upload-button">
                <span>Import a CSV/Parquet/JSON/JSONL/XLSX file to create a new dataset</span>
              </label>
              <input hidden id="upload-button" type="file" onChange={handleFileChange} />
              <Input
                id="dataset-name"
                type="text"
                placeholder="Dataset name"
                value={datasetName}
                onChange={handleNameChange}
              />
              {nameTaken ? (
                <div className="name-taken-warning">This dataset name is already taken.</div>
              ) : null}
              <Button type="submit" disabled={nameTaken || !datasetName} text="Submit" />
            </form>
            <JobProgress job={ingestJob} clearJob={() => setIngestJob(null)} />
          </div>
          <div className="hf-downloader">
            <h3>Download a scoped dataset from Hugging Face</h3>
            <HFDownload
              onComplete={() => {
                apiService.fetchDatasets().then(setDatasets);
              }}
            />
          </div>
        </div>
      )}

      <div className="section datasets">
        <h3>Datasets</h3>
        <div className="datasets-content">
          {datasets.map((dataset) => (
            <div className="dataset" key={dataset.id}>
              <h3>
                {' '}
                {dataset.id} &nbsp;
                {readonly ? null : <Link to={`/datasets/${dataset.id}/setup`}>Setup</Link>}
              </h3>
              <span>{dataset.length} rows</span>
              <div className="scope-links">
                {scopes[dataset.id] &&
                  scopes[dataset.id].map &&
                  scopes[dataset.id]?.map((scope, i) => (
                    <div className="scope-link" key={i}>
                      <Link to={`/datasets/${dataset.id}/explore/${scope.id}`}>
                        {scope.label || scope.id}
                        <br />
                        {scope.ignore_hulls ? (
                          <img src={`${apiUrl}/files/${dataset.id}/umaps/${scope.umap_id}.png`} />
                        ) : (
                          <img
                            src={`${apiUrl}/files/${dataset.id}/clusters/${scope.cluster_id}.png`}
                          />
                        )}
                      </Link>
                      <br />
                      <span className="scope-description">{scope.description}</span>
                      <br />
                      {readonly ? null : (
                        <Link to={`/datasets/${dataset.id}/setup/${scope.id}`}>Configure</Link>
                      )}
                      {readonly ? null : (
                        <>
                          {' '}
                          | <Link to={`/datasets/${dataset.id}/export/${scope.id}`}>
                            Export
                          </Link>{' '}
                        </>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Home;
