import { useEffect, useState, useMemo } from 'react';

import PropTypes from 'prop-types';

DatasetUmaps.propTypes = {
  datasetId: PropTypes.string.isRequired,
  dataset: PropTypes.object.isRequired,
};

function DatasetUmaps({ datasetId, dataset}) {

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

  // TODO: fix the classnames here. reused cluster for the umap card
  return (
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
  )
}

export default DatasetUmaps;