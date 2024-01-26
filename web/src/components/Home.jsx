import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { jobPolling } from './JobRun';
import JobProgress from './JobProgress';
const apiUrl = import.meta.env.VITE_API_URL

import './Home.css';

console.log("ENV", import.meta.env)

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
    document.getElementById('dataset-name').value = datasetName;
  };
  const handleFileChange = (event) => {
    const fileName = event.target.files[0].name
    const datasetName = sanitizeName(fileName);
    document.getElementById('dataset-name').value = datasetName;
  }

  const navigate = useNavigate();
  useEffect(() => {
    if (ingestJob && ingestJob.status === 'completed') {
      setTimeout(function() {
        navigate(`/datasets/${ingestJob.dataset}/setup`);
      }, 1000);
    }
  }, [ingestJob, navigate]);

  return (
    <div className="home">
      <div className="new-dataset">
        <h3>Create new dataset</h3>
        <form onSubmit={handleNewDataset} onDragOver={handleDragOver} onDrop={handleDrop}>
          <label htmlFor="upload-button">
            <span>Import a CSV to create a new dataset</span>
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
          />
          <button type="submit">Submit</button>
        </form>
        <JobProgress job={ingestJob} clearJob={() => setIngestJob(null)} />
      </div>
      <h3>Datasets</h3>
      <ul>
        {datasets.map(dataset => (
          <li key={dataset.id}>
            <Link to={`/datasets/${dataset.name}/setup`}>Setup {dataset.name}</Link>
            {scopes[dataset.id] && scopes[dataset.id].map && scopes[dataset.id]?.map((scope,i) => (
              <div key={i} >
                <Link to={`/datasets/${dataset.name}/explore/${scope.id}`}>Explore {scope.name} - {scope.label}<br></br>
                <img width="120px" src={`${apiUrl}/files/${dataset.id}/clusters/${scope.cluster}.png`} />
                </Link><br></br>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Home;
