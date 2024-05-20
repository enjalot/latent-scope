import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobPolling } from './Job/Run';
import JobProgress from './Job/Progress';
const apiUrl = import.meta.env.VITE_API_URL
const readonly = import.meta.env.MODE == "read_only"

import './Home.css';

function Home() {
  const [datasets, setDatasets] = useState([]);

  useEffect(() => {
    fetch(`${apiUrl}/datasets`)
      .then(response => response.json())
      .then(data => setDatasets(data));
  }, []);
  
  const [scopes, setScopes] = useState({});

  useEffect(() => {
    datasets.forEach(dataset => {
      fetch(`${apiUrl}/datasets/${dataset.id}/scopes`)
        .then(response => response.json())
        .then(data => setScopes(prevScopes => {
          const ret = {...prevScopes};
          ret[dataset.id] = data;
          return ret
        }))
    });
  }, [datasets]);
  useEffect(() => {
    console.log("scopes", scopes)
  }, [scopes]);

  const [ingestJob, setIngestJob] = useState(null);
  const handleNewDataset = (event) => {
    event.preventDefault();
    const dataset = event.target[1].value;
    const files = event.target[0].files
    const file = files[0];
    const formData = new FormData();
    formData.append("dataset", dataset);
    formData.append('file', file);

    fetch(`${apiUrl}/jobs/ingest`, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      console.log('Job ID:', data.job_id);
      jobPolling({id: dataset}, setIngestJob, data.job_id)
    })
    .catch(error => {
      console.error('Error:', error);
    });
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };
  
  function sanitizeName(fileName) {
    let datasetName = fileName.substring(0, fileName.lastIndexOf('.'));
    datasetName = datasetName.replace(/\s/g, '-')
    return datasetName
  }
  const handleDrop = (event) => {
    event.preventDefault();
    // const file = event.dataTransfer.files[0];
    // Now you can handle the file as you would in your handleNewDataset function
    document.getElementById('upload-button').files = event.dataTransfer.files;
    const fileName = event.dataTransfer.files[0].name;
    const datasetName = sanitizeName(fileName);

    const isNameTaken = datasets.some(dataset => dataset.id === datasetName);
    console.log("is name taken?", isNameTaken, datasetName, datasets)
    if (isNameTaken) {
      setNameTaken(true)
    } else {
      setNameTaken(false)
    }
    
    document.getElementById('dataset-name').value = datasetName;
  };
  const handleFileChange = useCallback((event) => {
    const fileName = event.target.files[0].name
    const datasetName = sanitizeName(fileName);
    const isNameTaken = datasets.some(dataset => dataset.id === datasetName);
    console.log("is name taken?", isNameTaken, datasetName, datasets)
    if (isNameTaken) {
      setNameTaken(true)
    } else {
      setNameTaken(false)
    }

    document.getElementById('dataset-name').value = datasetName;
  }, [datasets])

  const navigate = useNavigate();
  useEffect(() => {
    if (ingestJob && ingestJob.status === 'completed') {
      setTimeout(function() {
        navigate(`/datasets/${ingestJob.dataset}/setup`);
      }, 1000);
    }
  }, [ingestJob, navigate]);

  const [nameTaken, setNameTaken] = useState(false);

  return (
    <div className="home">
      {readonly ? null : <div className="new-dataset section">
        <h3>Create new dataset</h3>
        <form onSubmit={handleNewDataset} onDragOver={handleDragOver} onDrop={handleDrop}>
          <label htmlFor="upload-button">
            <span>Import a CSV/Parquet/JSON/JSONL/XLSX file to create a new dataset</span>
          </label>
          <input
            hidden
            id="upload-button"
            type="file"
            onChange={handleFileChange}
          />
          <input
            id="dataset-name"
            type="text"
            placeholder="Dataset name"
          onChange={(e) => {
            const newName = e.target.value;
            const isNameTaken = datasets.some(dataset => dataset.id === newName);
            if (isNameTaken) {
              setNameTaken(true)
            } else {
              setNameTaken(false)
            }
          }}
          />
          {nameTaken ? <div className="name-taken-warning">This dataset name is already taken.</div> : null}
          <button type="submit">Submit</button>
        </form>
        <JobProgress job={ingestJob} clearJob={() => setIngestJob(null)} />
      </div> }
      <div className="section datasets">
        <h3>Datasets</h3>
        <div className="datasets-content">
          {datasets.map(dataset => (
            <div className="dataset" key={dataset.id}>
              <h3> {dataset.id} &nbsp;
              {readonly ? null : <Link to={`/datasets/${dataset.id}/setup`}>Setup</Link> }
              </h3>
              <span>{dataset.length} rows</span>
              <div className="scope-links">
              {scopes[dataset.id] && scopes[dataset.id].map && scopes[dataset.id]?.map((scope,i) => (
                <div className="scope-link" key={i} >
                  <Link to={`/datasets/${dataset.id}/explore/${scope.id}`}>{scope.label || scope.id}<br/>
                  { scope.ignore_hulls ? 
                    <img src={`${apiUrl}/files/${dataset.id}/umaps/${scope.umap_id}.png`} />
                  : <img src={`${apiUrl}/files/${dataset.id}/clusters/${scope.cluster_id}.png`} /> }
                  </Link>
                  <br/>
                  <span className="scope-description">{scope.description}</span>
                  <br/>
                  {readonly ? null : <Link to={`/datasets/${dataset.id}/setup/${scope.id}`}>Configure</Link> }
                  {readonly ? null : <> | <Link to={`/datasets/${dataset.id}/export/${scope.id}`}>Export</Link> </>}
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
