import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetDetail.css';

function DatasetDetail() {
  const [dataset, setDataset] = useState(null);
  const { dataset: datasetId } = useParams();

  useEffect(() => {
    fetch(`http://localhost:3113/api/datasets/${datasetId}/meta`)
      .then(response => response.json())
      .then(data => setDataset(data));
  }, [datasetId]);

  const umaps = useMemo(() => {
    if (!dataset) return null;
    const umaps_keys = Object.keys(dataset).filter(key => key.startsWith('umap'));
    const umaps = umaps_keys.map(umap => ({
      file: umap,
      name: umap.replace(".json",""),
      url: `http://localhost:3113/files/${datasetId}/${umap.replace(".json","")}.png`,
      ...dataset[umap]
    }))
    const clusters_keys = Object.keys(dataset).filter(key => key.startsWith('cluster'));
    const clusters = clusters_keys.map(cluster=> ({
      file: cluster,
      name: cluster.replace(".json", ""),
      url: `http://localhost:3113/files/${datasetId}/${cluster.replace(".json", "")}.png`,
      ...dataset[cluster]
    }))
    umaps.forEach(umap => {
      umap.clusters = clusters.filter(cluster => cluster.umap_name === umap.name)
    })

    return umaps
  }, [dataset, datasetId]);


  useEffect(() => {
    console.log(dataset)
    console.log(umaps)
  }, [dataset, umaps]);

  if (!dataset) return <div>Loading...</div>;

  return (
    <div className="dataset--details">
      <h1>Dataset: {datasetId}</h1>
      <div className="dataset--details-summary">
        Rows: {dataset["embeddings.json"].shape[0]}<br/>
        Model: {dataset["embeddings.json"].model}<br/>
      </div>
      <div className="dataset--details-umaps">
      {umaps.map(umap => (
        <div className="dataset--details-umap" key={umap.name}>
          <div className="dataset--details-clusters">
          <div className="dataset--details-cluster">
            <h3>{umap.name}</h3>
            <div className="dataset--details-umap-stats">
              Neighbors: {umap.neighbors}<br/>
              Min Dist: {umap.min_dist}<br/>
            </div>
            <img src={umap.url} alt={umap.name} />
          </div>


            {umap.clusters.map(cluster => (
            <div className="dataset--details-cluster" key={cluster.name}>
              <h3>{cluster.name}</h3>
              <div className="dataset--details-cluster-stats">
                Clusters generated: {cluster.n_clusters}<br/>
                Noise points (unclustered): {cluster.n_noise}<br/>
                Samples: {cluster.samples}<br/>
                Min Samples: {cluster.min_samples}<br/>
              </div>
              <img src={cluster.url} alt={cluster.name} />
            </div>
          ))}
          </div>
        </div>
      ))}
      </div>
      
    </div>
  );
}

export default DatasetDetail;
