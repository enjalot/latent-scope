import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetDetail.css';
import DatasetUmaps from './DatasetUmaps';


function DatasetDetail() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();

  useEffect(() => {
    fetch(`http://localhost:3113/api/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => setDataset(data));
  }, [datasetId]);

  const [distances, setDistances] = useState(null);
  const [indices, setIndices] = useState(null);
  const searchQuery = (query) => {
    fetch(`http://localhost:5001/nn?dataset=${datasetId}&query=${query}`)
      .then(response => response.json())
      .then(data => {
        console.log("search", data)
        setDistances(data.distances);
        setIndices(data.indices);
      });
  };

  const [neighbors, setNeighbors] = useState(null);
  useEffect(() => {
    fetch(`http://localhost:5001/indexed?dataset=${datasetId}&indices=${JSON.stringify(indices)}`)
      .then(response => response.json())
      .then(data => {
        console.log("neighbors", data)
        setNeighbors(data)
      })
  }, [indices, datasetId])

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className="dataset--details">
      <h1>Dataset: {datasetId}</h1>
      <div className="dataset--details-summary">
        Rows: {dataset["embeddings.json"].shape[0]}<br/>
        Model: {dataset["embeddings.json"].model}<br/>
      </div>
      
      <div class="dataset--neighbors">
        <form onSubmit={(e) => {
          e.preventDefault();
          searchQuery(e.target.elements.searchBox.value);
        }}>
          <input type="text" id="searchBox" />
          <button type="submit">Similarity Search</button>
        </form>

      </div>

      <DatasetUmaps dataset={dataset} datasetId={datasetId} />
      
    </div>
  );
}

export default DatasetDetail;
