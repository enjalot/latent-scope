import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import './DatasetSetup.css';
import DatasetUmaps from './DatasetUmaps';

function DatasetSetup() {
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

  // run and poll umap job
  const [umapIntervalId, setUmapIntervalId] = useState(null);
  const [umapJob, setUmapJob] = useState(null);
  const handleNewUmap = useCallback((umap) => {
    // fetch request that submits embeddigns, neighbors and min_dist
    console.log("running umap", umap)
    fetch(`http://localhost:5001/scripts/umap?dataset=${dataset.id}&embeddings=${umap.embeddings}&neighbors=${umap.neighbors}&min_dist=${umap.min_dist}`)
      .then(response => response.json())
      .then(data => {
        const jobId = data.job_id;
        console.log("start polling", jobId)
        const intervalId = setInterval(() => {
          fetch(`http://localhost:5001/scripts/job?dataset=${dataset.id}&job_id=${jobId}`)
            .then(response => response.json())
            .then(jobData => {
              console.log("polling job status", jobData);
              setUmapJob(jobData);
              if (jobData.status === "completed") {
                clearInterval(intervalId);
                setUmapIntervalId(null);
                setUmapJob(null)
              }
            })
            .catch(error => {
              console.error("Error polling job status", error);
              clearInterval(intervalId);
              setUmapIntervalId(null);
            });
        }, 100);
        setUmapIntervalId(intervalId);
    })
  }, [dataset])
  useEffect(() => {
    return () => {
      if (umapIntervalId) {
        clearInterval(umapIntervalId);
      }
    };
  }, [umapIntervalId]); 

  // run and poll cluster job
  const [clusterIntervalId, setClusterIntervalId] = useState(null);
  const [clusterJob, setClusterJob] = useState(null);
  const handleNewCluster = useCallback((cluster) => {
    // fetch request that submits cluster name and umap name
    console.log("running cluster", cluster)
    fetch(`http://localhost:5001/scripts/cluster?dataset=${dataset.id}&umap_name=${cluster.umap_name}&samples=${cluster.samples}&min_samples=${cluster.min_samples}`)
      .then(response => response.json())
      .then(data => {
        const jobId = data.job_id;
        console.log("start polling", jobId)
        const intervalId = setInterval(() => {
          fetch(`http://localhost:5001/scripts/job?dataset=${dataset.id}&job_id=${jobId}`)
            .then(response => {
              if (!response.ok) { // This checks if the response status is not in the range 200-299
                throw new Error(`HTTP error! status: ${response.status}`);
              }
              return response.json()
            })
            .then(jobData => {
              console.log("polling job status", jobData);
              setClusterJob(jobData);
              if (jobData.status === "completed") {
                clearInterval(intervalId);
                setClusterIntervalId(null);
                setClusterJob(null)
              }
            })
            .catch(error => {
              console.error("Error polling job status", error);
              clearInterval(intervalId);
              setClusterIntervalId(null);
            });
        }, 100);
        setClusterIntervalId(intervalId);
    })
  }, [dataset])
  useEffect(() => {
    return () => {
      if (clusterIntervalId) {
        clearInterval(clusterIntervalId);
      }
    };
  }, [clusterIntervalId]);


  if (!dataset) return <div>Loading...</div>;
  const datasetUrl = "/datasets/" + datasetId

  return (
    <div className="dataset--details-experiments">
      <h2>Dataset: <a href={datasetUrl}>{datasetId}</a></h2>
      <div className="dataset--details-summary">
        [ {dataset.length} rows ][ {dataset.active_embeddings} ][ {dataset.active_umap} ]<br/>
      </div>
      
      <DatasetUmaps 
        dataset={dataset} 
        onActivateUmap={handleActivateUmap} 
        onNewUmap={handleNewUmap}
        onNewCluster={handleNewCluster}
        umapJob={umapJob}
        clusterJob={clusterJob}
        />

    </div>
  );
}

export default DatasetSetup;