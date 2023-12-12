import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function DatasetsList() {
  const [datasets, setDatasets] = useState([]);

  useEffect(() => {
    fetch('http://localhost:3113/api/datasets')
      .then(response => response.json())
      .then(data => setDatasets(data));
  }, []);

  return (
    <div>
      <h1>Datasets</h1>
      <ul>
        {datasets.map(dataset => (
          <li key={dataset.id}>
            <Link to={`/datasets/${dataset.name}`}>{dataset.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DatasetsList;
