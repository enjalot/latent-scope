import { useEffect, useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';

import './DatasetUmaps.css';

DatasetUmaps.propTypes = {
  dataset: PropTypes.object.isRequired,
  onActivateUmap: PropTypes.func.isRequired,
  onNewUmap: PropTypes.func.isRequired,
  onNewCluster: PropTypes.func.isRequired,
  umapJob: PropTypes.object,
  clusterJob: PropTypes.object,
};

function DatasetUmaps({ dataset, onActivateUmap, onNewUmap, onNewCluster, umapJob, clusterJob}) {
  const [umaps, setUmaps] = useState([]);
  const [clusters, setClusters] = useState([]);
  // Fetch all the UMAPs available and format their meta data
  useEffect(() => {
    if (!dataset) return;
    fetch(`http://localhost:5001/datasets/${dataset.id}/umaps`)
      .then(response => response.json())
      .then(data => {
        console.log("data!", data)
        const umaps_keys = Object.keys(data)
        const processed = umaps_keys.map(umap => ({
          file: umap,
          name: umap.replace(".json",""), // TODO: this will be deprecated
          url: `http://localhost:5001/files/${dataset.id}/umaps/${umap.replace(".json","")}.png`,
          ...data[umap],
          clusters: []
        }))
        console.log("setting umaps", processed)
        processed.reverse()
        setUmaps(processed)
      });
  }, [dataset, umapJob]);

  // Fetch all the clusters available and format their meta data
  // This will also update umaps
  useEffect(() => {
    if (!dataset || !umaps.length) return;
    fetch(`http://localhost:5001/datasets/${dataset.id}/clusters`)
      .then(response => response.json())
      .then(data => {
        const clusters_keys = Object.keys(data)
        const processed = clusters_keys.map(cluster => ({
          file: cluster,
          name: cluster.replace(".json",""), // TODO: this will be deprecated
          url: `http://localhost:5001/files/${dataset.id}/clusters/${cluster.replace(".json","")}.png`,
          ...data[cluster]
        }))
        setClusters(processed)
      })
      .catch(err => console.log(err))
  }, [dataset, umaps, clusterJob]);

  const [embeddings, setEmbeddings] = useState([]);
  useEffect(() => {
    fetch(`http://localhost:5001/datasets/${dataset.id}/embeddings`)
      .then(response => response.json())
      .then(data => {
        console.log("embeddings", data)
        setEmbeddings(data)
      });
  }, [dataset]);

  // useEffect(() => {
  //   console.log("dataset", dataset)
  //   console.log("umaps", umaps)
  // }, [dataset, umaps]);

  const handleActivateClick = useCallback((umap) => {
    console.log("activate", umap)
    onActivateUmap(umap)
  }, [onActivateUmap])

  const handleNewUmap = useCallback((e) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const embeddings = data.get('embeddings')
    const neighbors = data.get('neighbors')
    const min_dist = data.get('min_dist')
    console.log("new umap", embeddings, neighbors, min_dist)
    onNewUmap({embeddings, neighbors, min_dist})
  }, [onNewUmap])

  const handleNewCluster = useCallback((e, umap) => {
    e.preventDefault()
    const form = e.target
    const data = new FormData(form)
    const samples = data.get('samples')
    const min_samples = data.get('min_samples')
    console.log("new cluster", samples, min_samples)
    onNewCluster({umap_name: umap.name, samples, min_samples})
  }, [onNewCluster])

  // TODO: fix the classnames here. reused cluster for the umap card
  return (
    <div className="dataset--umaps">
      <div className="dataset--umaps-new">
          {!umapJob || umapJob.status == "completed" ? <form onSubmit={handleNewUmap}>
            <label>
              Embeddings:
              <select name="embeddings">
                {embeddings.map((embedding, index) => (
                  <option key={index} value={embedding}>{embedding}</option>
                ))}
              </select>
            </label>
            <label>
              Neighbors:
              <input type="number" name="neighbors" defaultValue="50"/>
            </label>
            <label>
              Min Dist:
              <input type="text" name="min_dist" defaultValue="0.1" />
            </label>
            <button type="submit">New UMAP</button>
          </form>
          : <div>Running UMAP... 
              <pre>{umapJob.progress.join("\n")}</pre>
            </div>}
      </div>
      <div className="dataset--umaps-list">
        {umaps.map(umap => (
          <div className="dataset--details-umap" key={umap.name}>
            <div className="dataset--details-clusters">
              <div className="dataset--details-cluster">
                <div className="dataset--details-umap-stats">
                  <h3>{umap.name}
                    {dataset.active_umap == umap.name ? " (Active)" : 
                      (<button 
                        key={umap.name + "-activate"} 
                        onClick={() => handleActivateClick(umap)}
                        // className={1 ? 'tag-active' : 'tag-inactive'}
                        >
                          Activate
                      </button>)
                  }</h3>
                  {umap.embeddings}<br/>
                  Neighbors: {umap.neighbors}<br/>
                  Min Dist: {umap.min_dist}<br/>
                </div>
                <img src={umap.url} alt={umap.name} />
              </div>

              <div className="dataset--clusters-new">
                
                <form onSubmit={(e) => handleNewCluster(e, umap)}>
                  <label>
                    Samples:
                    <input type="number" name="samples" defaultValue="30"/>
                  </label><br/>
                  <label>
                    Min Samples:
                    <input type="number" name="min_samples" defaultValue="5" />
                  </label>
                  <button type="submit">New Clusters</button>
                </form>
                {clusterJob && clusterJob.command.indexOf(umap.name) >= 0 ? <p>{clusterJob.progress.join("\n")}</p>: null}
            </div>
              {clusters.filter(cluster => cluster.umap_name === umap.name).reverse().map(cluster => (
              <div className="dataset--details-cluster" key={cluster.name}>
                <div className="dataset--details-cluster-stats">
                  <h3>{cluster.name}</h3>
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
  )
}

export default DatasetUmaps;