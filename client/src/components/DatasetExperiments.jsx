import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetExperiments.css';
import DatasetUmaps from './DatasetUmaps';

function DatasetExperiments() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();

  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => setDataset(data));
  }, [datasetId]);

  const handleActivateUmap = useCallback((umap) => {
    fetch(`http://localhost:5001/datasets/${datasetId}/umaps/activate?umap=${umap.name}`)
      .then(response => response.json())
      .then(data => {
        console.log("activated umap", umap, data)
        setDataset(data);
      });
  })


  if (!dataset) return <div>Loading...</div>;
  const datasetUrl = "/datasets/" + datasetId

  return (
    <div className="dataset--details-experiments">
      <h2>Dataset: <a href={datasetUrl}>{datasetId}</a></h2>
      <div className="dataset--details-summary">
        [ {dataset.length} rows ][ {dataset.active_embeddings} ][ {dataset.active_umap} ]<br/>
      </div>
      
      
      <DatasetUmaps dataset={dataset} datasetId={datasetId} onActivateUmap={handleActivateUmap} />

    </div>
  );
}

export default DatasetExperiments;